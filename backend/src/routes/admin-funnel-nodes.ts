import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import { logger } from '../utils/logger'
import { VARIABLE_DOCS, TRIGGER_OPTIONS, buildVars, subVars } from '../services/funnel-engine'
import { bot } from '../bot'
import { InlineKeyboard } from 'grammy'

// ── Node type configuration ─────────────────────────────────────
// Список триггеров. Должен соответствовать TRIGGER_OPTIONS в funnel-engine.ts.
// Группировка по смысловым категориям для администратора.
//   - webhook: приходит от REMNAWAVE, таймингом рулит панель
//   - event:   внутренние события нашего кода (оплата, реферал, промо)
//   - state:   cron-сканер с настраиваемым интервалом (triggerParam + delayType как единица)
const NODE_TYPE_CONFIG = [
  {
    type: 'trigger', label: 'Триггер', color: '#ef4444', icon: 'Zap',
    triggers: [
      // ── Регистрация и активация ──
      { id: 'registration',        label: '👋 Регистрация',                       category: 'signup',       hasParam: false },
      { id: 'first_connection',    label: '🎉 Первое подключение',                category: 'signup',       hasParam: false },

      // ── Подписка (от REMNAWAVE) ──
      { id: 'expiring_3d',         label: '⚠️ Истекает через 3 дня',             category: 'subscription', hasParam: false },
      { id: 'expiring_1d',         label: '🔴 Истекает через 1 день',            category: 'subscription', hasParam: false },
      { id: 'expired',             label: '❌ Подписка истекла',                 category: 'subscription', hasParam: false },
      { id: 'traffic_50',          label: '📊 Трафик 50%',                       category: 'subscription', hasParam: false },
      { id: 'traffic_80',          label: '📊 Трафик 80%',                       category: 'subscription', hasParam: false },
      { id: 'traffic_95',          label: '📊 Трафик 95%',                       category: 'subscription', hasParam: false },
      { id: 'traffic_100',         label: '🚫 Трафик исчерпан',                  category: 'subscription', hasParam: false },
      { id: 'traffic_reset',       label: '🔄 Трафик сброшен',                   category: 'subscription', hasParam: false },

      // ── Оплата ──
      { id: 'payment_success',     label: '✅ Оплата прошла',                    category: 'payment',      hasParam: false },
      { id: 'payment_pending',     label: '⏳ Оплата не завершена',              category: 'payment',      hasParam: false },
      { id: 'payment_renewal',     label: '🔄 Повторная оплата',                 category: 'payment',      hasParam: false },

      // ── Бонусы и промо ──
      { id: 'balance_topup',       label: '💳 Пополнение баланса',               category: 'bonus',        hasParam: false },
      { id: 'promo_activated',     label: '🎫 Промокод применён',                category: 'bonus',        hasParam: false },
      { id: 'bonus_days_granted',  label: '🎁 Бонус-дни начислены',              category: 'bonus',        hasParam: false },
      { id: 'gift_received',       label: '🎁 Получил подарок',                  category: 'bonus',        hasParam: false },

      // ── Рефералы ──
      { id: 'referral_registered', label: '👤 Реферал зарегистрировался',        category: 'referral',     hasParam: false },
      { id: 'referral_trial',      label: '🎁 Реферал взял триал',               category: 'referral',     hasParam: false },
      { id: 'referral_paid',       label: '💰 Реферал оплатил',                  category: 'referral',     hasParam: false },
      { id: 'five_referrals',      label: '🏆 5 рефералов',                      category: 'referral',     hasParam: false },

      // ── Безопасность ──
      { id: 'new_device',          label: '📱 Новое устройство',                 category: 'security',     hasParam: false },
      { id: 'device_limit',        label: '🔒 Лимит устройств',                  category: 'security',     hasParam: false },
      { id: 'sub_link_revoked',    label: '🔄 Подписка-ссылка обновлена',        category: 'security',     hasParam: false },

      // ⏰ Проверка состояния (cron-триггеры с гибким интервалом)
      { id: 'state_trial_not_activated',   label: '⏰ Не активировал триал N времени',         category: 'state', hasParam: true, paramLabel: 'N', defaultParam: 1,  defaultUnit: 'hours' },
      { id: 'state_not_connected',         label: '⏰ Не подключился N времени после подписки',category: 'state', hasParam: true, paramLabel: 'N', defaultParam: 24, defaultUnit: 'hours' },
      { id: 'state_inactive',              label: '⏰ Не заходил N времени',                   category: 'state', hasParam: true, paramLabel: 'N', defaultParam: 14, defaultUnit: 'days'  },
      { id: 'state_no_referrals',          label: '⏰ 0 рефералов N времени',                  category: 'state', hasParam: true, paramLabel: 'N', defaultParam: 7,  defaultUnit: 'days'  },
      { id: 'state_winback',               label: '⏰ Winback — истекла N назад',              category: 'state', hasParam: true, paramLabel: 'N', defaultParam: 7,  defaultUnit: 'days'  },
      { id: 'state_anniversary',           label: '⏰ Годовщина через N времени',              category: 'state', hasParam: true, paramLabel: 'N', defaultParam: 365,defaultUnit: 'days'  },
      { id: 'state_gift_not_claimed',      label: '⏰ Подарок не активирован N',               category: 'state', hasParam: true, paramLabel: 'N', defaultParam: 3,  defaultUnit: 'days'  },
      { id: 'state_feedback_request',      label: '⏰ Запрос отзыва через N времени',          category: 'state', hasParam: true, paramLabel: 'N', defaultParam: 7,  defaultUnit: 'days'  },
      { id: 'state_low_balance',           label: '⏰ Баланс 0 больше N времени',              category: 'state', hasParam: true, paramLabel: 'N', defaultParam: 3,  defaultUnit: 'days'  },
      { id: 'state_payment_pending_stuck', label: '⏰ Оплата зависла > N времени',             category: 'state', hasParam: true, paramLabel: 'N', defaultParam: 30, defaultUnit: 'minutes' },
      { id: 'state_on_trial_about_to_expire', label: '⏰ Триал заканчивается через N времени', category: 'state', hasParam: true, paramLabel: 'N', defaultParam: 1,  defaultUnit: 'days'  },

      // Ручной
      { id: 'manual',              label: '🖐 Ручной запуск',                    category: 'custom',       hasParam: false },
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

    const { buildKb } = await import('../services/funnel-engine')

    logger.info(`[test-node] raw tgButtons: ${JSON.stringify(node.tgButtons)}`)

    for (const admin of admins) {
      try {
        // TG
        if (node.channelTg && node.tgText && admin.telegramId) {
          const vars = await buildVars(admin.id)
          const text = '🧪 ТЕСТ: ' + subVars(node.tgText, vars)

          // Use the shared buildKb so test messages match production behavior
          const buttons = (node.tgButtons as any[] || []).filter((b: any) => b && !b._type)
          const kb = buttons.length > 0 ? buildKb(buttons, vars) : undefined

          logger.info(`[test-node] built kb: ${JSON.stringify(kb)}`)

          await bot.api.sendMessage(admin.telegramId, text, {
            parse_mode: (node.tgParseMode as any) || 'Markdown',
            ...(kb && { reply_markup: kb as any }),
          })
          sentTo++
        }
      } catch (e: any) {
        logger.error(`[test-node] send failed: ${e.message}`)
        errors.push(`${admin.email || admin.telegramId}: ${e.message}`)
      }
    }

    logger.info(`Test node ${nodeId} sent to ${sentTo} admins`)
    return { ok: true, sentTo, errors }
  })

  // ═══════════════════════════════════════════════════════════════
  // 18. GET /templates — каталог готовых шаблонов воронок
  // ═══════════════════════════════════════════════════════════════
  app.get('/templates', editor, async () => {
    const { FUNNEL_TEMPLATES } = await import('../services/funnel-templates')
    return FUNNEL_TEMPLATES.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      icon: t.icon,
      nodesCount: t.nodes.length,
      triggerType: t.nodes.find(n => n.nodeType === 'trigger')?.triggerType,
    }))
  })

  // ═══════════════════════════════════════════════════════════════
  // 19b. POST /templates/install-all — установить ВСЕ шаблоны разом
  // ═══════════════════════════════════════════════════════════════
  app.post('/templates/install-all', editor, async (_req) => {
    const { FUNNEL_TEMPLATES } = await import('../services/funnel-templates')
    const { skip = 'existing' } = (_req.query as Record<string, string>) || {}

    let installed = 0
    let skipped = 0
    const errors: string[] = []

    for (const tpl of FUNNEL_TEMPLATES) {
      try {
        // Skip if a funnel already has this trigger
        const triggerType = tpl.nodes.find(n => n.nodeType === 'trigger')?.triggerType
        if (skip === 'existing' && triggerType) {
          const existing = await prisma.funnel.findFirst({
            where: { nodes: { some: { nodeType: 'trigger', triggerType } } },
          })
          if (existing) { skipped++; continue }
        }

        const maxOrder = await prisma.funnel.aggregate({ _max: { sortOrder: true } })
        const funnel = await prisma.funnel.create({
          data: {
            name: `${tpl.icon} ${tpl.name}`,
            description: tpl.description,
            category: tpl.category,
            sortOrder: (maxOrder._max.sortOrder ?? 0) + 10,
            isCustom: true,
            enabled: false,
            stopOnPayment: tpl.stopOnPayment ?? false,
            stopOnActiveSub: tpl.stopOnActiveSub ?? false,
            stopOnConnect: tpl.stopOnConnect ?? false,
            priority: tpl.priority ?? 100,
          },
        })

        const idMap = new Map<string, string>()
        let col = 0
        for (const tn of tpl.nodes) {
          const created = await prisma.funnelNode.create({
            data: {
              funnelId: funnel.id,
              nodeType: tn.nodeType,
              name: tn.name || '',
              posX: tn.posX ?? col * 320,
              posY: tn.posY ?? 100,
              triggerType: tn.triggerType,
              triggerParam: tn.triggerParam,
              delayType: tn.delayType ?? 'minutes',
              delayValue: tn.delayValue ?? 0,
              conditionType: tn.conditionType,
              conditions: tn.conditions as any,
              channelTg: tn.channelTg ?? false,
              channelEmail: tn.channelEmail ?? false,
              channelLk: tn.channelLk ?? false,
              tgText: tn.tgText,
              tgButtons: (tn.tgButtons ?? []) as any,
              tgParseMode: tn.tgParseMode ?? 'Markdown',
              lkTitle: tn.lkTitle, lkMessage: tn.lkMessage, lkType: tn.lkType ?? 'info',
              actionType: tn.actionType, actionValue: tn.actionValue, actionPromoExpiry: tn.actionPromoExpiry,
              waitEvent: tn.waitEvent, waitTimeout: tn.waitTimeout,
              notifyChannel: tn.notifyChannel, notifyText: tn.notifyText,
            },
          })
          idMap.set(tn.refId, created.id)
          col++
        }

        for (const tn of tpl.nodes) {
          const realId = idMap.get(tn.refId)
          if (!realId) continue
          const update: any = {}
          if (tn.next && idMap.has(tn.next)) update.nextNodeId = idMap.get(tn.next)
          if (tn.trueNext && idMap.has(tn.trueNext)) update.trueNodeId = idMap.get(tn.trueNext)
          if (tn.falseNext && idMap.has(tn.falseNext)) update.falseNodeId = idMap.get(tn.falseNext)
          if (Object.keys(update).length > 0) {
            await prisma.funnelNode.update({ where: { id: realId }, data: update })
          }
        }

        installed++
      } catch (e: any) {
        errors.push(`${tpl.id}: ${e.message}`)
      }
    }

    logger.info(`Bulk-installed ${installed} templates, skipped ${skipped}, errors ${errors.length}`)
    return { ok: true, installed, skipped, errors, total: FUNNEL_TEMPLATES.length }
  })

  // ═══════════════════════════════════════════════════════════════
  // 19. POST /templates/:id/install — установить шаблон (создать Funnel + ноды)
  // ═══════════════════════════════════════════════════════════════
  app.post('/templates/:id/install', editor, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { getTemplate } = await import('../services/funnel-templates')
    const tpl = getTemplate(id)
    if (!tpl) return reply.status(404).send({ error: 'Шаблон не найден' })

    const maxOrder = await prisma.funnel.aggregate({ _max: { sortOrder: true } })
    const funnel = await prisma.funnel.create({
      data: {
        name: `${tpl.icon} ${tpl.name}`,
        description: tpl.description,
        category: tpl.category,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 10,
        isCustom: true,
        enabled: false, // Создаём выключенной — админ сам включит после проверки
        stopOnPayment: tpl.stopOnPayment ?? false,
        stopOnActiveSub: tpl.stopOnActiveSub ?? false,
        stopOnConnect: tpl.stopOnConnect ?? false,
        priority: tpl.priority ?? 100,
      },
    })

    // Первый проход: создать все ноды с автогрид-расположением
    const idMap = new Map<string, string>()
    let col = 0
    for (const tn of tpl.nodes) {
      const created = await prisma.funnelNode.create({
        data: {
          funnelId: funnel.id,
          nodeType: tn.nodeType,
          name: tn.name || '',
          posX: tn.posX ?? col * 320,
          posY: tn.posY ?? 100,
          triggerType: tn.triggerType,
          triggerParam: tn.triggerParam,
          delayType: tn.delayType ?? 'minutes',
          delayValue: tn.delayValue ?? 0,
          conditionType: tn.conditionType,
          conditions: tn.conditions as any,
          channelTg: tn.channelTg ?? false,
          channelEmail: tn.channelEmail ?? false,
          channelLk: tn.channelLk ?? false,
          tgText: tn.tgText,
          tgButtons: (tn.tgButtons ?? []) as any,
          tgParseMode: tn.tgParseMode ?? 'Markdown',
          emailSubject: tn.emailSubject,
          emailHtml: tn.emailHtml,
          emailBtnText: tn.emailBtnText,
          emailBtnUrl: tn.emailBtnUrl,
          lkTitle: tn.lkTitle,
          lkMessage: tn.lkMessage,
          lkType: tn.lkType ?? 'info',
          actionType: tn.actionType,
          actionValue: tn.actionValue,
          actionPromoExpiry: tn.actionPromoExpiry,
          waitEvent: tn.waitEvent,
          waitTimeout: tn.waitTimeout,
          notifyChannel: tn.notifyChannel,
          notifyText: tn.notifyText,
          repeatEnabled: tn.repeatEnabled ?? false,
          repeatInterval: tn.repeatInterval,
          repeatMax: tn.repeatMax,
          httpUrl: tn.httpUrl,
          httpMethod: tn.httpMethod,
          httpBody: tn.httpBody,
        },
      })
      idMap.set(tn.refId, created.id)
      col++
    }

    // Второй проход: связать ноды по refId → id
    for (const tn of tpl.nodes) {
      const realId = idMap.get(tn.refId)
      if (!realId) continue
      const update: any = {}
      if (tn.next && idMap.has(tn.next)) update.nextNodeId = idMap.get(tn.next)
      if (tn.trueNext && idMap.has(tn.trueNext)) update.trueNodeId = idMap.get(tn.trueNext)
      if (tn.falseNext && idMap.has(tn.falseNext)) update.falseNodeId = idMap.get(tn.falseNext)
      if (Object.keys(update).length > 0) {
        await prisma.funnelNode.update({ where: { id: realId }, data: update })
      }
    }

    logger.info(`Installed funnel template ${tpl.id} → funnel ${funnel.id}`)
    return prisma.funnel.findUnique({
      where: { id: funnel.id },
      include: { nodes: true },
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // 21. POST /groups/:id/validate — структурная валидация воронки
  // ═══════════════════════════════════════════════════════════════
  app.post('/groups/:id/validate', editor, async (req, reply) => {
    const { id } = req.params as { id: string }
    const group = await prisma.funnel.findUnique({
      where: { id },
      include: { nodes: true },
    })
    if (!group) return reply.status(404).send({ error: 'Группа не найдена' })

    const issues: Array<{ severity: 'error' | 'warn' | 'info'; nodeId?: string; message: string }> = []
    const nodes = group.nodes
    const nodeMap = new Map(nodes.map(n => [n.id, n]))

    // No nodes
    if (nodes.length === 0) {
      issues.push({ severity: 'error', message: 'Воронка пуста — добавьте хотя бы одну ноду' })
    }

    // Triggers
    const triggers = nodes.filter(n => n.nodeType === 'trigger')
    if (triggers.length === 0) {
      issues.push({ severity: 'error', message: 'Нет триггера — воронка не запустится' })
    } else if (triggers.length > 1) {
      issues.push({ severity: 'warn', message: `Несколько триггеров (${triggers.length}) — возможно дублирование запусков` })
    }

    for (const n of nodes) {
      // Message without any channel
      if (n.nodeType === 'message' || n.nodeType === 'trigger') {
        if (!n.channelTg && !n.channelEmail && !n.channelLk) {
          issues.push({ severity: 'warn', nodeId: n.id, message: `Нода "${n.name}" — не выбран ни один канал` })
        }
        if (n.channelTg && !n.tgText) {
          issues.push({ severity: 'warn', nodeId: n.id, message: `Нода "${n.name}" — TG-канал включён, но текст пустой` })
        }
      }

      // Delay without value
      if (n.nodeType === 'delay') {
        if (!n.delayValue || n.delayValue <= 0) {
          issues.push({ severity: 'warn', nodeId: n.id, message: `Задержка "${n.name}" — значение 0 или не задано` })
        }
      }

      // Condition without connections
      if (n.nodeType === 'condition') {
        if (!n.trueNodeId && !n.falseNodeId) {
          issues.push({ severity: 'error', nodeId: n.id, message: `Условие "${n.name}" — не подключены ветки TRUE/FALSE` })
        }
        const conds = n.conditions as any
        if ((!conds || !conds.rules || conds.rules.length === 0) && !n.conditionType) {
          issues.push({ severity: 'warn', nodeId: n.id, message: `Условие "${n.name}" — нет ни одного правила` })
        }
      }

      // Wait event without event
      if (n.nodeType === 'wait_event' && !n.waitEvent) {
        issues.push({ severity: 'error', nodeId: n.id, message: `Wait event "${n.name}" — не выбрано событие` })
      }

      // HTTP without URL
      if (n.nodeType === 'http' && !n.httpUrl) {
        issues.push({ severity: 'error', nodeId: n.id, message: `HTTP "${n.name}" — не указан URL` })
      }

      // Notify without text
      if (n.nodeType === 'notify_admin' && !n.notifyText) {
        issues.push({ severity: 'warn', nodeId: n.id, message: `Уведомление "${n.name}" — пустой текст` })
      }

      // Dead-end (non-stop, non-terminal) nodes without outgoing connection
      if (!['stop', 'goto', 'condition', 'wait_event', 'split'].includes(n.nodeType) && !n.nextNodeId) {
        issues.push({ severity: 'info', nodeId: n.id, message: `Нода "${n.name}" — нет следующей ноды (цепочка обрывается)` })
      }

      // Broken references
      if (n.nextNodeId && !nodeMap.has(n.nextNodeId)) {
        issues.push({ severity: 'error', nodeId: n.id, message: `Нода "${n.name}" — next указывает на несуществующую ноду` })
      }
      if (n.trueNodeId && !nodeMap.has(n.trueNodeId)) {
        issues.push({ severity: 'error', nodeId: n.id, message: `Нода "${n.name}" — trueNext указывает на несуществующую ноду` })
      }
      if (n.falseNodeId && !nodeMap.has(n.falseNodeId)) {
        issues.push({ severity: 'error', nodeId: n.id, message: `Нода "${n.name}" — falseNext указывает на несуществующую ноду` })
      }
    }

    // Orphan detection (nodes unreachable from any trigger)
    const reachable = new Set<string>()
    const queue: string[] = triggers.map(t => t.id)
    while (queue.length > 0) {
      const cur = queue.shift()!
      if (reachable.has(cur)) continue
      reachable.add(cur)
      const node = nodeMap.get(cur)
      if (!node) continue
      if (node.nextNodeId) queue.push(node.nextNodeId)
      if (node.trueNodeId) queue.push(node.trueNodeId)
      if (node.falseNodeId) queue.push(node.falseNodeId)
    }
    for (const n of nodes) {
      if (!reachable.has(n.id)) {
        issues.push({ severity: 'warn', nodeId: n.id, message: `Нода "${n.name}" недостижима от триггера` })
      }
    }

    const errors = issues.filter(i => i.severity === 'error').length
    const warns = issues.filter(i => i.severity === 'warn').length
    return { ok: errors === 0, errors, warns, issues }
  })

  // ═══════════════════════════════════════════════════════════════
  // 22. POST /groups/:id/simulate — симуляция воронки на юзере (dry-run)
  // ═══════════════════════════════════════════════════════════════
  app.post('/groups/:id/simulate', editor, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = z.object({
      userId: z.string().min(1),
    }).parse(req.body)

    const [group, user] = await Promise.all([
      prisma.funnel.findUnique({ where: { id }, include: { nodes: true } }),
      prisma.user.findUnique({ where: { id: body.userId } }),
    ])
    if (!group) return reply.status(404).send({ error: 'Группа не найдена' })
    if (!user) return reply.status(404).send({ error: 'Юзер не найден' })

    const { evaluateConditions, subVars, buildVars } = await import('../services/funnel-engine')
    const vars = await buildVars(user.id)

    const trigger = group.nodes.find(n => n.nodeType === 'trigger')
    if (!trigger) return reply.status(400).send({ error: 'Нет триггера' })

    // Walk chain up to 30 steps (no-side-effects simulation)
    const nodeMap = new Map(group.nodes.map(n => [n.id, n]))
    const visited = new Set<string>()
    const steps: any[] = []
    let cur: string | null = trigger.id
    let depth = 0

    while (cur && depth < 30) {
      if (visited.has(cur)) {
        steps.push({ nodeId: cur, nodeType: 'loop', note: '⚠️ Цикл обнаружен' })
        break
      }
      visited.add(cur)
      const node = nodeMap.get(cur)
      if (!node) break
      depth++

      const step: any = {
        order: depth,
        nodeId: node.id,
        nodeType: node.nodeType,
        name: node.name,
      }

      if (node.nodeType === 'message' || node.nodeType === 'trigger') {
        step.channels = {
          tg: node.channelTg && !!node.tgText ? subVars(node.tgText, vars) : null,
          email: node.channelEmail && !!node.emailSubject ? subVars(node.emailSubject, vars) : null,
          lk: node.channelLk && !!node.lkMessage ? subVars(node.lkMessage, vars) : null,
        }
        cur = node.nextNodeId
      } else if (node.nodeType === 'delay') {
        step.delay = `${node.delayValue} ${node.delayType}`
        cur = node.nextNodeId
      } else if (node.nodeType === 'condition') {
        const result = node.conditions
          ? await evaluateConditions(node.conditions, user.id)
          : true
        step.result = result
        step.branch = result ? 'TRUE' : 'FALSE'
        cur = result ? (node.trueNodeId || node.nextNodeId) : (node.falseNodeId || node.nextNodeId)
      } else if (node.nodeType === 'wait_event') {
        step.waitEvent = node.waitEvent
        step.waitTimeout = node.waitTimeout
        step.note = '⏸️ В реальной воронке — ждёт событие'
        cur = node.nextNodeId
      } else if (node.nodeType === 'split') {
        step.splitPercent = node.splitPercent
        step.branch = 'A (sim)'
        cur = node.trueNodeId
      } else if (node.nodeType === 'stop') {
        step.note = '⏹️ Остановка'
        break
      } else if (node.nodeType === 'goto') {
        step.note = `→ goto ${node.gotoTargetType}:${node.gotoTargetId}`
        cur = node.gotoTargetType === 'node' ? (node.gotoTargetId || null) : null
      } else if (node.nodeType === 'action') {
        step.action = `${node.actionType} = ${node.actionValue}`
        step.note = '✨ В реальной воронке — выполнит действие'
        cur = node.nextNodeId
      } else if (node.nodeType === 'http') {
        step.url = node.httpUrl
        step.note = '🌐 В реальной воронке — отправит запрос'
        cur = node.nextNodeId
      } else if (node.nodeType === 'notify_admin') {
        step.channel = node.notifyChannel
        step.note = '🔔 В реальной воронке — уведомит админа'
        cur = node.nextNodeId
      } else {
        cur = node.nextNodeId
      }

      steps.push(step)
    }

    return {
      userId: user.id,
      userName: (user as any).firstName || user.email || user.telegramId?.toString() || user.id,
      totalSteps: steps.length,
      steps,
    }
  })

  // ═══════════════════════════════════════════════════════════════
  // 20. GET /groups/:id/analytics — аналитика воронки (drop-off по нодам)
  // ═══════════════════════════════════════════════════════════════
  app.get('/groups/:id/analytics', editor, async (req) => {
    const { id } = req.params as { id: string }
    const { days = '30' } = req.query as Record<string, string>
    const since = new Date(Date.now() - Number(days) * 86400_000)

    const [funnel, logs] = await Promise.all([
      prisma.funnel.findUnique({
        where: { id },
        include: { nodes: true },
      }),
      prisma.funnelLog.findMany({
        where: { funnelId: id, createdAt: { gte: since }, nodeId: { not: null } },
        select: { nodeId: true, userId: true, status: true, createdAt: true },
      }),
    ])

    if (!funnel) return { nodes: [], totalUsers: 0, totalLogs: 0 }

    // Per-node aggregation: unique users who reached each node
    const nodeStats = new Map<string, {
      nodeId: string
      users: Set<string>
      sent: number
      failed: number
    }>()

    for (const log of logs) {
      if (!log.nodeId) continue
      if (!nodeStats.has(log.nodeId)) {
        nodeStats.set(log.nodeId, { nodeId: log.nodeId, users: new Set(), sent: 0, failed: 0 })
      }
      const s = nodeStats.get(log.nodeId)!
      s.users.add(log.userId)
      if (log.status === 'sent') s.sent++
      else if (log.status === 'failed') s.failed++
    }

    // Total unique users entered the funnel
    const allUsers = new Set(logs.map(l => l.userId))

    // Per-node with conversion rate (compared to first node)
    const nodes = funnel.nodes.map(n => {
      const stats = nodeStats.get(n.id)
      const usersReached = stats?.users.size || 0
      const conversionPct = allUsers.size > 0 ? Math.round((usersReached / allUsers.size) * 100) : 0
      return {
        id: n.id,
        name: n.name || n.nodeType,
        nodeType: n.nodeType,
        posX: n.posX,
        posY: n.posY,
        nextNodeId: n.nextNodeId,
        trueNodeId: n.trueNodeId,
        falseNodeId: n.falseNodeId,
        usersReached,
        sent: stats?.sent || 0,
        failed: stats?.failed || 0,
        conversionPct,
      }
    })

    return {
      funnelId: id,
      days: Number(days),
      totalUsers: allUsers.size,
      totalLogs: logs.length,
      nodes,
    }
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
