import { PrismaClient }       from '@prisma/client'
import { notifyExpiryWarning } from '../bot'
import { logger }              from '../utils/logger'

const prisma = new PrismaClient()

/**
 * Run daily — notify users whose subscription expires in 3 days or 1 day
 */
export async function runExpiryNotifications() {
  logger.info('Running expiry notifications...')

  const now      = new Date()
  const in3days  = new Date(now.getTime() + 3 * 86400_000)
  const in1day   = new Date(now.getTime() + 1 * 86400_000)
  const window   = 12 * 3600_000  // 12h window to avoid double-notifs

  const candidates = await prisma.user.findMany({
    where: {
      subStatus:   'ACTIVE',
      telegramId:  { not: null },
      subExpireAt: {
        gte: new Date(in1day.getTime() - window),
        lte: in3days,
      },
    },
    select: { telegramId: true, subExpireAt: true },
  })

  logger.info(`Found ${candidates.length} users to notify`)

  for (const user of candidates) {
    if (!user.telegramId || !user.subExpireAt) continue
    const daysLeft = Math.ceil(
      (user.subExpireAt.getTime() - now.getTime()) / 86400_000,
    )
    if (daysLeft <= 3 && daysLeft >= 0) {
      await notifyExpiryWarning(user.telegramId, daysLeft)
      await new Promise(r => setTimeout(r, 100)) // rate limit
    }
  }

  logger.info('Expiry notifications done')
}

// Run if executed directly
if (require.main === module) {
  runExpiryNotifications()
    .catch(err => { logger.error('Cron failed:', err); process.exit(1) })
    .finally(() => prisma.$disconnect())
}
