import type { FastifyInstance } from 'fastify'
import { createHmac }   from 'crypto'
import { prisma }       from '../db'
import { remnawave }    from '../services/remnawave'
import { config }       from '../config'
import { logger }       from '../utils/logger'

/**
 * Validates Telegram Mini App initData using HMAC-SHA256
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
function validateInitData(initData: string, botToken: string): Record<string, string> | null {
  const params    = new URLSearchParams(initData)
  const hash      = params.get('hash')
  if (!hash) return null

  params.delete('hash')

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')

  const secretKey = createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest()

  const expectedHash = createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex')

  if (expectedHash !== hash) return null

  // Check auth_date not older than 24h
  const authDate = Number(params.get('auth_date'))
  if (Date.now() / 1000 - authDate > 86400) return null

  // Parse result
  const result: Record<string, string> = {}
  params.forEach((v, k) => { result[k] = v })
  return result
}

export async function tmaAuthRoute(app: FastifyInstance) {
  app.post('/telegram-mini-app', async (req, reply) => {
    const { initData } = req.body as { initData: string }

    if (!initData) {
      return reply.status(400).send({ error: 'initData required' })
    }

    const data = validateInitData(initData, config.telegram.botToken)
    if (!data) {
      return reply.status(401).send({ error: 'Invalid initData' })
    }

    let tgUser: any
    try {
      tgUser = JSON.parse(data.user)
    } catch {
      return reply.status(400).send({ error: 'Invalid user data' })
    }

    const telegramId = String(tgUser.id)

    // Find or create user
    let user = await prisma.user.findUnique({ where: { telegramId } })

    if (!user) {
      // Try to find existing REMNAWAVE subscription
      const rmUser = await remnawave.getUserByTelegramId(telegramId).catch(() => null)

      user = await prisma.user.create({
        data: {
          telegramId,
          telegramName: tgUser.username || tgUser.first_name || telegramId,
          remnawaveUuid: rmUser?.uuid || null,
          subStatus:     rmUser ? 'ACTIVE' : 'INACTIVE',
          subExpireAt:   rmUser?.expireAt ? new Date(rmUser.expireAt) : null,
          subLink:       rmUser ? remnawave.getSubscriptionUrl(rmUser.uuid) : null,
        },
      })
      logger.info(`New TMA user: ${telegramId}`)
    }

    await prisma.user.update({
      where: { id: user.id },
      data:  { lastLoginAt: new Date() },
    })

    const token = app.jwt.sign({ sub: user.id, role: user.role })

    const { passwordHash, ...safeUser } = user as any
    return reply
      .setCookie('token', token, {
        httpOnly: true,
        secure:   config.isProd,
        sameSite: config.isProd ? 'none' : 'lax', // 'none' required for TMA
        maxAge:   30 * 24 * 3600,
        path:     '/',
        domain:   config.isProd ? config.cookieDomain : undefined,
      })
      .send({ token, user: safeUser })
  })
}
