import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { InlineKeyboard } from 'grammy'
import { prisma } from '../db'
import { bot } from '../bot'
import { emailService } from '../services/email'
import { inAppNotifications } from '../services/notification-service'
import { logger } from '../utils/logger'
import { config } from '../config'

// ── Default triggers seed data ──────────────────────────────
const DEFAULT_TRIGGERS = [
  // Онбординг 100-199
  { triggerId: 'registration', name: 'Регистрация', sortOrder: 100, tgText: '👋 Добро пожаловать в *HIDEYOU VPN*!\n\nНачните с бесплатного пробного периода или выберите тариф.' },
  { triggerId: 'trial_not_activated', name: 'Не активировал триал (1ч)', sortOrder: 110, delayType: 'hours', delayValue: 1, tgText: '🎁 Вы ещё не активировали бесплатный период!\n\nПопробуйте VPN бесплатно — это займёт 10 секунд.' },
  { triggerId: 'not_connected_24h', name: 'Не подключился (24ч)', sortOrder: 120, delayType: 'hours', delayValue: 24, tgText: '🔧 Нужна помощь с настройкой?\n\nВы активировали подписку, но ещё не подключились к VPN. Откройте инструкции — там всё просто!' },
  { triggerId: 'not_connected_72h', name: 'Не подключился (72ч)', sortOrder: 130, delayType: 'hours', delayValue: 72, tgText: '❓ Возникли сложности с подключением?\n\nМы заметили что вы ещё не подключились к VPN. Напишите в поддержку — мы поможем!' },
  { triggerId: 'first_connection', name: 'Первое подключение', sortOrder: 140, tgText: '🎉 Отлично, вы подключились!\n\nТеперь ваш интернет защищён. Пригласите друзей и получите бонусные дни!' },

  // Подписка 200-299
  { triggerId: 'expiring_7d', name: 'Подписка истекает (7 дней)', sortOrder: 200, tgText: '📅 Ваша подписка истекает через *7 дней*.\n\nПродлите заранее чтобы не потерять доступ к VPN.' },
  { triggerId: 'expiring_3d', name: 'Подписка истекает (3 дня)', sortOrder: 210, tgText: '⚠️ Подписка истекает через *3 дня*!\n\nПродлите сейчас чтобы не остаться без VPN.' },
  { triggerId: 'expiring_1d', name: 'Подписка истекает (1 день)', sortOrder: 220, tgText: '🔴 Подписка истекает *завтра*!\n\nПродлите прямо сейчас — это займёт минуту.' },
  { triggerId: 'expired', name: 'Подписка истекла', sortOrder: 230, delayType: 'hours', delayValue: 24, tgText: '❌ Ваша подписка *истекла*.\n\nВаш VPN больше не работает. Продлите подписку чтобы вернуть доступ.' },
  { triggerId: 'expired_7d', name: 'Подписка истекла (7 дней)', sortOrder: 240, delayType: 'days', delayValue: 7, tgText: '💔 Мы скучаем по вам!\n\nВаша подписка истекла неделю назад. Вернитесь — у нас есть специальное предложение!' },
  { triggerId: 'traffic_80', name: 'Трафик 80%', sortOrder: 250, tgText: '📊 Использовано *80%* трафика.\n\nРассмотрите покупку дополнительного трафика или повышение тарифа.' },
  { triggerId: 'traffic_100', name: 'Трафик исчерпан', sortOrder: 260, tgText: '🚫 Трафик *исчерпан*!\n\nVPN временно недоступен. Докупите трафик или повысьте тариф.' },

  // Оплата 300-399
  { triggerId: 'payment_success', name: 'Оплата прошла', sortOrder: 300, tgText: '✅ *Оплата подтверждена!*\n\nВаша подписка активирована. Используйте /sub для получения ссылки.' },
  { triggerId: 'payment_pending', name: 'Оплата не завершена (30 мин)', sortOrder: 310, delayType: 'minutes', delayValue: 30, tgText: '⏳ Вы не завершили оплату.\n\nЕсли возникли проблемы — попробуйте другой способ оплаты.' },
  { triggerId: 'payment_renewal', name: 'Повторная оплата', sortOrder: 320, tgText: '🔄 *Подписка продлена!*\n\nСпасибо за лояльность!' },

  // Рефералы 400-499
  { triggerId: 'referral_registered', name: 'Реферал зарегистрировался', sortOrder: 400, tgText: '👤 Ваш друг *зарегистрировался* по вашей ссылке!\n\nКогда он оплатит подписку — вам начислятся бонусные дни.' },
  { triggerId: 'referral_trial', name: 'Реферал активировал триал', sortOrder: 410, tgText: '🎁 Ваш друг активировал *пробный период*!' },
  { triggerId: 'referral_paid', name: 'Реферал оплатил', sortOrder: 420, tgText: '🎉 Ваш друг *оплатил* подписку!\n\nВам начислены бонусные дни.' },

  // Бонусы 500-599
  { triggerId: 'bonus_days_granted', name: 'Начислены бонусные дни', sortOrder: 500, tgText: '🎁 Вам начислены *бонусные дни*!\n\nАктивируйте их в личном кабинете.' },
  { triggerId: 'promo_activated', name: 'Промокод активирован', sortOrder: 510, tgText: '✅ *Промокод активирован!*' },
  { triggerId: 'balance_topup', name: 'Баланс пополнен', sortOrder: 520, tgText: '💰 *Баланс пополнен!*' },

  // Безопасность 600-699
  { triggerId: 'new_device', name: 'Новое устройство', sortOrder: 600, tgText: '📱 Обнаружено *новое устройство*.\n\nЕсли это не вы — обновите ссылку подписки.' },
  { triggerId: 'device_limit', name: 'Лимит устройств', sortOrder: 610, tgText: '⚠️ Достигнут *лимит устройств*.\n\nУдалите одно из устройств или повысьте тариф.' },
  { triggerId: 'sub_link_revoked', name: 'Ссылка обновлена', sortOrder: 620, tgText: '🔄 Ваша *ссылка подписки обновлена*.\n\nПеренастройте все устройства.' },

  // Апсейл 700-799
  { triggerId: 'upsell_basic_30d', name: 'На базовом 30+ дней', sortOrder: 700, delayType: 'days', delayValue: 30, tgText: '💎 Вы на базовом тарифе уже месяц!\n\nПопробуйте тариф повыше.' },
  { triggerId: 'traffic_frequent_exceed', name: 'Частое превышение трафика', sortOrder: 710, tgText: '📈 Вы часто превышаете лимит трафика.\n\nРассмотрите безлимитный тариф!' },
  { triggerId: 'trial_expired_offer', name: 'Триал закончился', sortOrder: 720, tgText: '⏰ Пробный период *закончился*.\n\nОформите подписку — специальное предложение для новых пользователей!' },

  // Социальное 800-899
  { triggerId: 'zero_referrals_7d', name: '0 рефералов за 7 дней', sortOrder: 800, delayType: 'days', delayValue: 7, tgText: '👥 Пригласите друзей и получите *бонусные дни*!' },
  { triggerId: 'five_referrals', name: '5 рефералов', sortOrder: 810, tgText: '🏆 Поздравляем! Вы пригласили *5 друзей*!' },
  { triggerId: 'gift_received', name: 'Подарок получен', sortOrder: 820, tgText: '🎁 Кто-то активировал ваш *подарок*!' },
  { triggerId: 'gift_not_claimed_3d', name: 'Подарок не активирован 3д', sortOrder: 830, delayType: 'days', delayValue: 3, tgText: '🎁 Ваш подарок *не активирован* уже 3 дня.\n\nНапомните другу!' },

  // Вовлечение 900-999
  { triggerId: 'inactive_14d', name: 'Не заходил 14 дней', sortOrder: 900, delayType: 'days', delayValue: 14, tgText: '👋 Давно вас не видели!\n\nВаш VPN ждёт вас.' },
  { triggerId: 'inactive_30d', name: 'Не заходил 30 дней', sortOrder: 910, delayType: 'days', delayValue: 30, tgText: '💔 Мы скучаем!\n\nВы не заходили уже месяц.' },
  { triggerId: 'anniversary', name: 'Годовщина регистрации', sortOrder: 920, tgText: '🎂 С годовщиной в *HIDEYOU VPN*!\n\nСпасибо что вы с нами.' },

  // Фидбек 1000-1099
  { triggerId: 'feedback_7d', name: 'Отзыв после 7 дней', sortOrder: 1000, delayType: 'days', delayValue: 7, tgText: '💬 Как вам HIDEYOU VPN?\n\nБудем рады вашему отзыву!' },
  { triggerId: 'feedback_loyal', name: 'Отзыв от лояльного клиента', sortOrder: 1010, tgText: '⭐ Спасибо за лояльность!\n\nПожалуйста, оставьте отзыв.' },
]

// ── Build InlineKeyboard from tgButtons ─────────────────────
function buildKeyboard(buttons: any[]): InlineKeyboard | undefined {
  if (!buttons || !Array.isArray(buttons) || buttons.length === 0) return undefined
  const kb = new InlineKeyboard()
  for (const btn of buttons) {
    if (!btn.label) continue
    if (btn.type === 'callback') kb.text(btn.label, btn.data || 'menu:main')
    else if (btn.type === 'url' && btn.data?.startsWith('http')) kb.url(btn.label, btn.data)
    else if (btn.type === 'webapp' && btn.data?.startsWith('http')) kb.webApp(btn.label, btn.data)
    kb.row()
  }
  return kb
}

// ── Send funnel message to a user ───────────────────────────
async function sendFunnelToUser(funnel: any, userId: string, telegramId: string | null, email: string | null, prefix = '') {
  const results: Array<{ channel: string; ok: boolean; error?: string }> = []

  if (funnel.channelTg && telegramId && funnel.tgText) {
    try {
      const kb = buildKeyboard(funnel.tgButtons as any[])
      await bot.api.sendMessage(telegramId, prefix + funnel.tgText, {
        parse_mode: funnel.tgParseMode || 'Markdown',
        ...(kb && { reply_markup: kb }),
      })
      results.push({ channel: 'tg', ok: true })
    } catch (e: any) {
      results.push({ channel: 'tg', ok: false, error: e.message })
    }
  }

  if (funnel.channelEmail && email && funnel.emailSubject) {
    try {
      await emailService.sendBroadcastEmail({
        to: email,
        subject: prefix + funnel.emailSubject,
        html: funnel.emailHtml || funnel.tgText || '',
        btnText: funnel.emailBtnText ?? undefined,
        btnUrl: funnel.emailBtnUrl ?? undefined,
        template: funnel.emailTemplate || 'dark',
      })
      results.push({ channel: 'email', ok: true })
    } catch (e: any) {
      results.push({ channel: 'email', ok: false, error: e.message })
    }
  }

  if (funnel.channelLk && funnel.lkTitle) {
    try {
      await inAppNotifications.sendToUser({
        userId,
        title: prefix + funnel.lkTitle,
        message: funnel.lkMessage || '',
        type: funnel.lkType || 'INFO',
      })
      results.push({ channel: 'lk', ok: true })
    } catch (e: any) {
      results.push({ channel: 'lk', ok: false, error: e.message })
    }
  }

  return results
}

// ── Exported for use by cron/trigger system ─────────────────
export { sendFunnelToUser, buildKeyboard }

const FunnelUpdateSchema = z.object({
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  delayType: z.string().optional(),
  delayValue: z.coerce.number().int().min(0).optional(),
  delayTime: z.string().nullable().optional(),
  delayWeekdays: z.any().optional(),
  channelTg: z.boolean().optional(),
  channelEmail: z.boolean().optional(),
  channelLk: z.boolean().optional(),
  tgText: z.string().nullable().optional(),
  tgButtons: z.any().optional(),
  tgParseMode: z.string().optional(),
  emailSubject: z.string().nullable().optional(),
  emailHtml: z.string().nullable().optional(),
  emailBtnText: z.string().nullable().optional(),
  emailBtnUrl: z.string().nullable().optional(),
  emailTemplate: z.string().optional(),
  lkTitle: z.string().nullable().optional(),
  lkMessage: z.string().nullable().optional(),
  lkType: z.string().optional(),
  sortOrder: z.coerce.number().int().optional(),
}).partial()

export async function adminFunnelRoutes(app: FastifyInstance) {
  const admin = { preHandler: [app.adminOnly] }

  // List
  app.get('/funnels', admin, async () =>
    prisma.funnel.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { logs: true } } },
    })
  )

  // Single
  app.get('/funnels/:id', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const f = await prisma.funnel.findUnique({ where: { id }, include: { _count: { select: { logs: true } } } })
    if (!f) return reply.status(404).send({ error: 'Not found' })
    return f
  })

  // Create
  app.post('/funnels', admin, async (req) => {
    const body = z.object({
      triggerId: z.string().min(1).regex(/^[a-z0-9_]+$/),
      name: z.string().min(1),
      description: z.string().optional(),
    }).parse(req.body)
    return prisma.funnel.create({
      data: { triggerId: body.triggerId, name: body.name, description: body.description, isCustom: true, sortOrder: 1100, channelTg: true },
    })
  })

  // Update
  app.put('/funnels/:id', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const data = FunnelUpdateSchema.parse(req.body)
    try { return await prisma.funnel.update({ where: { id }, data }) }
    catch { return reply.status(404).send({ error: 'Not found' }) }
  })

  // Delete (custom only)
  app.delete('/funnels/:id', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const f = await prisma.funnel.findUnique({ where: { id } })
    if (!f) return reply.status(404).send({ error: 'Not found' })
    if (!f.isCustom) return reply.status(400).send({ error: 'Cannot delete built-in trigger' })
    await prisma.funnel.delete({ where: { id } })
    return { ok: true }
  })

  // Toggle
  app.post('/funnels/:id/toggle', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const f = await prisma.funnel.findUnique({ where: { id } })
    if (!f) return reply.status(404).send({ error: 'Not found' })
    const updated = await prisma.funnel.update({ where: { id }, data: { enabled: !f.enabled } })
    return { ok: true, enabled: updated.enabled }
  })

  // Test (send to ADMINs only)
  app.post('/funnels/:id/test', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const f = await prisma.funnel.findUnique({ where: { id } })
    if (!f) return reply.status(404).send({ error: 'Not found' })

    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true, telegramId: true, email: true },
    })

    let sentCount = 0
    for (const a of admins) {
      const res = await sendFunnelToUser(f, a.id, a.telegramId, a.email, '🧪 ТЕСТ: ')
      if (res.some(r => r.ok)) sentCount++
    }
    return { ok: true, sentTo: sentCount }
  })

  // Logs
  app.get('/funnels/:id/logs', admin, async (req) => {
    const { id } = req.params as { id: string }
    const { page = '1', limit = '30' } = req.query as Record<string, string>
    const [logs, total] = await Promise.all([
      prisma.funnelLog.findMany({ where: { funnelId: id }, orderBy: { createdAt: 'desc' }, skip: (Number(page) - 1) * Number(limit), take: Number(limit) }),
      prisma.funnelLog.count({ where: { funnelId: id } }),
    ])
    return { logs, total }
  })

  // Seed defaults
  app.post('/funnels/seed', admin, async () => {
    let created = 0
    for (const t of DEFAULT_TRIGGERS) {
      const exists = await prisma.funnel.findUnique({ where: { triggerId: t.triggerId } })
      if (!exists) {
        await prisma.funnel.create({
          data: {
            triggerId: t.triggerId, name: t.name, sortOrder: t.sortOrder,
            delayType: (t as any).delayType || 'immediate', delayValue: (t as any).delayValue || 0,
            channelTg: true, tgText: t.tgText, isCustom: false,
          },
        })
        created++
      }
    }
    return { ok: true, created, total: DEFAULT_TRIGGERS.length }
  })
}
