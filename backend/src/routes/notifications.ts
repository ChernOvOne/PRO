import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { inAppNotifications } from '../services/notification-service'

export async function notificationRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] }

  // Get user notifications (including broadcasts)
  app.get('/', auth, async (req) => {
    const userId = (req.user as any).sub
    const { page = '1', limit = '20', unreadOnly = 'false' } = req.query as Record<string, string>

    return inAppNotifications.getUserNotifications(userId, {
      page:       Number(page),
      limit:      Number(limit),
      unreadOnly: unreadOnly === 'true',
    })
  })

  // Get unread count
  app.get('/unread-count', auth, async (req) => {
    const userId = (req.user as any).sub
    const count = await inAppNotifications.getUnreadCount(userId)
    return { count }
  })

  // Mark single notification as read
  app.post('/:id/read', auth, async (req) => {
    const userId = (req.user as any).sub
    const { id } = req.params as { id: string }
    await inAppNotifications.markAsRead(id, userId)
    return { ok: true }
  })

  // Mark all as read
  app.post('/read-all', auth, async (req) => {
    const userId = (req.user as any).sub
    const updated = await inAppNotifications.markAllAsRead(userId)
    return { ok: true, updated }
  })
}

// Admin notification sending endpoints
export async function adminNotificationRoutes(app: FastifyInstance) {
  const admin = { preHandler: [app.adminOnly] }

  const SendSchema = z.object({
    title:   z.string().min(1),
    message: z.string().min(1),
    type:    z.enum(['INFO', 'WARNING', 'SUCCESS', 'PROMO']).default('INFO'),
    linkUrl: z.string().optional(),
  })

  // Send to all users (broadcast)
  app.post('/send', admin, async (req) => {
    const data = SendSchema.parse(req.body)
    const notification = await inAppNotifications.sendBroadcast(data)
    return { ok: true, notificationId: notification.id }
  })

  // Send to specific user
  app.post('/send/:userId', admin, async (req) => {
    const { userId } = req.params as { userId: string }
    const data = SendSchema.parse(req.body)
    const notification = await inAppNotifications.sendToUser({ ...data, userId })
    return { ok: true, notificationId: notification.id }
  })

  // Send to multiple users
  app.post('/send-many', admin, async (req) => {
    const { userIds, ...data } = z.object({
      userIds: z.array(z.string()),
      ...SendSchema.shape,
    }).parse(req.body)

    const count = await inAppNotifications.sendToUsers({ ...data, userIds })
    return { ok: true, sent: count }
  })
}
