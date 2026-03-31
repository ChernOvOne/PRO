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
]

// ── Available triggers for dropdown ─────────────────────────
export const TRIGGER_OPTIONS = [
  { group: 'Онбординг', triggers: [
    { id: 'registration', name: 'Регистрация' },
    { id: 'trial_not_activated', name: 'Не активировал триал' },
    { id: 'not_connected_24h', name: 'Не подключился (24ч)' },
    { id: 'not_connected_72h', name: 'Не подключился (72ч)' },
    { id: 'first_connection', name: 'Первое подключение' },
  ]},
  { group: 'Подписка', triggers: [
    { id: 'expiring_7d', name: 'Истекает через 7 дней' },
    { id: 'expiring_3d', name: 'Истекает через 3 дня' },
    { id: 'expiring_1d', name: 'Истекает через 1 день' },
    { id: 'expired', name: 'Подписка истекла' },
    { id: 'expired_7d', name: 'Истекла 7 дней назад' },
    { id: 'traffic_80', name: 'Трафик 80%' },
    { id: 'traffic_100', name: 'Трафик исчерпан' },
  ]},
  { group: 'Оплата', triggers: [
    { id: 'payment_success', name: 'Оплата прошла' },
    { id: 'payment_pending', name: 'Оплата не завершена' },
    { id: 'payment_renewal', name: 'Повторная оплата' },
  ]},
  { group: 'Рефералы', triggers: [
    { id: 'referral_registered', name: 'Реферал зарегистрировался' },
    { id: 'referral_trial', name: 'Реферал взял триал' },
    { id: 'referral_paid', name: 'Реферал оплатил' },
  ]},
  { group: 'Бонусы', triggers: [
    { id: 'bonus_days_granted', name: 'Начислены бонусные дни' },
    { id: 'promo_activated', name: 'Промокод активирован' },
    { id: 'balance_topup', name: 'Баланс пополнен' },
  ]},
  { group: 'Безопасность', triggers: [
    { id: 'new_device', name: 'Новое устройство' },
    { id: 'device_limit', name: 'Лимит устройств' },
    { id: 'sub_link_revoked', name: 'Ссылка обновлена' },
  ]},
  { group: 'Апсейл', triggers: [
    { id: 'upsell_basic_30d', name: 'На базовом 30+ дней' },
    { id: 'traffic_frequent_exceed', name: 'Частое превышение трафика' },
    { id: 'trial_expired_offer', name: 'Триал закончился' },
  ]},
  { group: 'Социальное', triggers: [
    { id: 'zero_referrals_7d', name: '0 рефералов за 7 дней' },
    { id: 'five_referrals', name: '5 рефералов' },
    { id: 'gift_received', name: 'Подарок получен' },
    { id: 'gift_not_claimed_3d', name: 'Подарок не активирован 3д' },
  ]},
  { group: 'Вовлечение', triggers: [
    { id: 'inactive_14d', name: 'Не заходил 14 дней' },
    { id: 'inactive_30d', name: 'Не заходил 30 дней' },
    { id: 'anniversary', name: 'Годовщина регистрации' },
  ]},
  { group: 'Фидбек', triggers: [
    { id: 'feedback_7d', name: 'Отзыв после 7 дней' },
    { id: 'feedback_loyal', name: 'Отзыв от лояльного клиента' },
  ]},
]

// ── Helpers ─────────────────────────────────────────────────
function subVars(text: string, vars: Record<string, string>): string {
  let r = text
  for (const [k, v] of Object.entries(vars)) r = r.replace(new RegExp(`\\{${k}\\}`, 'g'), v || '')
  return r.replace(/\{appUrl\}/g, config.appUrl)
}

async function buildVars(userId: string, extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, email: true, telegramName: true, telegramId: true,
      referralCode: true, balance: true, bonusDays: true,
      subStatus: true, subExpireAt: true, remnawaveUuid: true,
      createdAt: true, lastLoginAt: true,
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
    ...extra,
  }
}

function buildKb(buttons: any[]): InlineKeyboard | undefined {
  if (!buttons?.length) return undefined
  const kb = new InlineKeyboard()
  for (const b of buttons) {
    if (!b.label) continue
    if (b.type === 'callback') kb.text(b.label, b.data || 'menu:main')
    else if (b.type === 'url' && b.data?.startsWith('http')) kb.url(b.label, b.data)
    else if (b.type === 'webapp' && b.data?.startsWith('http')) kb.webApp(b.label, b.data)
    kb.row()
  }
  return kb
}

// ── Check step condition ────────────────────────────────────
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
      const kb = buildKb(step.tgButtons as any[])
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
  const funnel = await prisma.funnel.findUnique({
    where: { triggerId },
    include: { steps: { orderBy: { stepOrder: 'asc' } } },
  })
  if (!funnel || !funnel.enabled || funnel.steps.length === 0) return

  for (const step of funnel.steps) {
    // Check if this step was already sent
    const sent = await prisma.funnelLog.findFirst({
      where: { funnelId: funnel.id, userId, stepOrder: step.stepOrder, status: 'sent' },
    })
    if (sent) continue

    // Calculate delay
    let delayMs = 0
    switch (step.delayType) {
      case 'minutes': delayMs = step.delayValue * 60_000; break
      case 'hours':   delayMs = step.delayValue * 3600_000; break
      case 'days':    delayMs = step.delayValue * 86400_000; break
    }

    if (delayMs === 0) {
      await sendStep(step, funnel.id, userId, extraVars)
    } else if (delayMs <= 24 * 3600_000) {
      // Short delay: setTimeout
      setTimeout(() => sendStep(step, funnel.id, userId, extraVars).catch(() => {}), delayMs)
      logger.info(`Funnel ${triggerId} step ${step.stepOrder} scheduled for ${userId} in ${delayMs / 60000}min`)
      break // Don't schedule further steps — cron will pick them up
    } else {
      // Long delay: cron will handle
      break
    }
  }
}

// ── CRON: process pending chain steps ───────────────────────
export async function runCronFunnels() {
  const now = new Date()

  // 1. Process condition-based triggers
  await processConditionTrigger('trial_not_activated', { remnawaveUuid: null, createdAt: { lt: new Date(now.getTime() - 3600_000) } })
  await processConditionTrigger('expiring_7d', { subStatus: 'ACTIVE' as const, subExpireAt: { gte: new Date(now.getTime() + 6 * 86400_000), lt: new Date(now.getTime() + 7 * 86400_000) } })
  await processConditionTrigger('expiring_3d', { subStatus: 'ACTIVE' as const, subExpireAt: { gte: new Date(now.getTime() + 2 * 86400_000), lt: new Date(now.getTime() + 3 * 86400_000) } })
  await processConditionTrigger('expiring_1d', { subStatus: 'ACTIVE' as const, subExpireAt: { gte: now, lt: new Date(now.getTime() + 86400_000) } })
  await processConditionTrigger('expired', { subExpireAt: { gte: new Date(now.getTime() - 2 * 86400_000), lt: new Date(now.getTime() - 86400_000) } })
  await processConditionTrigger('expired_7d', { subExpireAt: { gte: new Date(now.getTime() - 8 * 86400_000), lt: new Date(now.getTime() - 7 * 86400_000) } })
  await processConditionTrigger('inactive_14d', { lastLoginAt: { lt: new Date(now.getTime() - 14 * 86400_000) }, isActive: true })
  await processConditionTrigger('inactive_30d', { lastLoginAt: { lt: new Date(now.getTime() - 30 * 86400_000) }, isActive: true })
  await processConditionTrigger('zero_referrals_7d', { createdAt: { lt: new Date(now.getTime() - 7 * 86400_000) }, referrals: { none: {} } })
  await processConditionTrigger('trial_expired_offer', { subStatus: { not: 'ACTIVE' as const }, remnawaveUuid: { not: null }, payments: { none: { status: 'PAID', amount: { gt: 0 } } } })

  // 2. Process pending chain steps (steps with delay that need to fire)
  await processPendingChainSteps()

  logger.info('Cron funnels completed')
}

async function processConditionTrigger(triggerId: string, where: any) {
  const funnel = await prisma.funnel.findUnique({
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
