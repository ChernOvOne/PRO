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
      firstConnectedAt: true, subLink: true,
    },
  })

  logger.info(`Syncing ${users.length} linked users...`)

  let updated = 0
  let expired = 0
  let errors  = 0
  let firstConnections = 0

  for (const user of users) {
    try {
      let rmUser
      try {
        rmUser = await remnawave.getUserByUuid(user.remnawaveUuid!)
      } catch (err: any) {
        // UUID doesn't exist in current panel (404) — user was linked to an old
        // panel that we no longer use, or was deleted there. Try to find by
        // telegramId in the current panel and relink the local record.
        const is404 = err?.response?.status === 404
        if (is404 && user.telegramId) {
          const fallback = await remnawave.getUserByTelegramId(user.telegramId).catch(() => null)
          if (fallback) {
            logger.info(`Relinked user ${user.id}: ${user.remnawaveUuid} → ${fallback.uuid}`)
            rmUser = fallback
            // Update UUID now so subsequent fields match
            await prisma.user.update({
              where: { id: user.id },
              data:  { remnawaveUuid: fallback.uuid },
            })
          } else {
            throw err
          }
        } else {
          throw err
        }
      }
      const newStatus = rmUser.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE'
      const newExpire = rmUser.expireAt ? new Date(rmUser.expireAt) : null
      const newSubLink = remnawave.getSubscriptionUrl(rmUser.uuid, rmUser.subscriptionUrl)

      // Check if anything changed
      const statusChanged = newStatus !== user.subStatus
      const expireChanged = newExpire?.toISOString() !== user.subExpireAt?.toISOString()
      const subLinkChanged = newSubLink !== user.subLink

      if (statusChanged || expireChanged || subLinkChanged) {
        await prisma.user.update({
          where: { id: user.id },
          data:  { subStatus: newStatus, subExpireAt: newExpire, subLink: newSubLink },
        })

        // Notify if just expired
        if (user.subStatus === 'ACTIVE' && newStatus === 'INACTIVE') {
          expired++
          logger.info(`Subscription expired: ${user.id}`)
        } else {
          updated++
        }
      }

      // ── First connection detection (fallback without webhook) ──
      const rmFirstConnAt = rmUser.userTraffic?.firstConnectedAt ?? null
      if (rmFirstConnAt && !user.firstConnectedAt) {
        // Dedup: skip firing the trigger if the funnel message was already sent earlier
        // (e.g. via webhook before this field was added in DB).
        const firstConnTriggerNodes = await prisma.funnelNode.findMany({
          where: { nodeType: 'trigger', triggerType: 'first_connection' },
          select: { id: true },
        })
        const alreadySent = firstConnTriggerNodes.length > 0
          ? await prisma.funnelLog.findFirst({
              where: {
                userId: user.id,
                status: 'sent',
                nodeId: { in: firstConnTriggerNodes.map(n => n.id) },
              },
              select: { id: true },
            })
          : null

        await prisma.user.update({
          where: { id: user.id },
          data:  { firstConnectedAt: new Date(rmFirstConnAt) },
        })

        if (alreadySent) {
          logger.info(`First connection backfill (already notified): ${user.id}`)
        } else {
          firstConnections++
          logger.info(`First connection detected: ${user.id}`)
          try {
            const { triggerEvent } = await import('../services/funnel-engine')
            await triggerEvent('first_connection', user.id)
          } catch (e: any) {
            logger.error(`Funnel trigger failed for first_connection ${user.id}: ${e.message}`)
          }
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
  logger.info(`Updated: ${updated} | Expired: ${expired} | FirstConn: ${firstConnections} | Errors: ${errors}`)

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
