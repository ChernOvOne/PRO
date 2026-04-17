/**
 * Funnel execution engine with step chains, conditions, actions, variables.
 */
import { prisma } from '../db'
import { bot } from '../bot'
import { emailService } from '../services/email'
import { inAppNotifications } from '../services/notification-service'
import { remnawave } from '../services/remnawave'
import { balanceService } from '../services/balance'
import { config } from '../config'
import { logger } from '../utils/logger'
import { InlineKeyboard } from 'grammy'
import { nanoid } from 'nanoid'

// ── Variable documentation ──────────────────────────────────
export const VARIABLE_DOCS = [
  // Пользователь
  { var: '{name}', desc: 'Имя пользователя (Telegram username или часть email)', group: 'Пользователь' },
  { var: '{email}', desc: 'Email пользователя', group: 'Пользователь' },
  { var: '{telegramName}', desc: 'Telegram username', group: 'Пользователь' },
  { var: '{telegramId}', desc: 'Telegram ID (числовой)', group: 'Пользователь' },
  { var: '{userId}', desc: 'ID пользователя в системе (UUID)', group: 'Пользователь' },
  { var: '{registrationDate}', desc: 'Дата регистрации (ДД.ММ.ГГГГ)', group: 'Пользователь' },
  { var: '{lastLogin}', desc: 'Последний вход в ЛК', group: 'Пользователь' },

  // Подписка
  { var: '{subStatus}', desc: 'Статус подписки (ACTIVE/INACTIVE/EXPIRED)', group: 'Подписка' },
  { var: '{subExpireDate}', desc: 'Дата окончания подписки (ДД.ММ.ГГГГ)', group: 'Подписка' },
  { var: '{daysLeft}', desc: 'Дней до окончания подписки', group: 'Подписка' },
  { var: '{trafficUsed}', desc: 'Использованный трафик (ГБ)', group: 'Подписка' },
  { var: '{trafficLimit}', desc: 'Лимит трафика (ГБ или "безлимит")', group: 'Подписка' },
  { var: '{trafficPercent}', desc: 'Процент использованного трафика', group: 'Подписка' },
  { var: '{deviceCount}', desc: 'Количество подключённых устройств', group: 'Подписка' },
  { var: '{deviceLimit}', desc: 'Лимит устройств', group: 'Подписка' },

  // Финансы
  { var: '{balance}', desc: 'Текущий баланс в рублях', group: 'Финансы' },
  { var: '{bonusDays}', desc: 'Количество накопленных бонусных дней', group: 'Финансы' },
  { var: '{tariffName}', desc: 'Название тарифа (при оплате)', group: 'Финансы' },
  { var: '{amount}', desc: 'Сумма платежа в рублях', group: 'Финансы' },
  { var: '{topupAmount}', desc: 'Сумма пополнения баланса', group: 'Финансы' },

  // Рефералы
  { var: '{referralCode}', desc: 'Реферальный код пользователя', group: 'Рефералы' },
  { var: '{referralUrl}', desc: 'Полная реферальная ссылка', group: 'Рефералы' },
  { var: '{referralCount}', desc: 'Количество приглашённых рефералов', group: 'Рефералы' },
  { var: '{referralPaidCount}', desc: 'Количество оплативших рефералов', group: 'Рефералы' },
  { var: '{refName}', desc: 'Имя реферала (при реферальных событиях)', group: 'Рефералы' },
  { var: '{refBonusDays}', desc: 'Начисленные реферальные дни', group: 'Рефералы' },

  // Промо и действия
  { var: '{promoCode}', desc: 'Промокод (при активации промокода)', group: 'Промо' },
  { var: '{generatedPromo}', desc: 'Автоматически созданный промокод (действие шага)', group: 'Промо' },
  { var: '{trialDays}', desc: 'Количество дней пробного периода', group: 'Промо' },

  // Устройства
  { var: '{deviceName}', desc: 'Название/модель нового устройства', group: 'Устройства' },

  // Система
  { var: '{appUrl}', desc: 'URL вашего сервиса', group: 'Система' },
  { var: '{supportUrl}', desc: 'Ссылка на поддержку', group: 'Система' },
  { var: '{channelUrl}', desc: 'Ссылка на Telegram-канал', group: 'Система' },

  // Расширенные
  { var: '{daysSinceRegistration}', desc: 'Дней с момента регистрации', group: 'Пользователь' },
  { var: '{hoursLeft}', desc: 'Часов до окончания подписки', group: 'Подписка' },
  { var: '{tariffPrice}', desc: 'Цена текущего тарифа', group: 'Финансы' },
  { var: '{subLink}', desc: 'Ссылка подключения VPN', group: 'Подписка' },
  { var: '{isTrialUsed}', desc: 'Использовал ли триал', group: 'Подписка' },
  { var: '{trafficLeft}', desc: 'Осталось трафика (ГБ)', group: 'Подписка' },
  { var: '{totalPaid}', desc: 'Сумма всех оплат (₽)', group: 'Финансы' },
  { var: '{lastPaymentDate}', desc: 'Дата последней оплаты', group: 'Финансы' },
  { var: '{lastPaymentAmount}', desc: 'Сумма последней оплаты', group: 'Финансы' },
  { var: '{paymentUrl}', desc: 'Ссылка на страницу оплаты', group: 'Финансы' },
  { var: '{appName}', desc: 'Название сервиса', group: 'Система' },
  { var: '{currentDate}', desc: 'Сегодняшняя дата', group: 'Система' },
  { var: '{currentTime}', desc: 'Текущее время', group: 'Система' },
  { var: '{customerSource}', desc: 'Откуда пришёл (UTM)', group: 'Пользователь' },
  { var: '{campaignName}', desc: 'Рекламная кампания', group: 'Пользователь' },
  { var: '{promoDiscount}', desc: 'Размер скидки промокода (%)', group: 'Промо' },
]

// ── Available triggers for dropdown ─────────────────────────
// Triggers classified by source:
// - webhook: from REMNAWAVE (timing managed externally)
// - event:   internal code event (payment, referral, promo, etc) — fires immediately
// - state:   periodic cron scan with configurable interval (triggerParam + delayType as unit)
//
// `delayType` field on the trigger node encodes the time unit for triggerParam:
//   'minutes' | 'hours' | 'days' | 'weeks'
// (reused from Delay node for consistency — no schema changes needed)
export const TRIGGER_OPTIONS = [
  { group: 'Регистрация', triggers: [
    { id: 'registration',        name: '👋 Регистрация',                         source: 'event'   },
    { id: 'first_connection',    name: '🎉 Первое подключение',                  source: 'webhook' },
  ]},
  { group: 'Подписка (от REMNAWAVE)', triggers: [
    { id: 'expiring_3d',         name: '⚠️ Истекает через 3 дня',               source: 'webhook' },
    { id: 'expiring_1d',         name: '🔴 Истекает через 1 день',              source: 'webhook' },
    { id: 'expired',             name: '❌ Подписка истекла',                   source: 'webhook' },
    { id: 'traffic_50',          name: '📊 Трафик 50%',                         source: 'webhook' },
    { id: 'traffic_80',          name: '📊 Трафик 80%',                         source: 'webhook' },
    { id: 'traffic_95',          name: '📊 Трафик 95%',                         source: 'webhook' },
    { id: 'traffic_100',         name: '🚫 Трафик исчерпан',                    source: 'webhook' },
    { id: 'traffic_reset',       name: '🔄 Трафик сброшен',                     source: 'webhook' },
  ]},
  { group: 'Оплата', triggers: [
    { id: 'payment_success',     name: '✅ Оплата прошла',                      source: 'event'   },
    { id: 'payment_pending',     name: '⏳ Оплата не завершена',                source: 'event'   },
    { id: 'payment_renewal',     name: '🔄 Повторная оплата',                   source: 'event'   },
  ]},
  { group: 'Бонусы и промо', triggers: [
    { id: 'balance_topup',       name: '💳 Пополнение баланса',                 source: 'event'   },
    { id: 'promo_activated',     name: '🎫 Промокод применён',                  source: 'event'   },
    { id: 'bonus_days_granted',  name: '🎁 Бонус-дни начислены',                source: 'event'   },
    { id: 'gift_received',       name: '🎁 Получил подарок',                    source: 'event'   },
  ]},
  { group: 'Рефералы', triggers: [
    { id: 'referral_registered', name: '👤 Реферал зарегистрировался',          source: 'event'   },
    { id: 'referral_trial',      name: '🎁 Реферал взял триал',                 source: 'event'   },
    { id: 'referral_paid',       name: '💰 Реферал оплатил',                    source: 'event'   },
    { id: 'five_referrals',      name: '🏆 5 рефералов достигнуто',             source: 'event'   },
  ]},
  { group: 'Безопасность', triggers: [
    { id: 'new_device',          name: '📱 Новое устройство',                   source: 'webhook' },
    { id: 'device_limit',        name: '🔒 Лимит устройств достигнут',          source: 'webhook' },
    { id: 'sub_link_revoked',    name: '🔄 Подписка-ссылка пересоздана',        source: 'webhook' },
  ]},
  // ⏰ Единственная параметризованная группа — «проверка состояния через N времени».
  // Всё что раньше было отдельными cron-триггерами — теперь сценарии этого типа.
  { group: '⏰ Проверка состояния', triggers: [
    { id: 'state_trial_not_activated', name: '⏰ Не активировал триал N времени после регистрации',
      hasParam: true, paramLabel: 'N', defaultParam: 1, defaultUnit: 'hours', source: 'state' },
    { id: 'state_not_connected', name: '⏰ Не подключился N времени после подписки',
      hasParam: true, paramLabel: 'N', defaultParam: 24, defaultUnit: 'hours', source: 'state' },
    { id: 'state_inactive',      name: '⏰ Не заходил в ЛК N времени',
      hasParam: true, paramLabel: 'N', defaultParam: 14, defaultUnit: 'days', source: 'state' },
    { id: 'state_no_referrals',  name: '⏰ 0 рефералов N времени после регистрации',
      hasParam: true, paramLabel: 'N', defaultParam: 7, defaultUnit: 'days', source: 'state' },
    { id: 'state_winback',       name: '⏰ Winback — подписка истекла N времени назад',
      hasParam: true, paramLabel: 'N', defaultParam: 7, defaultUnit: 'days', source: 'state' },
    { id: 'state_anniversary',   name: '⏰ Годовщина регистрации через N времени',
      hasParam: true, paramLabel: 'N', defaultParam: 365, defaultUnit: 'days', source: 'state' },
    { id: 'state_gift_not_claimed', name: '⏰ Подарок не активирован N времени',
      hasParam: true, paramLabel: 'N', defaultParam: 3, defaultUnit: 'days', source: 'state' },
    { id: 'state_feedback_request', name: '⏰ Попросить отзыв через N времени после регистрации',
      hasParam: true, paramLabel: 'N', defaultParam: 7, defaultUnit: 'days', source: 'state' },
    { id: 'state_low_balance',   name: '⏰ Баланс 0 больше N времени',
      hasParam: true, paramLabel: 'N', defaultParam: 3, defaultUnit: 'days', source: 'state' },
    { id: 'state_payment_pending_stuck', name: '⏰ Оплата зависла > N времени',
      hasParam: true, paramLabel: 'N', defaultParam: 30, defaultUnit: 'minutes', source: 'state' },
    { id: 'state_on_trial_about_to_expire', name: '⏰ Триал заканчивается через N времени',
      hasParam: true, paramLabel: 'N', defaultParam: 1, defaultUnit: 'days', source: 'state' },
  ]},
  { group: 'Ручной запуск', triggers: [
    { id: 'manual',              name: '🖐 Ручной запуск из админки',           source: 'event'   },
  ]},
]

// ── Helpers ─────────────────────────────────────────────────
export function subVars(text: string, vars: Record<string, string>): string {
  let r = text
  for (const [k, v] of Object.entries(vars)) r = r.replace(new RegExp(`\\{${k}\\}`, 'g'), v || '')
  return r.replace(/\{appUrl\}/g, config.appUrl)
}

export async function buildVars(userId: string, extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, email: true, telegramName: true, telegramId: true,
      referralCode: true, balance: true, bonusDays: true,
      subStatus: true, subExpireAt: true, remnawaveUuid: true,
      createdAt: true, lastLoginAt: true,
      totalPaid: true, lastPaymentAt: true, subLink: true, customerSource: true,
      _count: { select: { referrals: true } },
    },
  })
  if (!u) return { appUrl: config.appUrl, ...extra }

  const daysLeft = u.subExpireAt ? Math.max(0, Math.ceil((u.subExpireAt.getTime() - Date.now()) / 86400_000)) : 0

  // Referral paid count
  const paidRefs = await prisma.user.count({
    where: { referredById: u.id, payments: { some: { status: 'PAID', amount: { gt: 0 }, provider: { in: ['YUKASSA', 'CRYPTOPAY'] } } } },
  }).catch(() => 0)

  // Traffic from REMNAWAVE
  let trafficUsed = '0', trafficLimit = 'безлимит', trafficPercent = '0', deviceCount = '0', deviceLimit = '0'
  if (u.remnawaveUuid) {
    try {
      const rm = await remnawave.getUserByUuid(u.remnawaveUuid)
      const usedBytes = rm.userTraffic?.usedTrafficBytes ?? 0
      trafficUsed = (usedBytes / 1e9).toFixed(1)
      trafficLimit = rm.trafficLimitBytes && rm.trafficLimitBytes > 0 ? (rm.trafficLimitBytes / 1e9).toFixed(0) : 'безлимит'
      trafficPercent = rm.trafficLimitBytes && rm.trafficLimitBytes > 0 ? String(Math.round(usedBytes / rm.trafficLimitBytes * 100)) : '0'
      deviceLimit = String(rm.hwidDeviceLimit || 0)
    } catch {}
    try {
      const devs = await remnawave.getDevices(u.remnawaveUuid)
      deviceCount = String(devs?.devices?.length ?? 0)
    } catch {}
  }

  // Support/channel from settings
  const supportUrl = await prisma.setting.findUnique({ where: { key: 'support_url' } }).then(s => s?.value || '').catch(() => '')
  const channelUrl = await prisma.setting.findUnique({ where: { key: 'channel_url' } }).then(s => s?.value || '').catch(() => '')

  const daysSinceReg = Math.floor((Date.now() - new Date(u.createdAt).getTime()) / 86400000)
  const hoursLeft = Math.max(0, Math.floor((new Date(u.subExpireAt || 0).getTime() - Date.now()) / 3600000))

  return {
    name: u.telegramName || u.email?.split('@')[0] || 'Пользователь',
    email: u.email || '',
    telegramName: u.telegramName || '',
    telegramId: u.telegramId || '',
    userId: u.id,
    registrationDate: u.createdAt.toLocaleDateString('ru'),
    lastLogin: u.lastLoginAt?.toLocaleDateString('ru') || '—',
    subStatus: u.subStatus,
    subExpireDate: u.subExpireAt?.toLocaleDateString('ru') || '—',
    daysLeft: String(daysLeft),
    trafficUsed, trafficLimit, trafficPercent,
    deviceCount, deviceLimit,
    balance: String(Number(u.balance || 0)),
    bonusDays: String(u.bonusDays || 0),
    referralCode: u.referralCode || '',
    referralUrl: `${config.appUrl}?ref=${u.referralCode}`,
    referralCount: String(u._count.referrals),
    referralPaidCount: String(paidRefs),
    trialDays: String(config.features.trialDays || 3),
    appUrl: config.appUrl,
    supportUrl, channelUrl,
    generatedPromo: '', topupAmount: '',
    // Расширенные переменные
    daysSinceRegistration: String(daysSinceReg),
    hoursLeft: String(hoursLeft),
    totalPaid: String(Number(u.totalPaid || 0)),
    lastPaymentDate: u.lastPaymentAt ? new Date(u.lastPaymentAt).toLocaleDateString('ru-RU') : '—',
    lastPaymentAmount: '',
    subLink: u.subLink || '',
    currentDate: new Date().toLocaleDateString('ru-RU'),
    currentTime: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    customerSource: u.customerSource || '',
    paymentUrl: config.appUrl + '/payment',
    appName: 'HIDEYOU',
    campaignName: '',
    promoDiscount: '',
    tariffPrice: '',
    isTrialUsed: '',
    trafficLeft: '',
    ...extra,
  }
}

// Build inline keyboard from funnel node buttons.
// Mirrors the bot-constructor format: buttons support url/webapp/copy_text/callback,
// variables are substituted from the user's context ({appUrl}, {subLink}, {referralUrl}, etc),
// and empty-resolved buttons are dropped so Telegram doesn't reject the message.
export function buildKb(buttons: any[], vars?: Record<string, string>): { inline_keyboard: any[][] } | undefined {
  if (!buttons?.length) return undefined

  const resolve = (text?: string): string => {
    if (!text) return ''
    if (!vars) return text
    return text.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`)
  }

  // Group buttons by row
  const rowMap = new Map<number, any[]>()
  buttons.forEach((b: any, i: number) => {
    if (!b || !b.label) return
    const row = b.row ?? i
    if (!rowMap.has(row)) rowMap.set(row, [])
    rowMap.get(row)!.push(b)
  })

  const sortedRows = [...rowMap.entries()].sort((a, b) => a[0] - b[0])
  const keyboard: any[][] = []

  for (const [_, rowButtons] of sortedRows) {
    rowButtons.sort((a: any, b: any) => (a.col ?? 0) - (b.col ?? 0) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    const row: any[] = []
    for (const b of rowButtons) {
      const label = resolve(b.label)
      if (!label) continue
      const button: any = { text: label }

      // Support both {url, copyText, data} legacy and new formats
      const urlVal   = b.url ?? b.data ?? ''
      const copyVal  = b.copyText ?? b.copy_text ?? ''
      const cbVal    = b.callback_data ?? b.data ?? ''

      if (b.type === 'url') {
        const u = resolve(urlVal)
        if (!u || !u.startsWith('http')) continue
        button.url = u
      } else if (b.type === 'webapp') {
        const u = resolve(urlVal)
        if (!u || !u.startsWith('http')) continue
        button.web_app = { url: u }
      } else if (b.type === 'copy_text') {
        const c = resolve(copyVal)
        if (!c || c === '—') continue
        button.copy_text = { text: c }
      } else if (b.type === 'bot_block') {
        // Link to a bot-constructor block — rendered as blk:<blockId> callback
        if (!b.botBlockId) continue
        button.callback_data = `blk:${b.botBlockId}`
      } else if (b.type === 'callback' || !b.type) {
        const cb = cbVal || 'menu:main'
        button.callback_data = cb
      } else {
        continue
      }

      // Colored buttons (Bot API 9.4)
      if (b.style && b.style !== 'default') {
        button.style = b.style
      }
      if (b.iconCustomEmojiId) {
        button.icon_custom_emoji_id = b.iconCustomEmojiId
      }

      row.push(button)
    }
    if (row.length > 0) keyboard.push(row)
  }

  return keyboard.length > 0 ? { inline_keyboard: keyboard } : undefined
}

// ── Check step condition ────────────────────────────────────
// ── Advanced condition evaluator (visual builder format) ──
// Supports JSON conditions: { logic: 'AND'|'OR', rules: [{ field, op, value }] }
export async function evaluateConditions(conditionsJson: any, userId: string): Promise<boolean> {
  if (!conditionsJson || !conditionsJson.rules || !Array.isArray(conditionsJson.rules)) return true
  const logic = conditionsJson.logic || 'AND'
  const rules = conditionsJson.rules

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      payments: { where: { status: 'PAID' }, select: { id: true, amount: true, createdAt: true } },
      referrals: { select: { id: true } },
      userTags: { select: { tag: true } },
    },
  })
  if (!user) return false

  let rmUser: any = null
  if (user.remnawaveUuid) {
    try { rmUser = await remnawave.getUserByUuid(user.remnawaveUuid) } catch {}
  }

  const ctx: Record<string, any> = {
    sub_status: user.subStatus,
    days_left: user.subExpireAt ? Math.ceil((new Date(user.subExpireAt).getTime() - Date.now()) / 86400_000) : 0,
    has_subscription: !!user.remnawaveUuid,
    is_connected: rmUser ? (rmUser.onlineAt != null || rmUser.lastTrafficResetAt != null) : false,
    devices_count: rmUser?.hwidDeviceCount || 0,
    traffic_used_gb: rmUser?.usedTrafficBytes ? Math.round(rmUser.usedTrafficBytes / 1024 / 1024 / 1024) : 0,
    payments_count: user.payments.length,
    payments_sum: user.payments.reduce((s, p) => s + Number(p.amount), 0),
    last_payment_days: user.lastPaymentAt ? Math.floor((Date.now() - new Date(user.lastPaymentAt).getTime()) / 86400_000) : 99999,
    referrals_count: user.referrals.length,
    balance: Number(user.balance),
    bonus_days: user.bonusDays,
    days_since_registration: Math.floor((Date.now() - user.createdAt.getTime()) / 86400_000),
    has_email: !!user.email,
    has_telegram: !!user.telegramId,
    tags: user.userTags.map(t => t.tag),
  }

  function check(rule: any): boolean {
    const value = ctx[rule.field]
    const target = rule.value
    switch (rule.op) {
      case 'eq': return value == target
      case 'ne': return value != target
      case 'gt': return Number(value) > Number(target)
      case 'lt': return Number(value) < Number(target)
      case 'gte': return Number(value) >= Number(target)
      case 'lte': return Number(value) <= Number(target)
      case 'contains': return Array.isArray(value) ? value.includes(target) : String(value).includes(String(target))
      case 'not_contains': return Array.isArray(value) ? !value.includes(target) : !String(value).includes(String(target))
      case 'is_true': return value === true
      case 'is_false': return value === false
      case 'is_empty': return value == null || value === '' || (Array.isArray(value) && value.length === 0)
      case 'is_not_empty': return value != null && value !== '' && (!Array.isArray(value) || value.length > 0)
      default: return false
    }
  }

  if (logic === 'OR') return rules.some(check)
  return rules.every(check)
}

async function checkCondition(condition: string, userId: string): Promise<boolean> {
  if (condition === 'none') return true
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subStatus: true, remnawaveUuid: true, subExpireAt: true },
  })
  if (!user) return false

  switch (condition) {
    case 'not_paid': {
      const paid = await prisma.payment.count({ where: { userId, status: 'PAID', amount: { gt: 0 }, provider: { in: ['YUKASSA', 'CRYPTOPAY'] } } })
      return paid === 0
    }
    case 'not_connected': {
      if (!user.remnawaveUuid) return true
      try {
        const rm = await remnawave.getUserByUuid(user.remnawaveUuid)
        return !rm.userTraffic?.firstConnectedAt
      } catch { return true }
    }
    case 'no_subscription': return user.subStatus !== 'ACTIVE'
    case 'expired': return user.subStatus !== 'ACTIVE' && !!user.subExpireAt && user.subExpireAt < new Date()
    default: return true
  }
}

// ── Execute action ──────────────────────────────────────────
async function executeAction(step: any, userId: string, vars: Record<string, string>): Promise<void> {
  if (step.actionType === 'none' || !step.actionType) return

  switch (step.actionType) {
    case 'bonus_days':
      await prisma.user.update({ where: { id: userId }, data: { bonusDays: { increment: step.actionValue } } })
      logger.info(`Funnel action: +${step.actionValue} bonus days for ${userId}`)
      break

    case 'balance':
      await balanceService.adminAdjust({ userId, amount: step.actionValue, description: 'Бонус от воронки' })
      logger.info(`Funnel action: +${step.actionValue}₽ balance for ${userId}`)
      break

    case 'promo_discount':
    case 'promo_balance': {
      const code = `FUNNEL_${nanoid(6).toUpperCase()}`
      const isDiscount = step.actionType === 'promo_discount'
      await prisma.promoCode.create({
        data: {
          code,
          type: isDiscount ? 'discount' : 'balance',
          discountPct: isDiscount ? step.actionValue : null,
          balanceAmount: isDiscount ? null : step.actionValue,
          maxUses: 1, maxUsesPerUser: 1,
          expiresAt: new Date(Date.now() + step.actionPromoExpiry * 86400_000),
          description: `Автоворонка`,
        },
      })
      vars.generatedPromo = code
      logger.info(`Funnel action: promo ${code} (${step.actionType} ${step.actionValue}) for ${userId}`)
      break
    }

    case 'trial':
      // Only if user has no subscription
      const user = await prisma.user.findUnique({ where: { id: userId } })
      if (user && !user.remnawaveUuid) {
        // Import and call trial activation from users route
        try {
          const { triggerEvent } = await import('./funnel-engine')
          // We can't easily call the trial activation here, so just grant bonus days
          await prisma.user.update({ where: { id: userId }, data: { bonusDays: { increment: step.actionValue || config.features.trialDays || 3 } } })
          logger.info(`Funnel action: trial ${step.actionValue} days for ${userId}`)
        } catch {}
      }
      break
  }
}

// ── Send a single step to a user ────────────────────────────
export async function sendTestStep(step: any, funnelId: string, userId: string) {
  return sendStep(step, funnelId, userId, {}, '🧪 ТЕСТ: ')
}

async function sendStep(step: any, funnelId: string, userId: string, extraVars: Record<string, string> = {}, prefix = '') {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, telegramId: true, email: true },
  })
  if (!user) return

  // Check condition
  if (!await checkCondition(step.condition, userId)) {
    await prisma.funnelLog.create({ data: { funnelId, userId, stepOrder: step.stepOrder, channel: 'skip', status: 'skipped' } })
    return
  }

  // Build vars + set action-related vars before executing
  const vars = await buildVars(userId, extraVars)
  // Pre-fill action vars so they're available in message text
  if (step.actionType === 'balance') vars.topupAmount = String(step.actionValue || 0)
  if (step.actionType === 'bonus_days') vars.bonusDays = String((parseInt(vars.bonusDays) || 0) + (step.actionValue || 0))
  // Execute action (creates promo etc, sets {generatedPromo})
  await executeAction(step, userId, vars)

  // TG
  if (step.channelTg && user.telegramId && step.tgText) {
    try {
      const text = prefix + subVars(step.tgText, vars)
      const kb = buildKb(step.tgButtons as any[], vars)
      await bot.api.sendMessage(user.telegramId, text, { parse_mode: (step.tgParseMode as any) || 'Markdown', ...(kb && { reply_markup: kb }) })
      await prisma.funnelLog.create({ data: { funnelId, userId, stepOrder: step.stepOrder, channel: 'tg', status: 'sent' } })
    } catch (e: any) {
      await prisma.funnelLog.create({ data: { funnelId, userId, stepOrder: step.stepOrder, channel: 'tg', status: 'failed', error: e.message } })
    }
  }

  // Email
  if (step.channelEmail && user.email && step.emailSubject) {
    try {
      await emailService.sendBroadcastEmail({
        to: user.email, subject: prefix + subVars(step.emailSubject, vars),
        html: subVars(step.emailHtml || step.tgText || '', vars),
        btnText: step.emailBtnText ?? undefined,
        btnUrl: step.emailBtnUrl ? subVars(step.emailBtnUrl, vars) : undefined,
        template: step.emailTemplate || 'dark',
      })
      await prisma.funnelLog.create({ data: { funnelId, userId, stepOrder: step.stepOrder, channel: 'email', status: 'sent' } })
    } catch (e: any) {
      await prisma.funnelLog.create({ data: { funnelId, userId, stepOrder: step.stepOrder, channel: 'email', status: 'failed', error: e.message } })
    }
  }

  // LK
  if (step.channelLk && step.lkTitle) {
    try {
      await inAppNotifications.sendToUser({ userId, title: prefix + subVars(step.lkTitle, vars), message: subVars(step.lkMessage || '', vars), type: (step.lkType || 'INFO') as any })
      await prisma.funnelLog.create({ data: { funnelId, userId, stepOrder: step.stepOrder, channel: 'lk', status: 'sent' } })
    } catch (e: any) {
      await prisma.funnelLog.create({ data: { funnelId, userId, stepOrder: step.stepOrder, channel: 'lk', status: 'failed', error: e.message } })
    }
  }
}

// ── EVENT TRIGGER ───────────────────────────────────────────
export async function triggerEvent(triggerId: string, userId: string, extraVars: Record<string, string> = {}) {
  // === NEW: Check FunnelNode system first ===
  const triggerNodes = await prisma.funnelNode.findMany({
    where: { nodeType: 'trigger', triggerType: triggerId },
    include: { funnel: true },
  })

  for (const triggerNode of triggerNodes) {
    if (!triggerNode.funnel.enabled) continue

    // Check wait_event resolution: if there are pending wait_event nodes
    // for this user matching this trigger, resolve them
    const pendingWaits = await prisma.pendingFunnelStep.findMany({
      where: { userId, type: 'wait_event', waitEvent: triggerId },
    })
    for (const pending of pendingWaits) {
      logger.info(`[Funnel] wait_event resolved for ${userId}: ${triggerId}`)
      await prisma.pendingFunnelStep.delete({ where: { id: pending.id } })
      // Continue the chain from the wait_event's nextNodeId
      const waitNode = await prisma.funnelNode.findUnique({ where: { id: pending.nodeId } })
      if (waitNode?.nextNodeId) {
        await processNodeChain(waitNode.nextNodeId, pending.funnelId, userId, extraVars, pending.depth)
      }
    }

    // Check stop conditions — if user already reached the goal, skip this funnel entirely
    const funnel = triggerNode.funnel as any
    if (funnel.stopOnPayment || funnel.stopOnActiveSub || funnel.stopOnConnect) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { paymentsCount: true, subStatus: true, firstConnectedAt: true },
      })
      if (funnel.stopOnPayment && user && user.paymentsCount > 0) continue
      if (funnel.stopOnActiveSub && user?.subStatus === 'ACTIVE') continue
      if (funnel.stopOnConnect && user?.firstConnectedAt) continue
    }

    // Anti-spam: don't send to this user if last message from this funnel was < N hours ago
    if (funnel.antiSpamHours && funnel.antiSpamHours > 0) {
      const since = new Date(Date.now() - funnel.antiSpamHours * 3600_000)
      const recentLog = await prisma.funnelLog.findFirst({
        where: { funnelId: triggerNode.funnelId, userId, status: 'sent', createdAt: { gte: since } },
      })
      if (recentLog) continue
    }

    // Max messages: don't exceed total message count per user in this funnel
    if (funnel.maxMessages && funnel.maxMessages > 0) {
      const sentCount = await prisma.funnelLog.count({
        where: { funnelId: triggerNode.funnelId, userId, status: 'sent' },
      })
      if (sentCount >= funnel.maxMessages) continue
    }

    // Check sandbox mode
    if (funnel.sandboxMode) {
      const tag = funnel.sandboxTag || 'test_funnel'
      const hasTag = await prisma.userTag.findFirst({ where: { userId, tag } })
      if (!hasTag) continue
    }

    // Send the trigger node itself
    await sendNode(triggerNode, triggerNode.funnel.id, userId, extraVars)

    // Follow the chain through advanced node engine
    if (triggerNode.nextNodeId) {
      await processNodeChain(triggerNode.nextNodeId, triggerNode.funnelId, userId, extraVars, 0)
    }
  }

  // === LEGACY: Old FunnelStep system (backward compat) ===
  const funnel = await prisma.funnel.findFirst({
    where: { triggerId },
    include: { steps: { orderBy: { stepOrder: 'asc' } } },
  })
  if (!funnel || !funnel.enabled || funnel.steps.length === 0) return

  for (const step of funnel.steps) {
    const sent = await prisma.funnelLog.findFirst({
      where: { funnelId: funnel.id, userId, stepOrder: step.stepOrder, status: 'sent' },
    })
    if (sent) continue

    let delayMs = 0
    switch (step.delayType) {
      case 'minutes': delayMs = step.delayValue * 60_000; break
      case 'hours':   delayMs = step.delayValue * 3600_000; break
      case 'days':    delayMs = step.delayValue * 86400_000; break
    }

    if (delayMs === 0) {
      await sendStep(step, funnel.id, userId, extraVars)
    } else if (delayMs <= 24 * 3600_000) {
      setTimeout(() => sendStep(step, funnel.id, userId, extraVars).catch(() => {}), delayMs)
      logger.info(`Funnel ${triggerId} step ${step.stepOrder} scheduled for ${userId} in ${delayMs / 60000}min`)
      break
    } else {
      break
    }
  }
}

// ── SEND NODE (new system) ─────────────────────────────────
async function sendNode(node: any, funnelId: string, userId: string, extraVars: Record<string, string> = {}) {
  const vars = await buildVars(userId, extraVars)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { telegramId: true, email: true },
  })
  if (!user) return

  // Execute action if set
  if (node.actionType && node.actionType !== 'none') {
    await executeAction({ actionType: node.actionType, actionValue: Number(node.actionValue || 0), actionPromoExpiry: node.actionPromoExpiry || 7 } as any, userId, vars)
  }

  // TG
  if (node.channelTg && user.telegramId && node.tgText) {
    const text = subVars(node.tgText, vars)
    const buttons = (node.tgButtons as any[] || []).filter((b: any) => b && !b._type)
    const kb = buttons.length > 0 ? buildKb(buttons, vars) : undefined
    const parseMode = (node.tgParseMode as any) || 'Markdown'

    try {
      await bot.api.sendMessage(user.telegramId, text, {
        parse_mode: parseMode,
        ...(kb && { reply_markup: kb }),
      })
      await prisma.funnelLog.create({ data: { funnelId, userId, nodeId: node.id, stepOrder: 0, channel: 'tg', status: 'sent' } })
    } catch (e: any) {
      // Если Telegram отверг из-за невалидной разметки — ретрай без parse_mode
      const isParseErr = /can't parse entities|can't find end of the entity/i.test(e.message || '')
      if (isParseErr) {
        try {
          await bot.api.sendMessage(user.telegramId, text, { ...(kb && { reply_markup: kb }) })
          await prisma.funnelLog.create({ data: { funnelId, userId, nodeId: node.id, stepOrder: 0, channel: 'tg', status: 'sent', error: 'plain (parse fallback)' } })
          logger.warn(`[Funnel] parse-mode fallback used for node ${node.id}`)
          return
        } catch (e2: any) {
          await prisma.funnelLog.create({ data: { funnelId, userId, nodeId: node.id, stepOrder: 0, channel: 'tg', status: 'failed', error: e2.message } })
          return
        }
      }
      await prisma.funnelLog.create({ data: { funnelId, userId, nodeId: node.id, stepOrder: 0, channel: 'tg', status: 'failed', error: e.message } })
    }
  }

  // Email
  if (node.channelEmail && user.email && node.emailSubject) {
    try {
      await emailService.sendBroadcastEmail({
        to: user.email, subject: subVars(node.emailSubject, vars),
        html: subVars(node.emailHtml || node.tgText || '', vars),
        btnText: node.emailBtnText ?? undefined,
        btnUrl: node.emailBtnUrl ? subVars(node.emailBtnUrl, vars) : undefined,
        template: node.emailTemplate || 'dark',
      })
      await prisma.funnelLog.create({ data: { funnelId, userId, nodeId: node.id, stepOrder: 0, channel: 'email', status: 'sent' } })
    } catch (e: any) {
      await prisma.funnelLog.create({ data: { funnelId, userId, nodeId: node.id, stepOrder: 0, channel: 'email', status: 'failed', error: e.message } })
    }
  }

  // LK
  if (node.channelLk && node.lkTitle) {
    try {
      await inAppNotifications.sendToUser({
        userId, title: subVars(node.lkTitle, vars),
        message: subVars(node.lkMessage || '', vars),
        type: (node.lkType || 'INFO') as any,
      })
      await prisma.funnelLog.create({ data: { funnelId, userId, nodeId: node.id, stepOrder: 0, channel: 'lk', status: 'sent' } })
    } catch (e: any) {
      await prisma.funnelLog.create({ data: { funnelId, userId, nodeId: node.id, stepOrder: 0, channel: 'lk', status: 'failed', error: e.message } })
    }
  }
}

// ════════════════════════════════════════════════════════════
// NODE CHAIN ENGINE — обрабатывает все типы нод с поддержкой
// долгих задержек, циклов, ветвлений, wait_event, repeat, etc.
// ════════════════════════════════════════════════════════════

const MAX_CHAIN_DEPTH = 50 // Защита от зацикливания

/**
 * Выполняет цепочку нод начиная с заданного nodeId.
 * Поддерживает все типы нод: message, delay, condition, action,
 * split, wait_event, goto, http, notify_admin, repeat, stop.
 */
export async function processNodeChain(
  startNodeId: string,
  funnelId: string,
  userId: string,
  extraVars: Record<string, string> = {},
  depth = 0,
) {
  let currentId: string | null = startNodeId
  let localDepth = depth

  while (currentId) {
    if (localDepth >= MAX_CHAIN_DEPTH) {
      logger.warn(`[Funnel] Max chain depth reached for user ${userId}, funnel ${funnelId}, node ${currentId}`)
      break
    }
    localDepth++

    const node: any = await prisma.funnelNode.findUnique({ where: { id: currentId } })
    if (!node) break
    if (node.nodeType === 'stop') break

    // Skip if already sent (for message-like nodes)
    if (['message', 'trigger'].includes(node.nodeType)) {
      const alreadySent = await prisma.funnelLog.findFirst({
        where: { funnelId, userId, nodeId: node.id, status: 'sent' },
      })
      if (alreadySent) {
        currentId = node.nextNodeId
        continue
      }
    }

    const result: NodeResult = await processNode(node, funnelId, userId, extraVars, localDepth)
    if (result.action === 'stop') break
    if (result.action === 'pending') break // Saved to PendingFunnelStep, will resume later
    if (result.action === 'goto') {
      currentId = result.nextNodeId || null
      continue
    }
    currentId = result.nextNodeId || node.nextNodeId
  }
}

interface NodeResult {
  action: 'continue' | 'stop' | 'pending' | 'goto'
  nextNodeId?: string | null
}

/**
 * Обработка одной ноды. Возвращает что делать дальше.
 */
async function processNode(
  node: any,
  funnelId: string,
  userId: string,
  extraVars: Record<string, string>,
  depth: number,
): Promise<NodeResult> {
  switch (node.nodeType) {
    case 'message':
    case 'trigger': {
      // Check delay — if has delay, schedule pending step
      const delayMs = computeDelayMs(node)
      if (delayMs > 0) {
        await prisma.pendingFunnelStep.create({
          data: {
            funnelId,
            userId,
            nodeId: node.id,
            type: 'delayed',
            executeAt: new Date(Date.now() + delayMs),
            depth,
            varsJson: extraVars as any,
          },
        })
        logger.info(`[Funnel] Node ${node.id} scheduled for ${userId} in ${Math.round(delayMs / 60000)}min`)
        return { action: 'pending' }
      }
      // Check workHours
      if (await shouldDeferForWorkHours(funnelId, userId, node, depth, extraVars)) {
        return { action: 'pending' }
      }
      await sendNode(node, funnelId, userId, extraVars)

      // Start repeat cycle if enabled on this node
      if (node.repeatEnabled && node.repeatMax && node.repeatMax > 0) {
        const intervalMs = (node.repeatInterval || 3600) * 1000
        await prisma.pendingFunnelStep.create({
          data: {
            funnelId,
            userId,
            nodeId: node.id,
            type: 'repeat',
            executeAt: new Date(Date.now() + intervalMs),
            repeatCount: 1,
            depth,
            varsJson: extraVars as any,
          },
        })
        logger.info(`[Funnel] Repeat started for node ${node.id}: every ${node.repeatInterval}s, max ${node.repeatMax}`)
      }

      return { action: 'continue' }
    }

    case 'delay': {
      const delayMs = computeDelayMs(node)
      if (delayMs <= 0) return { action: 'continue' }

      // ⏱ SHORT DELAY (< 5 min): in-process setTimeout for second-level precision.
      // Tradeoff: если бот перезапустится в эти 5 минут — задержка потеряется.
      // Для большинства UX-сценариев это допустимо.
      const FIVE_MIN_MS = 5 * 60_000
      if (delayMs < FIVE_MIN_MS) {
        logger.info(`[Funnel] Short delay ${Math.round(delayMs / 1000)}s in-process for ${userId}`)
        setTimeout(async () => {
          try {
            if (node.nextNodeId) {
              await processNodeChain(node.nextNodeId, funnelId, userId, extraVars, depth + 1)
            }
          } catch (err: any) {
            logger.error(`[Funnel] In-process delay chain failed: ${err.message}`)
          }
        }, delayMs)
        return { action: 'pending' }
      }

      // 📦 LONG DELAY (≥ 5 min): persist to DB, cron picks up every 30 sec.
      await prisma.pendingFunnelStep.create({
        data: {
          funnelId,
          userId,
          nodeId: node.id,
          type: 'delayed',
          executeAt: new Date(Date.now() + delayMs),
          depth,
          varsJson: extraVars as any,
        },
      })
      logger.info(`[Funnel] Delay ${Math.round(delayMs / 60000)}min for ${userId}`)
      return { action: 'pending' }
    }

    case 'condition': {
      // Try advanced conditions JSON first
      let passed = true
      if (node.conditions) {
        passed = await evaluateConditions(node.conditions, userId)
      } else if (node.conditionType && node.conditionType !== 'none') {
        passed = await checkCondition(node.conditionType, userId)
      }
      const next = passed ? node.trueNodeId : node.falseNodeId
      return { action: 'continue', nextNodeId: next }
    }

    case 'action': {
      if (node.actionType && node.actionType !== 'none') {
        const vars = await buildVars(userId, extraVars)
        await executeAction({
          actionType: node.actionType,
          actionValue: Number(node.actionValue || 0),
          actionPromoExpiry: node.actionPromoExpiry || 7,
        } as any, userId, vars)
        await prisma.funnelLog.create({
          data: { funnelId, userId, nodeId: node.id, stepOrder: 0, channel: 'action', status: 'sent' },
        })
      }
      return { action: 'continue' }
    }

    case 'split': {
      // A/B split based on userId hash
      const percent = node.splitPercent || 50
      const hash = simpleHash(userId)
      const variantA = (hash % 100) < percent
      // Log which variant
      await prisma.funnelLog.create({
        data: {
          funnelId, userId, nodeId: node.id, stepOrder: 0,
          channel: 'split', status: 'sent', error: variantA ? 'A' : 'B',
        },
      })
      return { action: 'continue', nextNodeId: variantA ? node.trueNodeId : node.falseNodeId }
    }

    case 'wait_event': {
      const timeoutMs = (node.waitTimeout || 3600) * 1000
      await prisma.pendingFunnelStep.create({
        data: {
          funnelId,
          userId,
          nodeId: node.id,
          type: 'wait_event',
          waitEvent: node.waitEvent || 'unknown',
          executeAt: new Date(Date.now() + timeoutMs),
          depth,
          varsJson: extraVars as any,
        },
      })
      logger.info(`[Funnel] Wait for event '${node.waitEvent}' for ${userId}, timeout ${timeoutMs / 1000}s`)
      return { action: 'pending' }
    }

    case 'goto': {
      // Jump to another node (or another funnel's first node)
      let targetId: string | null = null
      if (node.gotoTargetType === 'node') {
        targetId = node.gotoTargetId
      } else if (node.gotoTargetType === 'funnel') {
        const targetFunnel = await prisma.funnel.findUnique({
          where: { id: node.gotoTargetId },
          include: { nodes: { where: { nodeType: 'trigger' }, take: 1 } },
        })
        targetId = targetFunnel?.nodes[0]?.id || null
      }
      await prisma.funnelLog.create({
        data: { funnelId, userId, nodeId: node.id, stepOrder: 0, channel: 'goto', status: 'sent', error: targetId },
      })
      return { action: 'goto', nextNodeId: targetId }
    }

    case 'http': {
      if (!node.httpUrl) return { action: 'continue' }
      try {
        const vars = await buildVars(userId, extraVars)
        const url = subVars(node.httpUrl, vars)
        const method = node.httpMethod || 'POST'
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (node.httpHeaders && typeof node.httpHeaders === 'object') {
          Object.assign(headers, node.httpHeaders)
        }
        const body = node.httpBody ? subVars(node.httpBody, vars) : undefined
        // Retry up to 3 times
        let lastError: string | null = null
        for (let i = 0; i < 3; i++) {
          try {
            const res = await fetch(url, {
              method,
              headers,
              body: method !== 'GET' && body ? body : undefined,
              signal: AbortSignal.timeout(5000),
            })
            if (res.ok) {
              await prisma.funnelLog.create({
                data: { funnelId, userId, nodeId: node.id, stepOrder: 0, channel: 'http', status: 'sent', error: `${res.status}` },
              })
              return { action: 'continue' }
            }
            lastError = `HTTP ${res.status}`
          } catch (e: any) {
            lastError = e?.message || 'unknown'
          }
        }
        await prisma.funnelLog.create({
          data: { funnelId, userId, nodeId: node.id, stepOrder: 0, channel: 'http', status: 'failed', error: lastError },
        })
      } catch (e: any) {
        await prisma.funnelLog.create({
          data: { funnelId, userId, nodeId: node.id, stepOrder: 0, channel: 'http', status: 'failed', error: e.message },
        })
      }
      return { action: 'continue' }
    }

    case 'notify_admin': {
      try {
        const vars = await buildVars(userId, { ...extraVars, funnelId, nodeId: node.id })
        const text = subVars(node.notifyText || `Воронка ${funnelId}: достигнута нода ${node.name || node.id}`, vars)
        const channel = node.notifyChannel || 'tg' // tg | ticket | email
        if (channel === 'tg') {
          // Send to support channel
          const setting = await prisma.setting.findUnique({ where: { key: 'support_tg_channel_id' } })
          const channelId = setting?.value
          if (channelId) {
            await bot.api.sendMessage(channelId, text, { parse_mode: 'HTML' })
          }
        } else if (channel === 'ticket') {
          // Create a ticket on behalf of the user
          await prisma.ticket.create({
            data: {
              userId,
              subject: `Авто-уведомление: ${node.name || 'Воронка'}`,
              category: 'OTHER',
              priority: 'HIGH',
              source: 'ADMIN',
              messages: {
                create: {
                  authorType: 'SYSTEM',
                  body: text,
                  source: 'ADMIN',
                },
              },
              unreadByAdmin: 1,
              lastMessageAt: new Date(),
            },
          })
        }
        await prisma.funnelLog.create({
          data: { funnelId, userId, nodeId: node.id, stepOrder: 0, channel: 'notify_admin', status: 'sent' },
        })
      } catch (e: any) {
        await prisma.funnelLog.create({
          data: { funnelId, userId, nodeId: node.id, stepOrder: 0, channel: 'notify_admin', status: 'failed', error: e.message },
        })
      }
      return { action: 'continue' }
    }

    case 'stop':
      return { action: 'stop' }

    default:
      logger.warn(`[Funnel] Unknown node type: ${node.nodeType}`)
      return { action: 'continue' }
  }
}

function computeDelayMs(node: any): number {
  const v = node.delayValue ?? 0
  let ms = 0
  switch (node.delayType) {
    case 'seconds': ms = v * 1000; break
    case 'minutes': ms = v * 60_000; break
    case 'hours':   ms = v * 3600_000; break
    case 'days':    ms = v * 86400_000; break
    case 'weeks':   ms = v * 7 * 86400_000; break
    default:        ms = 0
  }

  // Optional: snap to specific weekday if delayWeekdays is set ([1-7], 1=Mon).
  // If the date after delay lands on a disabled weekday, extend to next allowed day.
  const weekdays = node.delayWeekdays as number[] | null | undefined
  if (ms > 0 && Array.isArray(weekdays) && weekdays.length > 0 && weekdays.length < 7) {
    const future = new Date(Date.now() + ms)
    // JS getDay: 0=Sun..6=Sat; normalize to 1-7 where Mon=1
    let dow = future.getDay()
    if (dow === 0) dow = 7
    let addDays = 0
    while (!weekdays.includes(((dow - 1 + addDays) % 7) + 1) && addDays < 7) addDays++
    ms += addDays * 86400_000
  }

  // Optional: snap to specific time of day if delayTime is set (HH:MM)
  const delayTime = node.delayTime as string | null | undefined
  if (ms > 0 && delayTime && /^\d{1,2}:\d{2}$/.test(delayTime)) {
    const [h, m] = delayTime.split(':').map(Number)
    const future = new Date(Date.now() + ms)
    future.setHours(h, m, 0, 0)
    // If that time is already past today → move to next day
    const calculated = future.getTime() - Date.now()
    if (calculated > 0) ms = calculated
  }

  return ms
}

function simpleHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/**
 * Проверяет workHours воронки. Если время не рабочее — записывает
 * pending step на следующее рабочее окно и возвращает true (defer).
 */
async function shouldDeferForWorkHours(
  funnelId: string,
  userId: string,
  node: any,
  depth: number,
  extraVars: Record<string, string>,
): Promise<boolean> {
  const funnel = await prisma.funnel.findUnique({ where: { id: funnelId } })
  if (!funnel) return false
  const fAny = funnel as any
  const start = fAny.workHoursStart || fAny.work_hours_start // string "09:00" or null
  const end = fAny.workHoursEnd || fAny.work_hours_end
  if (!start || !end) return false

  const tz = fAny.timezone || 'Europe/Moscow'
  const now = new Date()
  const fmt = new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz })
  const [hh, mm] = fmt.format(now).split(':').map(Number)
  const minutesNow = hh * 60 + mm
  const [sh, sm] = String(start).split(':').map(Number)
  const [eh, em] = String(end).split(':').map(Number)
  const minutesStart = sh * 60 + (sm || 0)
  const minutesEnd = eh * 60 + (em || 0)

  if (minutesNow >= minutesStart && minutesNow < minutesEnd) {
    return false // In work hours, send now
  }

  // Calculate next work window start
  let executeAt = new Date(now)
  if (minutesNow < minutesStart) {
    executeAt.setHours(sh, sm || 0, 0, 0)
  } else {
    // After end — next day at start
    executeAt.setDate(executeAt.getDate() + 1)
    executeAt.setHours(sh, sm || 0, 0, 0)
  }

  await prisma.pendingFunnelStep.create({
    data: {
      funnelId, userId, nodeId: node.id, type: 'delayed',
      executeAt, depth, varsJson: extraVars as any,
    },
  })
  logger.info(`[Funnel] Deferred to work hours: ${userId} -> ${executeAt.toISOString()}`)
  return true
}

// Convert (param, unit) → milliseconds
export function unitToMs(param: number, unit?: string | null): number {
  switch (unit) {
    case 'seconds': return param * 1000
    case 'minutes': return param * 60_000
    case 'hours':   return param * 3600_000
    case 'days':    return param * 86400_000
    case 'weeks':   return param * 7 * 86400_000
    default:        return param * 3600_000 // default hours
  }
}

// Map of state_* triggers → where-clause builder.
// IMPORTANT: no narrow gt-windows — dedup is handled by funnel_logs check below.
// We just say "X has been true for at least N time" without restricting upper bound.
// Anniversary-style scenarios use a precise window because they fire ON the date.
const STATE_SCENARIOS: Record<string, (ms: number, now: Date) => any> = {
  state_trial_not_activated: (ms, now) => ({
    remnawaveUuid: null,
    createdAt: { lt: new Date(now.getTime() - ms) },
  }),
  state_not_connected: (ms, now) => ({
    remnawaveUuid: { not: null },
    firstConnectedAt: null,
    createdAt: { lt: new Date(now.getTime() - ms) },
  }),
  state_inactive: (ms, now) => ({
    lastLoginAt: { lt: new Date(now.getTime() - ms) },
  }),
  state_no_referrals: (ms, now) => ({
    createdAt: { lt: new Date(now.getTime() - ms) },
    referrals: { none: {} },
  }),
  state_winback: (ms, now) => ({
    subExpireAt: { lt: new Date(now.getTime() - ms) },
    subStatus: { not: 'ACTIVE' as const },
  }),
  // Anniversary fires exactly on the date — narrow window to ±1 day
  state_anniversary: (ms, now) => ({
    createdAt: {
      gte: new Date(now.getTime() - ms - 86400_000),
      lt:  new Date(now.getTime() - ms),
    },
  }),
  state_gift_not_claimed: (ms, now) => ({
    giftsReceived: { some: { claimedAt: null, createdAt: { lt: new Date(now.getTime() - ms) } } },
  }),
  // Feedback fires exactly on the date — narrow window
  state_feedback_request: (ms, now) => ({
    createdAt: {
      gte: new Date(now.getTime() - ms - 86400_000),
      lt:  new Date(now.getTime() - ms),
    },
  }),
  state_low_balance: (ms, now) => ({
    balance: { lte: 0 },
    createdAt: { lt: new Date(now.getTime() - ms) },
  }),
  state_payment_pending_stuck: (ms, now) => ({
    payments: { some: { status: 'PENDING', createdAt: { lt: new Date(now.getTime() - ms) } } },
  }),
  // Trial about to expire — narrow window because it's a future point in time
  state_on_trial_about_to_expire: (ms, now) => ({
    subStatus: 'ACTIVE' as const,
    paymentsCount: 0,
    subExpireAt: {
      gte: new Date(now.getTime() + ms - 3600_000),
      lt:  new Date(now.getTime() + ms),
    },
  }),
}

// Process all state-check triggers — sweep enabled funnel nodes by triggerType
async function processStateChecks(now: Date) {
  for (const [scenario, whereFn] of Object.entries(STATE_SCENARIOS)) {
    const triggerNodes = await prisma.funnelNode.findMany({
      where: {
        nodeType: 'trigger',
        triggerType: scenario,
        funnel: { enabled: true },
      },
      select: { id: true, funnelId: true, triggerParam: true, delayType: true },
    })

    for (const tn of triggerNodes) {
      const param = tn.triggerParam ?? 1
      if (param <= 0) continue
      const ms = unitToMs(param, tn.delayType)

      const where = whereFn(ms, now)
      const users = await prisma.user.findMany({
        where: { ...where, isActive: true },
        select: { id: true },
        take: 100,
      })

      for (const u of users) {
        // Dedup: don't fire twice for the same user+node
        const alreadySent = await prisma.funnelLog.findFirst({
          where: { funnelId: tn.funnelId, userId: u.id, nodeId: tn.id, status: 'sent' },
        })
        if (alreadySent) continue
        try {
          await triggerEvent(scenario, u.id)
        } catch (err: any) {
          logger.warn(`[State] ${scenario}(${param}${tn.delayType}) failed for ${u.id}: ${err.message}`)
        }
      }
    }
  }
}

// ── CRON: process pending chain steps ───────────────────────
export async function runCronFunnels() {
  const now = new Date()

  // ═════════════════════════════════════════════════════════
  // 1. STATE-CHECK triggers — универсальная обработка всех state_*
  // ═════════════════════════════════════════════════════════
  await processStateChecks(now)

  // ═════════════════════════════════════════════════════════
  // 2. Pending chain steps (short delays, wait_events, repeats)
  // ═════════════════════════════════════════════════════════
  await processPendingChainSteps()
  await processPendingNodeSteps()

  logger.info('Cron funnels completed')
}

/**
 * Обрабатывает pending node steps — отложенные ноды для нового движка.
 * Запускается каждую минуту.
 */
export async function processPendingNodeSteps() {
  const now = new Date()
  const pending = await prisma.pendingFunnelStep.findMany({
    where: { executeAt: { lte: now } },
    take: 100,
    orderBy: { executeAt: 'asc' },
  })

  for (const p of pending) {
    try {
      const node = await prisma.funnelNode.findUnique({ where: { id: p.nodeId } })
      if (!node) {
        await prisma.pendingFunnelStep.delete({ where: { id: p.id } })
        continue
      }

      const extraVars = (p.varsJson as any) || {}

      if (p.type === 'wait_event') {
        // Timeout reached — go through falseNodeId (timeout path) or stop
        await prisma.pendingFunnelStep.delete({ where: { id: p.id } })
        const timeoutNext = node.falseNodeId || node.nextNodeId
        if (timeoutNext) {
          await processNodeChain(timeoutNext, p.funnelId, p.userId, extraVars, p.depth + 1)
        }
      } else if (p.type === 'delayed') {
        // Execute the delayed node and continue chain
        await prisma.pendingFunnelStep.delete({ where: { id: p.id } })

        // For 'message'/'trigger' nodes — send the message
        if (['message', 'trigger'].includes(node.nodeType)) {
          // Re-check conditions before sending
          if (await shouldDeferForWorkHours(p.funnelId, p.userId, node, p.depth, extraVars)) {
            continue // Re-deferred to next work window
          }
          await sendNode(node, p.funnelId, p.userId, extraVars)
          if (node.nextNodeId) {
            await processNodeChain(node.nextNodeId, p.funnelId, p.userId, extraVars, p.depth + 1)
          }
        } else if (node.nodeType === 'delay') {
          // Delay node finished, continue
          if (node.nextNodeId) {
            await processNodeChain(node.nextNodeId, p.funnelId, p.userId, extraVars, p.depth + 1)
          }
        }
      } else if (p.type === 'repeat') {
        // Repeat node iteration
        const max = node.repeatMax || 5
        const count = p.repeatCount + 1
        await prisma.pendingFunnelStep.delete({ where: { id: p.id } })
        if (count > max) continue

        // Check break condition: if condition met → stop
        if (node.conditionType && node.conditionType !== 'none') {
          const passed = await checkCondition(node.conditionType, p.userId)
          if (passed) continue // Condition met, stop repeating
        }

        // Send message
        if (['message', 'trigger'].includes(node.nodeType)) {
          await sendNode(node, p.funnelId, p.userId, extraVars)
        }

        // Schedule next iteration
        const intervalMs = (node.repeatInterval || 3600) * 1000
        await prisma.pendingFunnelStep.create({
          data: {
            funnelId: p.funnelId,
            userId: p.userId,
            nodeId: p.nodeId,
            type: 'repeat',
            executeAt: new Date(Date.now() + intervalMs),
            repeatCount: count,
            depth: p.depth,
            varsJson: extraVars as any,
          },
        })
      }
    } catch (err: any) {
      logger.error(`[Funnel] Error processing pending step ${p.id}: ${err.message}`)
    }
  }

  // Clean up old completed wait_events that have been resolved separately
  await prisma.pendingFunnelStep.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 30 * 86400_000) } },
  })
}

async function processConditionTrigger(triggerId: string, where: any) {
  const funnel = await prisma.funnel.findFirst({
    where: { triggerId },
    include: { steps: { orderBy: { stepOrder: 'asc' }, take: 1 } },
  })
  if (!funnel || !funnel.enabled || funnel.steps.length === 0) return

  const firstStep = funnel.steps[0]
  const users = await prisma.user.findMany({ where: { ...where, isActive: true }, select: { id: true }, take: 100 })

  for (const u of users) {
    const sent = await prisma.funnelLog.findFirst({ where: { funnelId: funnel.id, userId: u.id, stepOrder: firstStep.stepOrder, status: 'sent' } })
    if (sent) continue
    await sendStep(firstStep, funnel.id, u.id)
  }
}

/**
 * Scan all enabled funnels whose TRIGGER node has `triggerType = triggerId` and fire
 * triggerEvent for users matching the condition built from each node's triggerParam.
 *
 * Example: triggerId='not_connected', whereFn=(hours)=>({ firstConnectedAt: null, createdAt: { lt: now - hours*h } })
 * Each enabled funnel can have a different triggerParam → different interval.
 */
async function processParameterizedTrigger(
  triggerId: string,
  whereFn: (param: number) => any,
  defaultParam = 24,
) {
  // Find all enabled funnels whose FIRST trigger node has this triggerType
  const triggerNodes = await prisma.funnelNode.findMany({
    where: {
      nodeType: 'trigger',
      triggerType: triggerId,
      funnel: { enabled: true },
    },
    select: { id: true, funnelId: true, triggerParam: true, funnel: { select: { enabled: true } } },
  })

  for (const tn of triggerNodes) {
    const param = tn.triggerParam ?? defaultParam
    if (param <= 0) continue

    const where = whereFn(param)
    const users = await prisma.user.findMany({
      where: { ...where, isActive: true },
      select: { id: true },
      take: 100,
    })

    for (const u of users) {
      // Dedup: don't fire twice for the same user+node
      const alreadySent = await prisma.funnelLog.findFirst({
        where: { funnelId: tn.funnelId, userId: u.id, nodeId: tn.id, status: 'sent' },
      })
      if (alreadySent) continue
      try {
        await triggerEvent(triggerId, u.id)
      } catch (err: any) {
        logger.warn(`[Cron] parameterized trigger ${triggerId}(${param}) failed for ${u.id}: ${err.message}`)
      }
    }
  }
}

async function processPendingChainSteps() {
  // Find funnels that have multi-step chains
  const funnels = await prisma.funnel.findMany({
    where: { enabled: true },
    include: { steps: { orderBy: { stepOrder: 'asc' } } },
  })

  for (const funnel of funnels) {
    if (funnel.steps.length <= 1) continue

    // Find users who received step N but not step N+1
    for (let i = 0; i < funnel.steps.length - 1; i++) {
      const currentStep = funnel.steps[i]
      const nextStep = funnel.steps[i + 1]

      // Calculate when next step should fire
      let delayMs = 0
      switch (nextStep.delayType) {
        case 'minutes': delayMs = nextStep.delayValue * 60_000; break
        case 'hours':   delayMs = nextStep.delayValue * 3600_000; break
        case 'days':    delayMs = nextStep.delayValue * 86400_000; break
      }

      // Find users who got current step but not next step
      const sentLogs = await prisma.funnelLog.findMany({
        where: { funnelId: funnel.id, stepOrder: currentStep.stepOrder, status: 'sent' },
        select: { userId: true, createdAt: true },
      })

      for (const log of sentLogs) {
        // Check if enough time has passed
        if (Date.now() - log.createdAt.getTime() < delayMs) continue

        // Check if next step already sent
        const nextSent = await prisma.funnelLog.findFirst({
          where: { funnelId: funnel.id, userId: log.userId, stepOrder: nextStep.stepOrder },
        })
        if (nextSent) continue

        await sendStep(nextStep, funnel.id, log.userId)
      }
    }
  }
}
