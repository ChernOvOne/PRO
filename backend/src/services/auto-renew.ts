import { prisma }         from '../db'
import { logger }         from '../utils/logger'
import { balanceService } from './balance'
import { notifications }  from './notifications'
import { remnawave }      from './remnawave'
import { syncUserSquadsToRemnawave, parsePaidSquads, PaidSquad } from './squad-addons'

type Setting = { key: string; value: string }

async function getSettings(keys: string[]): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } })
  const out: Record<string, string> = {}
  for (const r of rows as Setting[]) out[r.key] = r.value
  return out
}

/**
 * Main entry point for the cron. Finds users whose subscriptions are about
 * to expire (within lead-hours), attempts auto-renewal if the user opted in
 * and has enough balance. Sends notifications on success AND on failure.
 *
 * Idempotent: if user.lastAutoRenewAt is within the current cycle
 * (i.e. > subExpireAt - leadHours - 1h), we skip — already attempted.
 */
export async function runAutoRenew(): Promise<{ renewed: number; failed: number; skipped: number }> {
  const settings = await getSettings(['auto_renew_lead_hours', 'auto_renew_enabled'])
  const globallyEnabled = settings.auto_renew_enabled !== '0' && settings.auto_renew_enabled !== 'false'
  if (!globallyEnabled) {
    return { renewed: 0, failed: 0, skipped: 0 }
  }
  const leadHours = Math.max(1, Math.min(48, Number(settings.auto_renew_lead_hours) || 1))

  const now        = new Date()
  const windowEnd  = new Date(now.getTime() + leadHours * 3600_000)

  // Candidates: active subs expiring within the window, user opted in,
  // not already attempted in this cycle.
  const candidates = await prisma.user.findMany({
    where: {
      autoRenew: true,
      subStatus: 'ACTIVE',
      subExpireAt: { gt: now, lte: windowEnd },
    },
    select: { id: true, email: true, telegramId: true, subExpireAt: true, lastAutoRenewAt: true, remnawaveUuid: true },
    take: 200,
  })

  let renewed = 0, failed = 0, skipped = 0

  for (const user of candidates) {
    // Dedupe: if last attempt happened after (subExpireAt - leadHours*2), skip
    if (user.lastAutoRenewAt) {
      const attemptedAfter = user.subExpireAt!.getTime() - leadHours * 2 * 3600_000
      if (user.lastAutoRenewAt.getTime() > attemptedAfter) {
        skipped++
        continue
      }
    }
    try {
      const result = await tryRenewOne(user.id)
      if (result.ok) renewed++; else failed++
    } catch (err: any) {
      logger.error(`Auto-renew crashed for user ${user.id}: ${err?.message}`)
      failed++
    }
  }

  if (candidates.length > 0) {
    logger.info(`Auto-renew: ${renewed} ok, ${failed} failed, ${skipped} skipped (out of ${candidates.length})`)
  }
  return { renewed, failed, skipped }
}

/**
 * Attempt to renew a single user's subscription + active paid squads.
 *
 * Steps:
 *   1) Identify current tariff (last PAID SUBSCRIPTION payment)
 *   2) Calculate total = tariff.priceRub + Σ (paidSquads × months-of-tariff)
 *      for addons the user currently has active.
 *   3) If balance insufficient → send "failed" notification, stamp lastAutoRenewAt, bail.
 *   4) If tariff is deleted / not autoRenewAllowed → send "failed".
 *   5) Debit balance, extend user.subExpireAt += durationDays,
 *      extend active UserSquadAddon.expireAt to match,
 *      push new expireAt to Remnawave,
 *      create a Payment record (provider=BALANCE, status=PAID).
 *   6) Send success notification.
 */
async function tryRenewOne(userId: string): Promise<{ ok: boolean; reason?: string }> {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: {
      id: true, email: true, telegramId: true, remnawaveUuid: true,
      subExpireAt: true, subStatus: true,
    },
  })
  if (!user || !user.subExpireAt) return { ok: false, reason: 'no-subscription' }

  // Last paid tariff is our source of truth for what to renew
  const lastPaid = await prisma.payment.findFirst({
    where: { userId, status: 'PAID', purpose: 'SUBSCRIPTION' },
    orderBy: { confirmedAt: 'desc' },
    include: { tariff: true },
  })

  if (!lastPaid?.tariff) {
    await stampAttempt(userId)
    await notifications.autoRenewFailed(userId, {
      reason: 'Тариф не найден — оформите его заново',
      required: 0,
      balance: await currentBalance(userId),
    })
    return { ok: false, reason: 'no-tariff' }
  }

  const tariff = lastPaid.tariff
  if (!(tariff as any).autoRenewAllowed) {
    await stampAttempt(userId)
    await notifications.autoRenewFailed(userId, {
      reason: `Автопродление отключено для тарифа "${tariff.name}"`,
      required: 0,
      balance: await currentBalance(userId),
    })
    return { ok: false, reason: 'not-allowed' }
  }

  // Active addons for this user
  const now = new Date()
  const activeAddons = await prisma.userSquadAddon.findMany({
    where: { userId, cancelledAt: null, expireAt: { gt: now }, autoRenew: true },
  })
  const paidSquadsMap = new Map<string, PaidSquad>()
  for (const p of parsePaidSquads((tariff as any).paidSquads)) {
    paidSquadsMap.set(p.squadUuid, p)
  }
  const months = Math.max(1, Math.round(tariff.durationDays / 30))
  const addonCharges = activeAddons
    .map(a => {
      // Prefer current tariff's price; fall back to the price locked when user bought the addon
      const cur = paidSquadsMap.get(a.squadUuid)
      const perMonth = cur ? cur.pricePerMonth : Number(a.pricePerMonthLocked || 0)
      return { addon: a, amount: Math.ceil(perMonth * months) }
    })
    .filter(x => x.amount > 0)

  const tariffPrice = Number(tariff.priceRub)
  const addonsTotal = addonCharges.reduce((s, a) => s + a.amount, 0)
  const totalRequired = tariffPrice + addonsTotal

  const bal = await balanceService.getBalance(userId)
  if (Number(bal.balance) < totalRequired) {
    await stampAttempt(userId)
    await notifications.autoRenewFailed(userId, {
      reason: 'Недостаточно средств на балансе',
      required: totalRequired,
      balance: Math.floor(Number(bal.balance) * 100) / 100,
    })
    return { ok: false, reason: 'insufficient-balance' }
  }

  // ── DO IT ────────────────────────────────────────────────────
  // Debit balance for the whole amount
  await balanceService.debit({
    userId,
    amount: totalRequired,
    type: 'PURCHASE',
    description: `Автопродление «${tariff.name}»${addonsTotal > 0 ? ` + ${addonCharges.length} доп. серверов` : ''}`,
  })

  // Extend subscription locally
  const currentExpire = user.subExpireAt
  const base = currentExpire > now ? new Date(currentExpire) : new Date(now)
  base.setDate(base.getDate() + tariff.durationDays)

  await prisma.user.update({
    where: { id: userId },
    data: {
      subStatus:       'ACTIVE',
      subExpireAt:     base,
      lastAutoRenewAt: now,
      currentPlan:     tariff.name,
      currentPlanTag:  tariff.remnawaveTag ?? null,
    },
  })

  // Create a Payment row so accounting / refund logic sees it
  let renewalPayment: any = null
  try {
    renewalPayment = await prisma.payment.create({
      data: {
        userId,
        tariffId:    tariff.id,
        provider:    'BALANCE',
        amount:      totalRequired,
        currency:    'RUB',
        status:      'PAID',
        purpose:     'SUBSCRIPTION',
        confirmedAt: now,
        yukassaStatus: JSON.stringify({
          _autoRenew: true,
          tariffPrice,
          addonsTotal,
          months,
        }),
      },
    })
  } catch (err: any) {
    logger.warn(`Auto-renew: failed to create Payment row for ${userId}: ${err?.message}`)
  }

  // Extend each active addon to the new subscription end
  for (const { addon } of addonCharges) {
    await prisma.userSquadAddon.update({
      where: { id: addon.id },
      data:  {
        expireAt:  base,
        paymentId: renewalPayment?.id ?? addon.paymentId,
      },
    }).catch(err => logger.warn(`Addon extend failed ${addon.id}: ${err?.message}`))
  }

  // Push new expireAt to Remnawave (and resync squads to keep addon squads intact)
  if (user.remnawaveUuid) {
    try {
      await remnawave.updateUser({
        uuid:     user.remnawaveUuid,
        expireAt: base.toISOString(),
        status:   'ACTIVE',
      })
    } catch (err: any) {
      logger.warn(`Remnawave extend failed for ${userId}: ${err?.message}`)
    }
    await syncUserSquadsToRemnawave(userId).catch(() => {})
  }

  // Update payment aggregates (for LTV / history panel)
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        totalPaid:     { increment: totalRequired },
        paymentsCount: { increment: 1 },
        lastPaymentAt: now,
      },
    })
  } catch {}

  // Notify
  const newBal = await balanceService.getBalance(userId)
  await notifications.autoRenewSuccess(userId, {
    tariffName: tariff.name,
    amount:     totalRequired,
    expireAt:   base,
    balance:    Math.floor(Number(newBal.balance) * 100) / 100,
  })

  logger.info(`Auto-renew OK: user ${userId}, tariff "${tariff.name}", -${totalRequired} ₽, +${tariff.durationDays}d`)
  return { ok: true }
}

async function stampAttempt(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data:  { lastAutoRenewAt: new Date() },
  }).catch(() => {})
}

async function currentBalance(userId: string): Promise<number> {
  const bal = await balanceService.getBalance(userId).catch(() => ({ balance: 0 as any }))
  return Math.floor(Number(bal.balance) * 100) / 100
}

/**
 * Expire addons that went past their expireAt without a successful auto-renew.
 * Runs after runAutoRenew(). Cancels and re-syncs squads.
 */
export async function expireAddonsAfterRenew(): Promise<void> {
  const now = new Date()
  const rows = await prisma.userSquadAddon.findMany({
    where: { cancelledAt: null, expireAt: { lte: now } },
    select: { id: true, userId: true },
  })
  if (rows.length === 0) return
  const affected = new Set<string>()
  for (const r of rows) {
    affected.add(r.userId)
    await prisma.userSquadAddon.update({ where: { id: r.id }, data: { cancelledAt: now } })
  }
  for (const uid of affected) {
    await syncUserSquadsToRemnawave(uid).catch(() => {})
  }
  logger.info(`Addon expiry: ${rows.length} cancelled (${affected.size} users)`)
}
