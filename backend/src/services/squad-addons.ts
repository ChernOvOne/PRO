import { prisma }    from '../db'
import { logger }    from '../utils/logger'
import { remnawave } from './remnawave'

export type PaidSquad = {
  squadUuid:     string
  title:         string
  pricePerMonth: number
  description?:  string | null
  country?:      string | null
  icon?:         string | null
}

/**
 * Normalise Tariff.paidSquads (which is raw JSON) into a typed array,
 * skipping any malformed entries.
 */
export function parsePaidSquads(raw: unknown): PaidSquad[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((x: any): PaidSquad[] => {
    if (!x || typeof x.squadUuid !== 'string' || !x.squadUuid) return []
    return [{
      squadUuid:     x.squadUuid,
      title:         typeof x.title === 'string' && x.title ? x.title : 'Доп. сервер',
      pricePerMonth: Number(x.pricePerMonth) || 0,
      description:   x.description ?? null,
      country:       x.country ?? null,
      icon:          x.icon ?? null,
    }]
  })
}

/**
 * Find the user's current tariff — from the most recent PAID non-refunded
 * SUBSCRIPTION payment. The tariff is the source of truth for BOTH free base
 * squads AND the catalog of paid squads available for purchase.
 */
export async function getUserCurrentTariff(userId: string) {
  const lastSub = await prisma.payment.findFirst({
    where: { userId, status: 'PAID', purpose: 'SUBSCRIPTION' },
    orderBy: { confirmedAt: 'desc' },
    include: { tariff: true },
  })
  return lastSub?.tariff ?? null
}

/**
 * Compute the set of Remnawave squad UUIDs the user should currently have
 * active. Base squads from the current tariff + every non-cancelled, not-yet-
 * expired UserSquadAddon.
 */
export async function computeEffectiveSquads(userId: string): Promise<string[]> {
  const tariff = await getUserCurrentTariff(userId)
  const baseSquads = tariff?.remnawaveSquads ?? []

  const now = new Date()
  const addons = await prisma.userSquadAddon.findMany({
    where: { userId, cancelledAt: null, expireAt: { gt: now } },
    select: { squadUuid: true },
  })
  return Array.from(new Set([...baseSquads, ...addons.map(a => a.squadUuid)]))
}

/**
 * Push the computed squad list to Remnawave. Idempotent; safe to call after
 * any change to user's tariff / addons.
 */
export async function syncUserSquadsToRemnawave(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user?.remnawaveUuid) return
  try {
    const squads = await computeEffectiveSquads(userId)
    await remnawave.updateUser({
      uuid: user.remnawaveUuid,
      activeInternalSquads: squads,
    })
    logger.info(`Squads synced for user ${userId}: ${squads.length} total`)
  } catch (err: any) {
    logger.error(`Failed to sync squads for user ${userId}: ${err?.message}`)
  }
}

export function prorateAddonPrice(pricePerMonth: number, daysLeft: number): number {
  if (daysLeft <= 0) return 0
  const perDay = pricePerMonth / 30
  return Math.ceil(perDay * daysLeft)
}

export function daysLeftUntil(expireAt: Date | null | undefined): number {
  if (!expireAt) return 0
  const ms = new Date(expireAt).getTime() - Date.now()
  if (ms <= 0) return 0
  return Math.ceil(ms / 86_400_000)
}
