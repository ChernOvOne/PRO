import type { FastifyInstance } from 'fastify'
import { createHmac, createHash } from 'crypto'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../db'
import { config } from '../config'
import { remnawave } from '../services/remnawave'
import { verificationService } from '../services/verification'
import { emailService } from '../services/email'
import { logger } from '../utils/logger'

function getClientIp(req: any): string | null {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.ip
    || null
}

const TelegramAuthSchema = z.object({
  id:         z.number(),
  first_name: z.string().optional(),
  last_name:  z.string().optional(),
  username:   z.string().optional(),
  photo_url:  z.string().optional(),
  auth_date:  z.number(),
  hash:       z.string(),
})

const EmailLoginSchema = z.object({
  email:     z.string().email(),
  password:  z.string().min(6),
  utmSource: z.string().optional(),
})

// Опции куки — domain берётся из корневого домена, чтобы работало
// и на lk.example.com и на admin.example.com одновременно.
function cookieOpts() {
  return {
    httpOnly: true,
    secure:   config.isProd,
    sameSite: 'lax' as const,
    maxAge:   30 * 24 * 3600,
    path:     '/',
    // cookieDomain = .example.com (корень), undefined для localhost
    domain:   config.isProd ? config.cookieDomain : undefined,
  }
}

export async function authRoutes(app: FastifyInstance) {
  // ── Telegram OAuth ─────────────────────────────────────────
  // NOTE: тело валидируется вручную через Zod .parse() — Fastify/AJV
  // не понимает Zod-объекты в schema.body (required — не массив).
  app.post('/telegram', {
    schema: { tags: ['Auth'] },
  }, async (req, reply) => {
    const data = TelegramAuthSchema.parse(req.body)

    const { hash, ...params } = data
    const checkString = Object.keys(params)
      .sort()
      .map(k => `${k}=${(params as any)[k]}`)
      .join('\n')

    const secretKey = createHash('sha256')
      .update(config.telegram.loginBotToken)
      .digest()

    const expectedHash = createHmac('sha256', secretKey)
      .update(checkString)
      .digest('hex')

    if (expectedHash !== hash) {
      return reply.status(401).send({ error: 'Invalid Telegram auth data' })
    }

    if (Date.now() / 1000 - data.auth_date > 86400) {
      return reply.status(401).send({ error: 'Auth data expired' })
    }

    const telegramId = String(data.id)

    let user = await prisma.user.findUnique({ where: { telegramId } })

    if (!user) {
      const rmUser = await remnawave.getUserByTelegramId(telegramId).catch(() => null)
      user = await prisma.user.create({
        data: {
          telegramId,
          telegramName:  data.username || data.first_name || telegramId,
          remnawaveUuid: rmUser?.uuid || null,
          subStatus:     rmUser ? 'ACTIVE' : 'INACTIVE',
          subExpireAt:   rmUser?.expireAt ? new Date(rmUser.expireAt) : null,
          subLink:       rmUser ? remnawave.getSubscriptionUrl(rmUser.uuid) : null,
        },
      })
      logger.info(`New user via Telegram: ${telegramId}`)
    }

    const _utmSrc = (req.body as any)?.utmSource
    const loginUpd: any = { lastLoginAt: new Date(), lastIp: getClientIp(req) }
    if (_utmSrc && !user.customerSource) {
      loginUpd.customerSource = _utmSrc
      prisma.buhUtmLead.create({
        data: { utmCode: _utmSrc, customerId: user.id, customerName: user.email || user.telegramName || user.id, converted: user.subStatus !== 'INACTIVE' },
      }).catch(() => {})
    }
    await prisma.user.update({ where: { id: user.id }, data: loginUpd })

    const token = app.jwt.sign({ sub: user.id, role: user.role })
    const { passwordHash, ...safeUser } = user as any

    return reply
      .setCookie('token', token, cookieOpts())
      .send({ token, user: safeUser })
  })

  // ── Email login ────────────────────────────────────────────
  app.post('/login', {
    schema: { tags: ['Auth'] },
  }, async (req, reply) => {
    const { email, password, utmSource } = EmailLoginSchema.parse(req.body)

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !user.passwordHash) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    if (!user.remnawaveUuid && user.email) {
      const rmUser = await remnawave.getUserByEmail(user.email).catch(() => null)
      if (rmUser) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            remnawaveUuid: rmUser.uuid,
            subStatus:     'ACTIVE',
            subExpireAt:   rmUser.expireAt ? new Date(rmUser.expireAt) : null,
            subLink:       remnawave.getSubscriptionUrl(rmUser.uuid),
          },
        })
      }
    }

    const _utmSrc = (req.body as any)?.utmSource
    const loginUpd: any = { lastLoginAt: new Date(), lastIp: getClientIp(req) }
    if (_utmSrc && !user.customerSource) {
      loginUpd.customerSource = _utmSrc
      prisma.buhUtmLead.create({
        data: { utmCode: _utmSrc, customerId: user.id, customerName: user.email || user.telegramName || user.id, converted: user.subStatus !== 'INACTIVE' },
      }).catch(() => {})
    }
    await prisma.user.update({ where: { id: user.id }, data: loginUpd })

    const token = app.jwt.sign({ sub: user.id, role: user.role })
    const { passwordHash, ...safeUser } = user as any

    return reply
      .setCookie('token', token, cookieOpts())
      .send({ token, user: safeUser })
  })

  // ── Me ─────────────────────────────────────────────────────
  app.get('/me', {
    preHandler: [app.authenticate],
  }, async (req) => {
    const user = await prisma.user.findUnique({
      where: { id: (req.user as any).sub },
    })
    if (!user) throw new Error('User not found')
    const { passwordHash, ...safe } = user as any
    return safe
  })

  // ── Register with email verification ──────────────────────
  app.post('/register', async (req, reply) => {
    const schema = z.object({
      email:        z.string().email(),
      password:     z.string().min(6),
      code:         z.string().length(6),
      referralCode: z.string().optional(),
      utmSource:    z.string().optional(),
    })
    const { email, password, code, referralCode, utmSource } = schema.parse(req.body)

    // Verify email code — either already verified or verify now
    let verified = await verificationService.isRecentlyVerified(email, 'REGISTRATION')
    if (!verified) {
      // Try to verify the code inline (user sends code with registration)
      verified = await verificationService.verifyCode({ email, code, type: 'REGISTRATION' })
    }
    if (!verified) {
      return reply.status(400).send({ error: 'Неверный или просроченный код подтверждения' })
    }

    // Check if email already taken
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) return reply.status(409).send({ error: 'Email уже зарегистрирован' })

    const passwordHash = await bcrypt.hash(password, 12)

    // Check referral code
    let referredById: string | undefined
    if (referralCode) {
      const referrer = await prisma.user.findUnique({
        where:  { referralCode },
        select: { id: true },
      })
      if (referrer) referredById = referrer.id
    }

    // Check REMNAWAVE by email
    const rmUser = await remnawave.getUserByEmail(email).catch(() => null)

    const user = await prisma.user.create({
      data: {
        email,
        emailVerified: true,
        passwordHash,
        referredById,
        customerSource: utmSource || null,
        remnawaveUuid: rmUser?.uuid || null,
        subStatus:     rmUser ? 'ACTIVE' : 'INACTIVE',
        subExpireAt:   rmUser?.expireAt ? new Date(rmUser.expireAt) : null,
        subLink:       rmUser ? remnawave.getSubscriptionUrl(rmUser.uuid) : null,
      },
    })

    logger.info(`New user registered via email: ${email}${utmSource ? ' (utm: ' + utmSource + ')' : ''}`)

    // Apply referral on registration
    if (referredById) {
      try {
        const { applyReferralOnRegistration } = await import('../services/referral')
        await applyReferralOnRegistration(user.id)
      } catch (e: any) {
        logger.warn(`[Referral] registration hook failed: ${e.message}`)
      }
    }

    // Create UTM lead if user came from campaign
    if (utmSource) {
      prisma.buhUtmLead.create({
        data: { utmCode: utmSource, customerId: user.id, customerName: email, converted: false },
      }).catch(() => {})
    }

    // Trigger registration funnel
    import('../services/funnel-engine').then(({ triggerEvent }) =>
      triggerEvent('registration', user.id).catch(() => {})
    )

    // Send appropriate welcome email
    const hasSubscription = !!rmUser
    const trialAvailable = !hasSubscription && config.features.trial
    if (trialAvailable) {
      await emailService.sendTrialOffer(email, config.features.trialDays).catch(() => {})
    } else {
      await emailService.sendWelcome(email).catch(() => {})
    }

    const token = app.jwt.sign({ sub: user.id, role: user.role })
    const { passwordHash: _, ...safeUser } = user as any

    return reply
      .setCookie('token', token, cookieOpts())
      .status(201)
      .send({ token, user: { ...safeUser, trialAvailable } })
  })

  // ── Change password ────────────────────────────────────────
  app.post('/change-password', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const schema = z.object({
      currentPassword: z.string().min(1),
      newPassword:     z.string().min(6),
    })
    const { currentPassword, newPassword } = schema.parse(req.body)
    const userId = (req.user as any).sub

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user?.passwordHash) {
      return reply.status(400).send({ error: 'Пароль не установлен (Telegram аккаунт)' })
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!valid) return reply.status(401).send({ error: 'Неверный текущий пароль' })

    const hash = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: hash } })

    return { ok: true }
  })

  // ── Change email (with verification) ──────────────────────
  app.post('/change-email', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const schema = z.object({
      newEmail: z.string().email(),
      code:     z.string().length(6),
    })
    const { newEmail, code } = schema.parse(req.body)
    const userId = (req.user as any).sub

    // Verify code for new email
    const verified = await verificationService.isRecentlyVerified(newEmail, 'EMAIL_CHANGE')
    if (!verified) {
      return reply.status(400).send({ error: 'Email не подтверждён' })
    }

    // Check if already taken
    const existing = await prisma.user.findUnique({ where: { email: newEmail } })
    if (existing && existing.id !== userId) {
      return reply.status(409).send({ error: 'Email уже используется' })
    }

    await prisma.user.update({
      where: { id: userId },
      data:  { email: newEmail, emailVerified: true },
    })

    return { ok: true, email: newEmail }
  })

  // ── Reset password (no auth required) ─────────────────────
  app.post('/reset-password', async (req, reply) => {
    const schema = z.object({
      email:       z.string().email(),
      code:        z.string().length(6),
      newPassword: z.string().min(6),
    })
    const { email, code, newPassword } = schema.parse(req.body)

    // Verify code — either already verified or verify now
    let verified = await verificationService.isRecentlyVerified(email, 'PASSWORD_RESET')
    if (!verified) {
      verified = await verificationService.verifyCode({ email, code, type: 'PASSWORD_RESET' })
    }
    if (!verified) {
      return reply.status(400).send({ error: 'Неверный или просроченный код' })
    }

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) return reply.status(404).send({ error: 'Пользователь не найден' })

    const hash = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } })

    return { ok: true }
  })

  // ── Logout ─────────────────────────────────────────────────
  app.post('/logout', async (_, reply) => {
    return reply
      .clearCookie('token', {
        path:   '/',
        domain: config.isProd ? config.cookieDomain : undefined,
      })
      .send({ ok: true })
  })
}
