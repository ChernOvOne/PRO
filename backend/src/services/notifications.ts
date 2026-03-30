import { emailService } from './email'
import { logger }       from '../utils/logger'
import { prisma }       from '../db'

/**
 * Central notification service — sends via Telegram and/or Email
 * based on what the user has configured.
 */
export class NotificationService {
  // ── Payment confirmed ────────────────────────────────────────
  async paymentConfirmed(userId: string, tariffName: string, newExpireAt: Date) {
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { telegramId: true, email: true, telegramName: true },
    })
    if (!user) return

    const daysAdded = Math.round(
      (newExpireAt.getTime() - Date.now()) / 86400_000,
    )

    // Telegram notification (lazy import to avoid circular deps)
    if (user.telegramId) {
      try {
        const { notifyPaymentSuccess } = await import('../bot')
        await notifyPaymentSuccess(user.telegramId, tariffName, daysAdded)
      } catch (err) {
        logger.warn('TG payment notify failed:', err)
      }
    }

    // Email notification
    if (user.email) {
      await emailService.sendPaymentSuccess(user.email, tariffName, newExpireAt)
    }

    logger.info(`Notification sent: payment confirmed for ${userId}`)
  }

  // ── Expiry warning ────────────────────────────────────────────
  async expiryWarning(userId: string, daysLeft: number) {
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { telegramId: true, email: true },
    })
    if (!user) return

    if (user.telegramId) {
      try {
        const { notifyExpiryWarning } = await import('../bot')
        await notifyExpiryWarning(user.telegramId, daysLeft)
      } catch (err) {
        logger.warn('TG expiry notify failed:', err)
      }
    }

    if (user.email) {
      await emailService.sendExpiryWarning(user.email, daysLeft)
    }
  }

  // ── Referral bonus ────────────────────────────────────────────
  async referralBonus(userId: string, bonusDays: number) {
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { telegramId: true, email: true },
    })
    if (!user) return

    if (user.telegramId) {
      try {
        const { notifyReferralBonus } = await import('../bot')
        await notifyReferralBonus(user.telegramId, bonusDays)
      } catch (err) {
        logger.warn('TG referral notify failed:', err)
      }
    }
  }

  // ── Referral bonus (money) ──────────────────────────────────
  async referralBonusMoney(userId: string, amount: number) {
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { telegramId: true, email: true },
    })
    if (!user) return

    if (user.telegramId) {
      try {
        const { sendTelegramMessage } = await import('../bot')
        await sendTelegramMessage(user.telegramId,
          `🎉 Реферальный бонус!\n\nНа ваш баланс зачислено ${amount} ₽ за приглашённого друга.`)
      } catch (err) {
        logger.warn('TG referral money notify failed:', err)
      }
    }
  }

  // ── Gift claimed ────────────────────────────────────────────
  async giftClaimed(senderId: string, recipientId: string, tariffName: string) {
    const [sender, recipient] = await Promise.all([
      prisma.user.findUnique({ where: { id: senderId }, select: { telegramId: true, email: true } }),
      prisma.user.findUnique({ where: { id: recipientId }, select: { telegramName: true, email: true } }),
    ])
    if (!sender) return

    const recipientName = recipient?.telegramName || recipient?.email || 'Пользователь'

    if (sender.telegramId) {
      try {
        const { sendTelegramMessage } = await import('../bot')
        await sendTelegramMessage(sender.telegramId,
          `🎁 Ваш подарок активирован!\n\n${recipientName} активировал подарочную подписку "${tariffName}".`)
      } catch (err) {
        logger.warn('TG gift claim notify failed:', err)
      }
    }

    if (sender.email) {
      await emailService.send({
        to:      sender.email,
        subject: '🎁 Ваш подарок активирован — HIDEYOU VPN',
        html:    `<p>${recipientName} активировал подарочную подписку "${tariffName}".</p>`,
      })
    }
  }

  // ── Custom notification (from admin) ────────────────────────
  async sendCustom(userId: string, title: string, message: string) {
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { telegramId: true, email: true },
    })
    if (!user) return

    if (user.telegramId) {
      try {
        const { sendTelegramMessage } = await import('../bot')
        await sendTelegramMessage(user.telegramId, `${title}\n\n${message}`)
      } catch (err) {
        logger.warn('TG custom notify failed:', err)
      }
    }

    if (user.email) {
      await emailService.send({
        to:      user.email,
        subject: `${title} — HIDEYOU VPN`,
        html:    `<h2>${title}</h2><p>${message}</p>`,
      })
    }
  }
}

export const notifications = new NotificationService()
