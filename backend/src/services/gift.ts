import { nanoid }    from 'nanoid'
import { prisma }    from '../db'
import { config }    from '../config'
import { logger }    from '../utils/logger'
import { remnawave } from './remnawave'
import { notifications } from './notifications'
import type { User, Tariff } from '@prisma/client'

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
  }) {
    const giftCode = 'present_' + nanoid(10)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + config.gifts.codeExpiryDays)

    const gift = await prisma.giftSubscription.create({
      data: {
        giftCode,
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
      ).catch(err => logger.warn('Gift email notification failed:', err))
    }

    logger.info(`Gift created: ${giftCode} by user ${params.fromUserId}`)
    return gift
  }

  /**
   * Get gift status by code (public)
   */
  async getGiftStatus(code: string) {
    const gift = await prisma.giftSubscription.findUnique({
      where:   { giftCode: code },
      include: { tariff: true, fromUser: { select: { telegramName: true, email: true } } },
    })

    if (!gift) return null

    // Check if expired
    if (gift.status === 'PENDING' && gift.expiresAt < new Date()) {
      await prisma.giftSubscription.update({
        where: { id: gift.id },
        data:  { status: 'EXPIRED' },
      })
      return { ...gift, status: 'EXPIRED' as const }
    }

    return gift
  }

  /**
   * Claim a gift subscription
   */
  async claimGift(code: string, userId: string) {
    const gift = await prisma.giftSubscription.findUnique({
      where:   { giftCode: code },
      include: { tariff: true },
    })

    if (!gift) throw new Error('Подарок не найден')
    if (gift.status !== 'PENDING') throw new Error('Подарок уже использован или истёк')
    if (gift.expiresAt < new Date()) {
      await prisma.giftSubscription.update({
        where: { id: gift.id },
        data:  { status: 'EXPIRED' },
      })
      throw new Error('Срок действия подарка истёк')
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
          giftCode:   code,
          fromUserId: gift.fromUserId,
        }),
      },
    })

    logger.info(`Gift ${code} claimed by user ${userId}`)

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
   * Expire stale gifts (cron job)
   */
  async expireStaleGifts(): Promise<number> {
    const result = await prisma.giftSubscription.updateMany({
      where: {
        status:    'PENDING',
        expiresAt: { lt: new Date() },
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
