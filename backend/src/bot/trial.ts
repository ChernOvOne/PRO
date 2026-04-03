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

  // 4. Create REMNAWAVE user
  const rmUser = await remnawave.createUser({
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

  return { days: trialDays, tariffName: tariff.name }
}
