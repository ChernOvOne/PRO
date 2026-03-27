import type { FastifyInstance } from 'fastify'
import { createHmac, createHash } from 'crypto'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../db'
import { config } from '../config'
import { remnawave } from '../services/remnawave'
import { logger } from '../utils/logger'

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
  email:    z.string().email(),
  password: z.string().min(6),
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

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

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
    const { email, password } = EmailLoginSchema.parse(req.body)

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

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

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
