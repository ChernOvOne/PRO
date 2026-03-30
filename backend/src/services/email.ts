import nodemailer from 'nodemailer'
import { config }  from '../config'
import { logger }  from '../utils/logger'
import { prisma }  from '../db'

class EmailService {
  private transporter: nodemailer.Transporter | null = null
  private enabled: boolean

  constructor() {
    this.enabled = !!(config.smtp.host && config.smtp.user && config.smtp.pass)

    if (this.enabled) {
      this.transporter = nodemailer.createTransport({
        host:   config.smtp.host!,
        port:   config.smtp.port,
        secure: config.smtp.port === 465,
        auth: {
          user: config.smtp.user!,
          pass: config.smtp.pass!,
        },
      })
    } else {
      logger.warn('Email service disabled — SMTP not configured')
    }
  }

  async send(params: {
    to:      string
    subject: string
    html:    string
    text?:   string
  }): Promise<boolean> {
    if (!this.enabled || !this.transporter) {
      logger.warn(`Email skipped (SMTP not configured): ${params.to} — ${params.subject}`)
      return false
    }
    try {
      await this.transporter.sendMail({
        from:    `HIDEYOU VPN <${config.smtp.from}>`,
        to:      params.to,
        subject: params.subject,
        html:    params.html,
        text:    params.text,
      })
      logger.info(`Email sent: ${params.to} — ${params.subject}`)
      return true
    } catch (err) {
      logger.error('Email send failed:', err)
      return false
    }
  }

  // ── Template loader ────────────────────────────────────────
  private async getTemplate(key: string, vars: Record<string, string>, fallback: string): Promise<string> {
    try {
      const setting = await prisma.setting.findUnique({ where: { key: `email_tpl_${key}` } })
      if (setting?.value) {
        let html = setting.value
        for (const [k, v] of Object.entries(vars)) {
          html = html.replace(new RegExp(`\\{${k}\\}`, 'g'), v)
        }
        return html
      }
    } catch {}
    return fallback
  }

  // ── Templates ─────────────────────────────────────────────

  async sendWelcome(email: string) {
    const defaultHtml = `
      <h2>Добро пожаловать!</h2>
      <p>Твой аккаунт в <strong>HIDEYOU VPN</strong> создан.</p>
      <p>Войди в личный кабинет чтобы выбрать тариф:</p>
      <a href="${config.appUrl}/dashboard" class="btn">Открыть личный кабинет</a>
    `
    const content = await this.getTemplate('welcome', { appUrl: config.appUrl }, defaultHtml)
    return this.send({ to: email, subject: 'Добро пожаловать в HIDEYOU VPN', html: this.wrap(content) })
  }

  async sendPaymentSuccess(email: string, tariffName: string, expireAt: Date) {
    const expireStr = expireAt.toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })
    const defaultHtml = `
      <h2>Оплата подтверждена!</h2>
      <p>Тариф: <strong>${tariffName}</strong></p>
      <p>Подписка активна до: <strong>${expireStr}</strong></p>
      <p>Перейди в кабинет чтобы получить ссылку-подписку и QR-код:</p>
      <a href="${config.appUrl}/dashboard" class="btn">Открыть кабинет</a>
    `
    const content = await this.getTemplate('payment', { tariffName, expireAt: expireStr, appUrl: config.appUrl }, defaultHtml)
    return this.send({ to: email, subject: '✅ Оплата прошла — HIDEYOU VPN', html: this.wrap(content) })
  }

  async sendExpiryWarning(email: string, daysLeft: number) {
    const defaultHtml = `
      <h2>Подписка заканчивается</h2>
      <p>Твоя подписка истекает через <strong>${daysLeft} дней</strong>.</p>
      <p>Продли сейчас чтобы не потерять доступ:</p>
      <a href="${config.appUrl}/dashboard" class="btn">Продлить подписку</a>
    `
    const content = await this.getTemplate('expiry', { daysLeft: String(daysLeft), appUrl: config.appUrl }, defaultHtml)
    return this.send({ to: email, subject: `⚠️ Подписка истекает через ${daysLeft} дней — HIDEYOU VPN`, html: this.wrap(content) })
  }

  async sendVerificationCode(email: string, code: string, subject?: string) {
    const defaultHtml = `
      <h2>Код подтверждения</h2>
      <p>Ваш код:</p>
      <div style="font-size: 32px; font-weight: 700; letter-spacing: 8px; text-align: center; padding: 20px; background: rgba(85,105,255,0.15); border-radius: 12px; color: #f1f5f9;">${code}</div>
      <p style="margin-top: 16px;">Код действителен 10 минут. Не сообщайте его никому.</p>
    `
    const content = await this.getTemplate('verification', { code }, defaultHtml)
    return this.send({ to: email, subject: subject || 'Код подтверждения — HIDEYOU VPN', html: this.wrap(content) })
  }

  async sendGiftNotification(email: string, giftCode: string, tariffName: string, senderName: string) {
    const defaultHtml = `
      <h2>Вам подарок!</h2>
      <p><strong>${senderName}</strong> подарил вам подписку <strong>${tariffName}</strong>.</p>
      <p>Перейдите по ссылке чтобы активировать подарок:</p>
      <a href="${config.appUrl}/present/${giftCode}" class="btn">Активировать подарок</a>
      <p style="margin-top: 16px; font-size: 13px; color: #64748b;">Код подарка: <strong>${giftCode}</strong></p>
    `
    const content = await this.getTemplate('gift', { senderName, tariffName, giftCode, appUrl: config.appUrl }, defaultHtml)
    return this.send({ to: email, subject: '🎁 Вам подарили VPN-подписку — HIDEYOU', html: this.wrap(content) })
  }

  async sendPasswordReset(email: string, code: string) {
    const defaultHtml = `
      <h2>Сброс пароля</h2>
      <p>Код для сброса пароля:</p>
      <div style="font-size: 32px; font-weight: 700; letter-spacing: 8px; text-align: center; padding: 20px; background: rgba(85,105,255,0.15); border-radius: 12px; color: #f1f5f9;">${code}</div>
      <p style="margin-top: 16px;">Если вы не запрашивали сброс пароля, проигнорируйте это письмо.</p>
    `
    const content = await this.getTemplate('reset', { code }, defaultHtml)
    return this.send({ to: email, subject: 'Сброс пароля — HIDEYOU VPN', html: this.wrap(content) })
  }

  private wrap(content: string): string {
    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; padding: 0; }
    .container { max-width: 520px; margin: 40px auto; background: #1e293b; border-radius: 16px; padding: 40px; border: 1px solid #334155; }
    h2 { color: #f1f5f9; margin-top: 0; }
    p { color: #94a3b8; line-height: 1.6; }
    .btn { display: inline-block; background: #5569ff; color: #fff !important; padding: 12px 28px; border-radius: 10px; text-decoration: none; font-weight: 600; margin-top: 16px; }
    .footer { text-align: center; margin-top: 32px; color: #475569; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    ${content}
    <div class="footer">
      <p>HIDEYOU VPN · <a href="${config.appUrl}" style="color:#5569ff">hideyou.app</a></p>
    </div>
  </div>
</body>
</html>`
  }
}

export const emailService = new EmailService()
