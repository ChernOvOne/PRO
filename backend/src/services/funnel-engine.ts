/**
 * Funnel execution engine.
 * - Event triggers: called from code at the moment something happens
 * - Cron triggers: checked periodically by scheduler
 * - Variable substitution: {name}, {email}, {days}, etc.
 */

import { prisma } from '../db'
import { bot } from '../bot'
import { emailService } from '../services/email'
import { inAppNotifications } from '../services/notification-service'
import { remnawave } from '../services/remnawave'
import { config } from '../config'
import { logger } from '../utils/logger'
import { InlineKeyboard } from 'grammy'

// ── Variable substitution ───────────────────────────────────
// Available variables that can be used in funnel messages:
//
// {name}           — имя пользователя (TG или email)
// {email}          — email
// {telegramName}   — Telegram username
// {referralCode}   — реферальный код
// {referralUrl}    — реферальная ссылка
// {referralCount}  — кол-во рефералов
// {balance}        — баланс (руб)
// {bonusDays}      — бонусные дни
// {subStatus}      — статус подписки
// {subExpireDate}  — дата истечения подписки
// {daysLeft}       — дней до конца подписки
// {tariffName}     — название тарифа
// {amount}         — сумма платежа
// {refName}        — имя реферала (для ref-триггеров)
// {refBonusDays}   — начисленные реф. дни
// {promoCode}      — промокод
// {trialDays}      — дней пробного периода
// {appUrl}         — URL сервиса
// {deviceName}     — имя устройства

export const VARIABLE_DOCS = [
  { var: '{name}', desc: 'Имя пользователя' },
  { var: '{email}', desc: 'Email' },
  { var: '{telegramName}', desc: 'Telegram username' },
  { var: '{referralCode}', desc: 'Реферальный код' },
  { var: '{referralUrl}', desc: 'Реферальная ссылка' },
  { var: '{referralCount}', desc: 'Кол-во рефералов' },
  { var: '{balance}', desc: 'Баланс (руб)' },
  { var: '{bonusDays}', desc: 'Бонусные дни' },
  { var: '{subStatus}', desc: 'Статус подписки' },
  { var: '{subExpireDate}', desc: 'Дата окончания подписки' },
  { var: '{daysLeft}', desc: 'Дней осталось' },
  { var: '{tariffName}', desc: 'Название тарифа' },
  { var: '{amount}', desc: 'Сумма платежа' },
  { var: '{refName}', desc: 'Имя реферала' },
  { var: '{refBonusDays}', desc: 'Реферальные дни' },
  { var: '{promoCode}', desc: 'Промокод' },
  { var: '{trialDays}', desc: 'Дней пробного периода' },
  { var: '{appUrl}', desc: 'URL сервиса' },
  { var: '{deviceName}', desc: 'Название устройства' },
]

function substituteVars(text: string, vars: Record<string, string>): string {
  let result = text
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '')
  }
  // Always substitute appUrl
  result = result.replace(/\{appUrl\}/g, config.appUrl)
  return result
}

async function buildUserVars(userId: string, extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true, telegramName: true, telegramId: true,
      referralCode: true, balance: true, bonusDays: true,
      subStatus: true, subExpireAt: true,
      _count: { select: { referrals: true } },
    },
  })
  if (!user) return extra

  const daysLeft = user.subExpireAt
    ? Math.max(0, Math.ceil((user.subExpireAt.getTime() - Date.now()) / 86400_000))
    : 0

  return {
    name: user.telegramName || user.email?.split('@')[0] || 'Пользователь',
    email: user.email || '',
    telegramName: user.telegramName || '',
    referralCode: user.referralCode || '',
    referralUrl: `${config.appUrl}?ref=${user.referralCode}`,
    referralCount: String(user._count.referrals),
    balance: String(Number(user.balance || 0)),
    bonusDays: String(user.bonusDays || 0),
    subStatus: user.subStatus,
    subExpireDate: user.subExpireAt ? user.subExpireAt.toLocaleDateString('ru') : '—',
    daysLeft: String(daysLeft),
    trialDays: String(config.features.trialDays || 3),
    appUrl: config.appUrl,
    ...extra,
  }
}

// ── Build keyboard from funnel buttons ──────────────────────
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

// ── Send funnel to a single user ────────────────────────────
async function sendFunnel(funnelId: string, userId: string, extraVars: Record<string, string> = {}) {
  const funnel = await prisma.funnel.findUnique({ where: { id: funnelId } })
  if (!funnel || !funnel.enabled) return

  // Check if already sent to this user
  const alreadySent = await prisma.funnelLog.findFirst({
    where: { funnelId, userId },
  })
  if (alreadySent) return // Don't send same funnel twice

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, telegramId: true, email: true },
  })
  if (!user) return

  const vars = await buildUserVars(userId, extraVars)

  // TG
  if (funnel.channelTg && user.telegramId && funnel.tgText) {
    try {
      const text = substituteVars(funnel.tgText, vars)
      const kb = buildKeyboard(funnel.tgButtons as any[])
      await bot.api.sendMessage(user.telegramId, text, {
        parse_mode: (funnel.tgParseMode as any) || 'Markdown',
        ...(kb && { reply_markup: kb }),
      })
      await prisma.funnelLog.create({ data: { funnelId, userId, channel: 'tg', status: 'sent' } })
    } catch (e: any) {
      await prisma.funnelLog.create({ data: { funnelId, userId, channel: 'tg', status: 'failed', error: e.message } })
    }
  }

  // Email
  if (funnel.channelEmail && user.email && funnel.emailSubject) {
    try {
      await emailService.sendBroadcastEmail({
        to: user.email,
        subject: substituteVars(funnel.emailSubject, vars),
        html: substituteVars(funnel.emailHtml || funnel.tgText || '', vars),
        btnText: funnel.emailBtnText ?? undefined,
        btnUrl: funnel.emailBtnUrl ? substituteVars(funnel.emailBtnUrl, vars) : undefined,
        template: funnel.emailTemplate || 'dark',
      })
      await prisma.funnelLog.create({ data: { funnelId, userId, channel: 'email', status: 'sent' } })
    } catch (e: any) {
      await prisma.funnelLog.create({ data: { funnelId, userId, channel: 'email', status: 'failed', error: e.message } })
    }
  }

  // LK
  if (funnel.channelLk && funnel.lkTitle) {
    try {
      await inAppNotifications.sendToUser({
        userId,
        title: substituteVars(funnel.lkTitle, vars),
        message: substituteVars(funnel.lkMessage || '', vars),
        type: (funnel.lkType || 'INFO') as any,
      })
      await prisma.funnelLog.create({ data: { funnelId, userId, channel: 'lk', status: 'sent' } })
    } catch (e: any) {
      await prisma.funnelLog.create({ data: { funnelId, userId, channel: 'lk', status: 'failed', error: e.message } })
    }
  }
}

// ── EVENT TRIGGERS (called from code) ───────────────────────
// Call these from the relevant places in the codebase

export async function triggerEvent(triggerId: string, userId: string, extraVars: Record<string, string> = {}) {
  const funnel = await prisma.funnel.findUnique({ where: { triggerId } })
  if (!funnel || !funnel.enabled) return

  // Check delay
  if (funnel.delayType === 'immediate' || funnel.delayValue === 0) {
    await sendFunnel(funnel.id, userId, extraVars)
  } else {
    // Delayed: calculate ms and use setTimeout (simple approach)
    let delayMs = 0
    switch (funnel.delayType) {
      case 'minutes': delayMs = funnel.delayValue * 60_000; break
      case 'hours':   delayMs = funnel.delayValue * 3600_000; break
      case 'days':    delayMs = funnel.delayValue * 86400_000; break
      default:        delayMs = 0
    }
    if (delayMs > 0 && delayMs < 24 * 3600_000) {
      // For delays up to 24h, use setTimeout
      setTimeout(() => sendFunnel(funnel.id, userId, extraVars).catch(() => {}), delayMs)
      logger.info(`Funnel ${triggerId} scheduled for ${userId} in ${delayMs / 60000} min`)
    } else if (delayMs > 0) {
      // For longer delays, just send immediately (cron will handle in production)
      // TODO: implement proper job queue for long delays
      await sendFunnel(funnel.id, userId, extraVars)
    } else {
      await sendFunnel(funnel.id, userId, extraVars)
    }
  }
}

// ── CRON TRIGGERS (run by scheduler) ────────────────────────
// These check conditions in the database and send to matching users

export async function runCronFunnels() {
  const now = new Date()

  // trial_not_activated: registered > 1h ago, no remnawaveUuid, trial available
  await runConditionFunnel('trial_not_activated', {
    remnawaveUuid: null,
    createdAt: { lt: new Date(now.getTime() - 3600_000) },
  })

  // not_connected_24h: has remnawave, subscribed > 24h ago, but never connected
  const users24h = await prisma.user.findMany({
    where: {
      remnawaveUuid: { not: null },
      subStatus: 'ACTIVE',
      createdAt: { lt: new Date(now.getTime() - 24 * 3600_000) },
    },
    select: { id: true, remnawaveUuid: true },
  })
  for (const u of users24h) {
    try {
      const rm = await remnawave.getUserByUuid(u.remnawaveUuid!)
      if (!rm.userTraffic?.firstConnectedAt) {
        await triggerIfNotSent('not_connected_24h', u.id)
      }
    } catch {}
  }

  // not_connected_72h
  const users72h = await prisma.user.findMany({
    where: {
      remnawaveUuid: { not: null },
      subStatus: 'ACTIVE',
      createdAt: { lt: new Date(now.getTime() - 72 * 3600_000) },
    },
    select: { id: true, remnawaveUuid: true },
  })
  for (const u of users72h) {
    try {
      const rm = await remnawave.getUserByUuid(u.remnawaveUuid!)
      if (!rm.userTraffic?.firstConnectedAt) {
        await triggerIfNotSent('not_connected_72h', u.id)
      }
    } catch {}
  }

  // expiring_7d, 3d, 1d
  for (const [trigger, days] of [['expiring_7d', 7], ['expiring_3d', 3], ['expiring_1d', 1]] as const) {
    const from = new Date(now.getTime() + (days - 1) * 86400_000)
    const to = new Date(now.getTime() + days * 86400_000)
    await runConditionFunnel(trigger, {
      subStatus: 'ACTIVE',
      subExpireAt: { gte: from, lt: to },
    })
  }

  // expired: subExpireAt was yesterday
  await runConditionFunnel('expired', {
    subExpireAt: {
      gte: new Date(now.getTime() - 2 * 86400_000),
      lt: new Date(now.getTime() - 86400_000),
    },
  })

  // expired_7d
  await runConditionFunnel('expired_7d', {
    subExpireAt: {
      gte: new Date(now.getTime() - 8 * 86400_000),
      lt: new Date(now.getTime() - 7 * 86400_000),
    },
  })

  // inactive_14d
  await runConditionFunnel('inactive_14d', {
    lastLoginAt: { lt: new Date(now.getTime() - 14 * 86400_000) },
    isActive: true,
  })

  // inactive_30d
  await runConditionFunnel('inactive_30d', {
    lastLoginAt: { lt: new Date(now.getTime() - 30 * 86400_000) },
    isActive: true,
  })

  // zero_referrals_7d: registered > 7d ago, 0 referrals
  await runConditionFunnel('zero_referrals_7d', {
    createdAt: { lt: new Date(now.getTime() - 7 * 86400_000) },
    referrals: { none: {} },
  })

  // trial_expired_offer: trial ended (subStatus != ACTIVE, has remnawave, no paid payments)
  await runConditionFunnel('trial_expired_offer', {
    subStatus: { not: 'ACTIVE' },
    remnawaveUuid: { not: null },
    payments: { none: { status: 'PAID', amount: { gt: 0 }, provider: { in: ['YUKASSA', 'CRYPTOPAY'] } } },
  })

  logger.info('Cron funnels check completed')
}

// Helper: run a trigger for all matching users who haven't received it
async function runConditionFunnel(triggerId: string, where: any) {
  const funnel = await prisma.funnel.findUnique({ where: { triggerId } })
  if (!funnel || !funnel.enabled) return

  const users = await prisma.user.findMany({
    where: { ...where, isActive: true },
    select: { id: true },
    take: 100, // batch limit
  })

  for (const u of users) {
    await triggerIfNotSent(triggerId, u.id)
  }
}

async function triggerIfNotSent(triggerId: string, userId: string) {
  const funnel = await prisma.funnel.findUnique({ where: { triggerId } })
  if (!funnel || !funnel.enabled) return

  const alreadySent = await prisma.funnelLog.findFirst({
    where: { funnelId: funnel.id, userId },
  })
  if (alreadySent) return

  await sendFunnel(funnel.id, userId)
}
