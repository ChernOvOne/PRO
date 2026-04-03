import { PrismaClient }       from '@prisma/client'
import { notifyExpiryWarning } from '../bot'
import { logger }              from '../utils/logger'
import Redis from 'ioredis'

const prisma = new PrismaClient()

/**
 * Run daily — notify users whose subscription expires in 3 days or 1 day.
 * Uses Redis lock per user to prevent duplicate notifications within 20 hours.
 */
export async function runExpiryNotifications() {
  logger.info('Running expiry notifications...')

  let redis: Redis | null = null
  try {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')
  } catch {
    logger.warn('Redis not available for expiry lock — skipping to avoid spam')
    return
  }

  const now      = new Date()
  const in3days  = new Date(now.getTime() + 3 * 86400_000)
  const in1day   = new Date(now.getTime() + 1 * 86400_000)
  const window   = 12 * 3600_000  // 12h window

  const candidates = await prisma.user.findMany({
    where: {
      subStatus:   'ACTIVE',
      telegramId:  { not: null },
      subExpireAt: {
        gte: new Date(in1day.getTime() - window),
        lte: in3days,
      },
    },
    select: { id: true, telegramId: true, subExpireAt: true },
  })

  logger.info(`Found ${candidates.length} users to check for expiry`)

  let sent = 0
  for (const user of candidates) {
    if (!user.telegramId || !user.subExpireAt) continue
    const daysLeft = Math.ceil(
      (user.subExpireAt.getTime() - now.getTime()) / 86400_000,
    )
    if (daysLeft > 3 || daysLeft < 0) continue

    // Check Redis lock — don't notify same user within 20 hours
    const lockKey = `expiry:notified:${user.id}:${daysLeft}`
    const alreadySent = await redis.get(lockKey)
    if (alreadySent) continue

    await notifyExpiryWarning(user.telegramId, daysLeft)
    await redis.set(lockKey, '1', 'EX', 72000) // 20 hours TTL
    sent++
    await new Promise(r => setTimeout(r, 100)) // rate limit
  }

  logger.info(`Expiry notifications done: sent ${sent} of ${candidates.length}`)
  await redis.quit()
}

// Run if executed directly
if (require.main === module) {
  runExpiryNotifications()
    .catch(err => { logger.error('Cron failed:', err); process.exit(1) })
    .finally(() => prisma.$disconnect())
}
