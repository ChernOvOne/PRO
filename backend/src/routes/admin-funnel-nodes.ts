import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { logger } from '../utils/logger'
import { VARIABLE_DOCS, TRIGGER_OPTIONS, buildVars, subVars } from '../services/funnel-engine'
import { bot } from '../bot'
import { InlineKeyboard } from 'grammy'

// ── Node type configuration ─────────────────────────────────────
const NODE_TYPE_CONFIG = [
  {
    type: 'trigger', label: 'Триггер', color: '#ef4444', icon: 'Zap',
    triggers: [
      { id: 'registration', label: 'Регистрация', category: 'onboarding', hasParam: false },
      { id: 'expiring', label: 'Подписка истекает', category: 'subscription', hasParam: false },
      { id: 'expired', label: 'Подписка истекла', category: 'subscription', hasParam: false },
      { id: 'payment', label: 'Оплата', category: 'payment', hasParam: false },
      { id: 'payment_failed', label: 'Оплата не прошла', category: 'payment', hasParam: false },
      { id: 'traffic_limit', label: 'Трафик исчерпан', category: 'subscription', hasParam: false },
      { id: 'traffic_warning', label: 'Трафик предупреждение', category: 'subscription', hasParam: true, paramLabel: '% порог' },
      { id: 'inactive', label: 'Неактивный', category: 'engagement', hasParam: false },
      { id: 'device_added', label: 'Новое устройство', category: 'security', hasParam: false },
      { id: 'device_limit', label: 'Лимит устройств', category: 'security', hasParam: false },
      { id: 'referral_registered', label: 'Реферал зарегался', category: 'referral', hasParam: false },
      { id: 'referral_paid', label: 'Реферал оплатил', category: 'referral', hasParam: false },
      { id: 'anniversary', label: 'Годовщина', category: 'engagement', hasParam: true, paramLabel: 'Дней' },
      { id: 'no_referrals', label: 'Нет рефералов', category: 'referral', hasParam: true, paramLabel: 'Дней' },
      { id: 'balance_topup', label: 'Пополнение баланса', category: 'payment', hasParam: false },
      { id: 'trial_activated', label: 'Триал активирован', category: 'onboarding', hasParam: false },
      { id: 'trial_not_activated', label: 'Триал не активирован', category: 'onboarding', hasParam: true, paramLabel: 'Часов' },
      { id: 'first_connection', label: 'Первое подключение', category: 'onboarding', hasParam: false },
      { id: 'sub_link_revoked', label: 'Ссылка пересоздана', category: 'security', hasParam: false },
      { id: 'node_down', label: 'Сервер упал', category: 'system', hasParam: false },
      { id: 'node_restored', label: 'Сервер восстановлен', category: 'system', hasParam: false },
      { id: 'manual', label: 'Ручной запуск', category: 'custom', hasParam: false },
    ],
  },
  { type: 'message', label: 'Сообщение', color: '#06b6d4', icon: 'MessageCircle' },
  { type: 'delay', label: 'Задержка', color: '#64748b', icon: 'Clock' },
  { type: 'condition', label: 'Условие', color: '#f59e0b', icon: 'GitBranch' },
  { type: 'action', label: 'Действие', color: '#a855f7', icon: 'Zap' },
  { type: 'split', label: 'A/B тест', color: '#ec4899', icon: 'Split' },
  { type: 'wait_event', label: 'Ждать событие', color: '#10b981', icon: 'Hourglass' },
  { type: 'goto', label: 'Переход', color: '#6366f1', icon: 'ArrowRight' },
  { type: 'stop', label: 'Стоп', color: '#dc2626', icon: 'Square' },
  { type: 'http', label: 'HTTP запрос', color: '#14b8a6', icon: 'Globe' },
  { type: 'notify_admin', label: 'Уведомить админа', color: '#ef4444', icon: 'Bell' },
]

export async function adminFunnelNodeRoutes(app: FastifyInstance) {
  const editor = { preHandler: [app.requireEditor] }

  // ═══════════════════════════════════════════════════════════════
  // 14. GET /node-types — конфиг всех типов нод
  // ═══════════════════════════════════════════════════════════════
  app.get('/node-types', editor, async () => NODE_TYPE_CONFIG)

  // ═══════════════════════════════════════════════════════════════
  // 15. GET /variables — переменные для подстановки
  // ═══════════════════════════════════════════════════════════════
  app.get('/variables', editor, async () => VARIABLE_DOCS)

  // ═══════════════════════════════════════════════════════════════
  // 13. GET /bot-blocks — блоки бота для выбора целевого блока
  // ═══════════════════════════════════════════════════════════════
  app.get('/bot-blocks', editor, async () => {
    const groups = await prisma.botBlockGroup.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        blocks: {
          select: { id: true, name: true, type: true },
          orderBy: { name: 'asc' },
        },
      },
    })
    return groups.map(g => ({
      id: g.id,
      name: g.name,
      blocks: g.blocks,
    }))
  })

  // ═══════════════════════════════════════════════════════════════
  // 1. GET /groups — список всех воронок (групп) с нодами
  // ═══════════════════════════════════════════════════════════════
  app.get('/groups', editor, async () => {
    return prisma.funnel.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        nodes: { orderBy: { createdAt: 'asc' } },
        _count: { select: { logs: true, nodes: true } },
      },
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // 2. GET /groups/:id — одна группа с нодами
  // ═══════════════════════════════════════════════════════════════
  app.get('/groups/:id', editor, async (req, reply) => {
    const { id } = req.params as { id: string }
    const group = await prisma.funnel.findUnique({
      where: { id },
      include: {
        nodes: { orderBy: { createdAt: 'asc' } },
        _count: { select: { logs: true, nodes: true } },
      },
    })
    if (!group) return reply.status(404).send({ error: 'Группа не найдена' })
    return group
  })

  // ═══════════════════════════════════════════════════════════════
  // 3. POST /groups — создать группу
  // ═══════════════════════════════════════════════════════════════
  app.post('/groups', editor, async (req) => {
    const body = z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      category: z.string().optional(),
    }).parse(req.body)

    const maxOrder = await prisma.funnel.aggregate({ _max: { sortOrder: true } })
    return prisma.funnel.create({
      data: {
        name: body.name,
        description: body.description,
        category: body.category,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 10,
        isCustom: true,
      },
      include: { nodes: true },
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // 4. PUT /groups/:id — обновить группу
  // ═══════════════════════════════════════════════════════════════
  app.put('/groups/:id', editor, async (req, reply) => {
    const { id } = req.params as { id: string }
    const data = z.object({
      name: z.string().optional(),
      description: z.string().nullable().optional(),
      enabled: z.boolean().optional(),
      category: z.string().nullable().optional(),
      stopOnPayment: z.boolean().optional(),
      stopOnConnect: z.boolean().optional(),
      stopOnActiveSub: z.boolean().optional(),
      stopOnBotMessage: z.boolean().optional(),
      sandboxMode: z.boolean().optional(),
      sandboxTag: z.string().nullable().optional(),
      maxMessages: z.number().int().nullable().optional(),
      timeoutDays: z.number().int().nullable().optional(),
      workHoursStart: z.string().nullable().optional(),
      workHoursEnd: z.string().nullable().optional(),
      timezone: z.string().nullable().optional(),
      priority: z.number().int().optional(),
      antiSpamHours: z.number().int().nullable().optional(),
      sortOrder: z.number().int().optional(),
    }).partial().parse(req.body)

    try {
      return await prisma.funnel.update({ where: { id }, data })
    } catch {
      return reply.status(404).send({ error: 'Группа не найдена' })
    }
  })

  // ═══════════════════════════════════════════════════════════════
  // 5. DELETE /groups/:id — удалить группу (каскадно)
  // ═══════════════════════════════════════════════════════════════
  app.delete('/groups/:id', editor, async (req, reply) => {
    const { id } = req.params as { id: string }
    const group = await prisma.funnel.findUnique({ where: { id } })
    if (!group) return reply.status(404).send({ error: 'Группа не найдена' })
    await prisma.funnel.delete({ where: { id } })
    return { ok: true }
  })

  // ═══════════════════════════════════════════════════════════════
  // 6. POST /groups/:id/toggle — включить/выключить
  // ═══════════════════════════════════════════════════════════════
  app.post('/groups/:id/toggle', editor, async (req, reply) => {
    const { id } = req.params as { id: string }
    const group = await prisma.funnel.findUnique({ where: { id } })
    if (!group) return reply.status(404).send({ error: 'Группа не найдена' })
    const updated = await prisma.funnel.update({
      where: { id },
      data: { enabled: !group.enabled },
    })
    return { ok: true, enabled: updated.enabled }
  })

  // ═══════════════════════════════════════════════════════════════
  // 7. POST /groups/:id/nodes — создать ноду
  // ═══════════════════════════════════════════════════════════════
  app.post('/groups/:id/nodes', editor, async (req) => {
    const { id } = req.params as { id: string }
    const body = z.object({
      nodeType: z.string().min(1),
      name: z.string().default(''),
      posX: z.number().default(0),
      posY: z.number().default(0),
      // Trigger
      triggerType: z.string().optional(),
      triggerParam: z.number().int().nullable().optional(),
      // Delay
      delayType: z.string().optional(),
      delayValue: z.number().int().optional(),
      delayTime: z.string().nullable().optional(),
      delayWeekdays: z.any().optional(),
      // Condition
      conditionType: z.string().nullable().optional(),
      conditionValue: z.string().nullable().optional(),
      conditionLogic: z.string().nullable().optional(),
      conditions: z.any().optional(),
      // Message
      channelTg: z.boolean().optional(),
      channelEmail: z.boolean().optional(),
      channelLk: z.boolean().optional(),
      channelPush: z.boolean().optional(),
      tgText: z.string().nullable().optional(),
      tgButtons: z.any().optional(),
      tgParseMode: z.string().optional(),
      tgMediaUrl: z.string().nullable().optional(),
      tgMediaType: z.string().nullable().optional(),
      tgPin: z.boolean().optional(),
      tgDeletePrev: z.boolean().optional(),
      emailSubject: z.string().nullable().optional(),
      emailHtml: z.string().nullable().optional(),
      emailBtnText: z.string().nullable().optional(),
      emailBtnUrl: z.string().nullable().optional(),
      emailTemplate: z.string().optional(),
      lkTitle: z.string().nullable().optional(),
      lkMessage: z.string().nullable().optional(),
      lkType: z.string().optional(),
      // Action
      actionType: z.string().optional(),
      actionValue: z.string().nullable().optional(),
      actionPromoExpiry: z.number().int().optional(),
      // Split
      splitPercent: z.number().int().nullable().optional(),
      // Wait event
      waitEvent: z.string().nullable().optional(),
      waitTimeout: z.number().int().nullable().optional(),
      // Goto
      gotoTargetType: z.string().nullable().optional(),
      gotoTargetId: z.string().nullable().optional(),
      // HTTP
      httpUrl: z.string().nullable().optional(),
      httpMethod: z.string().nullable().optional(),
      httpHeaders: z.any().optional(),
      httpBody: z.string().nullable().optional(),
      // Notify
      notifyChannel: z.string().nullable().optional(),
      notifyText: z.string().nullable().optional(),
    }).parse(req.body)

    return prisma.funnelNode.create({
      data: {
        funnelId: id,
        ...body,
      },
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // 8. PUT /nodes/:nodeId — обновить ноду
  // ═══════════════════════════════════════════════════════════════
  app.put('/nodes/:nodeId', editor, async (req, reply) => {
    const { nodeId } = req.params as { nodeId: string }
    const data = z.object({
      name: z.string().optional(),
      nodeType: z.string().optional(),
      posX: z.number().optional(),
      posY: z.number().optional(),
      // Connections
      nextNodeId: z.string().nullable().optional(),
      trueNodeId: z.string().nullable().optional(),
      falseNodeId: z.string().nullable().optional(),
      // Trigger
      triggerType: z.string().nullable().optional(),
      triggerParam: z.number().int().nullable().optional(),
      // Delay
      delayType: z.string().optional(),
      delayValue: z.number().int().optional(),
      delayTime: z.string().nullable().optional(),
      delayWeekdays: z.any().optional(),
      // Condition
      conditionType: z.string().nullable().optional(),
      conditionValue: z.string().nullable().optional(),
      conditionLogic: z.string().nullable().optional(),
      conditions: z.any().optional(),
      // Message
      channelTg: z.boolean().optional(),
      channelEmail: z.boolean().optional(),
      channelLk: z.boolean().optional(),
      channelPush: z.boolean().optional(),
      tgText: z.string().nullable().optional(),
      tgButtons: z.any().optional(),
      tgParseMode: z.string().optional(),
      tgMediaUrl: z.string().nullable().optional(),
      tgMediaType: z.string().nullable().optional(),
      tgPin: z.boolean().optional(),
      tgDeletePrev: z.boolean().optional(),
      emailSubject: z.string().nullable().optional(),
      emailHtml: z.string().nullable().optional(),
      emailBtnText: z.string().nullable().optional(),
      emailBtnUrl: z.string().nullable().optional(),
      emailTemplate: z.string().optional(),
      lkTitle: z.string().nullable().optional(),
      lkMessage: z.string().nullable().optional(),
      lkType: z.string().optional(),
      // Action
      actionType: z.string().optional(),
      actionValue: z.string().nullable().optional(),
      actionPromoExpiry: z.number().int().optional(),
      // Split
      splitPercent: z.number().int().nullable().optional(),
      // Wait event
      waitEvent: z.string().nullable().optional(),
      waitTimeout: z.number().int().nullable().optional(),
      // Goto
      gotoTargetType: z.string().nullable().optional(),
      gotoTargetId: z.string().nullable().optional(),
      // HTTP
      httpUrl: z.string().nullable().optional(),
      httpMethod: z.string().nullable().optional(),
      httpHeaders: z.any().optional(),
      httpBody: z.string().nullable().optional(),
      // Notify
      notifyChannel: z.string().nullable().optional(),
      notifyText: z.string().nullable().optional(),
      // Repeat
      repeatEnabled: z.boolean().optional(),
      repeatInterval: z.number().int().nullable().optional(),
      repeatMax: z.number().int().nullable().optional(),
    }).partial().parse(req.body)

    try {
      return await prisma.funnelNode.update({ where: { id: nodeId }, data })
    } catch {
      return reply.status(404).send({ error: 'Нода не найдена' })
    }
  })

  // ═══════════════════════════════════════════════════════════════
  // 9. DELETE /nodes/:nodeId — удалить ноду
  // ═══════════════════════════════════════════════════════════════
  app.delete('/nodes/:nodeId', editor, async (req, reply) => {
    const { nodeId } = req.params as { nodeId: string }
    try {
      // Also clean up references to this node in other nodes
      await prisma.funnelNode.updateMany({
        where: { nextNodeId: nodeId },
        data: { nextNodeId: null },
      })
      await prisma.funnelNode.updateMany({
        where: { trueNodeId: nodeId },
        data: { trueNodeId: null },
      })
      await prisma.funnelNode.updateMany({
        where: { falseNodeId: nodeId },
        data: { falseNodeId: null },
      })
      await prisma.funnelNode.delete({ where: { id: nodeId } })
      return { ok: true }
    } catch {
      return reply.status(404).send({ error: 'Нода не найдена' })
    }
  })

  // ═══════════════════════════════════════════════════════════════
  // 10. PUT /nodes/:nodeId/position — обновить позицию (drag-and-drop)
  // ═══════════════════════════════════════════════════════════════
  app.put('/nodes/:nodeId/position', editor, async (req, reply) => {
    const { nodeId } = req.params as { nodeId: string }
    const { posX, posY } = z.object({
      posX: z.number(),
      posY: z.number(),
    }).parse(req.body)

    try {
      return await prisma.funnelNode.update({
        where: { id: nodeId },
        data: { posX, posY },
      })
    } catch {
      return reply.status(404).send({ error: 'Нода не найдена' })
    }
  })

  // ═══════════════════════════════════════════════════════════════
  // 11. PUT /nodes/:nodeId/connect — обновить connections
  // ═══════════════════════════════════════════════════════════════
  app.put('/nodes/:nodeId/connect', editor, async (req, reply) => {
    const { nodeId } = req.params as { nodeId: string }
    const data = z.object({
      nextNodeId: z.string().nullable().optional(),
      trueNodeId: z.string().nullable().optional(),
      falseNodeId: z.string().nullable().optional(),
    }).parse(req.body)

    try {
      return await prisma.funnelNode.update({
        where: { id: nodeId },
        data,
      })
    } catch {
      return reply.status(404).send({ error: 'Нода не найдена' })
    }
  })

  // ═══════════════════════════════════════════════════════════════
  // 12. POST /groups/:id/duplicate — дублировать группу
  // ═══════════════════════════════════════════════════════════════
  app.post('/groups/:id/duplicate', editor, async (req, reply) => {
    const { id } = req.params as { id: string }
    const source = await prisma.funnel.findUnique({
      where: { id },
      include: { nodes: true },
    })
    if (!source) return reply.status(404).send({ error: 'Группа не найдена' })

    // Create copy
    const copy = await prisma.funnel.create({
      data: {
        name: `${source.name} (копия)`,
        description: source.description,
        category: source.category,
        sortOrder: source.sortOrder + 1,
        isCustom: true,
        stopOnPayment: source.stopOnPayment,
        stopOnConnect: source.stopOnConnect,
        maxMessages: source.maxMessages,
        timeoutDays: source.timeoutDays,
        workHoursStart: source.workHoursStart,
        workHoursEnd: source.workHoursEnd,
        timezone: source.timezone,
        priority: source.priority,
        antiSpamHours: source.antiSpamHours,
      },
    })

    // Map old node IDs to new node IDs
    const idMap = new Map<string, string>()

    // Create nodes (first pass — without connections)
    for (const node of source.nodes) {
      const newNode = await prisma.funnelNode.create({
        data: {
          funnelId: copy.id,
          nodeType: node.nodeType,
          name: node.name,
          posX: node.posX + 50,
          posY: node.posY + 50,
          triggerType: node.triggerType,
          triggerParam: node.triggerParam,
          delayType: node.delayType,
          delayValue: node.delayValue,
          delayTime: node.delayTime,
          delayWeekdays: node.delayWeekdays as any,
          conditionType: node.conditionType,
          conditionValue: node.conditionValue,
          conditionLogic: node.conditionLogic,
          conditions: node.conditions as any,
          channelTg: node.channelTg,
          channelEmail: node.channelEmail,
          channelLk: node.channelLk,
          channelPush: node.channelPush,
          tgText: node.tgText,
          tgButtons: node.tgButtons as any,
          tgParseMode: node.tgParseMode,
          tgMediaUrl: node.tgMediaUrl,
          tgMediaType: node.tgMediaType,
          tgPin: node.tgPin,
          tgDeletePrev: node.tgDeletePrev,
          emailSubject: node.emailSubject,
          emailHtml: node.emailHtml,
          emailBtnText: node.emailBtnText,
          emailBtnUrl: node.emailBtnUrl,
          emailTemplate: node.emailTemplate,
          lkTitle: node.lkTitle,
          lkMessage: node.lkMessage,
          lkType: node.lkType,
          actionType: node.actionType,
          actionValue: node.actionValue,
          actionPromoExpiry: node.actionPromoExpiry,
          splitPercent: node.splitPercent,
          waitEvent: node.waitEvent,
          waitTimeout: node.waitTimeout,
          gotoTargetType: node.gotoTargetType,
          gotoTargetId: node.gotoTargetId,
          httpUrl: node.httpUrl,
          httpMethod: node.httpMethod,
          httpHeaders: node.httpHeaders as any,
          httpBody: node.httpBody,
          notifyChannel: node.notifyChannel,
          notifyText: node.notifyText,
        },
      })
      idMap.set(node.id, newNode.id)
    }

    // Second pass — fix connections
    for (const node of source.nodes) {
      const newId = idMap.get(node.id)
      if (!newId) continue
      const update: any = {}
      if (node.nextNodeId && idMap.has(node.nextNodeId)) update.nextNodeId = idMap.get(node.nextNodeId)
      if (node.trueNodeId && idMap.has(node.trueNodeId)) update.trueNodeId = idMap.get(node.trueNodeId)
      if (node.falseNodeId && idMap.has(node.falseNodeId)) update.falseNodeId = idMap.get(node.falseNodeId)
      if (Object.keys(update).length > 0) {
        await prisma.funnelNode.update({ where: { id: newId }, data: update })
      }
    }

    return prisma.funnel.findUnique({
      where: { id: copy.id },
      include: { nodes: true },
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // 17. POST /nodes/:nodeId/test — тестовая отправка ноды админам
  // ═══════════════════════════════════════════════════════════════
  app.post('/nodes/:nodeId/test', editor, async (req, reply) => {
    const { nodeId } = req.params as { nodeId: string }
    const node = await prisma.funnelNode.findUnique({
      where: { id: nodeId },
      include: { funnel: true },
    })
    if (!node) return reply.status(404).send({ error: 'Нода не найдена' })

    const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } })
    if (admins.length === 0) return reply.status(400).send({ error: 'Нет администраторов' })

    let sentTo = 0
    const errors: string[] = []

    for (const admin of admins) {
      try {
        // TG
        if (node.channelTg && node.tgText && admin.telegramId) {
          const vars = await buildVars(admin.id)
          const text = '🧪 ТЕСТ: ' + subVars(node.tgText, vars)

          // Build keyboard
          let kb: InlineKeyboard | undefined
          const buttons = node.tgButtons as any[]
          if (buttons?.length) {
            kb = new InlineKeyboard()
            for (const b of buttons) {
              if (!b.label) continue
              if (b.type === 'callback') kb.text(b.label, b.data || 'menu:main')
              else if (b.type === 'url' && b.data?.startsWith('http')) kb.url(b.label, b.data)
              else if (b.type === 'webapp' && b.data?.startsWith('http')) kb.webApp(b.label, b.data)
              kb.row()
            }
          }

          await bot.api.sendMessage(admin.telegramId, text, {
            parse_mode: (node.tgParseMode as any) || 'Markdown',
            ...(kb && { reply_markup: kb }),
          })
          sentTo++
        }
      } catch (e: any) {
        errors.push(`${admin.email || admin.telegramId}: ${e.message}`)
      }
    }

    logger.info(`Test node ${nodeId} sent to ${sentTo} admins`)
    return { ok: true, sentTo, errors }
  })

  // ═══════════════════════════════════════════════════════════════
  // 16. GET /groups/:id/logs — логи выполнения
  // ═══════════════════════════════════════════════════════════════
  app.get('/groups/:id/logs', editor, async (req) => {
    const { id } = req.params as { id: string }
    const { skip = '0', take = '50' } = req.query as Record<string, string>
    const [logs, total] = await Promise.all([
      prisma.funnelLog.findMany({
        where: { funnelId: id },
        orderBy: { createdAt: 'desc' },
        skip: Number(skip),
        take: Number(take),
      }),
      prisma.funnelLog.count({ where: { funnelId: id } }),
    ])
    return { logs, total }
  })
}
