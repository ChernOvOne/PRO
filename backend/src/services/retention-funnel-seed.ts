/**
 * Retention funnel seed — idempotently creates the "Подписка закончилась"
 * retargeting flow the admin asked for:
 *
 *   Day 0  (trigger: expired)  → first reminder
 *   Day 2  → reminder 2        (gate: bought? → stop)
 *   Day 4  → reminder 3
 *   Day 6  → reminder 4
 *   Day 8  → reminder 5        (last plain reminder)
 *   Day 10 → msg + 10% off  (auto-applied, TTL 1 day)
 *   Day 12 → msg + 20% off
 *   Day 14 → msg + 30% off
 *   Day 16 → msg + 40% off
 *   Day 18 → msg + 50% off
 *   Day 20 → msg + 5 gift days (bonus_days action)
 *
 * Before every message we check `has_subscription` — if the user paid, the
 * funnel stops right there. `stopOnPayment: true` is also set at the Funnel
 * level as a belt-and-braces guard.
 *
 * Idempotency key: `Funnel.name = "Ретаргет — подписка закончилась"`. If an
 * admin has renamed or deleted it, seeder will rebuild it on next start.
 */

import { prisma } from '../db'
import { logger } from '../utils/logger'

const FUNNEL_NAME = 'Ретаргет — подписка закончилась'
const GIFT_DAYS = 5

type NodeDraft = {
  key: string
  nodeType: 'trigger' | 'message' | 'delay' | 'condition' | 'stop'
  name: string
  posX?: number
  posY?: number
  // transitions — resolved in pass 2
  nextKey?: string
  trueKey?: string
  falseKey?: string
  // trigger
  triggerType?: string
  // delay
  delayType?: 'minutes' | 'hours' | 'days'
  delayValue?: number
  // condition
  conditionType?: string
  conditionValue?: string
  // message
  tgText?: string
  tgParseMode?: string
  tgButtons?: any
  actionType?: string
  actionValue?: string
  actionPromoExpiry?: number
}

function reminder(key: string, y: number, text: string, opts: Partial<NodeDraft> = {}): NodeDraft {
  return {
    key,
    nodeType: 'message',
    name: key,
    posX: 300,
    posY: y,
    tgText: text,
    tgParseMode: 'Markdown',
    ...opts,
  }
}

function discountMsg(key: string, y: number, pct: number): NodeDraft {
  return {
    key,
    nodeType: 'message',
    name: key,
    posX: 300,
    posY: y,
    tgText:
      `💸 *Скидка ${pct}% уже в твоём кабинете!*\n\n` +
      'Цены на все тарифы автоматически снижены. ' +
      `Действует *24 часа* — потом сгорит.\n\n` +
      'Открой ЛК и оплати со скидкой 👇',
    tgParseMode: 'Markdown',
    tgButtons: [
      { label: '🌐 Открыть ЛК', type: 'webapp', url: '{appUrl}/dashboard' },
    ],
    actionType: 'promo_discount',
    actionValue: String(pct),
    actionPromoExpiry: 1, // TTL = 1 day (24h)
  }
}

function gap(key: string, y: number): NodeDraft {
  return { key, nodeType: 'delay', name: key, posX: 300, posY: y, delayType: 'days', delayValue: 2 }
}

function gate(key: string, y: number, trueK: string, falseK: string): NodeDraft {
  return {
    key,
    nodeType: 'condition',
    name: key,
    posX: 300, posY: y,
    conditionType: 'has_subscription',
    trueKey: trueK,
    falseKey: falseK,
  }
}

const SEED: NodeDraft[] = (() => {
  const ns: NodeDraft[] = []

  // Entry
  ns.push({
    key: 'trig',
    nodeType: 'trigger',
    name: 'Триггер: подписка истекла',
    posX: 300, posY: 0,
    triggerType: 'expired',
    nextKey: 'm1',
  })

  ns.push(reminder('m1', 120,
    '😔 *Твоя подписка закончилась*\n\n' +
    'Без VPN сложно — рекламы, блокировки, слежка. Продли сейчас и возвращайся к комфортному интернету.',
    { tgButtons: [{ label: '🌐 Продлить', type: 'webapp', url: '{appUrl}/dashboard' }], nextKey: 'd1' },
  ))

  ns.push({ ...gap('d1', 240), nextKey: 'g1' })
  ns.push(gate('g1', 360, 'stop', 'm2'))

  ns.push(reminder('m2', 480,
    '👀 *Уже 2 дня без VPN*\n\nВозвращайся — мы по тебе скучаем. Подписка оплачивается за минуту.',
    { tgButtons: [{ label: '🌐 Продлить', type: 'webapp', url: '{appUrl}/dashboard' }], nextKey: 'd2' },
  ))
  ns.push({ ...gap('d2', 600), nextKey: 'g2' })
  ns.push(gate('g2', 720, 'stop', 'm3'))

  ns.push(reminder('m3', 840,
    '📉 *4 дня без защиты*\n\nТвой трафик видно провайдеру, а многие сайты — недоступны. Напомнить как было удобно?',
    { tgButtons: [{ label: '🌐 Вернуться', type: 'webapp', url: '{appUrl}/dashboard' }], nextKey: 'd3' },
  ))
  ns.push({ ...gap('d3', 960), nextKey: 'g3' })
  ns.push(gate('g3', 1080, 'stop', 'm4'))

  ns.push(reminder('m4', 1200,
    '🫤 *Неделя без подписки*\n\nМожет что-то не устроило? Напиши в поддержку — мы хотим вернуть тебя.',
    { tgButtons: [{ label: '🛟 Поддержка', type: 'webapp', url: '{appUrl}/dashboard/support' }], nextKey: 'd4' },
  ))
  ns.push({ ...gap('d4', 1320), nextKey: 'g4' })
  ns.push(gate('g4', 1440, 'stop', 'm5'))

  ns.push(reminder('m5', 1560,
    '⏳ *8 дней без VPN*\n\nПоследнее дружеское напоминание перед специальным предложением…',
    { tgButtons: [{ label: '🌐 Продлить', type: 'webapp', url: '{appUrl}/dashboard' }], nextKey: 'd5' },
  ))
  ns.push({ ...gap('d5', 1680), nextKey: 'g5' })
  ns.push(gate('g5', 1800, 'stop', 'd10'))

  // ── Discount ladder — each msg applies a TTL 1-day discount automatically
  ns.push(discountMsg('d10', 1920, 10))
  ns.push({ ...gap('d6', 2040), nextKey: 'g6' })
  ns.push(gate('g6', 2160, 'stop', 'd20'))

  ns.push(discountMsg('d20', 2280, 20))
  ns.push({ ...gap('d7', 2400), nextKey: 'g7' })
  ns.push(gate('g7', 2520, 'stop', 'd30'))

  ns.push(discountMsg('d30', 2640, 30))
  ns.push({ ...gap('d8', 2760), nextKey: 'g8' })
  ns.push(gate('g8', 2880, 'stop', 'd40'))

  ns.push(discountMsg('d40', 3000, 40))
  ns.push({ ...gap('d9', 3120), nextKey: 'g9' })
  ns.push(gate('g9', 3240, 'stop', 'd50'))

  ns.push(discountMsg('d50', 3360, 50))
  ns.push({ ...gap('d11', 3480), nextKey: 'g10' })
  ns.push(gate('g10', 3600, 'stop', 'gift'))

  // Gift days
  ns.push({
    key: 'gift',
    nodeType: 'message',
    name: `Подарок ${GIFT_DAYS} дней`,
    posX: 300, posY: 3720,
    tgText:
      `🎁 *Держи ${GIFT_DAYS} дней подписки в подарок!*\n\n` +
      'Мы просто хотим, чтобы ты попробовал снова. Дни уже добавлены в твой кабинет — заходи и пользуйся.',
    tgParseMode: 'Markdown',
    tgButtons: [{ label: '🌐 Открыть ЛК', type: 'webapp', url: '{appUrl}/dashboard' }],
    actionType: 'bonus_days',
    actionValue: String(GIFT_DAYS),
    nextKey: 'stop',
  })

  ns.push({ key: 'stop', nodeType: 'stop', name: 'Стоп', posX: 300, posY: 3840 })

  // All message nodes default to the TG channel — wire it up here to keep
  // the draft list tidy.
  return ns.map(n => n.nodeType === 'message' ? { ...n, tgParseMode: n.tgParseMode || 'Markdown' } : n)
})()

export async function seedRetentionFunnel(): Promise<void> {
  const existing = await prisma.funnel.findFirst({
    where: { name: FUNNEL_NAME },
    select: { id: true },
  })
  if (existing) {
    logger.info(`[retention-funnel-seed] already exists — skipping`)
    return
  }

  const funnel = await prisma.funnel.create({
    data: {
      name: FUNNEL_NAME,
      description:
        'Автоматический ретаргет после окончания подписки. ' +
        'Каждые 2 дня: 5 напоминаний → 5 растущих скидок (10%→50%, каждая живёт 24ч) → подарок ' +
        GIFT_DAYS + ' дней. Останавливается при оплате или когда юзер блокирует бота.',
      enabled: false, // admin turns it on after reviewing
      isCustom: true,
      category: 'retention',
      stopOnPayment: true,
      stopOnActiveSub: true,
      antiSpamHours: 12,
    },
  })

  // Pass 1 — create every node without cross-refs
  const idByKey = new Map<string, string>()
  for (const d of SEED) {
    const row = await prisma.funnelNode.create({
      data: {
        funnelId: funnel.id,
        nodeType: d.nodeType,
        name: d.name,
        posX: d.posX ?? 0,
        posY: d.posY ?? 0,
        triggerType: d.triggerType ?? null,
        delayType: d.delayType ?? 'immediate',
        delayValue: d.delayValue ?? 0,
        conditionType: d.conditionType ?? null,
        conditionValue: d.conditionValue ?? null,
        channelTg: d.nodeType === 'message',
        tgText: d.tgText ?? null,
        tgParseMode: d.tgParseMode ?? 'Markdown',
        tgButtons: d.tgButtons ?? undefined,
        actionType: d.actionType ?? 'none',
        actionValue: d.actionValue ?? null,
        actionPromoExpiry: d.actionPromoExpiry ?? 7,
      },
    })
    idByKey.set(d.key, row.id)
  }

  // Pass 2 — resolve next/true/false cross-refs
  for (const d of SEED) {
    const id = idByKey.get(d.key)!
    const patch: any = {}
    if (d.nextKey)  patch.nextNodeId  = idByKey.get(d.nextKey)  ?? null
    if (d.trueKey)  patch.trueNodeId  = idByKey.get(d.trueKey)  ?? null
    if (d.falseKey) patch.falseNodeId = idByKey.get(d.falseKey) ?? null
    if (Object.keys(patch).length > 0) {
      await prisma.funnelNode.update({ where: { id }, data: patch })
    }
  }

  // Create/find the trigger entry and bind the funnel to it
  const firstTriggerNode = SEED.find(n => n.nodeType === 'trigger')
  if (firstTriggerNode?.triggerType) {
    await prisma.funnel.update({
      where: { id: funnel.id },
      data: { triggerId: firstTriggerNode.triggerType },
    }).catch(() => {})
  }

  logger.info(`[retention-funnel-seed] created funnel "${FUNNEL_NAME}" (${SEED.length} nodes, disabled)`)
}
