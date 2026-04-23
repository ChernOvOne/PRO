import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import Redis from 'ioredis'
import { promises as dns } from 'dns'
import { logger } from '../utils/logger'
import * as fs from 'fs/promises'
import * as path from 'path'
import bcrypt from 'bcryptjs'

const DOMAIN_ROLES = ['landing', 'app', 'admin', 'api', 'webhook', 'payments', 'custom'] as const

const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379'
const CONF_D_DIR = '/etc/nginx/conf.d'

async function publishCertJob(payload: { domain: string; role: string; email: string }) {
  const client = new Redis(REDIS_URL)
  try {
    await client.rpush('cert:queue', JSON.stringify(payload))
  } finally {
    client.disconnect()
  }
}

async function getPublicIP(): Promise<string | null> {
  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const data = await res.json() as { ip: string }
    return data.ip
  } catch {
    return null
  }
}

export async function adminSetupV2Routes(app: FastifyInstance) {
  const admin = { preHandler: [app.adminOnly] }

  /* ══════════════════════════════════════════════════════════════
     Public endpoints — available during first-run before any admin exists
     ══════════════════════════════════════════════════════════════ */

  // Does *any* admin account exist? Used by wizard to decide
  // whether to show the "Create first admin" step.
  app.get('/bootstrap', async () => {
    const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } })
    const completed = await prisma.setting.findUnique({ where: { key: 'setup_completed' } })
    return {
      hasAdmin: adminCount > 0,
      completed: completed?.value === '1',
      publicIp: await getPublicIP(),
    }
  })

  // Create the very first admin. ONLY allowed if no admin exists yet.
  app.post('/create-first-admin', async (req, reply) => {
    const existing = await prisma.user.count({ where: { role: 'ADMIN' } })
    if (existing > 0) {
      return reply.status(403).send({ error: 'Admin already exists' })
    }

    const body = z.object({
      email: z.string().email(),
      password: z.string().min(8),
    }).parse(req.body)

    const hashed = await bcrypt.hash(body.password, 12)
    const user = await prisma.user.upsert({
      where: { email: body.email },
      update: {
        role: 'ADMIN',
        passwordHash: hashed,
        passwordSetAt: new Date(),
      },
      create: {
        email: body.email,
        passwordHash: hashed,
        role: 'ADMIN',
        passwordSetAt: new Date(),
      },
    })
    return { ok: true, userId: user.id }
  })

  /* ══════════════════════════════════════════════════════════════
     Admin-guarded endpoints (from here down)
     ══════════════════════════════════════════════════════════════ */

  /* ── Setup progress ─────────────────────────────────────────── */

  app.get('/progress', admin, async () => {
    const row = await prisma.setting.findUnique({ where: { key: 'setup_progress' } })
    const completed = await prisma.setting.findUnique({ where: { key: 'setup_completed' } })
    let progress: any = {}
    if (row?.value) {
      try { progress = JSON.parse(row.value) } catch {}
    }
    return { progress, completed: completed?.value === '1' }
  })

  app.put('/progress', admin, async (req) => {
    const body = z.object({ progress: z.record(z.any()) }).parse(req.body)
    await prisma.setting.upsert({
      where:  { key: 'setup_progress' },
      update: { value: JSON.stringify(body.progress) },
      create: { key: 'setup_progress', value: JSON.stringify(body.progress) },
    })
    return { ok: true }
  })

  app.post('/complete', admin, async (req) => {
    // Read current wizard state
    const row = await prisma.setting.findUnique({ where: { key: 'setup_progress' } })
    let progress: any = {}
    if (row?.value) {
      try { progress = JSON.parse(row.value) } catch {}
    }

    // ── Finalize buhgalteria: write state into real tables ─────
    const buh = progress.buh || {}
    const stats = { categories: 0, servers: 0, saas: 0, transactions: 0 }

    // Save buh* settings
    if (buh.company_name || buh.currency || buh.timezone || typeof buh.starting_balance === 'number') {
      const settings: Record<string, string> = {}
      if (buh.company_name)   settings.buh_company_name = String(buh.company_name)
      if (buh.currency)       settings.buh_currency = String(buh.currency)
      if (buh.timezone)       settings.buh_timezone = String(buh.timezone)
      if (typeof buh.starting_balance === 'number')
        settings.buh_starting_balance = String(buh.starting_balance)
      for (const [key, value] of Object.entries(settings)) {
        await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } })
      }
    }

    // Categories (dedupe by name)
    if (Array.isArray(buh.categories)) {
      for (let i = 0; i < buh.categories.length; i++) {
        const c = buh.categories[i]
        if (!c?.enabled || !c?.name) continue
        const exists = await prisma.buhCategory.findFirst({ where: { name: c.name } })
        if (!exists) {
          await prisma.buhCategory.create({
            data: {
              name: c.name,
              color: c.color || '#64748b',
              icon: c.icon || null,
              sortOrder: i,
            },
          })
          stats.categories++
        }
      }
    }

    // VPN servers
    if (Array.isArray(buh.servers)) {
      for (const s of buh.servers) {
        if (!s?.name) continue
        const exists = await prisma.buhVpnServer.findFirst({ where: { name: s.name } })
        if (!exists) {
          await prisma.buhVpnServer.create({
            data: {
              name: s.name,
              provider: s.provider || null,
              ipAddress: s.ip || null,
              monthlyCost: s.monthlyCost || 0,
              currency: buh.currency || 'RUB',
              paymentDay: s.paymentDay || null,
              status: 'ACTIVE',
            },
          })
          stats.servers++
        }
      }
    }

    // SaaS recurring payments
    if (Array.isArray(buh.saas)) {
      for (const s of buh.saas) {
        if (!s?.name || !s?.cost) continue
        const exists = await prisma.buhRecurringPayment.findFirst({ where: { name: s.name } })
        if (!exists) {
          const monthly = s.period === 'year' ? Number(s.cost) / 12 : Number(s.cost)
          await prisma.buhRecurringPayment.create({
            data: {
              name: s.name,
              amount: monthly,
              currency: buh.currency || 'RUB',
              paymentDay: 1,
              description: s.period === 'year' ? `Годовая подписка (${s.cost}/год)` : null,
            },
          })
          stats.saas++
        }
      }
    }

    // Starting capital → BuhTransaction income entries (one per source, dedupe by externalHash)
    if (Array.isArray(buh.sources)) {
      for (const src of buh.sources) {
        if (!src?.label || !src?.amount) continue
        const hash = `setup-capital:${src.label}:${src.amount}`
        const exists = await prisma.buhTransaction.findUnique({ where: { externalHash: hash } })
        if (!exists) {
          await prisma.buhTransaction.create({
            data: {
              type: 'INCOME',
              amount: Number(src.amount),
              date: new Date(),
              description: `Стартовый капитал: ${src.label}`,
              source: 'system',
              externalHash: hash,
              isHistorical: true,
              createdById: (req as any).user?.sub || null,
            },
          })
          stats.transactions++
        }
      }
    }

    // Mark completed
    await prisma.setting.upsert({
      where:  { key: 'setup_completed' },
      update: { value: '1' },
      create: { key: 'setup_completed', value: '1' },
    })

    return { ok: true, created: stats }
  })

  app.post('/reset', admin, async () => {
    await prisma.setting.upsert({
      where:  { key: 'setup_completed' },
      update: { value: '0' },
      create: { key: 'setup_completed', value: '0' },
    })
    return { ok: true }
  })

  /**
   * DESTRUCTIVE: Selectively wipe business data and reset wizard.
   *
   * Body: {
   *   confirm: "УДАЛИТЬ ВСЁ",
   *   scopes: {
   *     users?, payments?, tickets?, news?, promos?, broadcasts?, giftSubs?,
   *     buhTransactions?, buhStructural?,
   *     tariffs?, funnels?, botConstructor?, landing?, proxies?,
   *     supportWizards?,
   *   }
   * }
   *
   * Always kept: calling admin user, TLS certs, migrations, instructions,
   *              setup_domains, settings (unless resetApiKeys true), admin_notes.
   */
  app.post('/wipe-and-reset', admin, async (req, reply) => {
    const body = z.object({
      confirm: z.string(),
      scopes: z.object({
        users: z.boolean().default(false),
        payments: z.boolean().default(false),
        tickets: z.boolean().default(false),
        news: z.boolean().default(false),
        promos: z.boolean().default(false),
        broadcasts: z.boolean().default(false),
        giftSubs: z.boolean().default(false),
        buhTransactions: z.boolean().default(false),
        buhStructural: z.boolean().default(false),
        tariffs: z.boolean().default(false),
        funnels: z.boolean().default(false),
        botConstructor: z.boolean().default(false),
        landing: z.boolean().default(false),
        proxies: z.boolean().default(false),
        supportWizards: z.boolean().default(false),
      }).default({} as any),
    }).parse(req.body)

    if (body.confirm !== 'УДАЛИТЬ ВСЁ') {
      return reply.status(400).send({ error: 'Confirmation phrase mismatch' })
    }

    // JWT payload puts the user id under `sub` (Fastify jwt default) — not `id`
    const callerId = (req as any).user?.sub
    if (!callerId) return reply.status(401).send({ error: 'Unauthorized' })

    const s = body.scopes
    const tables: string[] = []

    /**
     * Per-scope table lists. Order doesn't matter inside a single TRUNCATE CASCADE.
     * Tables referenced by cascades from other tables don't need to be listed.
     */

    if (s.users) {
      // Clearing users also cascades most FK tables, but we'll wipe user-scoped data
      // explicitly to not depend on CASCADE behavior being correct.
      tables.push('sessions', 'email_verifications', 'bot_messages',
                  'user_tags', 'user_variables', 'user_segments',
                  'referral_bonuses', 'balance_transactions',
                  'notifications', 'notification_reads',
                  'import_records', 'admin_notes',
                  'funnel_logs', 'pending_funnel_steps',
                  'buh_utm_clicks', 'buh_utm_leads')
    }
    if (s.payments) {
      tables.push('payments', 'balance_transactions', 'referral_bonuses',
                  'buh_webhook_payments', 'buh_webhook_api_keys')
    }
    if (s.tickets) {
      tables.push('ticket_messages', 'tickets', 'ticket_templates')
    }
    if (s.news) {
      tables.push('news')
    }
    if (s.promos) {
      tables.push('promo_usages', 'promo_codes')
    }
    if (s.broadcasts) {
      tables.push('broadcast_recipients', 'broadcasts')
    }
    if (s.giftSubs) {
      tables.push('gift_subscriptions')
    }
    if (s.buhTransactions) {
      tables.push('buh_transactions', 'buh_inkas_records', 'buh_ad_campaigns',
                  'buh_monthly_stats', 'buh_audit_logs')
    }
    if (s.buhStructural) {
      tables.push('buh_partners', 'buh_categories', 'buh_vpn_servers',
                  'buh_recurring_payments', 'buh_milestones',
                  'buh_notification_channels', 'buh_auto_tag_rules',
                  // also wipe transactions since they reference categories
                  'buh_transactions', 'buh_ad_campaigns', 'buh_inkas_records')
    }
    if (s.tariffs) {
      tables.push('tariffs')
    }
    if (s.funnels) {
      tables.push('funnel_logs', 'pending_funnel_steps', 'funnel_nodes',
                  'funnel_steps', 'funnels')
    }
    if (s.botConstructor) {
      tables.push('bot_block_stats', 'bot_buttons', 'bot_blocks',
                  'bot_block_groups', 'bot_triggers')
    }
    if (s.landing) {
      tables.push('landing_blocks')
    }
    if (s.proxies) {
      tables.push('telegram_proxies')
    }
    if (s.supportWizards) {
      tables.push('support_wizard_nodes', 'support_wizards')
    }

    const uniqueTables = Array.from(new Set(tables))

    try {
      if (uniqueTables.length > 0) {
        const quoted = uniqueTables.map(t => `"${t}"`).join(', ')
        await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`)
      }

      if (s.users) {
        // Delete all non-calling users
        await prisma.$executeRaw`DELETE FROM users WHERE id != ${callerId}`

        // Reset caller's client-side stats
        await prisma.user.update({
          where: { id: callerId },
          data: {
            totalPaid: 0,
            paymentsCount: 0,
            currentPlan: null,
            currentPlanTag: null,
            balance: 0,
            bonusDays: 0,
            subStatus: 'INACTIVE',
            subExpireAt: null,
            referredById: null,
          },
        }).catch(() => {})
      }

      // Always reset wizard flags
      await prisma.setting.deleteMany({
        where: { key: { in: ['setup_completed', 'setup_progress', 'buh_setup_completed'] } },
      })

      logger.warn('Wipe-and-reset performed', {
        adminId: callerId,
        scopes: Object.entries(s).filter(([, v]) => v).map(([k]) => k),
        tablesWiped: uniqueTables.length,
      })
      return {
        ok: true,
        tablesWiped: uniqueTables.length,
        message: uniqueTables.length === 0 ? 'Визард сброшен (ничего не удалено)' : 'Данные удалены, визард сброшен',
      }
    } catch (e: any) {
      logger.error('Wipe failed', { error: e.message })
      return reply.status(500).send({ error: e.message })
    }
  })

  /* ── Domains management ─────────────────────────────────────── */

  app.get('/domains', admin, async () =>
    prisma.setupDomain.findMany({ orderBy: { createdAt: 'asc' } })
  )

  app.post('/check-dns', admin, async (req) => {
    const body = z.object({ domain: z.string().min(1) }).parse(req.body)
    const domain = body.domain.trim().toLowerCase()
    const publicIp = await getPublicIP()

    let resolved: string[] = []
    try {
      resolved = await dns.resolve4(domain)
    } catch (e: any) {
      return {
        resolved: [],
        publicIp,
        matches: false,
        error: `DNS не резолвится: ${e.code || e.message}`,
      }
    }

    return {
      resolved,
      publicIp,
      matches: publicIp ? resolved.includes(publicIp) : resolved.length > 0,
    }
  })

  app.post('/domain', admin, async (req, reply) => {
    const body = z.object({
      domain: z.string().min(3),
      role: z.enum(DOMAIN_ROLES),
      email: z.string().email().optional(),
    }).parse(req.body)

    const domain = body.domain.trim().toLowerCase()

    const dup = await prisma.setupDomain.findUnique({ where: { domain } })
    if (dup) return reply.status(409).send({ error: 'Этот домен уже добавлен' })

    const rec = await prisma.setupDomain.create({
      data: { domain, role: body.role, status: 'pending' },
    })

    // Queue cert job — fire-and-forget
    publishCertJob({
      domain,
      role: body.role,
      email: body.email || process.env.CERTBOT_EMAIL || 'admin@example.com',
    }).catch(e => logger.error('publishCertJob failed', { error: e.message, domain }))

    return rec
  })

  app.post('/domain/:id/retry', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const rec = await prisma.setupDomain.findUnique({ where: { id } })
    if (!rec) return reply.status(404).send({ error: 'Not found' })

    await prisma.setupDomain.update({
      where: { id },
      data: { status: 'pending', lastError: null },
    })

    publishCertJob({
      domain: rec.domain,
      role: rec.role,
      email: process.env.CERTBOT_EMAIL || 'admin@example.com',
    }).catch(e => logger.error('publishCertJob failed', { error: e.message }))

    return { ok: true }
  })

  app.delete('/domain/:id', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const rec = await prisma.setupDomain.findUnique({ where: { id } })
    if (!rec) return reply.status(404).send({ error: 'Not found' })

    // Remove nginx vhost file if present
    const confPath = path.join(CONF_D_DIR, `${rec.domain}.conf`)
    try {
      await fs.unlink(confPath)
    } catch {
      // file may not exist — ignore
    }

    await prisma.setupDomain.delete({ where: { id } })
    return { ok: true }
  })

  /* ── Preview — live buh aggregates from wizard state ────────── */

  app.post('/preview', admin, async (req) => {
    const body = z.object({
      startingBalance: z.number().default(0),
      servers:  z.array(z.object({ monthlyCost: z.number() })).default([]),
      saas:     z.array(z.object({
        cost: z.number(),
        period: z.enum(['month', 'year']).default('month'),
      })).default([]),
      importSummary: z.object({
        totalIncome: z.number().optional(),
        totalExpense: z.number().optional(),
        userCount: z.number().optional(),
        paymentCount: z.number().optional(),
      }).optional(),
    }).parse(req.body)

    const monthlyServers = body.servers.reduce((s, x) => s + x.monthlyCost, 0)
    const monthlySaas = body.saas.reduce((s, x) =>
      s + (x.period === 'year' ? x.cost / 12 : x.cost), 0)
    const monthlyTotal = monthlyServers + monthlySaas

    return {
      startingBalance: body.startingBalance,
      monthlyServers,
      monthlySaas,
      monthlyTotal,
      runwayMonths: monthlyTotal > 0 ? body.startingBalance / monthlyTotal : null,
      import: body.importSummary || null,
    }
  })

  /* ── Tests — delegates to existing admin-settings test functions ─ */

  app.post('/test-remnawave', admin, async (req) => {
    const body = z.object({
      url: z.string().url(),
      token: z.string().min(1),
    }).parse(req.body)
    try {
      const res = await fetch(body.url.replace(/\/+$/, '') + '/api/users?size=1', {
        headers: { Authorization: `Bearer ${body.token}` },
        signal: AbortSignal.timeout(10000),
      })
      return { ok: res.ok, status: res.status }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  app.post('/test-yukassa', admin, async (req) => {
    const body = z.object({
      shopId: z.string().min(1),
      secretKey: z.string().min(1),
    }).parse(req.body)
    try {
      const auth = Buffer.from(`${body.shopId}:${body.secretKey}`).toString('base64')
      const res = await fetch('https://api.yookassa.ru/v3/me', {
        headers: { Authorization: `Basic ${auth}` },
        signal: AbortSignal.timeout(10000),
      })
      return { ok: res.ok, status: res.status }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  app.post('/test-bot', admin, async (req) => {
    const body = z.object({ token: z.string().min(1) }).parse(req.body)
    try {
      const res = await fetch(`https://api.telegram.org/bot${body.token}/getMe`, {
        signal: AbortSignal.timeout(10000),
      })
      const data = await res.json().catch(() => ({})) as any
      return { ok: !!data.ok, username: data.result?.username, error: data.description }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  /* ── Cert-event subscription endpoint — simple polling ──────── */

  // Backend listens to Redis pub/sub `cert:events` and updates SetupDomain.
  // This is started in routes/index.ts registration callback below.
}

/* ──────────────────────────────────────────────────────────────
   Redis subscriber — runs once at server start to update
   SetupDomain rows when certbot sidecar reports status changes.
   ────────────────────────────────────────────────────────────── */
let subscriberStarted = false
export async function startCertEventSubscriber() {
  if (subscriberStarted) return
  subscriberStarted = true

  const client = new Redis(REDIS_URL)
  client.on('error', e => logger.error('cert-events redis', { error: e.message }))

  client.subscribe('cert:events', (err) => {
    if (err) logger.error('subscribe cert:events failed', { error: err.message })
  })

  client.on('message', async (_channel, message) => {
    try {
      const { domain, status, error } = JSON.parse(message)
      const rec = await prisma.setupDomain.findUnique({ where: { domain } })
      if (!rec) return

      const patch: any = { status, lastError: error ?? null }
      if (status === 'cert_ok') {
        patch.certIssuedAt = new Date()
        patch.certExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // Let's Encrypt 90d
      }
      await prisma.setupDomain.update({ where: { id: rec.id }, data: patch })
      logger.info('Cert event applied', { domain, status })
    } catch (e: any) {
      logger.error('cert event processing', { error: e.message, message })
    }
  })

  logger.info('Cert-event subscriber started')
}
