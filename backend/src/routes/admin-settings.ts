import type { FastifyInstance } from 'fastify'
import { prisma } from '../db'
import { logger } from '../utils/logger'
import nodemailer from 'nodemailer'
import path from 'path'
import fs, { readFileSync, writeFileSync, copyFileSync } from 'fs'

// ── DB key → .env key mapping ─────────────────────────────────
const DB_TO_ENV: Record<string, string> = {
  'app_name': 'APP_NAME',
  'app_url': 'APP_URL',
  'domain': 'DOMAIN',
  'api_domain': 'API_DOMAIN',
  'bot_token': 'BOT_TOKEN',
  'bot_username': 'BOT_USERNAME',
  'yukassa_shop_id': 'YUKASSA_SHOP_ID',
  'yukassa_secret': 'YUKASSA_SECRET_KEY',
  'yukassa_test_mode': 'YUKASSA_TEST_MODE',
  'crypto_token': 'CRYPTO_PAY_TOKEN',
  'crypto_network': 'CRYPTOPAY_NETWORK',
  'platega_merchant_id': 'PLATEGA_MERCHANT_ID',
  'platega_secret': 'PLATEGA_SECRET',
  'remnawave_url': 'REMNAWAVE_API_URL',
  'remnawave_token': 'REMNAWAVE_API_TOKEN',
  'remnawave_webhook_secret': 'REMNAWAVE_WEBHOOK_SECRET',
  'smtp_host': 'SMTP_HOST',
  'smtp_port': 'SMTP_PORT',
  'smtp_login': 'SMTP_USER',
  'smtp_password': 'SMTP_PASS',
  'smtp_from_email': 'SMTP_FROM',
  'smtp_from_name': 'SMTP_FROM_NAME',
  'jwt_expires_in': 'JWT_EXPIRES_IN',
  'support_url': 'SUPPORT_URL',
  'channel_url': 'CHANNEL_URL',
  'currency': 'CURRENCY',
  'currency_symbol': 'CURRENCY_SYMBOL',
  'timezone': 'TIMEZONE',
  'maptiler_key': 'MAPTILER_KEY',
  'ai_provider': 'AI_PROVIDER',
  'ai_token': 'AI_API_KEY',
  'ai_model': 'AI_MODEL',
}

function updateEnvFile(updates: Record<string, string>) {
  const envPath = '/app/.env'

  // Backup
  try { copyFileSync(envPath, envPath + '.bak') } catch {}

  // Read current .env
  let content = ''
  try { content = readFileSync(envPath, 'utf-8') } catch {}

  const lines = content.split('\n')
  const existing = new Set<string>()

  // Update existing lines
  const updated = lines.map(line => {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (match && updates[match[1]] !== undefined) {
      existing.add(match[1])
      return `${match[1]}=${updates[match[1]]}`
    }
    return line
  })

  // Append new keys
  for (const [key, value] of Object.entries(updates)) {
    if (!existing.has(key)) {
      updated.push(`${key}=${value}`)
    }
  }

  writeFileSync(envPath, updated.join('\n'))
  logger.info('Updated .env file with ' + Object.keys(updates).length + ' keys')
}

// ── Email templates registry ───────────────────────────────────
// Each template = one email the system sends. Admins can override the HTML
// body via Setting key `email_tpl_${key}`. Default HTML lives in email.ts.
const EMAIL_TEMPLATES = [
  { key: 'welcome',         name: '👋 Регистрация',           description: 'Письмо после создания аккаунта',     vars: ['appName', 'appUrl'] },
  { key: 'verification',    name: '🔢 Код подтверждения',     description: 'Email-verification code (6 цифр)',    vars: ['code', 'appName'] },
  { key: 'reset',           name: '🔑 Сброс пароля (код)',    description: 'Код для восстановления пароля',       vars: ['code', 'appName'] },
  { key: 'admin_password',  name: '🔐 Пароль от админа',      description: 'Админ сгенерировал пароль для юзера', vars: ['email', 'password', 'appName', 'appUrl'] },
  { key: 'email_changed',   name: '⚠️ Email изменён',        description: 'Алерт на старый email при смене',    vars: ['oldEmail', 'newEmail', 'appName', 'appUrl'] },
  { key: 'payment',         name: '✅ Оплата прошла',         description: 'Подтверждение оплаты тарифа',         vars: ['tariffName', 'expireAt', 'appUrl', 'appName'] },
  { key: 'expiry',          name: '⚠️ Подписка истекает',    description: 'Напоминание за N дней до окончания',  vars: ['daysLeft', 'appUrl', 'appName'] },
  { key: 'gift',            name: '🎁 Подарок-подписка',     description: 'Кто-то подарил VPN-подписку',         vars: ['senderName', 'tariffName', 'giftCode', 'appUrl', 'appName'] },
  { key: 'trial_offer',     name: '🎁 Пробный период',        description: 'Предложение активировать trial',      vars: ['trialDays', 'appUrl', 'appName'] },
  { key: 'auto_renew_success', name: '🔁 Автопродление: успех',  description: 'Подписка/доп.серверы продлены с баланса', vars: ['tariffName', 'amount', 'expireAt', 'balance', 'appName', 'appUrl'] },
  { key: 'auto_renew_failed',  name: '❌ Автопродление: провал', description: 'Не удалось списать с баланса — баланс/тариф', vars: ['reason', 'required', 'balance', 'appName', 'appUrl'] },
]

export async function adminSettingsRoutes(app: FastifyInstance) {
  const admin = { preHandler: [app.adminOnly] }

  // ─── Email templates CRUD ──────────────────────────────────
  // List all templates with current value (or default) and metadata
  app.get('/email-templates', admin, async () => {
    const { emailService } = await import('../services/email')
    const rows = await prisma.setting.findMany({
      where: { key: { startsWith: 'email_tpl_' } },
    })
    const override: Record<string, string> = {}
    for (const r of rows) override[r.key.replace('email_tpl_', '')] = r.value

    const result = []
    for (const tpl of EMAIL_TEMPLATES) {
      const defaultHtml = await emailService.getDefaultTemplate(tpl.key) || ''
      result.push({
        key: tpl.key,
        name: tpl.name,
        description: tpl.description,
        vars: tpl.vars,
        customized: !!override[tpl.key],
        value: override[tpl.key] || defaultHtml,
        defaultValue: defaultHtml,
      })
    }
    return result
  })

  // Update one template — save custom HTML
  app.put('/email-templates/:key', admin, async (req) => {
    const { key } = req.params as { key: string }
    const { value } = req.body as { value: string }
    if (!EMAIL_TEMPLATES.find(t => t.key === key)) throw new Error('Unknown template key')
    const full = `email_tpl_${key}`
    await prisma.setting.upsert({
      where: { key: full }, create: { key: full, value: value || '' }, update: { value: value || '' },
    })
    return { ok: true }
  })

  // Reset to default — delete override
  app.delete('/email-templates/:key', admin, async (req) => {
    const { key } = req.params as { key: string }
    await prisma.setting.delete({ where: { key: `email_tpl_${key}` } }).catch(() => {})
    return { ok: true }
  })

  // Test-send template with sample vars
  app.post('/email-templates/:key/test', admin, async (req) => {
    const { key } = req.params as { key: string }
    const { to } = req.body as { to?: string }
    if (!to) throw new Error('Recipient email required')
    const { emailService } = await import('../services/email')
    const ok = await emailService.sendTestTemplate(key, to)
    return { ok }
  })

  // GET / — all settings as { [key]: value }
  app.get('/', admin, async () => {
    const settings = await prisma.setting.findMany()
    return Object.fromEntries(settings.map(s => [s.key, s.value]))
  })

  // PUT / — bulk upsert
  app.put('/', admin, async (req) => {
    const { settings } = req.body as { settings: { key: string; value: string }[] }
    let settingsArray: { key: string; value: string }[] = []

    if (!Array.isArray(settings)) {
      // Support legacy format { key: value } too
      const legacy = req.body as Record<string, any>
      const entries = Object.entries(legacy).filter(([k]) => k !== 'settings')
      if (entries.length) {
        settingsArray = entries.map(([key, value]) => ({ key, value: String(value) }))
        await Promise.all(
          settingsArray.map(({ key, value }) =>
            prisma.setting.upsert({
              where:  { key },
              create: { key, value },
              update: { value },
            }),
          ),
        )
      }
    } else {
      settingsArray = settings.map(({ key, value }) => ({ key, value: String(value) }))
      await Promise.all(
        settingsArray.map(({ key, value }) =>
          prisma.setting.upsert({
            where:  { key },
            create: { key, value },
            update: { value },
          }),
        ),
      )
    }

    // Invalidate referral config cache so new settings take effect immediately
    if (settingsArray.some(s => s.key.startsWith('referral_'))) {
      try {
        const { invalidateReferralCache } = await import('../services/referral')
        invalidateReferralCache()
      } catch { /* ignore */ }
    }

    // Invalidate brand cache if any branding-related setting changed
    const BRAND_PREFIXES = ['app_', 'brand_', 'support_url', 'channel_url', 'bot_url',
                            'terms_url', 'privacy_url', 'footer_text', 'domain',
                            'api_domain', 'currency_symbol', 'telegram_channel_name']
    if (settingsArray.some(s => BRAND_PREFIXES.some(p => s.key.startsWith(p) || s.key === p))) {
      try {
        const { invalidateBrand } = await import('../services/brand')
        invalidateBrand()
      } catch { /* ignore */ }
    }

    // Invalidate service-credential caches so next API call reads fresh values.
    // Without this, PaymentService / Remnawave / Email all keep the old creds
    // for up to 30 seconds even after the admin saved new ones.
    const changed = settingsArray.map(s => s.key)
    try {
      if (changed.some(k => k.startsWith('smtp_'))) {
        const { emailService } = await import('../services/email')
        await (emailService as any).reload?.()
      }
      if (changed.some(k => k.startsWith('yukassa_'))) {
        const { paymentService } = await import('../services/payment')
        ;(paymentService.yukassa as any).invalidateCache?.()
      }
      if (changed.some(k => k.startsWith('crypto_'))) {
        const { paymentService } = await import('../services/payment')
        ;(paymentService.cryptopay as any).invalidateCache?.()
      }
      if (changed.some(k => k.startsWith('platega_'))) {
        const { paymentService } = await import('../services/payment')
        ;(paymentService.platega as any).invalidateCache?.()
      }
      if (changed.some(k => k.startsWith('remnawave_'))) {
        const { remnawave } = await import('../services/remnawave')
        ;(remnawave as any).invalidateCache?.()
      }
    } catch (e: any) {
      logger.warn('Cache invalidation partial failure: ' + e.message)
    }

    // Sync to .env
    if (settingsArray.length > 0) {
      const envUpdates: Record<string, string> = {}
      for (const { key, value } of settingsArray) {
        const envKey = DB_TO_ENV[key]
        if (envKey) envUpdates[envKey] = value
      }
      if (Object.keys(envUpdates).length > 0) {
        try {
          updateEnvFile(envUpdates)
        } catch (err: any) {
          logger.error('Failed to update .env file: ' + err.message)
        }
      }
    }

    return { ok: true }
  })

  // POST /test-email — send test email to admin
  app.post('/test-email', admin, async (req) => {
    try {
      const rows = await prisma.setting.findMany({
        where: {
          key: {
            in: [
              'smtp_host', 'smtp_port', 'smtp_login', 'smtp_password',
              'smtp_from_email', 'smtp_from_name', 'smtp_encryption',
              // legacy keys
              'smtp_user', 'smtp_pass', 'smtp_from',
            ],
          },
        },
      })
      const s: Record<string, string> = {}
      for (const r of rows) s[r.key] = r.value

      const host = s.smtp_host
      const port = Number(s.smtp_port || 587)
      const user = s.smtp_login || s.smtp_user
      const pass = s.smtp_password || s.smtp_pass
      const fromEmail = s.smtp_from_email || s.smtp_from || user
      const fromName = s.smtp_from_name || 'HIDEYOU PRO'

      if (!host || !user || !pass) {
        return { ok: false, error: 'SMTP не настроен: заполните хост, логин и пароль' }
      }

      const encryption = s.smtp_encryption || 'tls'
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: encryption === 'ssl' || port === 465,
        auth: { user, pass },
      })

      // Get admin email from request
      const adminUser = (req as any).user
      const to = adminUser?.email || fromEmail

      await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to,
        subject: 'Тестовое письмо — HIDEYOU PRO',
        html: `<h2>Тестовое письмо</h2><p>SMTP настроен корректно.</p><p>Дата: ${new Date().toLocaleString('ru-RU')}</p>`,
      })

      return { ok: true, message: `Тестовое письмо отправлено на ${to}` }
    } catch (err: any) {
      logger.error('Test email failed:', err)
      return { ok: false, error: err.message || 'Ошибка отправки' }
    }
  })

  // POST /test-remnawave — check connection to REMNAWAVE
  app.post('/test-remnawave', admin, async () => {
    try {
      const rows = await prisma.setting.findMany({
        where: { key: { in: ['remnawave_url', 'remnawave_token'] } },
      })
      const s: Record<string, string> = {}
      for (const r of rows) s[r.key] = r.value

      const url = s.remnawave_url || process.env.REMNAWAVE_URL
      const token = s.remnawave_token || process.env.REMNAWAVE_TOKEN

      if (!url) {
        return { ok: false, error: 'URL REMNAWAVE не указан' }
      }

      const apiUrl = url.replace(/\/+$/, '') + '/api/users'
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const resp = await fetch(apiUrl, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(10000),
      })

      if (resp.ok) {
        return { ok: true, message: `Соединение успешно (HTTP ${resp.status})` }
      } else {
        return { ok: false, error: `HTTP ${resp.status}: ${resp.statusText}` }
      }
    } catch (err: any) {
      logger.error('Test remnawave failed:', err)
      return { ok: false, error: err.message || 'Ошибка соединения' }
    }
  })

  // POST /upload-logo — upload logo file
  app.post('/upload-logo', admin, async (req) => {
    try {
      const data = await req.file()
      if (!data) return { ok: false, error: 'Файл не найден' }

      const uploadsDir = '/app/uploads'
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true })
      }

      const ext = path.extname(data.filename) || '.png'
      const filename = `logo${ext}`
      const filepath = path.join(uploadsDir, filename)

      const buffer = await data.toBuffer()
      fs.writeFileSync(filepath, buffer)

      const logoUrl = `/uploads/${filename}`

      // Save to settings
      await prisma.setting.upsert({
        where:  { key: 'logo_url' },
        create: { key: 'logo_url', value: logoUrl },
        update: { value: logoUrl },
      })

      return { ok: true, url: logoUrl }
    } catch (err: any) {
      logger.error('Upload logo failed:', err)
      return { ok: false, error: err.message || 'Ошибка загрузки' }
    }
  })

  // GET /env-status — current .env values (masked for secrets)
  app.get('/env-status', admin, async () => {
    const mask = (v?: string) => v ? v.slice(0, 4) + '***' + v.slice(-3) : '—'
    const show = (v?: string) => v || '—'

    return {
      BOT_TOKEN: mask(process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN),
      REMNAWAVE_API_URL: show(process.env.REMNAWAVE_URL || process.env.REMNAWAVE_API_URL),
      REMNAWAVE_API_TOKEN: mask(process.env.REMNAWAVE_TOKEN || process.env.REMNAWAVE_API_TOKEN),
      YUKASSA_SHOP_ID: show(process.env.YUKASSA_SHOP_ID),
      YUKASSA_SECRET_KEY: mask(process.env.YUKASSA_SECRET_KEY),
      SMTP_HOST: show(process.env.SMTP_HOST),
      SMTP_PORT: show(process.env.SMTP_PORT),
      SMTP_USER: show(process.env.SMTP_USER),
      SMTP_FROM: show(process.env.SMTP_FROM),
      APP_URL: show(process.env.APP_URL),
      DOMAIN: show(process.env.DOMAIN),
      JWT_EXPIRES_IN: show(process.env.JWT_EXPIRES_IN),
      NODE_ENV: show(process.env.NODE_ENV),
      MAPTILER_KEY: mask(process.env.MAPTILER_KEY),
    }
  })

  // POST /restart — schedule service restart
  app.post('/restart', admin, async (_req, reply) => {
    reply.send({ ok: true, message: 'Перезапуск запланирован' })

    // Restart after 2 seconds so the response is sent first
    setTimeout(() => {
      logger.info('Admin requested service restart')
      process.exit(0) // Docker restart policy will restart the container
    }, 2000)
  })
}
