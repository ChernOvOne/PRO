import { Bot, InlineKeyboard, Context } from 'grammy'
import Redis from 'ioredis'
import { config }         from '../config'
import { logger }         from '../utils/logger'
import { prisma }         from '../db'
import { remnawave }      from '../services/remnawave'
import { balanceService } from '../services/balance'
import { paymentService } from '../services/payment'

// ── Redis for state management ───────────────────────────────
const redis = new Redis(config.redis.url)

// ── Bot instance ─────────────────────────────────────────────
export const bot = new Bot(config.telegram.botToken)

// ── Settings cache ───────────────────────────────────────────
const settingsCache = new Map<string, string>()
let settingsLoaded = false

async function loadBotSettings() {
  try {
    const rows = await prisma.setting.findMany({
      where: { key: { startsWith: 'bot_' } },
    })
    for (const r of rows) settingsCache.set(r.key, r.value)
    settingsLoaded = true
  } catch (e) {
    logger.warn('Failed to load bot settings from DB:', e)
  }
}

function msg(key: string, fallback: string): string {
  return settingsCache.get(key) ?? fallback
}

// ── Helper: find or ensure user ──────────────────────────────
async function ensureUser(telegramId: string) {
  return prisma.user.findUnique({ where: { telegramId } })
}

// ── Chat logging ─────────────────────────────────────────────
async function logIncoming(chatId: string, userId: string | null, text: string, callbackData?: string) {
  try {
    await prisma.botMessage.create({
      data: {
        chatId,
        userId: userId ?? undefined,
        direction: 'IN',
        text: text || '',
        callbackData: callbackData ?? null,
      },
    })
  } catch (e) {
    logger.debug('Failed to log incoming bot message:', e)
  }
}

async function logOutgoing(chatId: string, userId: string | null, text: string, buttons?: any) {
  try {
    await prisma.botMessage.create({
      data: {
        chatId,
        userId: userId ?? undefined,
        direction: 'OUT',
        text: text || '',
        buttonsJson: buttons ?? undefined,
      },
    })
  } catch (e) {
    logger.debug('Failed to log outgoing bot message:', e)
  }
}

// ── Human-readable callback labels ───────────────────────────
const CALLBACK_LABELS: Record<string, string> = {
  'menu:main':         '🏠 Главное меню',
  'menu:subscription': '🔑 Подписка',
  'menu:tariffs':      '💳 Тарифы',
  'menu:referral':     '👥 Рефералы',
  'menu:balance':      '💰 Баланс',
  'menu:promo':        '🎟 Промокод',
  'menu:devices':      '📱 Устройства',
  'menu:instructions': '📖 Инструкции',
  'sub:copy':          '📋 Скопировать ссылку',
  'sub:revoke':        '🔄 Обновить ссылку',
  'ref:share':         '📤 Поделиться реферальной ссылкой',
  'trial:start':       '🎁 Пробный период',
  'link:email':        '📧 Привязать email',
}

function callbackToLabel(data: string): string {
  if (CALLBACK_LABELS[data]) return CALLBACK_LABELS[data]
  if (data.startsWith('tariff:select:'))  return '💳 Выбор тарифа'
  if (data.startsWith('tariff:pay:'))     return '💳 Оплата тарифа'
  if (data.startsWith('instr:platform:')) return '📖 Выбор платформы'
  if (data.startsWith('instr:app:'))      return '📖 Выбор приложения'
  if (data.startsWith('instr:step:'))     return '📖 Шаг инструкции'
  if (data.startsWith('device:delete:'))  return '🗑 Удаление устройства'
  if (data.startsWith('promo:activate:')) return '🎟 Активация промокода'
  if (data.startsWith('ref:redeem'))      return '👥 Использование реферальных дней'
  if (data.startsWith('page:'))           return '📄 Переход по страницам'
  return `Действие: ${data}`
}

// ── Logging middleware ────────────────────────────────────────
bot.use(async (ctx, next) => {
  const chatId = String(ctx.chat?.id ?? '')
  const telegramId = String(ctx.from?.id ?? '')

  // Log incoming
  if (ctx.message?.text) {
    const user = await ensureUser(telegramId)
    await logIncoming(chatId, user?.id ?? null, ctx.message.text)
  } else if (ctx.callbackQuery?.data) {
    const user = await ensureUser(telegramId)
    const label = callbackToLabel(ctx.callbackQuery.data)
    await logIncoming(chatId, user?.id ?? null, label, ctx.callbackQuery.data)
  }

  await next()
})

// ── Outgoing message interceptor via API transformer ─────────
bot.api.config.use(async (prev, method, payload, signal) => {
  const result = await prev(method, payload, signal)

  if (method === 'sendMessage' || method === 'editMessageText') {
    const p = payload as any
    const chatId = String(p?.chat_id ?? '')
    const text = String(p?.text ?? '')
    const buttons = p?.reply_markup ?? null

    // Find user by chatId (which is telegram user id in private chats)
    const user = await ensureUser(chatId).catch(() => null)
    await logOutgoing(chatId, user?.id ?? null, text, buttons)
  }

  return result
})

// ── Main menu keyboard ───────────────────────────────────────
function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔑 Подписка', 'menu:subscription').text('💳 Тарифы', 'menu:tariffs').row()
    .text('👥 Рефералы', 'menu:referral').text('💰 Баланс', 'menu:balance').row()
    .text('🎟 Промокод', 'menu:promo').text('📱 Устройства', 'menu:devices').row()
    .text('📖 Инструкции', 'menu:instructions').row()
    .webApp('🌐 Открыть ЛК', `${config.appUrl}/dashboard`)
}

function backButton(to = 'menu:main'): InlineKeyboard {
  return new InlineKeyboard().text('◀️ Назад', to)
}

// ── Trial subscription creation ──────────────────────────────
async function createTrialSubscription(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('User not found')
  if (user.remnawaveUuid) throw new Error('Уже есть подписка')

  const trialDays = config.features.trialDays || 3
  const cheapestTariff = await prisma.tariff.findFirst({
    where: { isActive: true, type: 'SUBSCRIPTION' },
    orderBy: { priceRub: 'asc' },
  })
  if (!cheapestTariff) throw new Error('Нет доступных тарифов')

  const trafficLimitBytes = cheapestTariff.trafficGb ? cheapestTariff.trafficGb * 1024 * 1024 * 1024 : 0
  const expireAt = new Date(Date.now() + trialDays * 86400_000).toISOString()

  const rmUser = await remnawave.createUser({
    username: user.email ? user.email.split('@')[0].replace(/[^a-zA-Z0-9_-]/g, '_') : user.telegramId ? `tg_${user.telegramId}` : `user_${user.id.slice(0, 8)}`,
    email: user.email ?? undefined,
    telegramId: user.telegramId ? parseInt(user.telegramId, 10) : null,
    expireAt,
    trafficLimitBytes,
    trafficLimitStrategy: cheapestTariff.trafficStrategy || 'MONTH',
    hwidDeviceLimit: cheapestTariff.deviceLimit ?? 3,
    tag: cheapestTariff.remnawaveTag ?? undefined,
    activeInternalSquads: cheapestTariff.remnawaveSquads.length > 0 ? cheapestTariff.remnawaveSquads : undefined,
  })

  await prisma.user.update({
    where: { id: userId },
    data: {
      remnawaveUuid: rmUser.uuid,
      subLink: remnawave.getSubscriptionUrl(rmUser.uuid),
      subStatus: 'ACTIVE',
      subExpireAt: new Date(expireAt),
    },
  })

  return { days: trialDays, tariffName: cheapestTariff.name }
}

// ── Sync user subscription from REMNAWAVE ────────────────────
async function syncUserSub(user: any) {
  if (user.remnawaveUuid) return user // already linked

  // Try finding in REMNAWAVE by telegramId
  const rmUser = await remnawave.getUserByTelegramId(user.telegramId).catch(() => null)
  if (rmUser) {
    const statusMap: Record<string, string> = { ACTIVE: 'ACTIVE', DISABLED: 'INACTIVE', LIMITED: 'ACTIVE', EXPIRED: 'EXPIRED' }
    await prisma.user.update({
      where: { id: user.id },
      data: {
        remnawaveUuid: rmUser.uuid,
        subStatus: (statusMap[rmUser.status] ?? 'INACTIVE') as any,
        subExpireAt: rmUser.expireAt ? new Date(rmUser.expireAt) : null,
        subLink: remnawave.getSubscriptionUrl(rmUser.uuid, rmUser.subscriptionUrl),
      },
    })
    return prisma.user.findUnique({ where: { id: user.id } })
  }

  // Try finding by email
  if (user.email) {
    const rmByEmail = await remnawave.getUserByEmail(user.email).catch(() => null)
    if (rmByEmail) {
      const statusMap: Record<string, string> = { ACTIVE: 'ACTIVE', DISABLED: 'INACTIVE', LIMITED: 'ACTIVE', EXPIRED: 'EXPIRED' }
      await prisma.user.update({
        where: { id: user.id },
        data: {
          remnawaveUuid: rmByEmail.uuid,
          subStatus: (statusMap[rmByEmail.status] ?? 'INACTIVE') as any,
          subExpireAt: rmByEmail.expireAt ? new Date(rmByEmail.expireAt) : null,
          subLink: remnawave.getSubscriptionUrl(rmByEmail.uuid, rmByEmail.subscriptionUrl),
        },
      })
      return prisma.user.findUnique({ where: { id: user.id } })
    }
  }

  return user
}

// ── /start command ───────────────────────────────────────────
bot.command('start', async (ctx) => {
  const telegramId = String(ctx.from?.id)
  const tgName = ctx.from?.username || ctx.from?.first_name || telegramId
  const args = ctx.match

  // Find or create user
  let user = await prisma.user.findUnique({ where: { telegramId } })

  if (!user) {
    // New user — create in DB
    let referredById: string | undefined
    if (args && args.startsWith('ref_')) {
      const refCode = args.replace('ref_', '')
      const referrer = await prisma.user.findUnique({ where: { referralCode: refCode }, select: { id: true } })
      if (referrer) referredById = referrer.id
    }

    user = await prisma.user.create({
      data: {
        telegramId,
        telegramName: tgName,
        referredById: referredById ?? undefined,
      },
    })
    logger.info(`New bot user: ${telegramId} (@${tgName})`)
  } else {
    // Update name if changed
    if (tgName !== user.telegramName) {
      await prisma.user.update({ where: { id: user.id }, data: { telegramName: tgName } }).catch(() => {})
    }
    // Handle referral for existing user without referrer
    if (args && args.startsWith('ref_') && !user.referredById) {
      const refCode = args.replace('ref_', '')
      const referrer = await prisma.user.findUnique({ where: { referralCode: refCode }, select: { id: true } })
      if (referrer && referrer.id !== user.id) {
        await prisma.user.update({ where: { id: user.id }, data: { referredById: referrer.id } }).catch(() => {})
      }
    }
  }

  // Sync subscription from REMNAWAVE (by tg id or email)
  user = await syncUserSub(user)

  // ── Determine what to show ──
  if (user!.remnawaveUuid && user!.subStatus === 'ACTIVE') {
    // Has active subscription → main menu
    await ctx.reply(
      msg('bot_welcome_active', '✅ *Подписка активна!*\n\nВыберите нужный раздел:'),
      { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() },
    )
  } else if (user!.remnawaveUuid) {
    // Has REMNAWAVE but expired/inactive
    await ctx.reply(
      '⏰ *Ваша подписка истекла.*\n\nПродлите подписку или активируйте пробный период.',
      {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard()
          .text('💳 Выбрать тариф', 'menu:tariffs').row()
          .text('🎟 Ввести промокод', 'menu:promo').row()
          .webApp('🌐 Открыть ЛК', `${config.appUrl}/dashboard`),
      },
    )
  } else {
    // No subscription at all — new user flow
    const kb = new InlineKeyboard()
    if (config.features.trial) {
      kb.text(`🎁 Пробный период (${config.features.trialDays || 3} дней)`, 'trial:start').row()
    }
    kb.text('💳 Выбрать тариф', 'menu:tariffs').row()
    kb.text('📧 У меня есть аккаунт (привязать email)', 'link:email').row()
    kb.text('🎟 Ввести промокод', 'menu:promo').row()
    kb.webApp('🌐 Открыть ЛК', `${config.appUrl}/dashboard`)

    await ctx.reply(
      msg('bot_welcome_new', '👋 Добро пожаловать в *HIDEYOU VPN*!\n\n' +
        'Для начала выберите один из вариантов:'),
      { parse_mode: 'Markdown', reply_markup: kb },
    )
  }
})

// ── Main menu callback ───────────────────────────────────────
bot.callbackQuery('menu:main', async (ctx) => {
  await ctx.answerCallbackQuery()
  const text = msg('bot_welcome', '👋 Добро пожаловать в *HIDEYOU VPN*!\n\nВыберите нужный раздел:')
  await ctx.editMessageText(text, {
    parse_mode:   'Markdown',
    reply_markup: mainMenuKeyboard(),
  })
})

// ── Helpers: Russian date formatting & day declension ────────
function pluralDays(n: number): string {
  const abs = Math.abs(n)
  if (abs % 10 === 1 && abs % 100 !== 11) return `${n} день`
  if (abs % 10 >= 2 && abs % 10 <= 4 && (abs % 100 < 10 || abs % 100 >= 20)) return `${n} дня`
  return `${n} дней`
}

const RUSSIAN_MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

function formatDateRu(d: Date): string {
  return `${d.getDate()} ${RUSSIAN_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

function formatOnlineAt(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60_000)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')

  if (diffMins < 1) return 'только что'
  if (diffMins < 60) return `${diffMins} мин. назад`

  const isToday = d.toDateString() === now.toDateString()
  if (isToday) return `сегодня, ${hh}:${mm}`

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return `вчера, ${hh}:${mm}`

  return `${formatDateRu(d)}, ${hh}:${mm}`
}

function trafficBar(usedBytes: number, limitBytes: number, width = 16): string {
  if (limitBytes <= 0) return ''
  const pct = Math.min(1, usedBytes / limitBytes)
  const filled = Math.round(pct * width)
  const empty = width - filled
  return '█'.repeat(filled) + '░'.repeat(empty)
}

// ══════════════════════════════════════════════════════════════
//  SUBSCRIPTION
// ══════════════════════════════════════════════════════════════
bot.callbackQuery('menu:subscription', async (ctx) => {
  await ctx.answerCallbackQuery()
  const telegramId = String(ctx.from.id)
  const user = await ensureUser(telegramId)

  if (!user?.remnawaveUuid) {
    const kb = new InlineKeyboard()
      .webApp('💳 Купить подписку', `${config.appUrl}/dashboard/plans`).row()
      .text('◀️ Назад', 'menu:main')
    await ctx.editMessageText(
      msg('bot_no_sub', '❌ У вас нет активной подписки.\nОформите подписку в личном кабинете.'),
      { parse_mode: 'Markdown', reply_markup: kb },
    )
    return
  }

  try {
    const rmUser = await remnawave.getUserByUuid(user.remnawaveUuid)
    const expireAt = rmUser.expireAt ? new Date(rmUser.expireAt) : null
    const daysLeft = expireAt
      ? Math.max(0, Math.ceil((expireAt.getTime() - Date.now()) / 86400_000))
      : null

    const usedBytes = rmUser.userTraffic?.usedTrafficBytes ?? 0
    const limitBytes = rmUser.trafficLimitBytes ?? 0
    const usedGb = (usedBytes / 1e9).toFixed(1)
    const limitGb = limitBytes > 0 ? (limitBytes / 1e9).toFixed(0) : null

    const statusIcon = rmUser.status === 'ACTIVE' ? '✅' : rmUser.status === 'EXPIRED' ? '⏰' : '❌'
    const statusLabel = rmUser.status === 'ACTIVE' ? 'Активна'
      : rmUser.status === 'EXPIRED' ? 'Истекла'
      : rmUser.status === 'LIMITED' ? 'Лимит трафика'
      : 'Неактивна'

    // Find current tariff name from squads or tag
    const squadNames = (rmUser.activeInternalSquads ?? []).map(s => s.name).join(', ')
    const tariffLabel = rmUser.tag || squadNames || '—'

    // Build traffic line
    let trafficLine = `📊 Трафик: ${usedGb}`
    if (limitGb) {
      trafficLine += ` / ${limitGb} ГБ`
    } else {
      trafficLine += ` ГБ (безлимит)`
    }

    // Build progress bar
    let progressLine = ''
    if (limitBytes > 0) {
      const pct = Math.min(100, Math.round(usedBytes / limitBytes * 100))
      progressLine = `\n[${trafficBar(usedBytes, limitBytes)}] ${pct}%`
    }

    // Device info
    const deviceLimit = rmUser.hwidDeviceLimit ?? 0
    let deviceCount = 0
    try {
      const devData = await remnawave.getDevices(user.remnawaveUuid)
      deviceCount = devData.devices?.length ?? 0
    } catch { /* ignore */ }

    // Online info
    const onlineAt = formatOnlineAt(rmUser.userTraffic?.onlineAt ?? null)

    // Subscription link
    const subLink = user.subLink || remnawave.getSubscriptionUrl(rmUser.uuid, rmUser.subscriptionUrl)

    const text =
      `🔑 *Подписка*\n\n` +
      `Статус: ${statusIcon} ${statusLabel}\n` +
      `Тариф: ${tariffLabel}` + (expireAt && daysLeft !== null ? ` · ${pluralDays(Math.ceil((expireAt.getTime() - new Date(rmUser.createdAt).getTime()) / 86400_000))}` : '') + `\n` +
      (expireAt ? `Истекает: ${formatDateRu(expireAt)}\n` : '') +
      (daysLeft !== null ? `Осталось: ${pluralDays(daysLeft)}\n` : '') +
      `\n${trafficLine}${progressLine}\n` +
      `\n📱 Устройства: ${deviceCount}` + (deviceLimit > 0 ? ` / ${deviceLimit}` : '') + `\n` +
      `🌍 Последнее подключение: ${onlineAt}\n` +
      `\n🔗 Ссылка подписки:\n\`${subLink}\``

    const kb = new InlineKeyboard()
      .text('📋 Копировать', 'sub:copy_link')
      .text('🔄 Обновить ссылку', 'sub:refresh_link').row()
      .text('📖 Инструкции', 'menu:instructions')
      .text('◀️ Назад', 'menu:main')

    await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: kb })
  } catch {
    const kb = backButton()
    await ctx.editMessageText('⚠️ Не удалось получить данные. Попробуйте позже.', { reply_markup: kb })
  }
})

bot.callbackQuery('sub:copy_link', async (ctx) => {
  await ctx.answerCallbackQuery()
  const telegramId = String(ctx.from.id)
  const user = await ensureUser(telegramId)
  if (!user?.subLink) {
    await ctx.answerCallbackQuery({ text: 'Ссылка не найдена', show_alert: true })
    return
  }
  // Send as a separate message so user can copy
  await ctx.reply(`🔗 Ваша ссылка-подписка:\n\n\`${user.subLink}\``, { parse_mode: 'Markdown' })
})

bot.callbackQuery('sub:refresh_link', async (ctx) => {
  const telegramId = String(ctx.from.id)
  const user = await ensureUser(telegramId)

  if (!user?.remnawaveUuid) {
    await ctx.answerCallbackQuery({ text: 'Подписка не найдена', show_alert: true })
    return
  }

  try {
    const revoked = await remnawave.revokeSubscription(user.remnawaveUuid)
    const newUrl = remnawave.getSubscriptionUrl(revoked.uuid, revoked.subscriptionUrl)

    await prisma.user.update({
      where: { id: user.id },
      data:  { subLink: newUrl },
    })

    await ctx.answerCallbackQuery({ text: '✅ Ссылка обновлена!', show_alert: true })

    // Re-render subscription view
    await ctx.reply(`🔗 Новая ссылка-подписка:\n\n\`${newUrl}\``, { parse_mode: 'Markdown' })
  } catch {
    await ctx.answerCallbackQuery({ text: '⚠️ Ошибка обновления', show_alert: true })
  }
})

// ══════════════════════════════════════════════════════════════
//  TARIFFS
// ══════════════════════════════════════════════════════════════
bot.callbackQuery('menu:tariffs', async (ctx) => {
  await ctx.answerCallbackQuery()

  const tariffs = await prisma.tariff.findMany({
    where:   { isActive: true, type: 'SUBSCRIPTION' },
    orderBy: { sortOrder: 'asc' },
  })

  if (!tariffs.length) {
    await ctx.editMessageText(
      msg('bot_no_tariffs', 'Нет доступных тарифов.'),
      { reply_markup: backButton() },
    )
    return
  }

  const kb = new InlineKeyboard()
  for (const t of tariffs) {
    let price = t.priceRub
    // For variant tariffs show first variant price
    if (t.mode === 'variants' && t.variants) {
      const variants = t.variants as any[]
      if (variants.length > 0) price = variants[0].priceRub ?? price
    }
    kb.text(`${t.name} — ${price} ₽`, `tariff:${t.id}`).row()
  }
  kb.text('◀️ Назад', 'menu:main')

  await ctx.editMessageText(
    msg('bot_tariffs_title', '💳 *Выберите тариф:*'),
    { parse_mode: 'Markdown', reply_markup: kb },
  )
})

bot.callbackQuery(/^tariff:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery()
  const tariffId = ctx.match[1]

  const tariff = await prisma.tariff.findUnique({ where: { id: tariffId } })
  if (!tariff) {
    await ctx.editMessageText('Тариф не найден.', { reply_markup: backButton('menu:tariffs') })
    return
  }

  const trafficStr = tariff.trafficGb ? `${tariff.trafficGb} ГБ` : 'Безлимит'
  const text =
    `📦 *${tariff.name}*\n\n` +
    (tariff.description ? `${tariff.description}\n\n` : '') +
    `Срок: ${tariff.durationDays} дней\n` +
    `Трафик: ${trafficStr}\n` +
    `Устройств: ${tariff.deviceLimit}\n` +
    (tariff.countries ? `Страны: ${tariff.countries}\n` : '') +
    (tariff.protocol ? `Протокол: ${tariff.protocol}\n` : '') +
    (tariff.speed ? `Скорость: ${tariff.speed}\n` : '') +
    `\n💰 Цена: *${tariff.priceRub} ₽*` +
    (tariff.priceUsdt ? ` / ${tariff.priceUsdt} USDT` : '')

  const kb = new InlineKeyboard()
  if (config.yukassa.enabled) {
    kb.text('💳 Оплатить (ЮKassa)', `pay:yukassa:${tariffId}`).row()
  }
  if (config.cryptopay.enabled) {
    kb.text('🪙 Оплатить (CryptoPay)', `pay:crypto:${tariffId}`).row()
  }
  kb.text('◀️ Назад', 'menu:tariffs')

  await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: kb })
})

// ── Payment handlers ─────────────────────────────────────────
bot.callbackQuery(/^pay:(yukassa|crypto):(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery()
  const provider = ctx.match[1] === 'yukassa' ? 'YUKASSA' : 'CRYPTOPAY' as const
  const tariffId = ctx.match[2]

  const telegramId = String(ctx.from.id)
  const user = await ensureUser(telegramId)

  if (!user) {
    const kb = new InlineKeyboard()
      .webApp('📝 Регистрация', `${config.appUrl}/auth`).row()
      .text('◀️ Назад', 'menu:tariffs')
    await ctx.editMessageText(
      '❌ Сначала зарегистрируйтесь на сайте.',
      { reply_markup: kb },
    )
    return
  }

  const tariff = await prisma.tariff.findUnique({ where: { id: tariffId } })
  if (!tariff) {
    await ctx.editMessageText('Тариф не найден.', { reply_markup: backButton('menu:tariffs') })
    return
  }

  try {
    const order = await paymentService.createOrder({
      user,
      tariff,
      provider,
    })

    const kb = new InlineKeyboard()
      .url('💳 Перейти к оплате', order.paymentUrl).row()
      .text('◀️ Назад', `tariff:${tariffId}`)

    await ctx.editMessageText(
      `🧾 *Заказ создан*\n\n` +
      `Тариф: ${tariff.name}\n` +
      `Сумма: ${provider === 'YUKASSA' ? `${tariff.priceRub} ₽` : `${tariff.priceUsdt ?? '—'} USDT`}\n\n` +
      `Нажмите кнопку ниже для оплаты:`,
      { parse_mode: 'Markdown', reply_markup: kb },
    )
  } catch (err) {
    logger.error('Bot payment creation failed:', err)
    await ctx.editMessageText(
      '⚠️ Не удалось создать платёж. Попробуйте позже.',
      { reply_markup: backButton('menu:tariffs') },
    )
  }
})

// ══════════════════════════════════════════════════════════════
//  REFERRAL
// ══════════════════════════════════════════════════════════════
bot.callbackQuery('menu:referral', async (ctx) => {
  await ctx.answerCallbackQuery()
  const telegramId = String(ctx.from.id)
  const user = await prisma.user.findUnique({
    where:  { telegramId },
    select: {
      id: true,
      referralCode: true,
      bonusDays: true,
      _count: { select: { referrals: true } },
    },
  })

  if (!user) {
    await ctx.editMessageText(
      'Сначала зарегистрируйтесь на сайте.',
      { reply_markup: backButton() },
    )
    return
  }

  // Count earned bonus days from referral bonuses
  const bonusAgg = await prisma.referralBonus.aggregate({
    where: { referrerId: user.id, bonusType: 'DAYS' },
    _sum:  { bonusDays: true },
  })
  const earnedDays = bonusAgg._sum.bonusDays ?? 0

  const refUrl = `${config.appUrl}?ref=${user.referralCode}`
  const botUrl = `https://t.me/${config.telegram.botName}?start=ref_${user.referralCode}`

  const text =
    `👥 *Реферальная программа*\n\n` +
    `За каждого друга — *+${config.referral.bonusDays} дней* бесплатно.\n\n` +
    `🔗 Ссылка:\n\`${refUrl}\`\n\n` +
    `🤖 Через бот:\n\`${botUrl}\`\n\n` +
    `Приглашено: *${user._count.referrals}* чел.\n` +
    `Заработано дней: *${earnedDays}*\n` +
    `Доступно к списанию: *${user.bonusDays}* дн.`

  const kb = new InlineKeyboard()
  if (user.bonusDays > 0) {
    kb.text('🎁 Списать бонус-дни', 'ref:redeem').row()
  }
  kb.switchInline('📤 Поделиться', `Присоединяйся к HIDEYOU VPN! ${botUrl}`).row()
  kb.text('◀️ Назад', 'menu:main')

  await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: kb })
})

bot.callbackQuery('ref:redeem', async (ctx) => {
  const telegramId = String(ctx.from.id)
  const user = await prisma.user.findUnique({
    where:  { telegramId },
    select: { id: true, bonusDays: true, remnawaveUuid: true, subExpireAt: true },
  })

  if (!user || user.bonusDays <= 0) {
    await ctx.answerCallbackQuery({ text: 'Нет доступных бонус-дней', show_alert: true })
    return
  }

  if (!user.remnawaveUuid) {
    await ctx.answerCallbackQuery({ text: 'Сначала оформите подписку', show_alert: true })
    return
  }

  try {
    await remnawave.extendSubscription(
      user.remnawaveUuid,
      user.bonusDays,
      user.subExpireAt,
    )

    const newExpire = new Date(
      Math.max(user.subExpireAt?.getTime() ?? Date.now(), Date.now()) + user.bonusDays * 86400_000,
    )

    await prisma.user.update({
      where: { id: user.id },
      data:  {
        bonusDays:   0,
        subExpireAt: newExpire,
        subStatus:   'ACTIVE',
      },
    })

    await ctx.answerCallbackQuery({
      text:       `✅ +${user.bonusDays} дней добавлено!`,
      show_alert: true,
    })

    // Re-render referral screen
    await ctx.editMessageText(
      `✅ Бонус-дни списаны: +${user.bonusDays} дн.\nНовая дата истечения: ${newExpire.toLocaleDateString('ru')}`,
      { parse_mode: 'Markdown', reply_markup: backButton('menu:referral') },
    )
  } catch {
    await ctx.answerCallbackQuery({ text: '⚠️ Ошибка, попробуйте позже', show_alert: true })
  }
})

// ══════════════════════════════════════════════════════════════
//  BALANCE
// ══════════════════════════════════════════════════════════════
bot.callbackQuery('menu:balance', async (ctx) => {
  await ctx.answerCallbackQuery()
  const telegramId = String(ctx.from.id)
  const user = await ensureUser(telegramId)

  if (!user) {
    await ctx.editMessageText(
      'Сначала зарегистрируйтесь на сайте.',
      { reply_markup: backButton() },
    )
    return
  }

  const { balance, history } = await balanceService.getBalance(user.id)
  const last3 = history.slice(0, 3)

  let txLines = ''
  if (last3.length) {
    txLines = '\n\n📜 *Последние операции:*\n'
    for (const tx of last3) {
      const sign = tx.amount.toNumber() >= 0 ? '+' : ''
      const date = tx.createdAt.toLocaleDateString('ru')
      txLines += `${sign}${tx.amount.toNumber()} ₽ — ${tx.description || tx.type} (${date})\n`
    }
  } else {
    txLines = '\n\nОпераций пока нет.'
  }

  const text = `💰 *Баланс:* ${balance.toNumber()} ₽${txLines}`

  const kb = new InlineKeyboard()
    .webApp('💳 Пополнить', `${config.appUrl}/dashboard/topup`).row()
    .text('◀️ Назад', 'menu:main')

  await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: kb })
})

// ══════════════════════════════════════════════════════════════
//  PROMO CODE
// ══════════════════════════════════════════════════════════════
bot.callbackQuery('menu:promo', async (ctx) => {
  await ctx.answerCallbackQuery()
  const chatId = String(ctx.from.id)

  // Set waiting state in Redis (5 min TTL)
  await redis.set(`bot:state:${chatId}`, 'awaiting_promo', 'EX', 300)

  await ctx.editMessageText(
    msg('bot_promo_prompt', '🎟 *Промокод*\n\nВведите промокод:'),
    { parse_mode: 'Markdown', reply_markup: backButton() },
  )
})

bot.callbackQuery(/^promo:activate:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery()
  const code = ctx.match[1]
  const telegramId = String(ctx.from.id)
  const user = await ensureUser(telegramId)

  if (!user) {
    await ctx.editMessageText('Сначала зарегистрируйтесь.', { reply_markup: backButton() })
    return
  }

  const promo = await prisma.promoCode.findUnique({ where: { code: code.toUpperCase() } })
  if (!promo || !promo.isActive) {
    await ctx.editMessageText('❌ Промокод не найден или неактивен.', { reply_markup: backButton() })
    return
  }

  // Check already used
  const used = await prisma.promoUsage.findUnique({
    where: { promoId_userId: { promoId: promo.id, userId: user.id } },
  })
  if (used) {
    await ctx.editMessageText('❌ Вы уже использовали этот промокод.', { reply_markup: backButton() })
    return
  }

  // Apply promo
  let resultMsg = '✅ Промокод активирован!'

  if (promo.type === 'bonus_days' && promo.bonusDays) {
    await prisma.user.update({
      where: { id: user.id },
      data:  { bonusDays: { increment: promo.bonusDays } },
    })
    resultMsg = `✅ Начислено +${promo.bonusDays} бонусных дней!`
  }

  if (promo.type === 'balance' && promo.balanceAmount) {
    await balanceService.credit({
      userId:      user.id,
      amount:      promo.balanceAmount,
      type:        'TOPUP',
      description: `Промокод ${promo.code}`,
    })
    resultMsg = `✅ На баланс зачислено ${promo.balanceAmount} ₽!`
  }

  if (promo.type === 'discount') {
    resultMsg = `✅ Скидка ${promo.discountPct}% будет применена при оплате.`
  }

  if (promo.type === 'trial') {
    resultMsg = '✅ Пробный период активирован!'
  }

  // Record usage
  await prisma.promoUsage.create({ data: { promoId: promo.id, userId: user.id } })
  await prisma.promoCode.update({
    where: { id: promo.id },
    data:  { usedCount: { increment: 1 } },
  })

  // Clear state
  await redis.del(`bot:state:${String(ctx.from.id)}`)

  await ctx.editMessageText(resultMsg, { parse_mode: 'Markdown', reply_markup: backButton() })
})

// ══════════════════════════════════════════════════════════════
//  DEVICES
// ══════════════════════════════════════════════════════════════

function buildDevicesView(devices: any[], deviceLimit: number) {
  const total = devices.length
  const limitStr = deviceLimit > 0 ? `${total}/${deviceLimit}` : `${total}`

  if (!total) {
    return {
      text: msg('bot_no_devices', `📱 *Устройства (0${deviceLimit > 0 ? `/${deviceLimit}` : ''})*\n\nНет подключённых устройств.`),
      kb: backButton(),
    }
  }

  let text = `📱 *Устройства (${limitStr})*\n\n`
  const kb = new InlineKeyboard()

  for (let i = 0; i < devices.length; i++) {
    const d = devices[i]
    const model = d.deviceModel || 'Неизвестное устройство'
    const platform = d.platform || ''
    const osVer = d.osVersion || ''
    const agent = d.userAgent || ''
    const connected = formatOnlineAt(d.updatedAt || d.createdAt || null)

    text += `${i + 1}. *${model}*\n`
    if (platform || osVer) {
      text += `   ${platform}${osVer ? ` ${osVer}` : ''}${agent ? ` · ${agent}` : ''}\n`
    }
    text += `   Подключено: ${connected}\n\n`

    // Truncate button label to avoid TG 64-byte limit
    const btnLabel = model.length > 18 ? model.slice(0, 18) + '…' : model
    kb.text(`🗑 ${btnLabel}`, `device:delete:${d.hwid}`).row()
  }

  kb.text('◀️ Назад', 'menu:main')

  return { text, kb }
}

bot.callbackQuery('menu:devices', async (ctx) => {
  await ctx.answerCallbackQuery()
  const telegramId = String(ctx.from.id)
  const user = await ensureUser(telegramId)

  if (!user?.remnawaveUuid) {
    await ctx.editMessageText(
      msg('bot_no_devices', '📱 У вас нет подключённых устройств.'),
      { reply_markup: backButton() },
    )
    return
  }

  try {
    const { devices } = await remnawave.getDevices(user.remnawaveUuid)
    // Get device limit from remnawave
    let deviceLimit = 0
    try {
      const rmUser = await remnawave.getUserByUuid(user.remnawaveUuid)
      deviceLimit = rmUser.hwidDeviceLimit ?? 0
    } catch { /* ignore */ }

    const { text, kb } = buildDevicesView(devices, deviceLimit)
    await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: kb })
  } catch {
    await ctx.editMessageText('⚠️ Не удалось загрузить устройства.', { reply_markup: backButton() })
  }
})

bot.callbackQuery(/^device:delete:(.+)$/, async (ctx) => {
  const hwid = ctx.match[1]
  const telegramId = String(ctx.from.id)
  const user = await ensureUser(telegramId)

  if (!user?.remnawaveUuid) {
    await ctx.answerCallbackQuery({ text: 'Подписка не найдена', show_alert: true })
    return
  }

  try {
    await remnawave.deleteDevice(user.remnawaveUuid, hwid)
    await ctx.answerCallbackQuery({ text: '✅ Устройство удалено', show_alert: true })

    const { devices } = await remnawave.getDevices(user.remnawaveUuid)
    let deviceLimit = 0
    try {
      const rmUser = await remnawave.getUserByUuid(user.remnawaveUuid)
      deviceLimit = rmUser.hwidDeviceLimit ?? 0
    } catch { /* ignore */ }

    const { text, kb } = buildDevicesView(devices, deviceLimit)
    await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: kb })
  } catch {
    await ctx.answerCallbackQuery({ text: '⚠️ Ошибка удаления', show_alert: true })
  }
})

// ══════════════════════════════════════════════════════════════
//  INSTRUCTIONS
// ══════════════════════════════════════════════════════════════

// Helper: strip markdown bold/italic for cleaner Telegram display
function stripMd(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
}

// Step 1: list platforms
bot.callbackQuery('menu:instructions', async (ctx) => {
  await ctx.answerCallbackQuery()

  const platforms = await prisma.instructionPlatform.findMany({
    where:   { isActive: true },
    orderBy: { sortOrder: 'asc' },
  })

  if (!platforms.length) {
    await ctx.editMessageText(
      msg('bot_no_instructions', '📖 Инструкции пока не добавлены.'),
      { reply_markup: backButton() },
    )
    return
  }

  const kb = new InlineKeyboard()
  // Group platforms in rows of 2 where possible
  for (let i = 0; i < platforms.length; i += 2) {
    const p1 = platforms[i]
    kb.text(`${p1.icon} ${p1.name}`, `instr:platform:${p1.id}`)
    if (i + 1 < platforms.length) {
      const p2 = platforms[i + 1]
      kb.text(`${p2.icon} ${p2.name}`, `instr:platform:${p2.id}`)
    }
    kb.row()
  }
  kb.text('◀️ Назад', 'menu:main')

  await ctx.editMessageText(
    msg('bot_instructions_title', '📖 *Инструкции по подключению*\n\nВыберите вашу платформу:'),
    { parse_mode: 'Markdown', reply_markup: kb },
  )
})

// Step 2: list apps for platform
bot.callbackQuery(/^instr:platform:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery()
  const platformId = ctx.match[1]

  const platform = await prisma.instructionPlatform.findUnique({
    where:   { id: platformId },
    include: {
      apps: {
        where:   { isActive: true },
        orderBy: [{ isFeatured: 'desc' }, { sortOrder: 'asc' }],
      },
    },
  })

  if (!platform || !platform.apps.length) {
    await ctx.editMessageText(
      'Приложения для этой платформы не найдены.',
      { reply_markup: backButton('menu:instructions') },
    )
    return
  }

  const kb = new InlineKeyboard()
  for (const app of platform.apps) {
    const label = app.isFeatured
      ? `⭐ ${app.name} (рекомендуем)`
      : `${app.icon} ${app.name}`
    kb.text(label, `instr:app:${app.id}:1`).row()
  }
  kb.text('◀️ Назад', 'menu:instructions')

  await ctx.editMessageText(
    `${platform.icon} *${platform.name}*\n\nВыберите приложение:`,
    { parse_mode: 'Markdown', reply_markup: kb },
  )
})

// Step 3: show instruction steps with pagination — instr:app:{appId}:{stepNum}
bot.callbackQuery(/^instr:app:(.+?):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery()
  const appId = ctx.match[1]
  const stepNum = parseInt(ctx.match[2], 10)

  const app = await prisma.instructionApp.findUnique({
    where:   { id: appId },
    include: {
      platform: true,
      steps:    { orderBy: { order: 'asc' } },
    },
  })

  if (!app || !app.steps.length) {
    await ctx.editMessageText(
      'Инструкция не найдена.',
      { reply_markup: backButton('menu:instructions') },
    )
    return
  }

  const totalSteps = app.steps.length
  const stepIdx = Math.max(0, Math.min(stepNum - 1, totalSteps - 1))
  const step = app.steps[stepIdx]
  const currentStep = stepIdx + 1

  // Build step text
  const stepText = stripMd(step.text)
  let text = `📖 *${app.name}* — Шаг ${currentStep}/${totalSteps}\n\n`
  text += `${currentStep}. ${stepText}`

  // Build keyboard
  const kb = new InlineKeyboard()

  // App-specific action buttons (store/deeplink)
  if (app.storeUrl && currentStep === 1) {
    kb.url('📥 Скачать', app.storeUrl).row()
  }
  if (app.deeplink && currentStep === totalSteps) {
    // Replace {url} placeholder with user's subscription link
    const telegramId = String(ctx.from.id)
    const user = await ensureUser(telegramId)
    const subLink = user?.subLink || ''
    const deeplink = app.deeplink.replace(/\{url\}/g, encodeURIComponent(subLink))
    if (deeplink) {
      kb.url('🔗 Открыть в приложении', deeplink).row()
    }
  }

  // Navigation row
  if (currentStep > 1) {
    kb.text('◀️ Назад', `instr:app:${appId}:${currentStep - 1}`)
  } else {
    kb.text('◀️ Назад', `instr:platform:${app.platformId}`)
  }
  if (currentStep < totalSteps) {
    kb.text(`Шаг ${currentStep + 1} ▶️`, `instr:app:${appId}:${currentStep + 1}`)
  }

  await ctx.editMessageText(text, {
    parse_mode:              'Markdown',
    reply_markup:            kb,
    // @ts-ignore — grammy supports this
    disable_web_page_preview: true,
  })
})

// Legacy: instr:app:{id} without step number — redirect to step 1
bot.callbackQuery(/^instr:app:([^:]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery()
  const appId = ctx.match[1]

  const app = await prisma.instructionApp.findUnique({
    where:   { id: appId },
    include: {
      platform: true,
      steps:    { orderBy: { order: 'asc' } },
    },
  })

  if (!app || !app.steps.length) {
    await ctx.editMessageText(
      'Инструкция не найдена.',
      { reply_markup: backButton('menu:instructions') },
    )
    return
  }

  const totalSteps = app.steps.length
  const step = app.steps[0]
  const stepText = stripMd(step.text)

  let text = `📖 *${app.name}* — Шаг 1/${totalSteps}\n\n`
  text += `1. ${stepText}`

  const kb = new InlineKeyboard()
  if (app.storeUrl) {
    kb.url('📥 Скачать', app.storeUrl).row()
  }

  kb.text('◀️ Назад', `instr:platform:${app.platformId}`)
  if (totalSteps > 1) {
    kb.text('Шаг 2 ▶️', `instr:app:${appId}:2`)
  }

  await ctx.editMessageText(text, {
    parse_mode:              'Markdown',
    reply_markup:            kb,
    // @ts-ignore — grammy supports this
    disable_web_page_preview: true,
  })
})

// ══════════════════════════════════════════════════════════════
//  TEXT MESSAGE HANDLER (promo code input via state)
// ══════════════════════════════════════════════════════════════
bot.on('message:text', async (ctx) => {
  const chatId = String(ctx.from.id)
  const state = await redis.get(`bot:state:${chatId}`)

  if (state === 'awaiting_promo') {
    const code = ctx.message.text.trim().toUpperCase()

    if (!code || code.length < 2) {
      await ctx.reply('❌ Введите корректный промокод.', { reply_markup: backButton() })
      return
    }

    const telegramId = String(ctx.from.id)
    const user = await ensureUser(telegramId)

    if (!user) {
      await ctx.reply('Сначала зарегистрируйтесь на сайте.', { reply_markup: backButton() })
      await redis.del(`bot:state:${chatId}`)
      return
    }

    // Check promo
    const promo = await prisma.promoCode.findUnique({ where: { code } })

    if (!promo || !promo.isActive) {
      await ctx.reply('❌ Промокод не найден.', { reply_markup: backButton() })
      await redis.del(`bot:state:${chatId}`)
      return
    }

    if (promo.expiresAt && promo.expiresAt < new Date()) {
      await ctx.reply('❌ Промокод истёк.', { reply_markup: backButton() })
      await redis.del(`bot:state:${chatId}`)
      return
    }

    if (promo.maxUses && promo.usedCount >= promo.maxUses) {
      await ctx.reply('❌ Промокод исчерпан.', { reply_markup: backButton() })
      await redis.del(`bot:state:${chatId}`)
      return
    }

    const used = await prisma.promoUsage.findUnique({
      where: { promoId_userId: { promoId: promo.id, userId: user.id } },
    })

    if (used) {
      await ctx.reply('❌ Вы уже использовали этот промокод.', { reply_markup: backButton() })
      await redis.del(`bot:state:${chatId}`)
      return
    }

    // Show preview
    let preview = `🎟 *Промокод:* \`${promo.code}\`\n\n`
    if (promo.type === 'bonus_days')  preview += `Бонус: +${promo.bonusDays} дней`
    if (promo.type === 'balance')     preview += `Зачисление на баланс: ${promo.balanceAmount} ₽`
    if (promo.type === 'discount')    preview += `Скидка: ${promo.discountPct}%`
    if (promo.type === 'trial')       preview += `Пробный период`
    if (promo.description)            preview += `\n${promo.description}`

    const kb = new InlineKeyboard()
      .text('✅ Активировать', `promo:activate:${promo.code}`).row()
      .text('◀️ Назад', 'menu:main')

    await ctx.reply(preview, { parse_mode: 'Markdown', reply_markup: kb })

    // Clear state after showing preview
    await redis.del(`bot:state:${chatId}`)
    return
  }

  // ── Email linking flow ──
  if (state === 'awaiting_email') {
    const emailInput = ctx.message.text.trim().toLowerCase()
    await redis.del(`bot:state:${chatId}`)

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput)) {
      await ctx.reply('❌ Некорректный email. Попробуйте ещё раз.', {
        reply_markup: new InlineKeyboard()
          .text('📧 Ввести email', 'link:email').row()
          .text('◀️ В меню', 'menu:main'),
      })
      return
    }

    const telegramId = String(ctx.from.id)
    const currentUser = await ensureUser(telegramId)

    // Find existing user by email
    const emailUser = await prisma.user.findUnique({ where: { email: emailInput } })

    if (emailUser && emailUser.telegramId && emailUser.telegramId !== telegramId) {
      await ctx.reply('❌ Этот email уже привязан к другому аккаунту.', { reply_markup: backButton() })
      return
    }

    if (emailUser && !emailUser.telegramId) {
      // Link telegram to existing email account
      await prisma.user.update({
        where: { id: emailUser.id },
        data: { telegramId, telegramName: ctx.from.username || ctx.from.first_name || telegramId },
      })
      // Delete the orphan tg-only account if it exists and is different
      if (currentUser && currentUser.id !== emailUser.id) {
        await prisma.user.delete({ where: { id: currentUser.id } }).catch(() => {})
      }
      const linked = await syncUserSub(emailUser)
      const hasActive = linked?.remnawaveUuid && linked?.subStatus === 'ACTIVE'
      await ctx.reply(
        `✅ *Аккаунт привязан!*\n\nEmail: ${emailInput}` +
        (hasActive ? '\n\nПодписка найдена и активна!' : ''),
        { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() },
      )
      return
    }

    if (!emailUser && currentUser) {
      // No user with this email — just set email on current user
      await prisma.user.update({ where: { id: currentUser.id }, data: { email: emailInput } })
      const synced = await syncUserSub(currentUser)
      const hasActive = synced?.remnawaveUuid && synced?.subStatus === 'ACTIVE'
      await ctx.reply(
        `✅ *Email привязан:* ${emailInput}` +
        (hasActive ? '\n\nПодписка найдена!' : ''),
        { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() },
      )
      return
    }

    await ctx.reply('✅ Email сохранён.', { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() })
    return
  }

  // No active state — show main menu for any text
  await ctx.reply(
    msg('bot_welcome', '👋 Добро пожаловать в *HIDEYOU VPN*!\n\nВыберите нужный раздел:'),
    { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() },
  )
})

// ── Trial subscription callback ─────────────────────────────
bot.callbackQuery('trial:start', async (ctx) => {
  await ctx.answerCallbackQuery()
  const telegramId = String(ctx.from.id)
  const user = await ensureUser(telegramId)

  if (!user) {
    await ctx.editMessageText('❌ Пользователь не найден. Нажмите /start', { reply_markup: backButton() })
    return
  }

  if (user.remnawaveUuid) {
    await ctx.editMessageText('ℹ️ У вас уже есть подписка.', {
      reply_markup: mainMenuKeyboard(),
    })
    return
  }

  if (!config.features.trial) {
    await ctx.editMessageText('❌ Пробный период недоступен.', { reply_markup: mainMenuKeyboard() })
    return
  }

  try {
    const result = await createTrialSubscription(user.id)
    await ctx.editMessageText(
      `🎉 *Пробный период активирован!*\n\n` +
      `Тариф: ${result.tariffName}\n` +
      `Срок: ${result.days} дней\n\n` +
      `Откройте раздел "Подписка" для получения ссылки.`,
      { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() },
    )
  } catch (err: any) {
    await ctx.editMessageText(`❌ ${err.message || 'Не удалось активировать пробный период'}`, {
      reply_markup: mainMenuKeyboard(),
    })
  }
})

// ── Email linking callback ──────────────────────────────────
bot.callbackQuery('link:email', async (ctx) => {
  await ctx.answerCallbackQuery()
  const chatId = String(ctx.from.id)
  await redis.set(`bot:state:${chatId}`, 'awaiting_email', 'EX', 300)
  await ctx.editMessageText(
    '📧 *Привязка аккаунта*\n\nВведите email, который вы использовали при регистрации на сайте:',
    { parse_mode: 'Markdown', reply_markup: backButton() },
  )
})

// ── Poll answer tracking ────────────────────────────────────
bot.on('poll_answer', async (ctx) => {
  try {
    const pa = ctx.pollAnswer
    if (!pa.user) return
    const key = `poll_results_${pa.poll_id}`
    const existing = await prisma.setting.findUnique({ where: { key } })
    const results: Record<string, number[]> = existing ? JSON.parse(existing.value) : {}
    results[String(pa.user.id)] = pa.option_ids
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: JSON.stringify(results) },
      update: { value: JSON.stringify(results) },
    })
  } catch (err) {
    logger.warn('Failed to track poll answer:', err)
  }
})

// ── Catch-all for unknown callbacks ──────────────────────────
bot.on('callback_query:data', async (ctx) => {
  await ctx.answerCallbackQuery({ text: 'Неизвестное действие' })
})

// ══════════════════════════════════════════════════════════════
//  NOTIFICATION EXPORTS
// ══════════════════════════════════════════════════════════════

export async function notifyPaymentSuccess(telegramId: string, tariffName: string, daysAdded: number) {
  try {
    await bot.api.sendMessage(
      telegramId,
      `✅ *Оплата прошла!*\n\n` +
      `Тариф: ${tariffName}\n` +
      `Добавлено дней: +${daysAdded}\n\n` +
      `Подписка активирована.`,
      {
        parse_mode:   'Markdown',
        reply_markup: mainMenuKeyboard(),
      },
    )
  } catch (err) {
    logger.warn(`Cannot notify ${telegramId}:`, err)
  }
}

export async function notifyExpiryWarning(telegramId: string, daysLeft: number) {
  try {
    await bot.api.sendMessage(
      telegramId,
      `⚠️ *Подписка истекает через ${daysLeft} дней*\n\nПродлите сейчас, чтобы не потерять доступ.`,
      {
        parse_mode:   'Markdown',
        reply_markup: new InlineKeyboard()
          .text('💳 Тарифы', 'menu:tariffs').row()
          .webApp('📱 Личный кабинет', `${config.appUrl}/dashboard`),
      },
    )
  } catch (err) {
    logger.warn(`Cannot notify expiry ${telegramId}:`, err)
  }
}

export async function notifyReferralBonus(telegramId: string, bonusDays: number) {
  try {
    await bot.api.sendMessage(
      telegramId,
      `🎁 *Реферальный бонус!*\n\nТвой друг оплатил подписку — тебе начислено +${bonusDays} дней.`,
      {
        parse_mode:   'Markdown',
        reply_markup: new InlineKeyboard().text('👥 Рефералы', 'menu:referral'),
      },
    )
  } catch (err) {
    logger.warn(`Cannot notify referral ${telegramId}:`, err)
  }
}

export async function sendTelegramMessage(telegramId: string, text: string) {
  try {
    await bot.api.sendMessage(telegramId, text, { parse_mode: 'Markdown' })
  } catch (err) {
    logger.warn(`Cannot send message to ${telegramId}:`, err)
  }
}

// ══════════════════════════════════════════════════════════════
//  BOT STARTUP
// ══════════════════════════════════════════════════════════════

export async function startBot() {
  // Load bot messages from Settings table
  await loadBotSettings()

  logger.info('Starting Telegram bot...')
  bot.catch((err) => logger.error('Bot error:', err))
  await bot.start({
    onStart: (info) => logger.info(`Bot @${info.username} started`),
  })
}
