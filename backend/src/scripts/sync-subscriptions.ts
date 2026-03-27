/**
 * HIDEYOU — Subscription Sync Cron
 * Run every hour: syncs active subscriptions with REMNAWAVE
 * to keep local DB status up to date.
 *
 * Usage:
 *   node dist/scripts/sync-subscriptions.js
 *
 * Recommended cron (add via crontab -e):
 *   0 * * * * docker exec hideyou_backend node dist/scripts/sync-subscriptions.js
 *   0 9 * * * docker exec hideyou_backend node dist/scripts/notify-expiry.js
 */

import { PrismaClient }     from '@prisma/client'
import { remnawave }        from '../services/remnawave'
import { notifications }    from '../services/notifications'
import { logger }           from '../utils/logger'

const prisma = new PrismaClient()

export async function syncSubscriptions() {
  const startTime = Date.now()
  logger.info('=== Subscription sync started ===')

  // Get all users with a REMNAWAVE UUID
  const users = await prisma.user.findMany({
    where:  { remnawaveUuid: { not: null } },
    select: {
      id: true, remnawaveUuid: true,
      subStatus: true, subExpireAt: true, telegramId: true,
    },
  })

  logger.info(`Syncing ${users.length} linked users...`)

  let updated = 0
  let expired = 0
  let errors  = 0

  for (const user of users) {
    try {
      const rmUser = await remnawave.getUserByUuid(user.remnawaveUuid!)
      const newStatus = rmUser.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE'
      const newExpire = rmUser.expireAt ? new Date(rmUser.expireAt) : null

      // Check if anything changed
      const statusChanged = newStatus !== user.subStatus
      const expireChanged = newExpire?.toISOString() !== user.subExpireAt?.toISOString()

      if (statusChanged || expireChanged) {
        await prisma.user.update({
          where: { id: user.id },
          data:  { subStatus: newStatus, subExpireAt: newExpire },
        })

        // Notify if just expired
        if (user.subStatus === 'ACTIVE' && newStatus === 'INACTIVE') {
          expired++
          logger.info(`Subscription expired: ${user.id}`)
        } else {
          updated++
        }
      }

      // Throttle API calls
      await new Promise(r => setTimeout(r, 50))
    } catch (err) {
      logger.error(`Sync failed for ${user.id}:`, err)
      errors++
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  logger.info(`=== Sync complete in ${elapsed}s ===`)
  logger.info(`Updated: ${updated} | Expired: ${expired} | Errors: ${errors}`)

  await prisma.$disconnect()
}

// Run if executed directly (not imported by scheduler)
if (require.main === module) {
  syncSubscriptions()
    .catch(err => {
      logger.error('Sync crashed:', err)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
