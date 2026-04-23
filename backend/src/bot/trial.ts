import { prisma } from '../db'
import { config } from '../config'
import { logger } from '../utils/logger'
import { remnawave } from '../services/remnawave'

/**
 * Create a trial subscription for a user.
 *
 * 1. Checks user exists and doesn't already have a REMNAWAVE account
 * 2. Finds the cheapest active SUBSCRIPTION tariff
 * 3. Creates a REMNAWAVE user with traffic/device limits from tariff
 * 4. Updates the local user record with subscription data
 *
 * @returns { days, tariffName } on success
 * @throws on any validation or API error
 */
export async function createTrialForUser(
  userId: string,
): Promise<{ days: number; tariffName: string }> {
  // 1. Find user, ensure no existing REMNAWAVE account
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error(`User not found: ${userId}`)

  if (user.remnawaveUuid) {
    throw new Error(`User ${userId} already has a REMNAWAVE account (${user.remnawaveUuid})`)
  }

  // 2. Find cheapest active SUBSCRIPTION tariff
  const tariff = await prisma.tariff.findFirst({
    where: {
      type: 'SUBSCRIPTION',
      isActive: true,
    },
    orderBy: { priceRub: 'asc' },
  })

  if (!tariff) {
    throw new Error('No active SUBSCRIPTION tariff found for trial')
  }

  // 3. Calculate expiry
  const trialDays = config.features.trialDays || 3
  const expireAt = new Date()
  expireAt.setDate(expireAt.getDate() + trialDays)

  // Traffic limit: convert GB to bytes (null = unlimited)
  const trafficLimitBytes = tariff.trafficGb
    ? tariff.trafficGb * 1024 * 1024 * 1024
    : 0

  // Build username for REMNAWAVE
  const username = user.telegramId
    ? `tg_${user.telegramId}`
    : `trial_${user.id.slice(0, 8)}`

  // 4. Check if this user ALREADY exists on the REMNAWAVE panel (shared panel
  // across installs or a re-installed server). If yes — link to it instead of
  // creating a duplicate (panel throws 400 "username already exists" otherwise).
  let rmUser: any = null
  if (user.telegramId) {
    rmUser = await remnawave.getUserByTelegramId(user.telegramId).catch(() => null)
  }
  if (!rmUser && user.email) {
    rmUser = await remnawave.getUserByEmail(user.email).catch(() => null)
  }
  if (!rmUser) {
    rmUser = await remnawave.getUserByUsername(username).catch(() => null)
  }

  if (rmUser) {
    // Existing account — extend to trial period if expired, otherwise keep as-is.
    const rmExpire = rmUser.expireAt ? new Date(rmUser.expireAt) : null
    const expired  = !rmExpire || rmExpire < new Date()
    if (expired) {
      try {
        await remnawave.updateUser({
          uuid:     rmUser.uuid,
          expireAt: expireAt.toISOString(),
          status:   'ACTIVE',
          activeInternalSquads: tariff.remnawaveSquads ?? [],
        } as any)
        rmUser.expireAt = expireAt.toISOString()
      } catch (e: any) {
        logger.warn(`Failed to extend existing RM user ${rmUser.uuid}: ${e.message}`)
      }
    }
    logger.info(`Trial link: user ${userId} matched existing RM ${rmUser.uuid} (expired=${expired})`)
  } else {
    // 4b. No existing account — create new
    rmUser = await remnawave.createUser({
      username,
      status: 'ACTIVE',
      expireAt: expireAt.toISOString(),
      trafficLimitBytes,
      trafficLimitStrategy: tariff.trafficStrategy || 'MONTH',
      hwidDeviceLimit: tariff.deviceLimit || 3,
      telegramId: user.telegramId ? parseInt(user.telegramId, 10) : null,
      email: user.email ?? null,
      description: `Trial (${trialDays}d) — tariff: ${tariff.name}`,
      activeInternalSquads: tariff.remnawaveSquads ?? [],
      tag: tariff.remnawaveTag ?? null,
    })
  }

  // 5. Update local user record
  const subLink = remnawave.getSubscriptionUrl(rmUser.uuid, rmUser.subscriptionUrl)

  await prisma.user.update({
    where: { id: userId },
    data: {
      remnawaveUuid: rmUser.uuid,
      subLink,
      subStatus: 'TRIAL',
      subExpireAt: expireAt,
    },
  })

  logger.info(
    `Trial created for user ${userId}: ${trialDays} days, tariff "${tariff.name}", RM uuid ${rmUser.uuid}`,
  )

  // Fire referral_trial event for the referrer (if user was referred)
  if (user.referredById) {
    try {
      const { triggerEvent } = await import('../services/funnel-engine')
      await triggerEvent('referral_trial', user.referredById, {
        refName: user.telegramName || user.email || 'друг',
      })
    } catch (e: any) {
      logger.warn(`[Referral] referral_trial event failed: ${e.message}`)
    }
  }

  return { days: trialDays, tariffName: tariff.name }
}
