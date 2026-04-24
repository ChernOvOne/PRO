import { nanoid }    from 'nanoid'
import { prisma }    from '../db'
import { config }    from '../config'
import { logger }    from '../utils/logger'
import { remnawave } from './remnawave'
import { notifications } from './notifications'
import type { User, Tariff } from '@prisma/client'

// Human-typeable alphabet — avoids 0/O, 1/I/l, 5/S-like confusion.
// 7 chars from 30-symbol alphabet ≈ 22B combos, plenty for one tenant.
const SHORT_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function randomShortCode(): string {
  const { randomInt } = require('crypto') as typeof import('crypto')
  let body = ''
  for (let i = 0; i < 7; i++) body += SHORT_CODE_ALPHABET[randomInt(0, SHORT_CODE_ALPHABET.length)]
  // Prefix so the promo-input field can distinguish gift codes from regular promos
  // at a glance, and so shortCode never collides with a valid PromoCode.code.
  return 'G-' + body
}

async function generateUniqueShortCode(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const code = randomShortCode()
    const existing = await prisma.giftSubscription.findUnique({ where: { shortCode: code } })
    if (!existing) return code
  }
  // Astronomically unlikely at 22B space; bail rather than loop forever.
  throw new Error('Не удалось сгенерировать уникальный короткий код подарка')
}

class GiftService {
  /**
   * Create a gift subscription (after payment is confirmed)
   */
  async createGift(params: {
    fromUserId:     string
    tariffId:       string
    paymentId:      string
    recipientEmail?: string
    message?:       string
    // Omit expiresAt or pass null → gift lives until claimed / cancelled.
    // Pass a Date → fixed expiry.
    // Omit field entirely → legacy behaviour (default 30d from config).
    expiresAt?:     Date | null
  }) {
    const giftCode = 'present_' + nanoid(10)
    const shortCode = await generateUniqueShortCode()

    let expiresAt: Date | null
    if (params.expiresAt === null) {
      expiresAt = null
    } else if (params.expiresAt instanceof Date) {
      expiresAt = params.expiresAt
    } else {
      // Back-compat: caller didn't opt in either way — use legacy 30d default.
      const d = new Date()
      d.setDate(d.getDate() + config.gifts.codeExpiryDays)
      expiresAt = d
    }

    const gift = await prisma.giftSubscription.create({
      data: {
        giftCode,
        shortCode,
        fromUserId:     params.fromUserId,
        tariffId:       params.tariffId,
        paymentId:      params.paymentId,
        recipientEmail: params.recipientEmail,
        message:        params.message,
        status:         'PENDING',
        expiresAt,
      },
      include: { tariff: true, fromUser: true },
    })

    // Send email to recipient if specified
    if (params.recipientEmail) {
      const { emailService } = await import('./email')
      await emailService.sendGiftNotification(
        params.recipientEmail,
        giftCode,
        gift.tariff.name,
        gift.fromUser.telegramName || gift.fromUser.email || 'Друг',
        { shortCode, message: params.message, expiresAt },
      ).catch(err => logger.warn('Gift email notification failed:', err))
    }

    logger.info(`Gift created: ${giftCode} / ${shortCode} by user ${params.fromUserId}`)
    return gift
  }

  /**
   * Find a gift by either long code ("present_XXX") or short code ("G-XXXX").
   * Case-insensitive on shortCode so admins can tell users to type without
   * worrying about capitalisation.
   */
  async findByAnyCode(code: string) {
    const trimmed = code.trim()
    if (!trimmed) return null

    // Long code — prefixed, case-sensitive (nanoid is case-distinct)
    if (trimmed.startsWith('present_')) {
      return prisma.giftSubscription.findUnique({
        where:   { giftCode: trimmed },
        include: { tariff: true, fromUser: { select: { telegramName: true, email: true } } },
      })
    }

    // Short code — always uppercase in DB
    return prisma.giftSubscription.findUnique({
      where:   { shortCode: trimmed.toUpperCase() },
      include: { tariff: true, fromUser: { select: { telegramName: true, email: true } } },
    })
  }

  /**
   * Get gift status by code (public). Accepts both long and short codes.
   */
  async getGiftStatus(code: string) {
    const gift = await this.findByAnyCode(code)
    if (!gift) return null

    // Check if expired — only when expiresAt is set (nullable in v2)
    if (gift.status === 'PENDING' && gift.expiresAt && gift.expiresAt < new Date()) {
      await prisma.giftSubscription.update({
        where: { id: gift.id },
        data:  { status: 'EXPIRED' },
      })
      return { ...gift, status: 'EXPIRED' as const }
    }

    return gift
  }

  /**
   * Claim a gift subscription. Accepts either the long giftCode or shortCode.
   */
  async claimGift(code: string, userId: string) {
    const giftLookup = await this.findByAnyCode(code)
    if (!giftLookup) throw new Error('Подарок не найден')

    // Reload with full tariff relation (findByAnyCode already includes it,
    // but we want to be explicit about the row id for the subsequent writes)
    const gift = await prisma.giftSubscription.findUnique({
      where:   { id: giftLookup.id },
      include: { tariff: true },
    })
    if (!gift) throw new Error('Подарок не найден')
    if (gift.status !== 'PENDING') throw new Error('Подарок уже использован или отменён')
    if (gift.expiresAt && gift.expiresAt < new Date()) {
      await prisma.giftSubscription.update({
        where: { id: gift.id },
        data:  { status: 'EXPIRED' },
      })
      throw new Error('Срок действия подарка истёк')
    }
    if (gift.fromUserId === userId) {
      throw new Error('Нельзя активировать собственный подарок')
    }

    // Update gift as claimed
    await prisma.giftSubscription.update({
      where: { id: gift.id },
      data: {
        recipientUserId: userId,
        status:          'CLAIMED',
        claimedAt:       new Date(),
      },
    })

    // Activate subscription for recipient
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new Error('User not found')

    const tariff = gift.tariff

    if (!user.remnawaveUuid) {
      // Create REMNAWAVE user
      const rmUser = await remnawave.createUser({
        username:             user.email || `tg_${user.telegramId}`,
        email:                user.email ?? undefined,
        telegramId:           user.telegramId ? parseInt(user.telegramId, 10) : null,
        expireAt:             new Date(Date.now() + tariff.durationDays * 86400_000).toISOString(),
        activeInternalSquads: tariff.remnawaveSquads,
        tag:                  tariff.remnawaveTag,
      })

      await prisma.user.update({
        where: { id: userId },
        data: {
          remnawaveUuid: rmUser.uuid,
          subLink:       remnawave.getSubscriptionUrl(rmUser.uuid),
          subStatus:     'ACTIVE',
          subExpireAt:   new Date(Date.now() + tariff.durationDays * 86400_000),
        },
      })
    } else {
      // Extend existing subscription
      const rmUser = await remnawave.getUserByUuid(user.remnawaveUuid)
      await remnawave.extendSubscription(
        user.remnawaveUuid,
        tariff.durationDays,
        rmUser.expireAt ? new Date(rmUser.expireAt) : null,
      )

      const newExpireAt = new Date()
      if (user.subExpireAt && user.subExpireAt > newExpireAt) {
        newExpireAt.setTime(user.subExpireAt.getTime())
      }
      newExpireAt.setDate(newExpireAt.getDate() + tariff.durationDays)

      await prisma.user.update({
        where: { id: userId },
        data:  { subStatus: 'ACTIVE', subExpireAt: newExpireAt },
      })
    }

    // Create payment record for recipient (gift)
    await prisma.payment.create({
      data: {
        userId,
        tariffId:    gift.tariffId,
        provider:    'MANUAL',
        amount:      0,
        currency:    'RUB',
        status:      'PAID',
        purpose:     'GIFT',
        confirmedAt: new Date(),
        yukassaStatus: JSON.stringify({
          _giftClaim: true,
          giftCode:   gift.giftCode,
          shortCode:  gift.shortCode,
          fromUserId: gift.fromUserId,
        }),
      },
    })

    logger.info(`Gift ${gift.giftCode} claimed by user ${userId} via "${code}"`)

    // Notify gift sender
    await notifications.giftClaimed(gift.fromUserId, userId, tariff.name).catch(err =>
      logger.warn('Gift claim notification failed:', err)
    )

    return { tariffName: tariff.name, durationDays: tariff.durationDays }
  }

  /**
   * Get gifts sent by user
   */
  async getUserGifts(userId: string) {
    return prisma.giftSubscription.findMany({
      where:   { fromUserId: userId },
      include: {
        tariff:        { select: { name: true, durationDays: true } },
        recipientUser: { select: { email: true, telegramName: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  /**
   * Cancel a PENDING gift — only the sender can do this. Refunds the balance
   * if the original payment came from the balance; Yukassa/Crypto purchases
   * are not auto-refunded (admin handles those manually to avoid chargeback
   * flip-flops with providers).
   */
  async cancelGift(giftId: string, requesterUserId: string) {
    const gift = await prisma.giftSubscription.findUnique({
      where:   { id: giftId },
      include: { payment: true, tariff: true },
    })
    if (!gift) throw new Error('Подарок не найден')
    if (gift.fromUserId !== requesterUserId) throw new Error('Нельзя отменять чужие подарки')
    if (gift.status !== 'PENDING') throw new Error('Этот подарок уже активирован или отменён')

    await prisma.giftSubscription.update({
      where: { id: giftId },
      data:  { status: 'CANCELLED' },
    })

    // Refund balance-paid gifts automatically — the money never left the
    // platform so there's no external refund to reconcile.
    let refunded = false
    if (gift.payment.provider === 'BALANCE') {
      const { balanceService } = await import('./balance')
      await balanceService.credit({
        userId:      requesterUserId,
        amount:      Number(gift.payment.amount),
        type:        'REFUND',
        description: `Отмена подарка: ${gift.tariff.name}`,
      }).catch(err => logger.warn(`cancelGift: balance refund failed — ${err.message}`))
      refunded = true
    }

    logger.info(`Gift ${gift.giftCode} cancelled by ${requesterUserId} (refunded=${refunded})`)
    return { ok: true, refunded }
  }

  /**
   * Expire stale gifts (cron job). Nullable expires_at is a lifetime grant —
   * only timestamped gifts get expired here.
   */
  async expireStaleGifts(): Promise<number> {
    const result = await prisma.giftSubscription.updateMany({
      where: {
        status:    'PENDING',
        expiresAt: { not: null, lt: new Date() },
      },
      data: { status: 'EXPIRED' },
    })
    if (result.count > 0) {
      logger.info(`Expired ${result.count} stale gift subscriptions`)
    }
    return result.count
  }
}

export const giftService = new GiftService()
