import { prisma }       from '../db'
import { logger }       from '../utils/logger'
import { emailService } from './email'
import type { NotificationType } from '@prisma/client'

class InAppNotificationService {
  /**
   * Send notification to a specific user (bell icon)
   */
  async sendToUser(params: {
    userId:  string
    title:   string
    message: string
    type?:   NotificationType
    linkUrl?: string
  }) {
    const notification = await prisma.notification.create({
      data: {
        userId:  params.userId,
        title:   params.title,
        message: params.message,
        type:    params.type || 'INFO',
        linkUrl: params.linkUrl,
      },
    })

    // Also try to send via Telegram
    const user = await prisma.user.findUnique({
      where:  { id: params.userId },
      select: { telegramId: true, email: true },
    })

    if (user?.telegramId) {
      try {
        const { sendTelegramMessage } = await import('../bot')
        await sendTelegramMessage(user.telegramId, `${params.title}\n\n${params.message}`)
      } catch (err) {
        logger.debug('TG notification failed:', err)
      }
    }

    return notification
  }

  /**
   * Send broadcast notification to all users (userId = null)
   */
  async sendBroadcast(params: {
    title:   string
    message: string
    type?:   NotificationType
    linkUrl?: string
  }) {
    const notification = await prisma.notification.create({
      data: {
        userId:  null, // broadcast
        title:   params.title,
        message: params.message,
        type:    params.type || 'INFO',
        linkUrl: params.linkUrl,
      },
    })

    logger.info(`Broadcast notification created: ${notification.id}`)
    return notification
  }

  /**
   * Send notification to multiple specific users
   */
  async sendToUsers(params: {
    userIds: string[]
    title:   string
    message: string
    type?:   NotificationType
    linkUrl?: string
  }) {
    const data = params.userIds.map(userId => ({
      userId,
      title:   params.title,
      message: params.message,
      type:    (params.type || 'INFO') as NotificationType,
      linkUrl: params.linkUrl,
    }))

    const result = await prisma.notification.createMany({ data })
    logger.info(`Sent ${result.count} notifications to users`)
    return result.count
  }

  /**
   * Get notifications for a user (including broadcasts)
   */
  async getUserNotifications(userId: string, opts: {
    page?:      number
    limit?:     number
    unreadOnly?: boolean
  } = {}) {
    const { page = 1, limit = 20, unreadOnly = false } = opts
    const skip = (page - 1) * limit

    // Get user-specific + broadcast notifications
    const where: any = {
      OR: [
        { userId },
        { userId: null }, // broadcasts
      ],
    }

    if (unreadOnly) {
      // For user-specific: isRead = false
      // For broadcasts: no entry in NotificationRead
      where.OR = [
        { userId, isRead: false },
        {
          userId: null,
          reads:  { none: { userId } },
        },
      ]
    }

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          reads: {
            where:  { userId },
            select: { readAt: true },
          },
        },
      }),
      prisma.notification.count({ where }),
    ])

    // Transform: add isRead field for broadcasts
    const items = notifications.map(n => ({
      id:        n.id,
      title:     n.title,
      message:   n.message,
      type:      n.type,
      linkUrl:   n.linkUrl,
      isRead:    n.userId ? n.isRead : n.reads.length > 0,
      createdAt: n.createdAt,
    }))

    return { notifications: items, total }
  }

  /**
   * Get unread count for user
   */
  async getUnreadCount(userId: string): Promise<number> {
    const [userSpecific, broadcastTotal, broadcastRead] = await Promise.all([
      prisma.notification.count({
        where: { userId, isRead: false },
      }),
      prisma.notification.count({
        where: { userId: null },
      }),
      prisma.notificationRead.count({
        where: { userId },
      }),
    ])

    return userSpecific + Math.max(0, broadcastTotal - broadcastRead)
  }

  /**
   * Mark a single notification as read
   */
  async markAsRead(notificationId: string, userId: string) {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    })

    if (!notification) return

    if (notification.userId === userId) {
      // User-specific notification
      await prisma.notification.update({
        where: { id: notificationId },
        data:  { isRead: true, readAt: new Date() },
      })
    } else if (notification.userId === null) {
      // Broadcast notification
      await prisma.notificationRead.upsert({
        where: {
          notificationId_userId: { notificationId, userId },
        },
        create: { notificationId, userId },
        update: {},
      })
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<number> {
    // Mark user-specific
    const { count } = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data:  { isRead: true, readAt: new Date() },
    })

    // Mark all broadcasts as read
    const unreadBroadcasts = await prisma.notification.findMany({
      where: {
        userId: null,
        reads:  { none: { userId } },
      },
      select: { id: true },
    })

    if (unreadBroadcasts.length > 0) {
      await prisma.notificationRead.createMany({
        data:           unreadBroadcasts.map(n => ({ notificationId: n.id, userId })),
        skipDuplicates: true,
      })
    }

    return count + unreadBroadcasts.length
  }
}

export const inAppNotifications = new InAppNotificationService()
