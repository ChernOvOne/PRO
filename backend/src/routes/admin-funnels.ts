import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'

const SETTINGS_KEY = 'funnel_configs'

const DEFAULT_FUNNELS = [
  { id: 'registration', name: 'Регистрация', enabled: false, delay: 0, channels: ['telegram', 'email'], tgText: 'Добро пожаловать! Мы рады видеть вас в HideYou VPN.', emailSubject: 'Добро пожаловать в HideYou VPN', emailHtml: '<p>Добро пожаловать! Мы рады видеть вас в HideYou VPN.</p>' },
  { id: 'not_connected_24h', name: 'Не подключился (24ч)', enabled: false, delay: 86400, channels: ['telegram'], tgText: 'Вы зарегистрировались, но ещё не подключили VPN. Нужна помощь?' },
  { id: 'not_connected_72h', name: 'Не подключился (72ч)', enabled: false, delay: 259200, channels: ['telegram'], tgText: 'Прошло 3 дня с регистрации. Подключите VPN прямо сейчас!' },
  { id: 'expiring_3d', name: 'Подписка истекает (3 дня)', enabled: false, delay: 0, channels: ['telegram', 'email'], tgText: 'Ваша подписка истекает через 3 дня. Продлите, чтобы не потерять доступ.', emailSubject: 'Подписка скоро истекает', emailHtml: '<p>Ваша подписка истекает через 3 дня.</p>' },
  { id: 'expiring_1d', name: 'Подписка истекает (1 день)', enabled: false, delay: 0, channels: ['telegram', 'email'], tgText: 'Осталось менее 24 часов до окончания подписки!', emailSubject: 'Подписка истекает завтра', emailHtml: '<p>Осталось менее 24 часов до окончания вашей подписки.</p>' },
  { id: 'expired', name: 'Подписка истекла', enabled: false, delay: 86400, channels: ['telegram', 'email'], tgText: 'Ваша подписка истекла. Продлите её, чтобы вернуть доступ к VPN.', emailSubject: 'Подписка истекла', emailHtml: '<p>Ваша подписка истекла. Продлите её для восстановления доступа.</p>' },
  { id: 'payment_success', name: 'Оплата прошла', enabled: false, delay: 0, channels: ['telegram', 'email'], tgText: 'Оплата получена! Спасибо за покупку.', emailSubject: 'Оплата получена', emailHtml: '<p>Спасибо! Ваша оплата успешно получена.</p>' },
  { id: 'referral_paid', name: 'Реферал оплатил', enabled: false, delay: 0, channels: ['telegram'], tgText: 'Ваш реферал оплатил подписку! Вам начислено вознаграждение.' },
  { id: 'promo_activated', name: 'Промокод активирован', enabled: false, delay: 0, channels: ['telegram'], tgText: 'Промокод успешно активирован!' },
]

const funnelSchema = z.array(
  z.object({
    id:           z.string(),
    name:         z.string(),
    enabled:      z.boolean(),
    delay:        z.number().int().min(0),
    channels:     z.array(z.enum(['telegram', 'email', 'lk'])),
    tgText:       z.string().optional(),
    emailSubject: z.string().optional(),
    emailHtml:    z.string().optional(),
  }),
)

export async function adminFunnelRoutes(app: FastifyInstance) {
  const admin = { preHandler: [app.adminOnly] }

  // GET /api/admin/communications/funnels
  app.get('/funnels', admin, async () => {
    const row = await prisma.setting.findUnique({ where: { key: SETTINGS_KEY } })
    if (!row) return DEFAULT_FUNNELS
    try {
      return JSON.parse(row.value)
    } catch {
      return DEFAULT_FUNNELS
    }
  })

  // PUT /api/admin/communications/funnels
  app.put('/funnels', admin, async (req) => {
    const funnels = funnelSchema.parse(req.body)
    const value = JSON.stringify(funnels)

    await prisma.setting.upsert({
      where:  { key: SETTINGS_KEY },
      create: { key: SETTINGS_KEY, value },
      update: { value },
    })

    return { ok: true }
  })
}
