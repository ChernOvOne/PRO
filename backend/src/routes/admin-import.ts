import type { FastifyInstance } from 'fastify'
import { randomUUID, createHash } from 'crypto'
import ExcelJS from 'exceljs'
import { logger } from '../utils/logger'
import { prisma } from '../db'
import { paymentService } from '../services/payment'
import { config } from '../config'

// ── Types ────────────────────────────────────────────────────
interface ParsedFile {
  type: 'xlsx' | 'csv'
  headers: string[]
  rows: any[][]
  createdAt: number
}

interface ImportJob {
  id: string
  type: 'users' | 'payments' | 'accounting'
  status: 'pending' | 'running' | 'done' | 'error'
  total: number
  processed: number
  created: number
  updated: number
  skipped: number
  errors: number
  warnings: number
  errorMessages: string[]
  startedAt: Date
  finishedAt?: Date
}

// ── In-memory stores with TTL ────────────────────────────────
const files = new Map<string, ParsedFile>()
const jobs = new Map<string, ImportJob>()
const accountingFiles = new Map<string, { buf: Buffer; createdAt: number }>()

const FILE_TTL_MS = 30 * 60 * 1000 // 30 min
const JOB_TTL_MS = 60 * 60 * 1000 // 1 hour

setInterval(() => {
  const now = Date.now()
  for (const [k, v] of files.entries()) {
    if (now - v.createdAt > FILE_TTL_MS) files.delete(k)
  }
  for (const [k, v] of jobs.entries()) {
    if (v.finishedAt && now - v.finishedAt.getTime() > JOB_TTL_MS) jobs.delete(k)
  }
  for (const [k, v] of accountingFiles.entries()) {
    if (now - v.createdAt > FILE_TTL_MS) accountingFiles.delete(k)
  }
}, 5 * 60 * 1000).unref()

// ── Helpers ──────────────────────────────────────────────────
function updateJob(jobId: string, patch: Partial<ImportJob>) {
  const j = jobs.get(jobId)
  if (!j) return
  Object.assign(j, patch)
}

function parseNumber(raw: any): number {
  if (raw == null || raw === '') return 0
  const s = String(raw).replace(',', '.').replace(/\s/g, '').replace(/[^\d.\-]/g, '')
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

function parseRussianDate(raw: any): Date | null {
  if (!raw) return null
  if (raw instanceof Date) return raw
  const s = String(raw).trim()
  // Format: DD.MM.YYYY HH:MM:SS or DD.MM.YYYY
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (m) {
    const [, dd, mm, yyyy, hh = '0', mi = '0', ss = '0'] = m
    const d = new Date(
      parseInt(yyyy),
      parseInt(mm) - 1,
      parseInt(dd),
      parseInt(hh),
      parseInt(mi),
      parseInt(ss),
    )
    return isNaN(d.getTime()) ? null : d
  }
  // Fallback ISO
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Parse a CSV line respecting quoted fields and the given delimiter.
 */
function parseCsvLine(line: string, delim: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === delim && !inQuotes) {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out.map((v) => v.trim())
}

function parseCsvBuffer(buf: Buffer): { headers: string[]; rows: any[][] } {
  let text = buf.toString('utf-8')
  // Strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  // Split on \r\n or \n, handle quoted newlines by simple split (the source is YuKassa — single-line rows)
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }

  // Detect delimiter: prefer `;` if present in the first line, else `,`
  const first = lines[0]
  const delim = first.includes(';') ? ';' : ','

  const headers = parseCsvLine(first, delim).map((h) => h.replace(/^"|"$/g, ''))
  const rows = lines.slice(1).map((line) => parseCsvLine(line, delim))
  return { headers, rows }
}

async function parseXlsxBuffer(buf: Buffer): Promise<{ headers: string[]; rows: any[][] }> {
  const wb = new ExcelJS.Workbook()
  // ExcelJS expects an ArrayBuffer-like value; cast keeps TS strictness happy
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  await wb.xlsx.load(ab as any)
  const ws = wb.worksheets[0]
  if (!ws) return { headers: [], rows: [] }

  const headers: string[] = []
  const rows: any[][] = []

  ws.eachRow((row, rowNum) => {
    const values = row.values as any[]
    // ExcelJS row.values is 1-indexed; first element is empty
    const arr: any[] = []
    for (let i = 1; i < values.length; i++) {
      let v = values[i]
      if (v == null) v = ''
      else if (typeof v === 'object' && 'text' in v) v = v.text
      else if (typeof v === 'object' && 'result' in v) v = v.result
      else if (v instanceof Date) v = v
      arr.push(v)
    }
    if (rowNum === 1) {
      for (const h of arr) headers.push(String(h ?? '').trim())
    } else {
      rows.push(arr)
    }
  })

  return { headers, rows }
}

function valueToString(v: any): string {
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') {
    if ('text' in v) return String((v as any).text ?? '')
    if ('result' in v) return String((v as any).result ?? '')
    return JSON.stringify(v)
  }
  return String(v)
}

// ── Routes ───────────────────────────────────────────────────
export async function adminImportRoutes(app: FastifyInstance) {
  const admin = { preHandler: [app.adminOnly] }

  // ── 1. Upload file ──────────────────────────────────────
  app.post('/upload', admin, async (req, reply) => {
    try {
      const data = await (req as any).file()
      if (!data) return reply.status(400).send({ error: 'No file uploaded' })

      const buf = await data.toBuffer()
      const filename: string = data.filename || 'upload'
      const ext = filename.split('.').pop()?.toLowerCase() || ''

      let parsed: { headers: string[]; rows: any[][] }
      let type: 'xlsx' | 'csv'
      if (ext === 'xlsx' || ext === 'xls') {
        parsed = await parseXlsxBuffer(buf)
        type = 'xlsx'
      } else if (ext === 'csv' || ext === 'txt') {
        parsed = parseCsvBuffer(buf)
        type = 'csv'
      } else {
        return reply.status(400).send({ error: `Unsupported file type: .${ext}` })
      }

      const fileId = randomUUID()
      files.set(fileId, {
        type,
        headers: parsed.headers,
        rows: parsed.rows,
        createdAt: Date.now(),
      })

      const preview = parsed.rows.slice(0, 10).map((r) => r.map(valueToString))

      logger.info(`Import file uploaded: ${filename} (${parsed.rows.length} rows, fileId=${fileId})`)

      return {
        fileId,
        type,
        headers: parsed.headers,
        preview,
        totalRows: parsed.rows.length,
      }
    } catch (err: any) {
      logger.error('Import upload failed: ' + (err?.message || String(err)))
      return reply.status(500).send({ error: 'Upload failed' })
    }
  })

  // ── 2. Start user import ────────────────────────────────
  app.post('/users/import', admin, async (req, reply) => {
    const { fileId, mapping } = req.body as { fileId: string; mapping: Record<string, string> }
    const file = files.get(fileId)
    if (!file) return reply.status(404).send({ error: 'File not found or expired' })

    const jobId = randomUUID()
    const job: ImportJob = {
      id: jobId,
      type: 'users',
      status: 'pending',
      total: file.rows.length,
      processed: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      warnings: 0,
      errorMessages: [],
      startedAt: new Date(),
    }
    jobs.set(jobId, job)

    // Run async (fire-and-forget)
    runUserImport(jobId, file, mapping).catch((err) => {
      logger.error('User import crashed: ' + (err?.message || String(err)))
      updateJob(jobId, {
        status: 'error',
        errorMessages: [...(jobs.get(jobId)?.errorMessages || []), String(err?.message || err)],
        finishedAt: new Date(),
      })
    })

    return { jobId }
  })

  // ── 3. Start payment import ─────────────────────────────
  app.post('/payments/import', admin, async (req, reply) => {
    const { fileId, mapping } = req.body as { fileId: string; mapping: Record<string, string> }
    const file = files.get(fileId)
    if (!file) return reply.status(404).send({ error: 'File not found or expired' })

    const jobId = randomUUID()
    const job: ImportJob = {
      id: jobId,
      type: 'payments',
      status: 'pending',
      total: file.rows.length,
      processed: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      warnings: 0,
      errorMessages: [],
      startedAt: new Date(),
    }
    jobs.set(jobId, job)

    runPaymentImport(jobId, file, mapping).catch((err) => {
      logger.error('Payment import crashed: ' + (err?.message || String(err)))
      updateJob(jobId, {
        status: 'error',
        errorMessages: [...(jobs.get(jobId)?.errorMessages || []), String(err?.message || err)],
        finishedAt: new Date(),
      })
    })

    return { jobId }
  })

  // ── 4. Progress (SSE) ───────────────────────────────────
  app.get('/jobs/:jobId', admin, async (req, reply) => {
    const { jobId } = req.params as { jobId: string }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    const interval = setInterval(() => {
      const job = jobs.get(jobId)
      if (!job) {
        clearInterval(interval)
        reply.raw.end()
        return
      }
      reply.raw.write(`data: ${JSON.stringify(job)}\n\n`)
      if (job.status === 'done' || job.status === 'error') {
        clearInterval(interval)
        setTimeout(() => reply.raw.end(), 1000)
      }
    }, 500)

    req.raw.on('close', () => clearInterval(interval))
  })

  // ── 5. Stats ────────────────────────────────────────────
  app.get('/stats', admin, async () => {
    try {
      const [usersWithLeadteh, paymentsWithCommission, commissionSumAgg] = await Promise.all([
        prisma.user.count({ where: { leadtehId: { not: null } } }),
        prisma.payment.count({ where: { commission: { gt: 0 } } }),
        prisma.payment.aggregate({
          _sum: { commission: true },
          where: { commission: { gt: 0 } },
        }),
      ])
      return {
        usersWithLeadtehId: usersWithLeadteh,
        paymentsWithCommission,
        totalCommission: Number(commissionSumAgg._sum.commission || 0),
      }
    } catch (err: any) {
      logger.error('Import stats failed: ' + (err?.message || String(err)))
      return { usersWithLeadtehId: 0, paymentsWithCommission: 0, totalCommission: 0 }
    }
  })

  // ── 6. Upload accounting xlsx & preview ─────────────────
  app.post('/accounting/preview', admin, async (req, reply) => {
    try {
      const data = await (req as any).file()
      if (!data) return reply.status(400).send({ error: 'No file uploaded' })

      const buf = await data.toBuffer()
      const preview = await parseAccountingXlsx(buf)

      // Store raw buffer for later import
      const fileId = randomUUID()
      accountingFiles.set(fileId, { buf, createdAt: Date.now() })

      return { fileId, preview }
    } catch (err: any) {
      logger.error('Accounting preview failed: ' + (err?.message || String(err)))
      return reply.status(500).send({ error: 'Preview failed: ' + (err?.message || '') })
    }
  })

  // ── 7. Start accounting import ─────────────────────────
  app.post('/accounting/import', admin, async (req, reply) => {
    const { fileId, options } = req.body as {
      fileId: string
      options: Record<string, boolean>
    }
    const stored = accountingFiles.get(fileId)
    if (!stored) return reply.status(404).send({ error: 'File not found or expired' })

    const jobId = randomUUID()
    const job: ImportJob = {
      id: jobId,
      type: 'accounting',
      status: 'pending',
      total: 0,
      processed: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      warnings: 0,
      errorMessages: [],
      startedAt: new Date(),
    }
    jobs.set(jobId, job)

    runAccountingImport(jobId, stored.buf, options).catch((err) => {
      logger.error('Accounting import crashed: ' + (err?.message || String(err)))
      updateJob(jobId, {
        status: 'error',
        errorMessages: [...(jobs.get(jobId)?.errorMessages || []), String(err?.message || err)],
        finishedAt: new Date(),
      })
    })

    return { jobId }
  })

  // ── 8. Clear buh data (admin only) ─────────────────────
  app.post('/clear-buh', admin, async (_req, reply) => {
    try {
      await prisma.$transaction([
        prisma.buhAdCampaign.deleteMany(),
        prisma.buhInkasRecord.deleteMany(),
        prisma.buhTransaction.deleteMany(),
        prisma.buhRecurringPayment.deleteMany(),
        prisma.buhVpnServer.deleteMany(),
        prisma.buhMonthlyStats.deleteMany(),
        prisma.buhPartner.deleteMany(),
      ])
      return { ok: true, message: 'All buh data cleared' }
    } catch (err: any) {
      return reply.status(500).send({ error: err?.message || 'Clear failed' })
    }
  })

  // ── 9. Clear users (except admins) ─────────────────────
  app.post('/clear-users', admin, async (_req, reply) => {
    try {
      const nonAdminIds = (await prisma.user.findMany({
        where: { role: { not: 'ADMIN' } },
        select: { id: true },
      })).map((u) => u.id)

      if (nonAdminIds.length === 0) return { ok: true, deleted: 0 }

      // Detach payments from users (set userId=null instead of deleting)
      await prisma.payment.updateMany({
        where: { userId: { in: nonAdminIds } },
        data: { userId: null },
      })

      const deleted = await prisma.user.deleteMany({
        where: { id: { in: nonAdminIds } },
      })
      return { ok: true, deleted: deleted.count }
    } catch (err: any) {
      return reply.status(500).send({ error: err?.message || 'Clear failed' })
    }
  })

  // ── 10. Clear payments ─────────────────────────────────
  app.post('/clear-payments', admin, async (_req, reply) => {
    try {
      const deleted = await prisma.payment.deleteMany()
      // Reset user payment counters
      await prisma.user.updateMany({
        data: { totalPaid: 0, paymentsCount: 0, lastPaymentAt: null },
      })
      return { ok: true, deleted: deleted.count }
    } catch (err: any) {
      return reply.status(500).send({ error: err?.message || 'Clear failed' })
    }
  })

  // ── 11. Sync payments from YuKassa API ──────────────────
  app.post('/yukassa-sync', admin, async (req, reply) => {
    if (!config.yukassa.enabled) {
      return reply.status(400).send({ error: 'ЮKassa не настроена (YUKASSA_SHOP_ID / YUKASSA_SECRET_KEY)' })
    }

    const { dateFrom, dateTo } = (req.body || {}) as { dateFrom?: string; dateTo?: string }

    const jobId = randomUUID()
    const job: ImportJob = {
      id: jobId,
      type: 'payments',
      status: 'pending',
      total: 0,
      processed: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      warnings: 0,
      errorMessages: [],
      startedAt: new Date(),
    }
    jobs.set(jobId, job)

    runYukassaSync(jobId, dateFrom, dateTo).catch((err) => {
      logger.error('YuKassa sync crashed: ' + (err?.message || String(err)))
      updateJob(jobId, {
        status: 'error',
        errorMessages: [...(jobs.get(jobId)?.errorMessages || []), String(err?.message || err)],
        finishedAt: new Date(),
      })
    })

    return { jobId }
  })

  // ── 12. Full DB export (JSON dump of all tables) ────────
  app.get('/db/export/json', admin, async (_req, reply) => {
    try {
      const [
        users, sessions, tariffs, payments, referralBonuses, news, notifications,
        notificationReads, telegramProxies, adminNotes, giftSubscriptions, balanceTransactions,
        emailVerifications, instructionPlatforms, instructionApps, instructionSteps,
        settings, importRecords, promoCodes, promoUsages, botMessages, broadcasts,
        broadcastRecipients, funnels, funnelSteps, funnelNodes, funnelLogs,
        buhCategories, buhAutoTagRules, buhTransactions, buhPartners, buhInkasRecords,
        buhVpnServers, buhAdCampaigns, buhRecurringPayments, buhMonthlyStats, buhMilestones,
        buhAuditLogs, buhNotificationChannels, buhUtmClicks, buhUtmLeads,
        buhWebhookApiKeys, buhWebhookPayments,
        botBlockGroups, botBlocks, botButtons, botTriggers, botBlockStats,
        userTags, userVariables, userSegments,
      ] = await Promise.all([
        prisma.user.findMany(),
        prisma.session.findMany(),
        prisma.tariff.findMany(),
        prisma.payment.findMany(),
        prisma.referralBonus.findMany(),
        prisma.news.findMany(),
        prisma.notification.findMany(),
        prisma.notificationRead.findMany(),
        prisma.telegramProxy.findMany(),
        prisma.adminNote.findMany(),
        prisma.giftSubscription.findMany(),
        prisma.balanceTransaction.findMany(),
        prisma.emailVerification.findMany(),
        prisma.instructionPlatform.findMany(),
        prisma.instructionApp.findMany(),
        prisma.instructionStep.findMany(),
        prisma.setting.findMany(),
        prisma.importRecord.findMany(),
        prisma.promoCode.findMany(),
        prisma.promoUsage.findMany(),
        prisma.botMessage.findMany(),
        prisma.broadcast.findMany(),
        prisma.broadcastRecipient.findMany(),
        prisma.funnel.findMany(),
        prisma.funnelStep.findMany(),
        prisma.funnelNode.findMany(),
        prisma.funnelLog.findMany(),
        prisma.buhCategory.findMany(),
        prisma.buhAutoTagRule.findMany(),
        prisma.buhTransaction.findMany(),
        prisma.buhPartner.findMany(),
        prisma.buhInkasRecord.findMany(),
        prisma.buhVpnServer.findMany(),
        prisma.buhAdCampaign.findMany(),
        prisma.buhRecurringPayment.findMany(),
        prisma.buhMonthlyStats.findMany(),
        prisma.buhMilestone.findMany(),
        prisma.buhAuditLog.findMany(),
        prisma.buhNotificationChannel.findMany(),
        prisma.buhUtmClick.findMany(),
        prisma.buhUtmLead.findMany(),
        prisma.buhWebhookApiKey.findMany(),
        prisma.buhWebhookPayment.findMany(),
        prisma.botBlockGroup.findMany(),
        prisma.botBlock.findMany(),
        prisma.botButton.findMany(),
        prisma.botTrigger.findMany(),
        prisma.botBlockStat.findMany(),
        prisma.userTag.findMany(),
        prisma.userVariable.findMany(),
        prisma.userSegment.findMany(),
      ])

      const dump = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        tables: {
          User: users,
          Session: sessions,
          Tariff: tariffs,
          Payment: payments,
          ReferralBonus: referralBonuses,
          News: news,
          Notification: notifications,
          NotificationRead: notificationReads,
          TelegramProxy: telegramProxies,
          AdminNote: adminNotes,
          GiftSubscription: giftSubscriptions,
          BalanceTransaction: balanceTransactions,
          EmailVerification: emailVerifications,
          InstructionPlatform: instructionPlatforms,
          InstructionApp: instructionApps,
          InstructionStep: instructionSteps,
          Setting: settings,
          ImportRecord: importRecords,
          PromoCode: promoCodes,
          PromoUsage: promoUsages,
          BotMessage: botMessages,
          Broadcast: broadcasts,
          BroadcastRecipient: broadcastRecipients,
          Funnel: funnels,
          FunnelStep: funnelSteps,
          FunnelNode: funnelNodes,
          FunnelLog: funnelLogs,
          BuhCategory: buhCategories,
          BuhAutoTagRule: buhAutoTagRules,
          BuhTransaction: buhTransactions,
          BuhPartner: buhPartners,
          BuhInkasRecord: buhInkasRecords,
          BuhVpnServer: buhVpnServers,
          BuhAdCampaign: buhAdCampaigns,
          BuhRecurringPayment: buhRecurringPayments,
          BuhMonthlyStats: buhMonthlyStats,
          BuhMilestone: buhMilestones,
          BuhAuditLog: buhAuditLogs,
          BuhNotificationChannel: buhNotificationChannels,
          BuhUtmClick: buhUtmClicks,
          BuhUtmLead: buhUtmLeads,
          BuhWebhookApiKey: buhWebhookApiKeys,
          BuhWebhookPayment: buhWebhookPayments,
          BotBlockGroup: botBlockGroups,
          BotBlock: botBlocks,
          BotButton: botButtons,
          BotTrigger: botTriggers,
          BotBlockStat: botBlockStats,
          UserTag: userTags,
          UserVariable: userVariables,
          UserSegment: userSegments,
        },
      }

      reply.header('Content-Type', 'application/json')
      reply.header('Content-Disposition', `attachment; filename="lkhy-full-dump-${Date.now()}.json"`)
      return dump
    } catch (err: any) {
      logger.error('DB export failed: ' + (err?.message || String(err)))
      return reply.status(500).send({ error: 'Export failed: ' + (err?.message || '') })
    }
  })

  // ── 13. Restore DB from JSON dump ────────────────────────
  app.post('/db/restore', admin, async (req, reply) => {
    try {
      const data = await (req as any).file()
      if (!data) return reply.status(400).send({ error: 'No file uploaded' })

      const buf = await data.toBuffer()
      const dump = JSON.parse(buf.toString('utf-8'))

      if (!dump.version || !dump.tables) {
        return reply.status(400).send({ error: 'Invalid dump file format' })
      }

      const jobId = randomUUID()
      const job: ImportJob = {
        id: jobId,
        type: 'accounting',
        status: 'pending',
        total: 0,
        processed: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
        warnings: 0,
        errorMessages: [],
        startedAt: new Date(),
      }
      jobs.set(jobId, job)

      runDbRestore(jobId, dump).catch((err) => {
        logger.error('DB restore crashed: ' + (err?.message || String(err)))
        updateJob(jobId, {
          status: 'error',
          errorMessages: [...(jobs.get(jobId)?.errorMessages || []), String(err?.message || err)],
          finishedAt: new Date(),
        })
      })

      return { jobId }
    } catch (err: any) {
      logger.error('DB restore upload failed: ' + (err?.message || String(err)))
      return reply.status(500).send({ error: 'Restore failed: ' + (err?.message || '') })
    }
  })

  // ── Legacy endpoints (preserved for compatibility) ──────
  app.get('/status', admin, async () => {
    try {
      const [total, matched, pending] = await Promise.all([
        prisma.importRecord.count(),
        prisma.importRecord.count({ where: { status: 'matched' } }),
        prisma.importRecord.count({ where: { status: 'pending' } }),
      ])
      return { total, matched, pending, unmatched: total - matched }
    } catch {
      return { total: 0, matched: 0, pending: 0, unmatched: 0 }
    }
  })
}

// ── Background workers ───────────────────────────────────────

async function runUserImport(
  jobId: string,
  file: ParsedFile,
  mapping: Record<string, string>,
) {
  updateJob(jobId, { status: 'running' })
  const job = jobs.get(jobId)!

  // Build column index by header
  const colIdx: Record<string, number> = {}
  for (const [header, field] of Object.entries(mapping)) {
    if (!field || field === '-') continue
    const idx = file.headers.indexOf(header)
    if (idx >= 0) colIdx[field] = idx
  }

  const getField = (row: any[], field: string): string => {
    const idx = colIdx[field]
    if (idx == null) return ''
    return valueToString(row[idx]).trim()
  }

  // Cache referrer data for pass 2
  const referrerMap: Array<{ userTelegramId: string; referrerLeadtehId?: string; referrerTgId?: string }> = []

  for (let i = 0; i < file.rows.length; i++) {
    const row = file.rows[i]
    try {
      const telegramId = getField(row, 'telegramId')
      if (!telegramId) {
        job.skipped += 1
        job.processed += 1
        continue
      }

      const leadtehId = getField(row, 'leadtehId') || null
      const telegramName = getField(row, 'telegramName') || null
      const email = getField(row, 'email') || null
      const remnawaveUuid = getField(row, 'remnawaveUuid') || null
      const balanceRaw = getField(row, 'balance')
      const balance = balanceRaw ? parseNumber(balanceRaw) : null
      const referrerLeadtehId = getField(row, 'referrerLeadtehId') || null
      const referrerTgId = getField(row, 'referrerTgId') || null

      if (referrerLeadtehId || referrerTgId) {
        referrerMap.push({
          userTelegramId: telegramId,
          referrerLeadtehId: referrerLeadtehId || undefined,
          referrerTgId: referrerTgId || undefined,
        })
      }

      const createData: any = { telegramId }
      const updateData: any = {}

      if (leadtehId) {
        createData.leadtehId = leadtehId
        updateData.leadtehId = leadtehId
      }
      if (telegramName) {
        createData.telegramName = telegramName
        updateData.telegramName = telegramName
      }
      if (email) {
        createData.email = email
        // Do not overwrite existing email by default — but the task says to fill fields. Keep safe update.
        updateData.email = email
      }
      if (remnawaveUuid) {
        createData.remnawaveUuid = remnawaveUuid
        updateData.remnawaveUuid = remnawaveUuid
      }
      if (balance != null) {
        createData.balance = balance
        updateData.balance = balance
      }

      // Upsert — check if user exists so we can increment created/updated
      const existing = await prisma.user.findUnique({ where: { telegramId } })
      try {
        await prisma.user.upsert({
          where: { telegramId },
          create: createData,
          update: updateData,
        })
        if (existing) job.updated += 1
        else job.created += 1
      } catch (err: any) {
        // Could fail due to unique email/leadtehId clash — retry without those fields
        const safeCreate = { ...createData }
        const safeUpdate = { ...updateData }
        delete safeCreate.email
        delete safeUpdate.email
        delete safeCreate.leadtehId
        delete safeUpdate.leadtehId
        try {
          await prisma.user.upsert({
            where: { telegramId },
            create: safeCreate,
            update: safeUpdate,
          })
          if (existing) job.updated += 1
          else job.created += 1
        } catch (err2: any) {
          job.errors += 1
          if (job.errorMessages.length < 20) {
            job.errorMessages.push(`Row ${i + 2}: ${String(err2?.message || err2).slice(0, 200)}`)
          }
        }
      }
    } catch (err: any) {
      job.errors += 1
      if (job.errorMessages.length < 20) {
        job.errorMessages.push(`Row ${i + 2}: ${String(err?.message || err).slice(0, 200)}`)
      }
    }
    job.processed += 1
  }

  // ── Pass 2: referrals ────────────────────────────────
  for (const rel of referrerMap) {
    try {
      let referrerUserId: string | null = null
      if (rel.referrerLeadtehId) {
        const r = await prisma.user.findUnique({
          where: { leadtehId: rel.referrerLeadtehId },
          select: { id: true },
        })
        if (r) referrerUserId = r.id
      }
      if (!referrerUserId && rel.referrerTgId) {
        const r = await prisma.user.findUnique({
          where: { telegramId: rel.referrerTgId },
          select: { id: true },
        })
        if (r) referrerUserId = r.id
      }
      if (referrerUserId) {
        await prisma.user.update({
          where: { telegramId: rel.userTelegramId },
          data: { referredById: referrerUserId },
        })
      }
    } catch {
      /* ignore individual referral failures */
    }
  }

  updateJob(jobId, { status: 'done', finishedAt: new Date() })
  logger.info(
    `User import done: created=${job.created} updated=${job.updated} skipped=${job.skipped} errors=${job.errors}`,
  )
}

async function runPaymentImport(
  jobId: string,
  file: ParsedFile,
  mapping: Record<string, string>,
) {
  updateJob(jobId, { status: 'running' })
  const job = jobs.get(jobId)!

  const colIdx: Record<string, number> = {}
  for (const [header, field] of Object.entries(mapping)) {
    if (!field || field === '-') continue
    const idx = file.headers.indexOf(header)
    if (idx >= 0) colIdx[field] = idx
  }

  const getField = (row: any[], field: string): string => {
    const idx = colIdx[field]
    if (idx == null) return ''
    return valueToString(row[idx]).trim()
  }

  // Find a default tariff (required for payment.tariffId)
  const defaultTariff = await prisma.tariff.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!defaultTariff) {
    updateJob(jobId, {
      status: 'error',
      finishedAt: new Date(),
      errorMessages: ['No tariff found in DB — create at least one tariff before importing payments'],
    })
    return
  }

  const idRegex = /\[ID(\d+)\]/

  for (let i = 0; i < file.rows.length; i++) {
    const row = file.rows[i]
    try {
      // Determine payment status
      const statusRaw = (getField(row, 'status') || '').toLowerCase().trim()
      let paymentStatus: 'PAID' | 'REFUNDED' | 'PARTIAL_REFUND' | null = null
      if (statusRaw === 'оплачен' || statusRaw === 'succeeded' || statusRaw === 'paid' || statusRaw === 'success') {
        paymentStatus = 'PAID'
      } else if (statusRaw === 'возвращен' || statusRaw === 'refunded') {
        paymentStatus = 'REFUNDED'
      } else if (statusRaw === 'частично возвращен' || statusRaw === 'partial_refund') {
        paymentStatus = 'PARTIAL_REFUND'
      }
      if (!paymentStatus) {
        job.skipped += 1
        job.processed += 1
        continue
      }

      const description = getField(row, 'description')
      const m = description.match(idRegex)
      const leadtehId = m ? m[1] : null

      let user: any = null
      if (leadtehId) {
        user = await prisma.user.findUnique({ where: { leadtehId } })
      }
      if (!user) {
        job.warnings += 1
      }

      const externalPaymentId = getField(row, 'externalPaymentId')
      if (externalPaymentId) {
        const existing = await prisma.payment.findUnique({ where: { externalPaymentId } })
        if (existing) {
          job.skipped += 1
          job.processed += 1
          continue
        }
      }

      const grossAmount = parseNumber(getField(row, 'grossAmount'))
      const amount = parseNumber(getField(row, 'amount'))
      if (!grossAmount || grossAmount <= 0) {
        job.skipped += 1
        job.processed += 1
        continue
      }
      const netAmount = amount > 0 ? amount : grossAmount
      const commission = Math.max(0, +(grossAmount - netAmount).toFixed(2))

      // Require valid date
      const createdAtRaw = getField(row, 'createdAt')
      const createdAt = parseRussianDate(createdAtRaw)
      if (!createdAt) {
        job.skipped += 1
        job.processed += 1
        continue
      }

      // Refund data
      const refundAmountRaw = parseNumber(getField(row, 'refundAmount'))
      const refundAmount = refundAmountRaw > 0 ? refundAmountRaw : (paymentStatus === 'REFUNDED' ? grossAmount : null)
      const refundDateRaw = getField(row, 'refundDate')
      const refundedAt = refundDateRaw ? parseRussianDate(refundDateRaw) : null

      await prisma.$transaction(async (tx) => {
        await tx.payment.create({
          data: {
            userId: user?.id ?? null,
            tariffId: defaultTariff.id,
            provider: 'YUKASSA',
            providerOrderId: externalPaymentId || null,
            externalPaymentId: externalPaymentId || null,
            amount: netAmount,
            commission,
            currency: 'RUB',
            status: paymentStatus!,
            createdAt,
            confirmedAt: paymentStatus === 'PAID' ? createdAt : null,
            refundAmount: refundAmount ?? null,
            refundedAt: refundedAt ?? null,
          },
        })
        if (user && paymentStatus === 'PAID') {
          await tx.user.update({
            where: { id: user.id },
            data: {
              totalPaid: { increment: netAmount },
              paymentsCount: { increment: 1 },
              lastPaymentAt: createdAt,
            },
          })
        }
      })

      job.created += 1
    } catch (err: any) {
      job.errors += 1
      if (job.errorMessages.length < 20) {
        job.errorMessages.push(`Row ${i + 2}: ${String(err?.message || err).slice(0, 200)}`)
      }
    }
    job.processed += 1
  }

  updateJob(jobId, { status: 'done', finishedAt: new Date() })
  logger.info(
    `Payment import done: created=${job.created} skipped=${job.skipped} warnings=${job.warnings} errors=${job.errors}`,
  )
}

// ── Accounting xlsx helpers ─────────────────────────────────

function md5(str: string): string {
  return createHash('md5').update(str).digest('hex')
}

function cellVal(row: ExcelJS.Row, col: number): any {
  const cell = row.getCell(col)
  if (!cell || cell.value == null) return null
  const v = cell.value
  if (typeof v === 'object' && v !== null) {
    if ('result' in v) return (v as any).result
    if ('text' in v) return (v as any).text
    if ('hyperlink' in v) return (v as any).text || (v as any).hyperlink
  }
  return v
}

function cellStr(row: ExcelJS.Row, col: number): string {
  const v = cellVal(row, col)
  return v != null ? String(v).trim() : ''
}

function cellNum(row: ExcelJS.Row, col: number): number {
  const v = cellVal(row, col)
  if (v == null || v === '') return 0
  const n = parseFloat(String(v).replace(',', '.').replace(/\s/g, ''))
  return isNaN(n) ? 0 : n
}

function cellDate(row: ExcelJS.Row, col: number): Date | null {
  const v = cellVal(row, col)
  if (!v) return null
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v
  const d = new Date(String(v))
  return isNaN(d.getTime()) ? null : d
}

interface AccountingPreview {
  expenses: { count: number; totalAmount: number }
  investments: { count: number; totalAmount: number }
  inkas: { count: number; totalAmount: number }
  ads: { count: number; totalAmount: number }
  servers: { count: number }
  stats: { count: number }
}

async function parseAccountingXlsx(buf: Buffer): Promise<AccountingPreview> {
  const wb = new ExcelJS.Workbook()
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  await wb.xlsx.load(ab as any)

  const result: AccountingPreview = {
    expenses: { count: 0, totalAmount: 0 },
    investments: { count: 0, totalAmount: 0 },
    inkas: { count: 0, totalAmount: 0 },
    ads: { count: 0, totalAmount: 0 },
    servers: { count: 0 },
    stats: { count: 0 },
  }

  const wsExpenses = wb.getWorksheet('Расходы со счёта')
  if (wsExpenses) {
    wsExpenses.eachRow((row, num) => {
      if (num <= 1) return
      const date = cellDate(row, 1)
      const amount = cellNum(row, 3)
      if (date && amount > 0) {
        result.expenses.count++
        result.expenses.totalAmount += amount
      }
    })
  }

  const wsInv = wb.getWorksheet('Инвестиции')
  if (wsInv) {
    wsInv.eachRow((row, num) => {
      if (num <= 1) return
      const date = cellDate(row, 1)
      const amount = cellNum(row, 3)
      if (date && amount > 0) {
        result.investments.count++
        result.investments.totalAmount += amount
      }
    })
  }

  const wsInkas = wb.getWorksheet('Инкас')
  if (wsInkas) {
    wsInkas.eachRow((row, num) => {
      if (num <= 1) return
      const month = cellStr(row, 1)
      const type = cellStr(row, 2)
      const amount = cellNum(row, 3)
      if (month && type && amount > 0) {
        result.inkas.count++
        result.inkas.totalAmount += amount
      }
    })
  }

  const wsAds = wb.getWorksheet('Реклама')
  if (wsAds) {
    wsAds.eachRow((row, num) => {
      if (num <= 1) return
      const amount = cellNum(row, 3)
      const name = cellStr(row, 4)
      if (name) {
        result.ads.count++
        result.ads.totalAmount += amount
      }
    })
  }

  const wsPayments = wb.getWorksheet('Оплаты')
  if (wsPayments) {
    wsPayments.eachRow((row, num) => {
      if (num <= 1) return
      const name = cellStr(row, 2)
      if (name && !name.startsWith('ИТОГО')) result.servers.count++
    })
  }

  const wsStats = wb.getWorksheet('Статистика')
  if (wsStats) {
    wsStats.eachRow((row, num) => {
      if (num <= 1) return
      const revenue = cellNum(row, 2)
      if (revenue > 0) result.stats.count++
    })
  }

  return result
}

// ── Category auto-map for accounting import ─────────────────

const CATEGORY_MAP: Record<string, string[]> = {
  'Серверы':   ['серверов', 'сервер', '4vps', 'fornex', 'procloud', 'cloud4box', 'yandex', 'adminvps', 'beget', 'hip-hosting', 'regru'],
  'Реклама':   ['реклама'],
  'Подписки':  ['подписка', 'премиум', 'claude', 'яндекс 360'],
  'LeadTex':   ['leadtex'],
  'ФНС':       ['фнс', 'налог'],
  '��озыгрыш':  ['розыгрыш'],
  'СКАМ':      ['скам'],
}

function detectCategory(description: string): string {
  const lower = description.toLowerCase()
  for (const [cat, keywords] of Object.entries(CATEGORY_MAP)) {
    if (keywords.some((kw) => lower.includes(kw))) return cat
  }
  return 'Прочее'
}

// ── Month name mapping ──────────────────────────────────────

const MONTH_NAMES: Record<string, number> = {
  'ЯНВАРЬ': 1, 'ФЕВРАЛЬ': 2, 'МАРТ': 3, 'АПРЕЛЬ': 4,
  'МАЙ': 5, 'ИЮНЬ': 6, 'ИЮЛЬ': 7, 'АВГУСТ': 8,
  'СЕНТЯБРЬ': 9, 'ОКТЯБРЬ': 10, 'НОЯБРЬ': 11, 'ДЕКАБРЬ': 12,
}

const STAT_MONTH_NAMES: Record<string, number> = {
  'Январь': 1, 'Февраль': 2, 'Март': 3, 'Апрель': 4,
  'Май': 5, 'Июнь': 6, 'Июль': 7, 'Август': 8,
  'Сентябрь': 9, 'Октябрь': 10, 'Ноябрь': 11, 'Декабрь': 12,
}

// ── Partner name mapping ────────────────────────────────────

function extractPartnerName(typeStr: string): { partnerName: string; inkasType: string } | null {
  const upper = typeStr.toUpperCase().trim()
  if (upper.startsWith('ВОЗВРИНВ')) {
    const name = typeStr.replace(/ВОЗВРИНВ/i, '').trim()
    return { partnerName: name, inkasType: 'RETURN_INV' }
  }
  if (upper.startsWith('ДВД')) {
    const name = typeStr.replace(/ДВД/i, '').trim()
    return { partnerName: name, inkasType: 'DIVIDEND' }
  }
  if (upper.startsWith('ВИНВ')) {
    const name = typeStr.replace(/ВИНВ/i, '').trim()
    return { partnerName: name, inkasType: 'INVESTMENT' }
  }
  return null
}

// ── Main accounting import worker ───────────────────────────

async function runAccountingImport(
  jobId: string,
  buf: Buffer,
  options: Record<string, boolean>,
) {
  updateJob(jobId, { status: 'running' })
  const job = jobs.get(jobId)!

  const wb = new ExcelJS.Workbook()
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  await wb.xlsx.load(ab as any)

  // Pre-load categories (create if missing)
  const categoryCache = new Map<string, string>()
  const existingCats = await prisma.buhCategory.findMany()
  for (const c of existingCats) categoryCache.set(c.name, c.id)

  async function ensureCategory(name: string, color?: string): Promise<string> {
    if (categoryCache.has(name)) return categoryCache.get(name)!
    const cat = await prisma.buhCategory.create({
      data: { name, color: color || '#6B7280', icon: '📁', isActive: true },
    })
    categoryCache.set(name, cat.id)
    return cat.id
  }

  // Pre-load partners
  const partnerCache = new Map<string, string>()
  const existingPartners = await prisma.buhPartner.findMany()
  for (const p of existingPartners) partnerCache.set(p.name, p.id)

  async function ensurePartner(name: string): Promise<string> {
    if (partnerCache.has(name)) return partnerCache.get(name)!
    const initials = name.split(' ').map((w) => w[0] || '').join('').toUpperCase().slice(0, 2) || name.slice(0, 2).toUpperCase()
    const colors = ['#534AB7', '#E75A5A', '#3B82F6', '#10B981', '#F59E0B']
    const color = colors[partnerCache.size % colors.length]
    const p = await prisma.buhPartner.create({
      data: { name, roleLabel: 'Партнёр', avatarColor: color, initials, isActive: true },
    })
    partnerCache.set(name, p.id)
    return p.id
  }

  // Count total rows for progress
  let totalRows = 0
  if (options.expenses) {
    const ws = wb.getWorksheet('Расходы со счёта')
    if (ws) ws.eachRow((_, n) => { if (n > 1) totalRows++ })
  }
  if (options.investments) {
    const ws = wb.getWorksheet('Инвестиции')
    if (ws) ws.eachRow((_, n) => { if (n > 1) totalRows++ })
  }
  if (options.inkas) {
    const ws = wb.getWorksheet('Инкас')
    if (ws) ws.eachRow((_, n) => { if (n > 1) totalRows++ })
  }
  if (options.ads) {
    const ws = wb.getWorksheet('Реклама')
    if (ws) ws.eachRow((_, n) => { if (n > 1) totalRows++ })
  }
  if (options.servers) {
    const ws = wb.getWorksheet('Оплаты')
    if (ws) ws.eachRow((_, n) => { if (n > 1) totalRows++ })
  }
  if (options.stats) {
    const ws = wb.getWorksheet('Статистика')
    if (ws) ws.eachRow((_, n) => { if (n > 1) totalRows++ })
  }
  job.total = totalRows

  // Build investment lookup (date+amount → true) for ads budget detection
  const investmentLookup = new Set<string>()
  const wsInvForLookup = wb.getWorksheet('Инвестиции')
  if (wsInvForLookup) {
    wsInvForLookup.eachRow((row, num) => {
      if (num <= 1) return
      const date = cellDate(row, 1)
      const amount = cellNum(row, 3)
      const type = cellStr(row, 2)
      if (date && amount > 0 && type.toLowerCase().includes('реклам')) {
        const key = `${date.toISOString().slice(0, 10)}_${amount}`
        investmentLookup.add(key)
      }
    })
  }

  // ── Import: Расходы со счёта ──────────────────────────────
  if (options.expenses) {
    const ws = wb.getWorksheet('Расходы со счёта')
    if (ws) {
      const rows: ExcelJS.Row[] = []
      ws.eachRow((row, num) => { if (num > 1) rows.push(row) })

      for (const row of rows) {
        try {
          const date = cellDate(row, 1)
          const description = cellStr(row, 2)
          const amount = cellNum(row, 3)
          const receiptUrl = cellStr(row, 4)

          if (!date || amount <= 0 || !description) {
            job.skipped++
            job.processed++
            continue
          }

          const catName = detectCategory(description)
          const categoryId = await ensureCategory(catName)
          const hash = md5(`${date.toISOString().slice(0, 10)}_EXPENSE_${amount}_${description}`)

          await prisma.buhTransaction.upsert({
            where: { externalHash: hash },
            create: {
              type: 'EXPENSE',
              amount,
              date,
              categoryId,
              description,
              receiptUrl: receiptUrl || null,
              isHistorical: true,
              source: 'import',
              externalHash: hash,
            },
            update: {
              amount,
              categoryId,
              description,
              receiptUrl: receiptUrl || null,
            },
          })

          job.created++
        } catch (err: any) {
          job.errors++
          if (job.errorMessages.length < 20) {
            job.errorMessages.push(`Расходы: ${String(err?.message || err).slice(0, 200)}`)
          }
        }
        job.processed++
      }
    }
  }

  // ── Import: Инвестиции ────────────────────────────────────
  if (options.investments) {
    const ws = wb.getWorksheet('Инвестиции')
    if (ws) {
      const rows: ExcelJS.Row[] = []
      ws.eachRow((row, num) => { if (num > 1) rows.push(row) })

      for (const row of rows) {
        try {
          const date = cellDate(row, 1)
          const description = cellStr(row, 2)
          const amount = cellNum(row, 3)
          const receiptUrl = cellStr(row, 4)

          if (!date || amount <= 0 || !description) {
            job.skipped++
            job.processed++
            continue
          }

          const catName = detectCategory(description)
          const categoryId = await ensureCategory(catName)
          const hash = md5(`${date.toISOString().slice(0, 10)}_INV_${amount}_${description}`)

          await prisma.buhTransaction.upsert({
            where: { externalHash: hash },
            create: {
              type: 'EXPENSE',
              amount,
              date,
              categoryId,
              description,
              receiptUrl: receiptUrl || null,
              isHistorical: true,
              source: 'investment',
              externalHash: hash,
            },
            update: {
              amount,
              categoryId,
              description,
              receiptUrl: receiptUrl || null,
            },
          })

          job.created++
        } catch (err: any) {
          job.errors++
          if (job.errorMessages.length < 20) {
            job.errorMessages.push(`Инвестиции: ${String(err?.message || err).slice(0, 200)}`)
          }
        }
        job.processed++
      }
    }
  }

  // ── Import: Инкас ─────────────────────────────────────────
  if (options.inkas) {
    const ws = wb.getWorksheet('Инкас')
    if (ws) {
      const rows: ExcelJS.Row[] = []
      ws.eachRow((row, num) => { if (num > 1) rows.push(row) })

      for (const row of rows) {
        try {
          const monthStr = cellStr(row, 1).toUpperCase()
          const typeStr = cellStr(row, 2)
          const amount = cellNum(row, 3)

          if (!monthStr || !typeStr || amount <= 0) {
            job.skipped++
            job.processed++
            continue
          }

          const parsed = extractPartnerName(typeStr)
          if (!parsed) {
            job.skipped++
            job.processed++
            continue
          }

          const partnerId = await ensurePartner(parsed.partnerName)
          const monthNum = MONTH_NAMES[monthStr]
          if (!monthNum) {
            job.skipped++
            job.processed++
            continue
          }

          // Determine year: Aug-Dec = 2025, Jan+ = 2026
          const year = monthNum >= 8 ? 2025 : 2026
          const date = new Date(year, monthNum - 1, 15) // mid-month

          const monthLabel = `${monthStr.charAt(0)}${monthStr.slice(1).toLowerCase()} ${year}`

          // Dedup by partner + month + type + amount
          const dedupKey = `${partnerId}_${monthLabel}_${parsed.inkasType}_${amount}`
          const existing = await prisma.buhInkasRecord.findFirst({
            where: { partnerId, monthLabel, type: parsed.inkasType as any, amount },
          })

          if (existing) {
            job.skipped++
            job.processed++
            continue
          }

          await prisma.buhInkasRecord.create({
            data: {
              partnerId,
              type: parsed.inkasType as any,
              amount,
              date,
              monthLabel,
              description: typeStr,
            },
          })

          job.created++
        } catch (err: any) {
          job.errors++
          if (job.errorMessages.length < 20) {
            job.errorMessages.push(`Инкас: ${String(err?.message || err).slice(0, 200)}`)
          }
        }
        job.processed++
      }
    }
  }

  // ── Import: Реклама ───────────────────────────────────────
  if (options.ads) {
    const ws = wb.getWorksheet('Реклама')
    if (ws) {
      const rows: ExcelJS.Row[] = []
      ws.eachRow((row, num) => { if (num > 1) rows.push(row) })

      let lastDate: Date | null = null
      let adIndex = 0

      for (const row of rows) {
        try {
          const dateVal = cellDate(row, 1)
          if (dateVal) lastDate = dateVal
          const date = lastDate
          const format = cellStr(row, 2)
          const amount = cellNum(row, 3)
          const channelName = cellStr(row, 4)
          const subscribersStr = cellStr(row, 5)
          const channelUrl = cellStr(row, 6)
          const screenshotUrl = cellStr(row, 7)

          if (!channelName) {
            job.skipped++
            job.processed++
            continue
          }

          if (!date) {
            job.skipped++
            job.processed++
            continue
          }

          // Parse subscribers (can be ">2000", "1841", etc)
          const subsParsed = parseInt(subscribersStr.replace(/[^\d]/g, ''), 10)
          const subscribers = isNaN(subsParsed) ? null : subsParsed

          // Detect budget source
          const dateKey = date.toISOString().slice(0, 10)
          const lookupKey = `${dateKey}_${amount}`
          const budgetSource = amount > 0 && investmentLookup.has(lookupKey) ? 'investment' : amount > 0 ? 'account' : 'stats_only'

          // Unique UTM code for historical campaigns
          const utmCode = `hist-${dateKey}-${adIndex++}`

          // Dedup by channel + date + amount
          const existing = await prisma.buhAdCampaign.findFirst({
            where: { channelName, date, amount },
          })

          if (existing) {
            job.skipped++
            job.processed++
            continue
          }

          // Create ad campaign
          const campaign = await prisma.buhAdCampaign.create({
            data: {
              date,
              channelName,
              channelUrl: channelUrl || null,
              format: format || null,
              amount: amount || 0,
              subscribersGained: subscribers,
              screenshotUrl: screenshotUrl || null,
              budgetSource,
              utmCode,
              targetType: 'bot',
            },
          })

          // If budgetSource = 'account', create linked expense transaction
          if (budgetSource === 'account' && amount > 0) {
            const catId = await ensureCategory('Реклама', '#E75A5A')
            const hash = md5(`${dateKey}_AD_EXPENSE_${amount}_${channelName}`)
            await prisma.buhTransaction.upsert({
              where: { externalHash: hash },
              create: {
                type: 'EXPENSE',
                amount,
                date,
                categoryId: catId,
                description: `Реклама: ${channelName}`,
                isHistorical: true,
                source: 'import',
                externalHash: hash,
              },
              update: {
                amount,
                description: `Реклама: ${channelName}`,
              },
            })
            // Link transaction to campaign
            const tx = await prisma.buhTransaction.findUnique({ where: { externalHash: hash } })
            if (tx) {
              await prisma.buhAdCampaign.update({
                where: { id: campaign.id },
                data: { transactionId: tx.id },
              })
            }
          }

          job.created++
        } catch (err: any) {
          job.errors++
          if (job.errorMessages.length < 20) {
            job.errorMessages.push(`Реклама: ${String(err?.message || err).slice(0, 200)}`)
          }
        }
        job.processed++
      }
    }
  }

  // ── Import: Оплаты (серверы) ──────────────────────────────
  if (options.servers) {
    const ws = wb.getWorksheet('Оплаты')
    if (ws) {
      const rows: ExcelJS.Row[] = []
      ws.eachRow((row, num) => { if (num > 1) rows.push(row) })

      for (const row of rows) {
        try {
          const paymentDay = cellNum(row, 1)
          const provider = cellStr(row, 2)
          const amount = cellNum(row, 3)
          const comment = cellStr(row, 4)

          if (!provider || amount <= 0 || provider.startsWith('ИТОГО')) {
            job.skipped++
            job.processed++
            continue
          }

          const serverName = `${provider} — ${comment || 'Сервер'}`

          // Dedup by name
          let server = await prisma.buhVpnServer.findFirst({ where: { name: serverName } })
          if (!server) {
            const now = new Date()
            const nextPayment = new Date(now.getFullYear(), now.getMonth(), paymentDay)
            if (nextPayment < now) nextPayment.setMonth(nextPayment.getMonth() + 1)

            server = await prisma.buhVpnServer.create({
              data: {
                name: serverName,
                provider,
                purpose: comment || null,
                monthlyCost: amount,
                paymentDay: paymentDay || 1,
                nextPaymentDate: nextPayment,
                status: 'ACTIVE',
                isActive: true,
              },
            })
            job.created++
          } else {
            job.skipped++
          }
        } catch (err: any) {
          job.errors++
          if (job.errorMessages.length < 20) {
            job.errorMessages.push(`Серверы: ${String(err?.message || err).slice(0, 200)}`)
          }
        }
        job.processed++
      }
    }
  }

  // ── Import: Статистика ────────────────────────────────────
  if (options.stats) {
    const ws = wb.getWorksheet('Статистика')
    if (ws) {
      const rows: ExcelJS.Row[] = []
      ws.eachRow((row, num) => { if (num > 1) rows.push(row) })

      for (const row of rows) {
        try {
          const monthName = cellStr(row, 1)
          const revenue = cellNum(row, 2)
          if (!monthName || revenue <= 0) {
            job.skipped++
            job.processed++
            continue
          }

          const monthNum = STAT_MONTH_NAMES[monthName]
          if (!monthNum) {
            job.skipped++
            job.processed++
            continue
          }

          // Year: Aug-Dec = 2025, Jan+ = 2026
          const year = monthNum >= 8 ? 2025 : 2026

          await prisma.buhMonthlyStats.upsert({
            where: { year_month: { year, month: monthNum } },
            create: {
              year,
              month: monthNum,
              avgCheck: cellNum(row, 5) || null,
              totalPayments: cellNum(row, 6) || null,
              totalRefunds: cellNum(row, 7) || null,
              onlineCount: cellNum(row, 10) || null,
              onlineWeekly: cellNum(row, 11) || null,
              pdpInChannel: cellNum(row, 12) || null,
              tagPaid: cellNum(row, 9) || null,
            },
            update: {
              avgCheck: cellNum(row, 5) || null,
              totalPayments: cellNum(row, 6) || null,
              totalRefunds: cellNum(row, 7) || null,
              onlineCount: cellNum(row, 10) || null,
              onlineWeekly: cellNum(row, 11) || null,
              pdpInChannel: cellNum(row, 12) || null,
              tagPaid: cellNum(row, 9) || null,
            },
          })

          job.created++
        } catch (err: any) {
          job.errors++
          if (job.errorMessages.length < 20) {
            job.errorMessages.push(`Статистика: ${String(err?.message || err).slice(0, 200)}`)
          }
        }
        job.processed++
      }
    }
  }

  updateJob(jobId, { status: 'done', finishedAt: new Date() })
  logger.info(
    `Accounting import done: created=${job.created} updated=${job.updated} skipped=${job.skipped} errors=${job.errors}`,
  )
}

// ── YuKassa API sync ────────────────────────────────────────

async function runYukassaSync(jobId: string, dateFrom?: string, dateTo?: string) {
  updateJob(jobId, { status: 'running' })
  const job = jobs.get(jobId)!

  const idRegex = /\[ID(\d+)\]/

  // Default: last 7 days if no date range
  const now = new Date()
  const from = dateFrom || new Date(now.getTime() - 7 * 86400000).toISOString()
  const to = dateTo || now.toISOString()

  // Find default tariff
  const defaultTariff = await prisma.tariff.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!defaultTariff) {
    updateJob(jobId, { status: 'error', finishedAt: new Date(), errorMessages: ['Нет тарифов в БД'] })
    return
  }

  try {
    // ── Sync payments ────────────────────────────────────
    let cursor: string | undefined
    let totalFetched = 0

    do {
      const res = await paymentService.yukassa.listPayments({
        createdAtGte: from,
        createdAtLte: to,
        cursor,
        limit: 100,
      })

      totalFetched += res.items.length
      job.total = totalFetched

      for (const yp of res.items) {
        try {
          // Only process:
          // - succeeded with paid=true → real payment
          // - canceled with refunded_amount > 0 → refund
          // Skip everything else (expired, not paid, etc.)
          const isPaid = yp.status === 'succeeded' && (yp as any).paid === true
          const isRefund = yp.status === 'canceled' && yp.refunded_amount && parseFloat(yp.refunded_amount.value) > 0
          if (!isPaid && !isRefund) {
            job.skipped++
            job.processed++
            continue
          }

          // Skip if already exists
          const existing = await prisma.payment.findFirst({
            where: { OR: [{ yukassaPaymentId: yp.id }, { externalPaymentId: yp.id }] },
          })

          if (existing) {
            // Update commission if missing
            if (yp.income_amount && (!existing.commission || Number(existing.commission) === 0)) {
              const gross = parseFloat(yp.amount.value)
              const net = parseFloat(yp.income_amount.value)
              const commission = Math.max(0, +(gross - net).toFixed(2))
              if (commission > 0) {
                await prisma.payment.update({
                  where: { id: existing.id },
                  data: { commission },
                })
                job.updated++
              }
            }

            // Update refund if payment was refunded
            if (yp.status === 'canceled' && yp.refunded_amount) {
              const refundAmount = parseFloat(yp.refunded_amount.value)
              if (refundAmount > 0 && existing.status === 'PAID') {
                const gross = parseFloat(yp.amount.value)
                const isFullRefund = refundAmount >= gross - 0.01
                await prisma.payment.update({
                  where: { id: existing.id },
                  data: {
                    status: isFullRefund ? 'REFUNDED' : 'PARTIAL_REFUND',
                    refundAmount,
                    refundedAt: new Date(yp.captured_at || yp.created_at),
                  },
                })
                job.updated++
              }
            }

            // ── Re-match userId for payments imported before users were loaded ──
            // If we already have the payment but no user linked, try to resolve now.
            // User counters are recomputed in one pass at the end of the sync to avoid
            // double-counting on repeated runs.
            if (!existing.userId) {
              const desc = yp.description || ''
              const m = desc.match(idRegex)
              const leadtehId = m ? m[1] : null
              if (leadtehId) {
                const user = await prisma.user.findUnique({
                  where: { leadtehId },
                  select: { id: true },
                })
                if (user) {
                  await prisma.payment.update({
                    where: { id: existing.id },
                    data: { userId: user.id },
                  })
                  job.updated++
                }
              }
            }

            job.skipped++
            job.processed++
            continue
          }

          // New payment — create
          const gross = parseFloat(yp.amount.value)
          // Skip test/garbage payments with unrealistic amounts
          if (gross >= 100000) {
            job.skipped++
            job.processed++
            continue
          }
          let net: number
          let commission: number
          if (yp.income_amount) {
            net = parseFloat(yp.income_amount.value)
            commission = Math.max(0, +(gross - net).toFixed(2))
          } else {
            // Estimate commission at 3.5% when income_amount not available
            commission = +(gross * 0.035).toFixed(2)
            net = +(gross - commission).toFixed(2)
          }
          const createdAt = new Date(yp.created_at)

          // Try to find user from description
          const desc = yp.description || ''
          const m = desc.match(idRegex)
          const leadtehId = m ? m[1] : null
          let userId: string | null = null
          if (leadtehId) {
            const user = await prisma.user.findUnique({ where: { leadtehId }, select: { id: true } })
            userId = user?.id ?? null
          }
          if (!userId) job.warnings++

          // Determine status
          let status: 'PAID' | 'REFUNDED' | 'PARTIAL_REFUND' = 'PAID'
          let refundAmount: number | null = null
          let refundedAt: Date | null = null

          if (yp.status === 'canceled' && yp.refunded_amount) {
            const ra = parseFloat(yp.refunded_amount.value)
            if (ra > 0) {
              refundAmount = ra
              status = ra >= gross - 0.01 ? 'REFUNDED' : 'PARTIAL_REFUND'
              refundedAt = new Date(yp.captured_at || yp.created_at)
            }
          }

          await prisma.payment.create({
            data: {
              userId,
              tariffId: defaultTariff.id,
              provider: 'YUKASSA',
              yukassaPaymentId: yp.id,
              externalPaymentId: yp.id,
              amount: net,
              commission,
              currency: yp.amount.currency,
              status,
              createdAt,
              confirmedAt: yp.status === 'succeeded' ? createdAt : null,
              refundAmount,
              refundedAt,
            },
          })

          // Update user counters for paid
          if (userId && status === 'PAID') {
            await prisma.user.update({
              where: { id: userId },
              data: {
                totalPaid: { increment: net },
                paymentsCount: { increment: 1 },
                lastPaymentAt: createdAt,
              },
            })
          }

          job.created++
        } catch (err: any) {
          job.errors++
          if (job.errorMessages.length < 20) {
            job.errorMessages.push(`Payment ${yp.id}: ${String(err?.message || err).slice(0, 200)}`)
          }
        }
        job.processed++
      }

      cursor = res.nextCursor
    } while (cursor)

    // ── Sync refunds (catch refunds made after payment sync) ──
    let refundCursor: string | undefined
    do {
      const res = await paymentService.yukassa.listRefunds({
        createdAtGte: from,
        createdAtLte: to,
        cursor: refundCursor,
        limit: 100,
      })

      for (const ref of res.items) {
        try {
          if (ref.status !== 'succeeded') continue

          const payment = await prisma.payment.findFirst({
            where: { OR: [{ yukassaPaymentId: ref.payment_id }, { externalPaymentId: ref.payment_id }] },
          })

          if (!payment) continue
          if (payment.status === 'REFUNDED') continue // already processed

          const refundAmt = parseFloat(ref.amount.value)
          const gross = payment.amount + Number(payment.commission || 0)
          const isFullRefund = refundAmt >= gross - 0.01

          await prisma.payment.update({
            where: { id: payment.id },
            data: {
              status: isFullRefund ? 'REFUNDED' : 'PARTIAL_REFUND',
              refundAmount: refundAmt,
              refundedAt: new Date(ref.created_at),
            },
          })
          job.updated++
        } catch (err: any) {
          job.errors++
          if (job.errorMessages.length < 20) {
            job.errorMessages.push(`Refund ${ref.id}: ${String(err?.message || err).slice(0, 200)}`)
          }
        }
      }

      refundCursor = res.nextCursor
    } while (refundCursor)

    // ── Recompute user counters (totalPaid, paymentsCount, lastPaymentAt) ──
    // Idempotent — runs over all matched payments after sync is complete.
    // Necessary because we re-match userId for old imports where user
    // counters weren't incremented (userId was null during initial sync).
    try {
      await prisma.$executeRawUnsafe(`
        UPDATE users u SET
          total_paid      = COALESCE(agg.total, 0),
          payments_count  = COALESCE(agg.cnt, 0),
          last_payment_at = agg.last_at
        FROM (
          SELECT user_id,
                 SUM(amount)      AS total,
                 COUNT(*)         AS cnt,
                 MAX(COALESCE(confirmed_at, created_at)) AS last_at
          FROM payments
          WHERE user_id IS NOT NULL
            AND status = 'PAID'
            AND provider IN ('YUKASSA','CRYPTOPAY')
          GROUP BY user_id
        ) agg
        WHERE u.id = agg.user_id
      `)
      logger.info('YuKassa sync: user counters recomputed')
    } catch (err: any) {
      logger.error(`User counters recompute failed: ${err.message}`)
    }

  } catch (err: any) {
    job.errors++
    job.errorMessages.push(`API error: ${String(err?.message || err).slice(0, 300)}`)
  }

  updateJob(jobId, { status: 'done', finishedAt: new Date() })
  logger.info(
    `YuKassa sync done: created=${job.created} updated=${job.updated} skipped=${job.skipped} warnings=${job.warnings} errors=${job.errors}`,
  )
}

// ── DB Restore from JSON dump ────────────────────────────────

async function runDbRestore(jobId: string, dump: any) {
  updateJob(jobId, { status: 'running' })
  const job = jobs.get(jobId)!

  const tables = dump.tables || {}

  // Restore order matters due to foreign keys.
  // Independent first, then dependent.
  const restoreOrder: Array<{ name: string; model: any }> = [
    // Level 0: no FK dependencies
    { name: 'Tariff', model: prisma.tariff },
    { name: 'Setting', model: prisma.setting },
    { name: 'TelegramProxy', model: prisma.telegramProxy },
    { name: 'InstructionPlatform', model: prisma.instructionPlatform },
    { name: 'News', model: prisma.news },
    { name: 'BuhCategory', model: prisma.buhCategory },
    { name: 'BuhPartner', model: prisma.buhPartner },
    { name: 'BuhVpnServer', model: prisma.buhVpnServer },
    { name: 'BuhMonthlyStats', model: prisma.buhMonthlyStats },
    { name: 'BuhMilestone', model: prisma.buhMilestone },
    { name: 'BuhNotificationChannel', model: prisma.buhNotificationChannel },
    { name: 'BuhWebhookApiKey', model: prisma.buhWebhookApiKey },
    { name: 'PromoCode', model: prisma.promoCode },

    // Level 1: depends on Level 0
    { name: 'InstructionApp', model: prisma.instructionApp },
    { name: 'BuhAutoTagRule', model: prisma.buhAutoTagRule },
    { name: 'BuhRecurringPayment', model: prisma.buhRecurringPayment },
    { name: 'Funnel', model: prisma.funnel },

    // Level 2: Users (depends on Tariff via subscriptions)
    { name: 'User', model: prisma.user },

    // Level 3: User-dependent
    { name: 'Session', model: prisma.session },
    { name: 'EmailVerification', model: prisma.emailVerification },
    { name: 'AdminNote', model: prisma.adminNote },
    { name: 'Notification', model: prisma.notification },
    { name: 'InstructionStep', model: prisma.instructionStep },
    { name: 'BuhTransaction', model: prisma.buhTransaction },
    { name: 'BuhInkasRecord', model: prisma.buhInkasRecord },
    { name: 'BuhAdCampaign', model: prisma.buhAdCampaign },
    { name: 'BuhAuditLog', model: prisma.buhAuditLog },
    { name: 'BuhUtmClick', model: prisma.buhUtmClick },
    { name: 'UserTag', model: prisma.userTag },
    { name: 'UserVariable', model: prisma.userVariable },
    { name: 'UserSegment', model: prisma.userSegment },
    { name: 'PromoUsage', model: prisma.promoUsage },
    { name: 'BotMessage', model: prisma.botMessage },
    { name: 'FunnelStep', model: prisma.funnelStep },
    { name: 'FunnelNode', model: prisma.funnelNode },
    { name: 'FunnelLog', model: prisma.funnelLog },
    { name: 'Broadcast', model: prisma.broadcast },
    { name: 'ImportRecord', model: prisma.importRecord },

    // Level 4: Payment-related
    { name: 'Payment', model: prisma.payment },
    { name: 'BuhUtmLead', model: prisma.buhUtmLead },
    { name: 'BuhWebhookPayment', model: prisma.buhWebhookPayment },
    { name: 'GiftSubscription', model: prisma.giftSubscription },
    { name: 'BroadcastRecipient', model: prisma.broadcastRecipient },

    // Level 5: depends on Payment
    { name: 'ReferralBonus', model: prisma.referralBonus },
    { name: 'BalanceTransaction', model: prisma.balanceTransaction },
    { name: 'NotificationRead', model: prisma.notificationRead },

    // Bot blocks
    { name: 'BotBlockGroup', model: prisma.botBlockGroup },
    { name: 'BotBlock', model: prisma.botBlock },
    { name: 'BotButton', model: prisma.botButton },
    { name: 'BotTrigger', model: prisma.botTrigger },
    { name: 'BotBlockStat', model: prisma.botBlockStat },
  ]

  // Count total rows
  job.total = restoreOrder.reduce((s, t) => s + (Array.isArray(tables[t.name]) ? tables[t.name].length : 0), 0)

  for (const { name, model } of restoreOrder) {
    const rows = tables[name]
    if (!Array.isArray(rows) || rows.length === 0) continue

    for (const row of rows) {
      try {
        await model.upsert({
          where: { id: row.id },
          create: row,
          update: row,
        })
        job.created++
      } catch (err: any) {
        job.errors++
        if (job.errorMessages.length < 30) {
          job.errorMessages.push(`${name}[${row.id?.slice(0, 8)}]: ${String(err?.message || err).slice(0, 200)}`)
        }
      }
      job.processed++
    }
  }

  updateJob(jobId, { status: 'done', finishedAt: new Date() })
  logger.info(
    `DB restore done: created=${job.created} errors=${job.errors}`,
  )
}
