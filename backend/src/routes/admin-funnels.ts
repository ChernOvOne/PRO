import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { logger } from '../utils/logger'

export async function adminFunnelRoutes(app: FastifyInstance) {
  const admin = { preHandler: [app.adminOnly] }

  // Variable docs
  app.get('/variables', admin, async () => {
    const { VARIABLE_DOCS } = await import('../services/funnel-engine')
    return VARIABLE_DOCS
  })

  // Trigger options (for dropdown)
  app.get('/triggers', admin, async () => {
    const { TRIGGER_OPTIONS } = await import('../services/funnel-engine')
    return TRIGGER_OPTIONS
  })

  // List all funnels with steps
  app.get('/funnels', admin, async () =>
    prisma.funnel.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        steps: { orderBy: { stepOrder: 'asc' } },
        _count: { select: { logs: true } },
      },
    })
  )

  // Single funnel
  app.get('/funnels/:id', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const f = await prisma.funnel.findUnique({
      where: { id },
      include: { steps: { orderBy: { stepOrder: 'asc' } }, _count: { select: { logs: true } } },
    })
    if (!f) return reply.status(404).send({ error: 'Not found' })
    return f
  })

  // Create funnel (select trigger from list)
  app.post('/funnels', admin, async (req, reply) => {
    const body = z.object({
      triggerId: z.string().min(1),
      name: z.string().min(1),
      description: z.string().optional(),
      isCustom: z.boolean().default(false),
      sortOrder: z.number().default(1100),
    }).parse(req.body)

    const exists = await prisma.funnel.findUnique({ where: { triggerId: body.triggerId } })
    if (exists) return reply.status(409).send({ error: 'Воронка с этим триггером уже существует' })

    const funnel = await prisma.funnel.create({
      data: {
        triggerId: body.triggerId,
        name: body.name,
        description: body.description,
        isCustom: body.isCustom,
        sortOrder: body.sortOrder,
      },
    })

    // Create default first step
    await prisma.funnelStep.create({
      data: { funnelId: funnel.id, stepOrder: 0, channelTg: true, tgText: '👋 {name}, ...' },
    })

    return prisma.funnel.findUnique({
      where: { id: funnel.id },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    })
  })

  // Update funnel (name, description, enabled)
  app.put('/funnels/:id', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const data = z.object({
      name: z.string().optional(),
      description: z.string().nullable().optional(),
      enabled: z.boolean().optional(),
      sortOrder: z.number().optional(),
    }).partial().parse(req.body)
    try { return await prisma.funnel.update({ where: { id }, data }) }
    catch { return reply.status(404).send({ error: 'Not found' }) }
  })

  // Delete funnel
  app.delete('/funnels/:id', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const f = await prisma.funnel.findUnique({ where: { id } })
    if (!f) return reply.status(404).send({ error: 'Not found' })
    await prisma.funnel.delete({ where: { id } })
    return { ok: true }
  })

  // Toggle enabled
  app.post('/funnels/:id/toggle', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const f = await prisma.funnel.findUnique({ where: { id } })
    if (!f) return reply.status(404).send({ error: 'Not found' })
    const updated = await prisma.funnel.update({ where: { id }, data: { enabled: !f.enabled } })
    return { ok: true, enabled: updated.enabled }
  })

  // ── Steps CRUD ────────────────────────────────────────────

  // Add step to funnel
  app.post('/funnels/:id/steps', admin, async (req) => {
    const { id } = req.params as { id: string }
    const maxStep = await prisma.funnelStep.findFirst({
      where: { funnelId: id }, orderBy: { stepOrder: 'desc' }, select: { stepOrder: true },
    })
    return prisma.funnelStep.create({
      data: { funnelId: id, stepOrder: (maxStep?.stepOrder ?? -1) + 1, channelTg: true, tgText: '' },
    })
  })

  // Update step
  app.put('/steps/:stepId', admin, async (req, reply) => {
    const { stepId } = req.params as { stepId: string }
    const data = z.object({
      delayType: z.string().optional(),
      delayValue: z.coerce.number().int().min(0).optional(),
      delayTime: z.string().nullable().optional(),
      condition: z.string().optional(),
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
      actionType: z.string().optional(),
      actionValue: z.coerce.number().int().optional(),
      actionPromoExpiry: z.coerce.number().int().optional(),
    }).partial().parse(req.body)
    try { return await prisma.funnelStep.update({ where: { id: stepId }, data }) }
    catch { return reply.status(404).send({ error: 'Not found' }) }
  })

  // Delete step
  app.delete('/steps/:stepId', admin, async (req) => {
    const { stepId } = req.params as { stepId: string }
    await prisma.funnelStep.delete({ where: { id: stepId } })
    return { ok: true }
  })

  // ── Test: send step 1 to ADMINs ──────────────────────────
  app.post('/funnels/:id/test', admin, async (req, reply) => {
    const { id } = req.params as { id: string }
    const funnel = await prisma.funnel.findUnique({
      where: { id },
      include: { steps: { orderBy: { stepOrder: 'asc' }, take: 1 } },
    })
    if (!funnel || funnel.steps.length === 0) return reply.status(400).send({ error: 'Нет шагов' })

    const { sendStep } = await import('../services/funnel-engine') as any
    // Use internal sendStep — not exported yet, so use triggerEvent-like logic
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true, telegramId: true, email: true },
    })

    const step = funnel.steps[0]
    let sentCount = 0
    for (const a of admins) {
      const { sendTestStep } = await import('../services/funnel-engine')
      await sendTestStep(step, funnel.id, a.id).catch(() => {})
      sentCount++
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
    const { TRIGGER_OPTIONS } = await import('../services/funnel-engine')
    let created = 0
    const defaultTexts: Record<string, string> = {
      'registration': '👋 Добро пожаловать в *HIDEYOU VPN*, {name}!\n\nНачните с бесплатного пробного периода или выберите тариф.',
      'trial_not_activated': '🎁 {name}, вы ещё не активировали бесплатный период!\n\nПопробуйте VPN бесплатно — это займёт 10 секунд.',
      'not_connected_24h': '🔧 {name}, нужна помощь с настройкой?\n\nВы активировали подписку, но ещё не подключились к VPN.',
      'not_connected_72h': '❓ {name}, возникли сложности?\n\nНапишите в поддержку — мы поможем!',
      'first_connection': '🎉 {name}, отлично! Вы подключились!\n\nПригласите друзей: {referralUrl}',
      'expiring_7d': '📅 {name}, подписка истекает через *7 дней* ({subExpireDate}).',
      'expiring_3d': '⚠️ {name}, подписка истекает через *3 дня*!',
      'expiring_1d': '🔴 {name}, подписка истекает *завтра*!',
      'expired': '❌ {name}, подписка *истекла*. Продлите чтобы вернуть доступ.',
      'expired_7d': '💔 {name}, мы скучаем! Подписка истекла неделю назад.',
      'payment_success': '✅ {name}, оплата подтверждена! Тариф: {tariffName}.',
      'payment_pending': '⏳ {name}, вы не завершили оплату.',
      'referral_paid': '🎉 {name}, ваш друг оплатил подписку! +{refBonusDays} бонусных дней.',
      'referral_registered': '👤 {name}, ваш друг зарегистрировался по вашей ссылке!',
    }

    let sortOrder = 100
    for (const group of TRIGGER_OPTIONS) {
      for (const t of group.triggers) {
        const exists = await prisma.funnel.findUnique({ where: { triggerId: t.id } })
        if (exists) { sortOrder += 10; continue }

        const funnel = await prisma.funnel.create({
          data: { triggerId: t.id, name: t.name, sortOrder, isCustom: false },
        })

        await prisma.funnelStep.create({
          data: {
            funnelId: funnel.id, stepOrder: 0, channelTg: true,
            tgText: defaultTexts[t.id] || `📢 {name}, ${t.name.toLowerCase()}`,
          },
        })

        created++
        sortOrder += 10
      }
    }

    return { ok: true, created }
  })
}
