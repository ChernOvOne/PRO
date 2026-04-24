import nodemailer from 'nodemailer'
import { config }  from '../config'
import { logger }  from '../utils/logger'
import { prisma }  from '../db'

class EmailService {
  private transporter: nodemailer.Transporter | null = null
  private enabled: boolean
  private fromAddress: string = ''
  private dbChecked = false

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
      this.fromAddress = config.smtp.from || config.smtp.user!
    } else {
      logger.warn('Email service disabled via env — will try DB settings on first send')
    }
  }

  // Load SMTP settings from DB (admin saves them there)
  private async ensureTransporter(): Promise<boolean> {
    if (this.enabled && this.transporter) return true
    if (this.dbChecked) return false

    this.dbChecked = true
    try {
      // Admin UI saves under smtp_login/smtp_password/smtp_from_email — the older
      // smtp_user/smtp_pass/smtp_from keys are still checked for back-compat.
      const rows = await prisma.setting.findMany({
        where: { key: { in: [
          'smtp_host', 'smtp_port', 'smtp_encryption',
          'smtp_login', 'smtp_user',
          'smtp_password', 'smtp_pass',
          'smtp_from_email', 'smtp_from',
          'smtp_from_name',
        ] } },
      })
      const s: Record<string, string> = {}
      for (const r of rows) s[r.key] = r.value

      const user = s.smtp_login    || s.smtp_user
      const pass = s.smtp_password || s.smtp_pass
      const from = s.smtp_from_email || s.smtp_from || user
      if (s.smtp_host && user && pass) {
        const port = Number(s.smtp_port || 587)
        this.transporter = nodemailer.createTransport({
          host:   s.smtp_host,
          port,
          secure: s.smtp_encryption === 'ssl' || port === 465,
          auth: { user, pass },
        })
        this.fromAddress = from
        this.enabled = true
        logger.info(`Email service configured from DB: ${s.smtp_host} (${user})`)
        return true
      }
    } catch (err) {
      logger.warn('Failed to load SMTP settings from DB:', err)
    }
    return false
  }

  // Force reload (call after admin changes settings)
  async reload() {
    this.dbChecked = false
    this.enabled = false
    this.transporter = null
    await this.ensureTransporter()
  }

  async send(params: {
    to:      string
    subject: string
    html:    string
    text?:   string
  }): Promise<boolean> {
    await this.ensureTransporter()

    if (!this.enabled || !this.transporter) {
      logger.warn(`Email skipped (SMTP not configured): ${params.to} — ${params.subject}`)
      return false
    }
    try {
      // Strip HTML tags for plain-text fallback (improves deliverability)
      const autoText = params.text || params.html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

      const { getBrandName } = await import('./brand')
      const appName = await getBrandName()
      await this.transporter.sendMail({
        from:    `${appName} <${this.fromAddress}>`,
        replyTo: this.fromAddress,
        to:      params.to,
        subject: params.subject,
        html:    params.html,
        text:    autoText,
        headers: {
          'X-Mailer': `${appName} Platform`,
          'List-Unsubscribe': `<mailto:${this.fromAddress}?subject=unsubscribe>`,
        },
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
    const { getBrandName } = await import('./brand')
    const appName = await getBrandName()
    const defaultHtml = `
      <h2>Добро пожаловать!</h2>
      <p>Твой аккаунт в <strong>${appName}</strong> создан.</p>
      <p>Войди в личный кабинет чтобы выбрать тариф:</p>
      <a href="${config.appUrl}/dashboard" class="btn">Открыть личный кабинет</a>
    `
    const content = await this.getTemplate('welcome', { appUrl: config.appUrl, appName }, defaultHtml)
    return this.send({ to: email, subject: `Добро пожаловать в ${appName}`, html: this.wrap(content, undefined, appName) })
  }

  async sendPaymentSuccess(email: string, tariffName: string, expireAt: Date) {
    const { getBrandName } = await import("./brand")
    const appName = await getBrandName()
    const expireStr = expireAt.toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })
    const defaultHtml = `
      <h2>Оплата подтверждена!</h2>
      <p>Тариф: <strong>${tariffName}</strong></p>
      <p>Подписка активна до: <strong>${expireStr}</strong></p>
      <p>Перейди в кабинет чтобы получить ссылку-подписку и QR-код:</p>
      <a href="${config.appUrl}/dashboard" class="btn">Открыть кабинет</a>
    `
    const content = await this.getTemplate('payment', { tariffName, expireAt: expireStr, appUrl: config.appUrl }, defaultHtml)
    return this.send({ to: email, subject: `✅ Оплата прошла — ${appName}`, html: this.wrap(content, undefined, appName) })
  }

  async sendAutoRenewSuccess(email: string, vars: { tariffName: string; amount: number; expireAt: Date; balance: number }) {
    const { getBrandName } = await import('./brand')
    const appName = await getBrandName()
    const expireStr = vars.expireAt.toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })
    const defaultHtml = `<h2>🔁 Подписка продлена автоматически</h2><p>Тариф: <strong>${vars.tariffName}</strong></p><p>Списано с баланса: <strong>${vars.amount} ₽</strong></p><p>Подписка активна до: <strong>${expireStr}</strong></p><p>Остаток на балансе: <strong>${vars.balance} ₽</strong></p><a href="${config.appUrl}/dashboard" class="btn">Открыть кабинет</a>`
    const content = await this.getTemplate('auto_renew_success', {
      tariffName: vars.tariffName, amount: String(vars.amount), expireAt: expireStr,
      balance: String(vars.balance), appUrl: config.appUrl, appName,
    }, defaultHtml)
    return this.send({ to: email, subject: `🔁 Подписка продлена — ${appName}`, html: this.wrap(content, undefined, appName) })
  }

  async sendAutoRenewFailed(email: string, vars: { reason: string; required: number; balance: number }) {
    const { getBrandName } = await import('./brand')
    const appName = await getBrandName()
    const defaultHtml = `<h2>❌ Не удалось продлить подписку</h2><p>Причина: ${vars.reason}</p><p>Требуется: <strong>${vars.required} ₽</strong></p><p>На балансе: <strong>${vars.balance} ₽</strong></p><p>Пополните баланс, чтобы сохранить доступ к VPN.</p><a href="${config.appUrl}/dashboard" class="btn">Пополнить баланс</a>`
    const content = await this.getTemplate('auto_renew_failed', {
      reason: vars.reason, required: String(vars.required), balance: String(vars.balance),
      appUrl: config.appUrl, appName,
    }, defaultHtml)
    return this.send({ to: email, subject: `❌ Не удалось продлить подписку — ${appName}`, html: this.wrap(content, undefined, appName) })
  }

  async sendExpiryWarning(email: string, daysLeft: number) {
    const { getBrandName } = await import('./brand')
    const appName = await getBrandName()
    const defaultHtml = `
      <h2>Подписка заканчивается</h2>
      <p>Твоя подписка истекает через <strong>${daysLeft} дней</strong>.</p>
      <p>Продли сейчас чтобы не потерять доступ:</p>
      <a href="${config.appUrl}/dashboard" class="btn">Продлить подписку</a>
    `
    const content = await this.getTemplate('expiry', { daysLeft: String(daysLeft), appUrl: config.appUrl, appName }, defaultHtml)
    return this.send({ to: email, subject: `⚠️ Подписка истекает через ${daysLeft} дней — ${appName}`, html: this.wrap(content, undefined, appName) })
  }

  async sendVerificationCode(email: string, code: string, subject?: string) {
    const { getBrandName } = await import('./brand')
    const appName = await getBrandName()
    const defaultHtml = `
      <h2>Код подтверждения</h2>
      <p>Ваш код:</p>
      <div style="font-size: 32px; font-weight: 700; letter-spacing: 8px; text-align: center; padding: 20px; background: rgba(85,105,255,0.15); border-radius: 12px; color: #f1f5f9;">${code}</div>
      <p style="margin-top: 16px;">Код действителен 10 минут. Не сообщайте его никому.</p>
    `
    const content = await this.getTemplate('verification', { code, appName }, defaultHtml)
    return this.send({ to: email, subject: subject || `Код подтверждения — ${appName}`, html: this.wrap(content, undefined, appName) })
  }

  async sendGiftNotification(
    email: string,
    giftCode: string,
    tariffName: string,
    senderName: string,
    opts: { shortCode?: string | null; message?: string | null; expiresAt?: Date | null } = {},
  ) {
    const { getBrandName } = await import('./brand')
    const appName = await getBrandName()
    const messageBlock = opts.message
      ? `<div style="margin:16px 0;padding:12px 14px;background:#f8fafc;border-left:3px solid #a78bfa;border-radius:4px;font-style:italic;">${opts.message.replace(/</g, '&lt;')}</div>`
      : ''
    const shortCodeBlock = opts.shortCode
      ? `<p style="margin-top: 20px; padding: 12px; background: #f8fafc; border-radius: 6px; font-size: 14px;">
           Или введите короткий код в поле <strong>«Промокод»</strong> на сайте:
           <span style="display:inline-block;margin-top:6px;padding:4px 10px;background:#fff;border:1px dashed #a78bfa;border-radius:4px;font-family:monospace;font-size:16px;letter-spacing:2px;color:#7c3aed;"><strong>${opts.shortCode}</strong></span>
         </p>`
      : ''
    const expiryBlock = opts.expiresAt
      ? `<p style="margin-top: 12px; font-size: 12px; color: #94a3b8;">Ссылка действует до ${opts.expiresAt.toLocaleDateString('ru-RU')}.</p>`
      : `<p style="margin-top: 12px; font-size: 12px; color: #94a3b8;">Ссылка бессрочная — можно активировать в любой момент.</p>`
    const defaultHtml = `
      <h2>🎁 Вам подарок!</h2>
      <p><strong>${senderName}</strong> подарил вам подписку <strong>${tariffName}</strong>.</p>
      ${messageBlock}
      <p>Нажмите кнопку чтобы активировать:</p>
      <a href="${config.appUrl}/present/${giftCode}" class="btn">Активировать подарок</a>
      ${shortCodeBlock}
      ${expiryBlock}
    `
    const content = await this.getTemplate('gift', {
      senderName, tariffName, giftCode,
      shortCode:  opts.shortCode || '',
      message:    opts.message   || '',
      appUrl:     config.appUrl,
      appName,
    }, defaultHtml)
    return this.send({ to: email, subject: `🎁 Вам подарили подписку — ${appName}`, html: this.wrap(content, undefined, appName) })
  }

  async sendTrialOffer(email: string, trialDays: number) {
    const { getBrandName } = await import('./brand')
    const appName = await getBrandName()
    const defaultHtml = `
      <h2>🎁 Попробуйте бесплатно!</h2>
      <p>Вы зарегистрировались в <strong>${appName}</strong>.</p>
      <p>Специально для вас — <strong>бесплатный пробный период на ${trialDays} дней</strong>!</p>
      <p>Активируйте пробный период в личном кабинете одним нажатием:</p>
      <a href="${config.appUrl}/dashboard" class="btn">Активировать пробный период</a>
      <p style="margin-top: 20px; font-size: 13px; color: #64748b;">Полный доступ без ограничений. Никаких обязательств — просто попробуйте.</p>
    `
    const content = await this.getTemplate('trial_offer', {
      trialDays: String(trialDays),
      appUrl: config.appUrl,
      appName,
    }, defaultHtml)
    return this.send({
      to: email,
      subject: `🎁 ${trialDays} дней бесплатно — ${appName}`,
      html: this.wrap(content, undefined, appName),
    })
  }

  async sendPasswordReset(email: string, code: string) {
    const { getBrandName } = await import('./brand')
    const appName = await getBrandName()
    const defaultHtml = `
      <h2>Сброс пароля</h2>
      <p>Код для сброса пароля:</p>
      <div style="font-size: 32px; font-weight: 700; letter-spacing: 8px; text-align: center; padding: 20px; background: rgba(85,105,255,0.15); border-radius: 12px; color: #f1f5f9;">${code}</div>
      <p style="margin-top: 16px;">Если вы не запрашивали сброс пароля, проигнорируйте это письмо.</p>
    `
    const content = await this.getTemplate('reset', { code, appName }, defaultHtml)
    return this.send({ to: email, subject: `Сброс пароля — ${appName}`, html: this.wrap(content, undefined, appName) })
  }

  // Password set/reset by admin — sends plain password to user's email.
  // Used for bot-first users who need a web fallback in case Telegram is blocked.
  async sendAdminPasswordReset(email: string, plainPassword: string) {
    const { getBrandName } = await import('./brand')
    const appName = await getBrandName()
    const defaultHtml = `
      <h2>🔑 Доступ к ${appName} через сайт</h2>
      <p>Администратор сгенерировал для вас пароль от личного кабинета на сайте <b>${config.appUrl}</b>.</p>
      <p style="margin-top:18px;">Ваши данные для входа:</p>
      <div style="padding:16px; background:rgba(85,105,255,0.15); border-radius:12px; color:#f1f5f9;">
        <div><b>Email:</b> ${email}</div>
        <div style="margin-top:8px;"><b>Пароль:</b>
          <code style="font-size:18px; letter-spacing:1px; padding:4px 8px; background:rgba(0,0,0,0.3); border-radius:6px;">${plainPassword}</code>
        </div>
      </div>
      <p style="margin-top:18px;">
        <b>Зачем это нужно?</b> Если Telegram вдруг заблокируют или у вас нет доступа к боту —
        вы всегда сможете зайти на сайт, проверить подписку, оплатить и продлить доступ.
        Это резервный способ.
      </p>
      <p>
        ⚠️ <b>Это письмо могло попасть в папку «Спам»</b> — добавьте нас в контакты,
        чтобы важные письма приходили вовремя.
      </p>
      <p>
        <b>Сохраните письмо</b> или измените пароль на более удобный в
        <a href="${config.appUrl}/dashboard">личном кабинете</a> после первого входа.
      </p>
      <p style="margin-top:20px; color:#94a3b8; font-size:13px;">
        Если вы не просили сгенерировать пароль — срочно сообщите в поддержку.
      </p>
      <a href="${config.appUrl}/auth" class="btn">Войти в личный кабинет</a>
    `
    const content = await this.getTemplate('admin_password', { email, password: plainPassword, appUrl: config.appUrl, appName }, defaultHtml)
    return this.send({
      to: email,
      subject: `🔑 Ваш пароль от ${appName} — резервный доступ`,
      html: this.wrap(content, undefined, appName),
    })
  }

  // Security alert: sent to the OLD email when address is changed by admin.
  // Gives the original owner a chance to notice unauthorized changes.
  async sendEmailChangedAlert(oldEmail: string, newEmail: string) {
    const { getBrandName } = await import('./brand')
    const appName = await getBrandName()
    const defaultHtml = `
      <h2>⚠️ Ваш email был изменён</h2>
      <p>Администратор ${appName} сменил адрес электронной почты на вашем аккаунте:</p>
      <div style="padding:14px; background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.3); border-radius:10px; color:#fecaca;">
        <div>Был: <code>${oldEmail}</code></div>
        <div style="margin-top:6px;">Стал: <code>${newEmail}</code></div>
      </div>
      <p style="margin-top:18px;">
        Если вы обращались в поддержку и просили это сделать — всё в порядке, игнорируйте письмо.
      </p>
      <p>
        <b>Если вы не просили менять email</b> — немедленно напишите в поддержку.
        Ваш аккаунт, возможно, скомпрометирован.
      </p>
      <a href="${config.appUrl}/dashboard/support" class="btn">Связаться с поддержкой</a>
    `
    const content = await this.getTemplate('email_changed', { oldEmail, newEmail, appUrl: config.appUrl, appName }, defaultHtml)
    return this.send({
      to: oldEmail,
      subject: `⚠️ Email на аккаунте ${appName} был изменён`,
      html: this.wrap(content, undefined, appName),
    })
  }

  // Get default template HTML (for admin preview / init)
  async getDefaultTemplate(key: string): Promise<string | null> {
    const { getBrandName } = await import('./brand')
    const appName = await getBrandName()
    const defaults: Record<string, string> = {
      welcome: `<h2>Добро пожаловать!</h2><p>Твой аккаунт в <strong>${appName}</strong> создан.</p><p>Войди в личный кабинет чтобы выбрать тариф:</p><a href="${config.appUrl}/dashboard" class="btn">Открыть личный кабинет</a>`,
      payment: `<h2>Оплата подтверждена!</h2><p>Тариф: <strong>{tariffName}</strong></p><p>Подписка активна до: <strong>{expireAt}</strong></p><a href="${config.appUrl}/dashboard" class="btn">Открыть кабинет</a>`,
      expiry: `<h2>Подписка заканчивается</h2><p>Твоя подписка истекает через <strong>{daysLeft} дней</strong>.</p><a href="${config.appUrl}/dashboard" class="btn">Продлить подписку</a>`,
      verification: `<h2>Код подтверждения</h2><p>Ваш код:</p><div style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;padding:20px;background:rgba(85,105,255,0.15);border-radius:12px;color:#f1f5f9;">{code}</div><p style="margin-top:16px;">Код действителен 10 минут.</p>`,
      gift: `<h2>Вам подарок!</h2><p><strong>{senderName}</strong> подарил вам подписку <strong>{tariffName}</strong>.</p><a href="${config.appUrl}/present/{giftCode}" class="btn">Активировать подарок</a>`,
      trial_offer: `<h2>🎁 Попробуйте бесплатно!</h2><p>Вы зарегистрировались в <strong>${appName}</strong>.</p><p><strong>{trialDays} дней бесплатно</strong></p><a href="${config.appUrl}/dashboard" class="btn">Активировать</a>`,
      reset: `<h2>Сброс пароля</h2><p>Код:</p><div style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;padding:20px;background:rgba(85,105,255,0.15);border-radius:12px;color:#f1f5f9;">{code}</div>`,
      admin_password: `<h2>🔑 Доступ к ${appName} через сайт</h2><p>Администратор сгенерировал для вас пароль.</p><p>Email: <b>{email}</b></p><p>Пароль: <code>{password}</code></p><a href="${config.appUrl}/auth" class="btn">Войти в личный кабинет</a>`,
      email_changed: `<h2>⚠️ Ваш email был изменён</h2><p>Был: {oldEmail}<br/>Стал: {newEmail}</p><p>Если это не вы — напишите в поддержку.</p>`,
      auto_renew_success: `<h2>🔁 Подписка продлена автоматически</h2><p>Тариф: <b>{tariffName}</b></p><p>Списано с баланса: <b>{amount} ₽</b></p><p>Подписка активна до: <b>{expireAt}</b></p><p>Остаток на балансе: <b>{balance} ₽</b></p><a href="${config.appUrl}/dashboard" class="btn">Открыть кабинет</a>`,
      auto_renew_failed: `<h2>❌ Не удалось продлить подписку</h2><p>Причина: {reason}</p><p>Требуется: <b>{required} ₽</b></p><p>На балансе: <b>{balance} ₽</b></p><p>Пополните баланс, чтобы сохранить доступ к VPN и доп. серверам.</p><a href="${config.appUrl}/dashboard" class="btn">Пополнить баланс</a>`,
    }
    return defaults[key] || null
  }

  // Test-send any template key with sample vars to the given address.
  async sendTestTemplate(key: string, toEmail: string, sampleVars: Record<string, string> = {}) {
    const { getBrandName } = await import('./brand')
    const appName = await getBrandName()
    const setting = await prisma.setting.findUnique({ where: { key: `email_tpl_${key}` } })
    const defaultHtml = await this.getDefaultTemplate(key) || '<p>Template not found</p>'
    let html = setting?.value || defaultHtml
    // Merge sample vars + defaults
    const vars: Record<string, string> = {
      appName, appUrl: config.appUrl,
      code: '123456', tariffName: 'Pro-тариф', expireAt: new Date().toLocaleDateString('ru-RU'),
      daysLeft: '3', senderName: 'Иван', giftCode: 'GIFT-XYZ', trialDays: '3',
      email: toEmail, password: 'test1234', oldEmail: 'old@example.com', newEmail: 'new@example.com',
      ...sampleVars,
    }
    for (const [k, v] of Object.entries(vars)) {
      html = html.replace(new RegExp(`\\{${k}\\}`, 'g'), v)
    }
    return this.send({
      to: toEmail,
      subject: `[ТЕСТ] Шаблон ${key} — ${appName}`,
      html: this.wrap(html, undefined, appName),
    })
  }

  // Send broadcast email with optional template and CTA button
  async sendBroadcastEmail(params: {
    to: string; subject: string; html: string;
    btnText?: string; btnUrl?: string; template?: string;
  }) {
    let content = params.html
    if (params.btnText && params.btnUrl) {
      content += `\n<a href="${params.btnUrl}" class="btn">${params.btnText}</a>`
    }
    return this.send({
      to: params.to,
      subject: params.subject,
      html: this.wrap(content, params.template),
    })
  }

  private wrap(content: string, template?: string, appName?: string): string {
    const tpl = EMAIL_TEMPLATES[template || 'dark'] || EMAIL_TEMPLATES.dark
    return tpl(content, config.appUrl, appName || 'VPN')
  }
}

// ── Email design templates ──────────────────────────────────
const EMAIL_TEMPLATES: Record<string, (content: string, appUrl: string, appName: string) => string> = {
  dark: (content, appUrl, appName) => `<!DOCTYPE html>
<html lang="ru"><head><meta charset="UTF-8"><style>
  body { font-family: -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; padding: 0; }
  .container { max-width: 520px; margin: 40px auto; background: #1e293b; border-radius: 16px; padding: 40px; border: 1px solid #334155; }
  h2 { color: #f1f5f9; margin-top: 0; }
  p { color: #94a3b8; line-height: 1.6; }
  .btn { display: inline-block; background: #5569ff; color: #fff !important; padding: 12px 28px; border-radius: 10px; text-decoration: none; font-weight: 600; margin-top: 16px; }
  .footer { text-align: center; margin-top: 32px; color: #475569; font-size: 12px; }
</style></head><body>
  <div class="container">${content}<div class="footer"><p>${appName} · <a href="${appUrl}" style="color:#5569ff">${appUrl}</a></p></div></div>
</body></html>`,

  gradient: (content, appUrl, appName) => `<!DOCTYPE html>
<html lang="ru"><head><meta charset="UTF-8"><style>
  body { font-family: -apple-system, sans-serif; margin: 0; padding: 0; background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%); }
  .container { max-width: 520px; margin: 40px auto; background: rgba(30,41,59,0.9); border-radius: 20px; padding: 40px; border: 1px solid rgba(139,92,246,0.2); backdrop-filter: blur(20px); }
  h2 { color: #f1f5f9; margin-top: 0; background: linear-gradient(135deg, #a78bfa, #06b6d4); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  p { color: #94a3b8; line-height: 1.7; }
  .btn { display: inline-block; background: linear-gradient(135deg, #8b5cf6, #06b6d4); color: #fff !important; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 700; margin-top: 16px; box-shadow: 0 4px 20px rgba(139,92,246,0.3); }
  .footer { text-align: center; margin-top: 32px; color: #475569; font-size: 12px; }
</style></head><body>
  <div class="container">${content}<div class="footer"><p>${appName} · <a href="${appUrl}" style="color:#a78bfa">${appUrl}</a></p></div></div>
</body></html>`,

  minimal: (content, appUrl, appName) => `<!DOCTYPE html>
<html lang="ru"><head><meta charset="UTF-8"><style>
  body { font-family: -apple-system, sans-serif; margin: 0; padding: 0; background: #f8fafc; }
  .container { max-width: 520px; margin: 40px auto; background: #ffffff; border-radius: 12px; padding: 40px; border: 1px solid #e2e8f0; }
  h2 { color: #1e293b; margin-top: 0; }
  p { color: #64748b; line-height: 1.6; }
  .btn { display: inline-block; background: #3b82f6; color: #fff !important; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 16px; }
  .footer { text-align: center; margin-top: 32px; color: #94a3b8; font-size: 12px; }
</style></head><body>
  <div class="container">${content}<div class="footer"><p>${appName} · <a href="${appUrl}" style="color:#3b82f6">${appUrl}</a></p></div></div>
</body></html>`,

  neon: (content, appUrl, appName) => `<!DOCTYPE html>
<html lang="ru"><head><meta charset="UTF-8"><style>
  body { font-family: -apple-system, sans-serif; margin: 0; padding: 0; background: #000000; }
  .container { max-width: 520px; margin: 40px auto; background: #0a0a0a; border-radius: 16px; padding: 40px; border: 1px solid #22d3ee33; box-shadow: 0 0 40px rgba(34,211,238,0.05); }
  h2 { color: #22d3ee; margin-top: 0; text-shadow: 0 0 20px rgba(34,211,238,0.3); }
  p { color: #94a3b8; line-height: 1.6; }
  .btn { display: inline-block; background: transparent; color: #22d3ee !important; padding: 12px 28px; border-radius: 10px; text-decoration: none; font-weight: 600; margin-top: 16px; border: 1px solid #22d3ee; box-shadow: 0 0 15px rgba(34,211,238,0.2); }
  .footer { text-align: center; margin-top: 32px; color: #334155; font-size: 12px; }
</style></head><body>
  <div class="container">${content}<div class="footer"><p>${appName} · <a href="${appUrl}" style="color:#22d3ee">${appUrl}</a></p></div></div>
</body></html>`,
}

export const EMAIL_TEMPLATE_NAMES = Object.keys(EMAIL_TEMPLATES)

export const emailService = new EmailService()
