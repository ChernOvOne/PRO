import { Bot, InlineKeyboard, Context } from 'grammy'
import Redis from 'ioredis'
import { config }         from '../config'
import { logger }         from '../utils/logger'
import { prisma }         from '../db'
import { remnawave }      from '../services/remnawave'
import { balanceService } from '../services/balance'
import { paymentService } from '../services/payment'
import { executeBlock, findTriggerBlock, loadBlockCache, subscribeCacheInvalidation, trackClick } from './engine'
import { getUserState as getEngineState, clearUserState as clearEngineState } from './state'

// ── Redis for state management ───────────────────────────────
const redis = new Redis(config.redis.url)

// ── Bot instance ─────────────────────────────────────────────
// Use a placeholder token when none is configured to prevent crash on import
export const bot = new Bot(config.telegram.botToken || 'placeholder:token')

// ── Global middleware: log all incoming updates ──────────────
bot.use(async (ctx, next) => {
  const type = ctx.update.message ? 'msg:' + (ctx.update.message.text?.slice(0, 20) || 'media') :
    ctx.update.callback_query ? 'cb:' + ctx.update.callback_query.data?.slice(0, 30) : 'other'
  logger.info(`[bot] Update #${ctx.update.update_id}: ${type} from ${ctx.from?.id}`)
  await next()
})

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

// ── Helper: check if user is staff (for admin button in bot) ─
async function isStaffUser(telegramId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { telegramId }, select: { role: true } })
  return !!user && user.role !== 'USER'
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
  try {
    if (ctx.message?.text) {
      const user = await ensureUser(telegramId)
      await logIncoming(chatId, user?.id ?? null, ctx.message.text)
      logger.info(`[chat-log] IN text from ${telegramId}: ${ctx.message.text.slice(0, 50)}`)
    } else if (ctx.callbackQuery?.data) {
      const user = await ensureUser(telegramId)
      const label = callbackToLabel(ctx.callbackQuery.data)
      await logIncoming(chatId, user?.id ?? null, label, ctx.callbackQuery.data)
      logger.info(`[chat-log] IN callback from ${telegramId}: ${ctx.callbackQuery.data.slice(0, 50)}`)
    }
  } catch (e: any) {
    logger.error(`[chat-log] Failed to log incoming: ${e.message}`)
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
function mainMenuKeyboard(isStaff = false): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text('🔑 Подписка', 'menu:subscription').text('💳 Тарифы', 'menu:tariffs').row()
    .text('👥 Рефералы', 'menu:referral').text('💰 Баланс', 'menu:balance').row()
    .text('🎟 Промокод', 'menu:promo').text('📱 Устройства', 'menu:devices').row()
    .text('📖 Инструкции', 'menu:instructions').row()
    .webApp('🌐 Открыть ЛК', `${config.appUrl}/dashboard`)
  if (isStaff) {
    kb.row().text('⚙️ Админ-панель', 'menu:admin_panel')
  }
  return kb
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

  // Ensure user exists in DB
  let user = await prisma.user.findUnique({ where: { telegramId } })
  const isNewUser = !user

  if (!user) {
    let referredById: string | undefined
    if (args && args.startsWith('ref_')) {
      const refCode = args.replace('ref_', '')
      const referrer = await prisma.user.findUnique({ where: { referralCode: refCode }, select: { id: true } })
      if (referrer) referredById = referrer.id
    }
    user = await prisma.user.create({ data: { telegramId, telegramName: tgName, referredById } })
    logger.info(`New bot user: ${telegramId} (@${tgName})`)

    // Apply referral on registration (invitee bonus + optional inviter trigger=registration)
    if (referredById) {
      try {
        const { applyReferralOnRegistration } = await import('../services/referral')
        await applyReferralOnRegistration(user.id)
      } catch (e: any) {
        logger.warn(`[Referral] registration hook failed: ${e.message}`)
      }
    }
  } else {
    if (tgName !== user.telegramName) {
      await prisma.user.update({ where: { id: user.id }, data: { telegramName: tgName } }).catch(() => {})
    }
    if (args && args.startsWith('ref_') && !user.referredById) {
      const refCode = args.replace('ref_', '')
      const referrer = await prisma.user.findUnique({ where: { referralCode: refCode }, select: { id: true } })
      if (referrer && referrer.id !== user.id) {
        await prisma.user.update({ where: { id: user.id }, data: { referredById: referrer.id } }).catch(() => {})
      }
    }
  }

  // Route by user state:
  // - New user (never seen before) → splash block (event: new_user)
  // - Existing / imported user → /start command trigger (goes through sync + migration check)
  const triggerType = isNewUser ? 'event' : 'command'
  const triggerValue = isNewUser ? 'new_user' : '/start'
  const engineBlockId = await findTriggerBlock(triggerType, triggerValue)

  if (engineBlockId) {
    await executeBlock(engineBlockId, ctx, user!.id, telegramId)
    return
  }

  logger.error(`No engine block found for ${triggerType}:${triggerValue}`)
  await ctx.reply('⚠️ Бот временно недоступен. Попробуйте позже или напишите в поддержку.')
})

// Legacy /start fallback and menu:main removed — engine blocks are the only source of truth now.

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


// Legacy `trial:start` and `link:email` callbacks removed.
// Trial activation and email linking are now engine blocks (ACTION trial, INPUT + send_email_code + verify_email_code).

// ══════════════════════════════════════════════════════════════
//  TEXT MESSAGE HANDLER
//  Only two paths:
//    1) Engine INPUT blocks waiting for user text
//    2) Admin quick-commands (/income, /expense style)
//  Everything else is ignored.
// ══════════════════════════════════════════════════════════════

import { handleAdminTextInput } from './admin-commands'

bot.on('message:text', async (ctx) => {
  const chatId = String(ctx.from.id)

  // 1. Engine INPUT state — user is filling a form block
  const engineState = await getEngineState(chatId)
  if (engineState?.waitingInput) {
    const text = ctx.message.text.trim()
    const validation = engineState.inputValidation

    if (validation === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
      await ctx.reply('❌ Введите корректный email.')
      return
    }
    if (validation === 'phone' && !/^\+?\d{7,15}$/.test(text.replace(/[\s()-]/g, ''))) {
      await ctx.reply('❌ Введите корректный номер телефона.')
      return
    }
    if (validation === 'number' && isNaN(Number(text))) {
      await ctx.reply('❌ Введите число.')
      return
    }

    if (engineState.inputVar) {
      const user = await prisma.user.findUnique({ where: { telegramId: chatId }, select: { id: true } })
      if (user) {
        await prisma.userVariable.upsert({
          where: { userId_key: { userId: user.id, key: engineState.inputVar } },
          create: { userId: user.id, key: engineState.inputVar, value: text },
          update: { value: text },
        })
        await clearEngineState(chatId)
        if (engineState.nextBlockId) {
          await executeBlock(engineState.nextBlockId, ctx, user.id, chatId)
        }
      }
    }
    return
  }

  // 2. Admin quick commands (buhgalteria /income, /expense)
  const handled = await handleAdminTextInput(ctx)
  if (handled) return

  // 3. Text triggers from the constructor (custom keywords → blocks)
  const text = ctx.message.text
  const textTriggerId = await findTriggerBlock('text', text).catch(() => null)
  if (textTriggerId) {
    const user = await prisma.user.findUnique({ where: { telegramId: chatId } })
    if (user) {
      await executeBlock(textTriggerId, ctx, user.id, chatId)
    }
    return
  }

  // 4. Fallback: any other text (typed random word, old Leadteh keyboard button label) →
  //    show migration hint and route user into /start flow.
  const user = await prisma.user.findUnique({ where: { telegramId: chatId } })
  if (!user) return

  const startBlockId = await findTriggerBlock('command', '/start').catch(() => null)
  if (startBlockId) {
    await ctx.reply(
      '👋 Не понял команду. Открываю главное меню:',
      { parse_mode: 'Markdown' },
    ).catch(() => {})
    await executeBlock(startBlockId, ctx, user.id, chatId)
  }
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

    // Also track in BroadcastRecipient if this poll belongs to a broadcast
    try {
      const telegramId = String(pa.user.id)
      const user = await prisma.user.findUnique({ where: { telegramId }, select: { id: true } })
      if (user) {
        const broadcast = await prisma.broadcast.findFirst({
          where: { tgPollId: pa.poll_id },
          select: { id: true },
        })
        if (broadcast) {
          await prisma.broadcastRecipient.update({
            where: { broadcastId_userId: { broadcastId: broadcast.id, userId: user.id } },
            data: {
              pollOptionIdx: pa.option_ids[0],
              pollVotedAt: new Date(),
            },
          }).catch(() => {})
        }
      }
    } catch (e) {
      logger.warn(`Broadcast poll vote tracking failed: ${e}`)
    }
  } catch (err) {
    logger.warn('Failed to track poll answer:', err)
  }
})

// ── Admin Panel (inline бухгалтерия в боте) ─────────────────
import { registerAdminPanel } from './admin-panel'
registerAdminPanel()

// ── Engine: tariff selection ─────────────────────────────────
bot.callbackQuery(/^engine:tariff:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery()
  const tariffId = ctx.match[1]
  const chatId = String(ctx.from.id)

  try {
    const tariff = await prisma.tariff.findUnique({ where: { id: tariffId } })
    if (!tariff) { await ctx.editMessageText('❌ Тариф не найден'); return }

    const text = `💳 *${tariff.name}*\n\n` +
      `💰 Цена: ${tariff.priceRub} ₽${tariff.priceUsdt ? ` / ${tariff.priceUsdt} USDT` : ''}\n` +
      `📅 Срок: ${tariff.durationDays} дней\n` +
      `${tariff.trafficGb ? `📶 Трафик: ${tariff.trafficGb} ГБ\n` : '📶 Трафик: Безлимит\n'}` +
      `📱 Устройства: ${tariff.deviceLimit}\n\n` +
      `Выберите способ оплаты:`

    const payButtons: any[][] = []

    // YuKassa
    if (config.yukassa.enabled) {
      payButtons.push([{
        text: '💳 Банковская карта',
        callback_data: `engine:pay:YUKASSA:${tariffId}`,
        style: 'success',
      }])
    }

    // CryptoPay
    if (config.cryptopay.enabled) {
      payButtons.push([{
        text: '🪙 Криптовалюта',
        callback_data: `engine:pay:CRYPTOPAY:${tariffId}`,
      }])
    }

    // Balance
    const user = await prisma.user.findUnique({ where: { telegramId: chatId }, select: { balance: true } })
    if (user && Number(user.balance) >= tariff.priceRub) {
      payButtons.push([{
        text: `💰 С баланса (${user.balance} ₽)`,
        callback_data: `engine:pay:BALANCE:${tariffId}`,
      }])
    }

    payButtons.push([{ text: '◀️ Назад к тарифам', callback_data: `engine:back:tariffs` }])

    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: payButtons },
    })
  } catch (err) {
    logger.warn('Tariff selection error:', err)
  }
})

// ── Engine: payment creation ────────────────────────────────
bot.callbackQuery(/^engine:pay:(\w+):(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery()
  const provider = ctx.match[1] as 'YUKASSA' | 'CRYPTOPAY' | 'BALANCE'
  const tariffId = ctx.match[2]
  const chatId = String(ctx.from.id)

  try {
    const user = await prisma.user.findUnique({ where: { telegramId: chatId } })
    if (!user) { await ctx.editMessageText('❌ Пользователь не найден'); return }

    const tariff = await prisma.tariff.findUnique({ where: { id: tariffId } })
    if (!tariff) { await ctx.editMessageText('❌ Тариф не найден'); return }

    if (provider === 'BALANCE') {
      // Pay from balance directly
      try {
        const { balanceService } = await import('../services/balance')
        await balanceService.debit({
          userId: user.id,
          amount: tariff.priceRub,
          type: 'PURCHASE',
          description: `Оплата тарифа: ${tariff.name}`,
        })
        // Create payment record
        const payment = await prisma.payment.create({
          data: {
            userId: user.id,
            tariffId: tariff.id,
            provider: 'BALANCE',
            amount: tariff.priceRub,
            currency: 'RUB',
            status: 'PAID',
            purpose: 'SUBSCRIPTION',
            confirmedAt: new Date(),
          },
        })
        // Confirm payment (activates subscription)
        await paymentService.confirmPayment(payment.id)
        // Go to PAYMENT_SUCCESS block if exists
        const successBlock = await prisma.botBlock.findFirst({ where: { type: 'PAYMENT_SUCCESS', isDraft: false } })
        if (successBlock) {
          await executeBlock(successBlock.id, ctx, user.id, chatId)
        } else {
          await ctx.editMessageText(
            `✅ *Оплата прошла!*\n\nТариф: ${tariff.name}\nПодписка активирована!`,
            { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🏠 Главное меню', callback_data: 'engine:back:start' }]] } }
          )
        }
      } catch (err: any) {
        await ctx.editMessageText('❌ ' + (err.message || 'Ошибка оплаты'))
      }
      return
    }

    // YuKassa or CryptoPay — create payment order
    const result = await paymentService.createOrder({
      user: user as any,
      tariff: tariff as any,
      provider,
    })

    if (result.paymentUrl) {
      await ctx.editMessageText(
        `💳 *Оплата тарифа "${tariff.name}"*\n\n` +
        `Сумма: ${tariff.priceRub} ₽\n\n` +
        `Нажмите кнопку ниже для оплаты:`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '💳 Перейти к оплате', url: result.paymentUrl }],
              [{ text: '✅ Я оплатил', callback_data: `engine:verify:${result.orderId}` }],
              [{ text: '◀️ Отмена', callback_data: `engine:back:tariffs` }],
            ],
          },
        }
      )
    }
  } catch (err) {
    logger.warn('Payment creation error:', err)
    await ctx.editMessageText('❌ Ошибка создания платежа. Попробуйте позже.').catch(() => {})
  }
})

// ── Engine: verify payment ──────────────────────────────────
bot.callbackQuery(/^engine:verify:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery()
  const orderId = ctx.match[1]
  const chatId = String(ctx.from.id)

  try {
    const payment = await prisma.payment.findUnique({ where: { id: orderId } })
    if (!payment) { await ctx.editMessageText('❌ Платёж не найден'); return }

    const goToSuccessBlock = async () => {
      const user = await prisma.user.findUnique({ where: { telegramId: chatId }, select: { id: true } })
      if (!user) return
      // Find PAYMENT_SUCCESS block in engine
      const successBlock = await prisma.botBlock.findFirst({ where: { type: 'PAYMENT_SUCCESS', isDraft: false } })
      if (successBlock) {
        await executeBlock(successBlock.id, ctx, user.id, chatId)
      } else {
        // Fallback if no PAYMENT_SUCCESS block configured
        await ctx.editMessageText(
          '✅ *Оплата подтверждена!*\n\nПодписка активирована.',
          { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🏠 Главное меню', callback_data: 'engine:back:start' }]] } }
        )
      }
    }

    if (payment.status === 'PAID') {
      await goToSuccessBlock()
      return
    }

    // Check with provider
    if (payment.provider === 'YUKASSA' && payment.yukassaPaymentId) {
      const yp = await paymentService.yukassa.getPayment(payment.yukassaPaymentId)
      if (yp.paid || yp.status === 'succeeded') {
        await paymentService.confirmPayment(orderId)
        await goToSuccessBlock()
        return
      }
    }

    await ctx.answerCallbackQuery({ text: '⏳ Платёж ещё не получен. Подождите немного.', show_alert: true })
  } catch (err) {
    logger.warn('Payment verify error:', err)
    await ctx.answerCallbackQuery({ text: '❌ Ошибка проверки', show_alert: true })
  }
})

// ── Engine: back navigation ─────────────────────────────────
bot.callbackQuery(/^engine:back:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery()
  const target = ctx.match[1]
  const chatId = String(ctx.from.id)
  const user = await prisma.user.findUnique({ where: { telegramId: chatId }, select: { id: true } })
  if (!user) return

  try {
    if (target === 'start') {
      const blockId = await findTriggerBlock('command', '/start')
      if (blockId) await executeBlock(blockId, ctx, user.id, chatId)
    } else if (target === 'tariffs') {
      // Find tariff block by name
      const tariffBlock = await prisma.botBlock.findFirst({ where: { name: { contains: 'Тариф' }, type: 'MESSAGE', isDraft: false } })
      if (tariffBlock) await executeBlock(tariffBlock.id, ctx, user.id, chatId)
    }
  } catch { /* ignore */ }
})

bot.callbackQuery(/^blk:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery()
  const buttonId = ctx.match[1]
  const chatId = String(ctx.from.id)

  try {
    trackClick(buttonId).catch(() => {})

    const button = await prisma.botButton.findUnique({ where: { id: buttonId } })
    const user = await prisma.user.findUnique({ where: { telegramId: chatId }, select: { id: true } })

    // Track broadcast button clicks: find recent broadcast recipient and mark click
    if (user) {
      try {
        const recent = await prisma.broadcastRecipient.findFirst({
          where: {
            userId: user.id,
            tgStatus: 'sent',
            tgSentAt: { gte: new Date(Date.now() - 7 * 86400_000) },
            clickedAt: null,
          },
          orderBy: { tgSentAt: 'desc' },
          include: {
            broadcast: { select: { tgButtons: true } },
          },
        })
        if (recent) {
          const btns = Array.isArray(recent.broadcast.tgButtons) ? recent.broadcast.tgButtons as any[] : []
          const clickedBtn = btns.find((b: any) => b && b.botBlockId === buttonId)
          if (clickedBtn) {
            await prisma.broadcastRecipient.update({
              where: { id: recent.id },
              data: {
                clickedButton: clickedBtn.label,
                clickedBlockId: buttonId,
                clickedAt: new Date(),
              },
            }).catch(() => {})
          }
        }
      } catch (e) {
        logger.warn(`Broadcast click tracking failed: ${e}`)
      }
    }

    if (button) {
      // Log incoming callback
      logIncoming(chatId, user?.id ?? null, `Действие: ${button.label}`, `blk:${buttonId}`)

      if (button.nextBlockId && user) {
        await executeBlock(button.nextBlockId, ctx, user.id, chatId)
      }
    } else if (user) {
      // Fallback: `blk:{id}` might reference a BotBlock directly (used by funnel
      // engine when it generates a bot_block button — it puts botBlockId there,
      // not a bot_buttons row id). If there's a matching block, execute it.
      const directBlock = await prisma.botBlock.findUnique({ where: { id: buttonId } })
      if (directBlock) {
        logIncoming(chatId, user.id, `Действие: ${directBlock.name}`, `blk:${buttonId}`)
        await executeBlock(buttonId, ctx, user.id, chatId)
      }
    }
  } catch (err) {
    logger.warn('Bot constructor callback error:', err)
  }
})

// ── Catch-all for unknown callbacks ──────────────────────────
// Old Leadteh-era buttons in chat history (`menu:*`, `ld:*`, `tariff:*`, etc.)
// click here. We route user into a fresh /start flow so they don't feel lost.
bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data || ''
  await ctx.answerCallbackQuery({ text: '🔄 Бот обновился — открываем меню' }).catch(() => {})

  const telegramId = String(ctx.from.id)
  const user = await prisma.user.findUnique({ where: { telegramId } })
  if (!user) {
    // Unknown user — trigger the new_user splash
    const splashBlockId = await findTriggerBlock('event', 'new_user').catch(() => null)
    if (splashBlockId) {
      const created = await prisma.user.create({
        data: { telegramId, telegramName: ctx.from.username || ctx.from.first_name || telegramId },
      })
      await executeBlock(splashBlockId, ctx, created.id, telegramId)
    }
    return
  }

  // Known user — pass through the full /start pipeline (sync + migration banner + routing)
  const startBlockId = await findTriggerBlock('command', '/start').catch(() => null)
  if (startBlockId) {
    try {
      await ctx.reply(
        '🔄 *Бот обновился!*\n\nСтарые кнопки больше не работают — используйте новое меню:',
        { parse_mode: 'Markdown' },
      )
    } catch { /* ignore */ }
    await executeBlock(startBlockId, ctx, user.id, telegramId)
  }

  logger.info(`[legacy-callback] ${telegramId} clicked "${data}" — routed to /start`)
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

// Import admin commands registration and daily report (buhgalteria merge)
import './admin-commands'
import { setupDailyReportCron } from '../services/daily-report'

export async function startBot() {
  if (!config.telegram.configured) {
    logger.warn('Telegram bot token not configured — skipping bot startup')
    // Still setup daily report cron (it will send to channels if configured)
    setupDailyReportCron()
    return
  }

  // Load bot messages from Settings table
  await loadBotSettings()

  // Load bot constructor block cache
  await loadBlockCache().catch(err => logger.warn('Failed to load block cache:', err))

  // Subscribe to Redis cache invalidation from backend API
  subscribeCacheInvalidation()

  // Setup daily financial report cron
  setupDailyReportCron()

  logger.info('Starting Telegram bot...')
  bot.catch((err) => logger.error('Bot error:', err))
  await bot.start({
    onStart: (info) => logger.info(`Bot @${info.username} started`),
  })
}
