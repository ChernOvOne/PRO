/**
 * Referral Program — central service for all referral-related logic.
 *
 * Reads settings from the Setting table (admin-configurable via /admin/settings),
 * falls back to env defaults from config.referral.
 *
 * Capabilities:
 *   - Flexible bonus types (days / balance / discount) for inviter and invitee
 *   - Trigger modes: on registration / on first payment / on each payment
 *   - Monthly cap per user (max_monthly)
 *   - Minimum payment threshold
 *   - Multi-level (up to 2) — grandparent referrer also gets bonus
 *   - Bind duration — referrer link expires after N days (0 = forever)
 *   - Percent-based reward (% from payment)
 */

import { prisma } from '../db'
import { config } from '../config'
import { logger } from '../utils/logger'
import { balanceService } from './balance'
import { notifications } from './notifications'

// ────────────────────────────────────────────────────────────────
// Settings
// ────────────────────────────────────────────────────────────────

export interface ReferralConfig {
  enabled:           boolean
  inviterBonusType:  'days' | 'balance' | 'discount'
  inviterBonusValue: number
  inviterTrigger:    'registration' | 'first_payment' | 'each_payment'
  maxMonthly:        number  // 0 = unlimited
  inviteeBonusType:  'days' | 'balance' | 'discount' | 'none'
  inviteeBonusValue: number
  minPayment:        number  // 0 = no min
  levels:            number  // 1 or 2
  percent:           number  // 0 = use fixed inviterBonusValue; >0 = % of payment.amount
  bindDuration:      number  // days, 0 = forever
  pageText:          string
}

const SETTING_KEYS = [
  'referral_enabled',
  'referral_inviter_bonus_type',
  'referral_inviter_bonus_value',
  'referral_inviter_trigger',
  'referral_max_monthly',
  'referral_invitee_bonus_type',
  'referral_invitee_bonus_value',
  'referral_min_payment',
  'referral_levels',
  'referral_percent',
  'referral_bind_duration',
  'referral_page_text',
]

let settingsCache: ReferralConfig | null = null
let cacheExpiresAt = 0

export async function getReferralConfig(force = false): Promise<ReferralConfig> {
  const now = Date.now()
  if (!force && settingsCache && cacheExpiresAt > now) return settingsCache

  const rows = await prisma.setting.findMany({ where: { key: { in: SETTING_KEYS } } })
  const bag: Record<string, string> = {}
  for (const r of rows) bag[r.key] = r.value

  // env fallbacks — admin Setting always wins over env
  const envBonusType: 'days' | 'balance' = config.referral.rewardType === 'balance' ? 'balance' : 'days'

  const cfg: ReferralConfig = {
    enabled:           bag.referral_enabled === undefined
      ? config.referral.enabled
      : bag.referral_enabled === 'true' || bag.referral_enabled === '1',
    inviterBonusType:  ((bag.referral_inviter_bonus_type as any) || envBonusType) as 'days' | 'balance' | 'discount',
    inviterBonusValue: Number(bag.referral_inviter_bonus_value ?? config.referral.bonusDays),
    inviterTrigger:    (bag.referral_inviter_trigger as any) || 'first_payment',
    maxMonthly:        Number(bag.referral_max_monthly ?? 0),
    inviteeBonusType:  (bag.referral_invitee_bonus_type as any) || 'none',
    inviteeBonusValue: Number(bag.referral_invitee_bonus_value ?? 7),
    minPayment:        Number(bag.referral_min_payment ?? 0),
    levels:            Math.max(1, Math.min(2, Number(bag.referral_levels ?? 1))),
    percent:           Number(bag.referral_percent ?? 0),
    bindDuration:      Number(bag.referral_bind_duration ?? 0),
    pageText:          bag.referral_page_text || '',
  }

  settingsCache = cfg
  cacheExpiresAt = now + 60_000 // cache 1 min
  return cfg
}

export function invalidateReferralCache() {
  settingsCache = null
  cacheExpiresAt = 0
}

// ────────────────────────────────────────────────────────────────
// Check if referrer bond is still valid
// ────────────────────────────────────────────────────────────────

async function isBondActive(inviteeUser: { createdAt: Date }, cfg: ReferralConfig): Promise<boolean> {
  if (cfg.bindDuration <= 0) return true
  const elapsedDays = (Date.now() - inviteeUser.createdAt.getTime()) / 86400_000
  return elapsedDays <= cfg.bindDuration
}

async function monthlyBonusCount(referrerId: string): Promise<number> {
  const since = new Date(Date.now() - 30 * 86400_000)
  return prisma.referralBonus.count({
    where: { referrerId, appliedAt: { gte: since } },
  })
}

async function isFirstPaymentOfInvitee(inviteeUserId: string, currentPaymentId: string): Promise<boolean> {
  const previousPaidCount = await prisma.payment.count({
    where: {
      userId: inviteeUserId,
      status: 'PAID',
      id: { not: currentPaymentId },
    },
  })
  return previousPaidCount === 0
}

// ────────────────────────────────────────────────────────────────
// INVITER bonus — called from payment.confirmPayment
// ────────────────────────────────────────────────────────────────

export async function applyReferralOnPayment(opts: {
  inviteeUserId: string  // also stored on the bonus record for dedup per (referrer, invitee)
  referrerId:    string
  paymentId:     string
  paymentAmount: number
}): Promise<void> {
  const cfg = await getReferralConfig()
  if (!cfg.enabled) {
    logger.info(`[Referral] disabled — skipping`)
    return
  }

  // Load referrer/invitee
  const [referrer, invitee] = await Promise.all([
    prisma.user.findUnique({ where: { id: opts.referrerId } }),
    prisma.user.findUnique({ where: { id: opts.inviteeUserId }, select: { createdAt: true, id: true } }),
  ])
  if (!referrer || !invitee) return

  // Check bond is still active
  if (!await isBondActive(invitee, cfg)) {
    logger.info(`[Referral] bond expired for ${invitee.id} → ${opts.referrerId}`)
    return
  }

  // Check min payment
  if (cfg.minPayment > 0 && opts.paymentAmount < cfg.minPayment) {
    logger.info(`[Referral] payment ${opts.paymentAmount} < min ${cfg.minPayment} — skipping`)
    return
  }

  // Check trigger policy
  if (cfg.inviterTrigger === 'registration') {
    // Bonus already given at registration time — skip payment bonus
    logger.info(`[Referral] inviterTrigger=registration — already applied`)
    return
  }
  if (cfg.inviterTrigger === 'first_payment') {
    const isFirst = await isFirstPaymentOfInvitee(opts.inviteeUserId, opts.paymentId)
    if (!isFirst) {
      logger.info(`[Referral] not first payment for ${opts.inviteeUserId} — skipping (first_payment mode)`)
      return
    }
  }
  // 'each_payment' — always apply

  // Monthly cap check
  if (cfg.maxMonthly > 0) {
    const count = await monthlyBonusCount(opts.referrerId)
    if (count >= cfg.maxMonthly) {
      logger.info(`[Referral] monthly cap reached (${count}/${cfg.maxMonthly}) for ${opts.referrerId}`)
      return
    }
  }

  // Apply L1 bonus
  await applyBonusToReferrer({
    referrerId:    opts.referrerId,
    inviteeUserId: opts.inviteeUserId,
    paymentId:     opts.paymentId,
    amount:        opts.paymentAmount,
    cfg,
    level:         1,
  })

  // L2 multi-level
  if (cfg.levels >= 2 && referrer.referredById) {
    await applyBonusToReferrer({
      referrerId:    referrer.referredById,
      inviteeUserId: opts.inviteeUserId,
      paymentId:     opts.paymentId,
      amount:        opts.paymentAmount,
      cfg,
      level:         2,
    })
  }
}

async function applyBonusToReferrer(opts: {
  referrerId:    string
  inviteeUserId: string
  paymentId:     string
  amount:        number
  cfg:           ReferralConfig
  level:         1 | 2
}): Promise<void> {
  const reason = opts.level === 2 ? 'INVITER_L2' : 'INVITER'

  // Dedup: one bonus per (payment, referrer, reason)
  const existing = await prisma.referralBonus.findFirst({
    where: {
      triggeredByPaymentId: opts.paymentId,
      referrerId: opts.referrerId,
      bonusReason: reason,
    },
  })
  if (existing) return

  // Multi-level: L2 gets half of L1 value
  const multiplier = opts.level === 2 ? 0.5 : 1

  // Calculate bonus value
  let bonusDays = 0
  let bonusAmount = 0

  if (opts.cfg.percent > 0) {
    // Percent-based reward (overrides fixed value)
    if (opts.cfg.inviterBonusType === 'balance' || opts.cfg.inviterBonusType === 'discount') {
      bonusAmount = +(opts.amount * opts.cfg.percent / 100 * multiplier).toFixed(2)
    } else {
      // Days based on %: treat 1 day = 10 rubles as rough mapping
      bonusDays = Math.floor(opts.amount * opts.cfg.percent / 100 * multiplier / 10)
    }
  } else {
    // Fixed value
    if (opts.cfg.inviterBonusType === 'days') {
      bonusDays = Math.floor(opts.cfg.inviterBonusValue * multiplier)
    } else {
      bonusAmount = +(opts.cfg.inviterBonusValue * multiplier).toFixed(2)
    }
  }

  if (bonusDays <= 0 && bonusAmount <= 0) return

  // Write record
  await prisma.referralBonus.create({
    data: {
      referrerId:           opts.referrerId,
      inviteeUserId:        opts.inviteeUserId,
      triggeredByPaymentId: opts.paymentId,
      bonusType:            bonusAmount > 0 ? 'MONEY' : 'DAYS',
      bonusReason:          reason,
      bonusDays,
      bonusAmount:          bonusAmount > 0 ? bonusAmount : null,
      bonusCurrency:        'RUB',
    },
  })

  // Credit balance immediately (money) — days accumulate for manual redeem
  if (bonusAmount > 0) {
    await balanceService.credit({
      userId:      opts.referrerId,
      amount:      bonusAmount,
      type:        'REFERRAL_REWARD',
      description: `Реферальный бонус ${bonusAmount}₽ (L${opts.level})`,
      paymentId:   opts.paymentId,
    })
  }

  // NOTE: hardcoded notifications removed — use funnel `referral_paid` instead
  // (admin can edit message text in /admin/communications/funnel-builder)

  // Fire funnel trigger
  try {
    const { triggerEvent } = await import('./funnel-engine')
    await triggerEvent('referral_paid', opts.referrerId, {
      refBonusDays:   String(bonusDays),
      refBonusAmount: String(bonusAmount),
      refLevel:       String(opts.level),
    })
  } catch { /* ignore */ }

  logger.info(
    `[Referral] L${opts.level} bonus applied to ${opts.referrerId}: ${bonusDays}d / ${bonusAmount}₽ (payment ${opts.paymentId})`
  )
}

// ────────────────────────────────────────────────────────────────
// INVITEE bonus — called on registration when user has referrer
// ────────────────────────────────────────────────────────────────

export async function applyInviteeBonus(inviteeUserId: string): Promise<void> {
  const cfg = await getReferralConfig()
  if (!cfg.enabled) return
  if (cfg.inviteeBonusType === 'none' || cfg.inviteeBonusValue <= 0) return

  const user = await prisma.user.findUnique({ where: { id: inviteeUserId }, select: { id: true, referredById: true, email: true } })
  if (!user || !user.referredById) return

  // Dedup — check no existing INVITEE bonus
  const existing = await prisma.referralBonus.findFirst({
    where: { referrerId: user.id, bonusReason: 'INVITEE', triggeredByPaymentId: null },
  })
  if (existing) return

  if (cfg.inviteeBonusType === 'days') {
    await prisma.user.update({
      where: { id: inviteeUserId },
      data:  { bonusDays: { increment: cfg.inviteeBonusValue } },
    })
    await prisma.referralBonus.create({
      data: {
        referrerId: inviteeUserId, // invitee is the recipient
        bonusType:  'DAYS',
        bonusReason: 'INVITEE',
        bonusDays:  cfg.inviteeBonusValue,
      },
    })
    logger.info(`[Referral] invitee bonus +${cfg.inviteeBonusValue} days for ${inviteeUserId}`)
  } else if (cfg.inviteeBonusType === 'balance') {
    await balanceService.credit({
      userId:      inviteeUserId,
      amount:      cfg.inviteeBonusValue,
      type:        'REFERRAL_REWARD',
      description: `Бонус приглашённому ${cfg.inviteeBonusValue}₽`,
    })
    await prisma.referralBonus.create({
      data: {
        referrerId:   inviteeUserId,
        bonusType:    'MONEY',
        bonusReason:  'INVITEE',
        bonusAmount:  cfg.inviteeBonusValue,
        bonusCurrency: 'RUB',
      },
    })
    logger.info(`[Referral] invitee bonus +${cfg.inviteeBonusValue}₽ balance for ${inviteeUserId}`)
  } else if (cfg.inviteeBonusType === 'discount') {
    // Discount = create a one-time promo code for the invitee (TODO: implement if needed)
    logger.info(`[Referral] invitee discount ${cfg.inviteeBonusValue}% — not yet implemented`)
  }
}

// ────────────────────────────────────────────────────────────────
// REGISTRATION trigger mode — if policy is 'registration', apply bonus now
// ────────────────────────────────────────────────────────────────

export async function applyReferralOnRegistration(inviteeUserId: string): Promise<void> {
  const cfg = await getReferralConfig()
  if (!cfg.enabled) return

  // Invitee bonus always applies on registration (independent of inviter trigger mode)
  await applyInviteeBonus(inviteeUserId)

  // Always fire referral_registered funnel for the referrer (regardless of trigger mode —
  // funnels are notification-only and shouldn't be coupled to bonus accrual policy)
  const inviteeForFunnel = await prisma.user.findUnique({
    where: { id: inviteeUserId },
    select: { referredById: true, telegramName: true, email: true },
  })
  if (inviteeForFunnel?.referredById) {
    try {
      const { triggerEvent } = await import('./funnel-engine')
      await triggerEvent('referral_registered', inviteeForFunnel.referredById, {
        refName: inviteeForFunnel.telegramName || inviteeForFunnel.email || 'друг',
      })
    } catch { /* ignore */ }
  }

  // Inviter bonus only if trigger=registration
  if (cfg.inviterTrigger !== 'registration') return

  const invitee = await prisma.user.findUnique({
    where: { id: inviteeUserId },
    select: { id: true, referredById: true, createdAt: true },
  })
  if (!invitee?.referredById) return

  // Dedup PER (referrer, invitee, INVITER) — позволяет начислять за каждого нового реферала отдельно
  const existing = await prisma.referralBonus.findFirst({
    where: {
      referrerId:    invitee.referredById,
      inviteeUserId: invitee.id,
      bonusReason:   'INVITER',
    },
  })
  if (existing) return

  // Monthly cap
  if (cfg.maxMonthly > 0) {
    const count = await monthlyBonusCount(invitee.referredById)
    if (count >= cfg.maxMonthly) return
  }

  let bonusDays = 0
  let bonusAmount = 0
  if (cfg.inviterBonusType === 'days') bonusDays = cfg.inviterBonusValue
  else bonusAmount = cfg.inviterBonusValue

  await prisma.referralBonus.create({
    data: {
      referrerId:   invitee.referredById,
      inviteeUserId: invitee.id,
      triggeredByPaymentId: null,
      bonusType:    bonusAmount > 0 ? 'MONEY' : 'DAYS',
      bonusReason:  'INVITER',
      bonusDays,
      bonusAmount:  bonusAmount > 0 ? bonusAmount : null,
      bonusCurrency: 'RUB',
    },
  })

  if (bonusAmount > 0) {
    await balanceService.credit({
      userId: invitee.referredById, amount: bonusAmount,
      type: 'REFERRAL_REWARD', description: `Бонус за регистрацию реферала ${bonusAmount}₽`,
    })
  }

  // NOTE: notifications via funnel `referral_registered` (already fired above) — admin edits text in funnel-builder
  logger.info(`[Referral] registration bonus applied to ${invitee.referredById}: ${bonusDays}d / ${bonusAmount}₽`)
}
