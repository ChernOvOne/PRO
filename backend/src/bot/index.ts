import { Bot, InlineKeyboard, webhookCallback } from 'grammy'
import { config }       from '../config'
import { logger }       from '../utils/logger'
import { prisma }       from '../db'
import { remnawave }    from '../services/remnawave'

export const bot = new Bot(config.telegram.botToken)

// ── Commands ───────────────────────────────────────────────────

bot.command('start', async (ctx) => {
  const telegramId = String(ctx.from?.id)
  const args       = ctx.match   // ref code from /start ref_CODE

  // Handle referral
  if (args && args.startsWith('ref_')) {
    const refCode = args.replace('ref_', '')
    const user    = await prisma.user.findUnique({ where: { telegramId } })
    if (!user?.referredById) {
      const referrer = await prisma.user.findUnique({
        where:  { referralCode: refCode },
        select: { id: true },
      })
      if (referrer) {
        await prisma.user.upsert({
          where:  { telegramId },
          create: { telegramId, referredById: referrer.id },
          update: { referredById: referrer.id },
        })
      }
    }
  }

  // Find user's subscription
  const user = await prisma.user.findUnique({ where: { telegramId } })

  const keyboard = new InlineKeyboard()
    .webApp('🚀 Открыть кабинет', `${config.appUrl}/dashboard`)
    .row()
    .url('🌍 Наш сайт', config.appUrl)

  const greeting = user?.subStatus === 'ACTIVE'
    ? `✅ *Подписка активна*\n\nОткрой личный кабинет для управления.`
    : `👋 Привет! Я бот сервиса *HIDEYOU VPN*.\n\nДля подключения к VPN оформи подписку в личном кабинете.`

  await ctx.reply(greeting, {
    parse_mode:   'Markdown',
    reply_markup: keyboard,
  })
})

bot.command('status', async (ctx) => {
  const telegramId = String(ctx.from?.id)
  const user = await prisma.user.findUnique({ where: { telegramId } })

  if (!user?.remnawaveUuid) {
    return ctx.reply('❌ Подписка не найдена. Перейди в личный кабинет для оформления.')
  }

  try {
    const rmUser = await remnawave.getUserByUuid(user.remnawaveUuid)
    const expireAt = rmUser.expireAt ? new Date(rmUser.expireAt) : null
    const days = expireAt
      ? Math.max(0, Math.ceil((expireAt.getTime() - Date.now()) / 86400_000))
      : null

    const usedGb  = (rmUser.usedTrafficBytes / 1e9).toFixed(2)
    const limitGb = rmUser.trafficLimitBytes
      ? `/ ${(rmUser.trafficLimitBytes / 1e9).toFixed(0)} ГБ`
      : '(безлимит)'

    await ctx.reply(
      `📊 *Статус подписки*\n\n` +
      `Статус: ${rmUser.status === 'ACTIVE' ? '✅ Активна' : '❌ ' + rmUser.status}\n` +
      `Истекает: ${expireAt ? expireAt.toLocaleDateString('ru') : '—'}\n` +
      `Осталось: ${days !== null ? `${days} дней` : '—'}\n` +
      `Трафик: ${usedGb} ГБ ${limitGb}`,
      { parse_mode: 'Markdown' },
    )
  } catch {
    ctx.reply('⚠️ Не удалось получить данные. Попробуйте позже.')
  }
})

bot.command('sub', async (ctx) => {
  const telegramId = String(ctx.from?.id)
  const user = await prisma.user.findUnique({ where: { telegramId } })

  if (!user?.subLink) {
    return ctx.reply(
      '❌ У тебя нет активной подписки.',
      {
        reply_markup: new InlineKeyboard()
          .webApp('💳 Купить подписку', `${config.appUrl}/dashboard/plans`),
      },
    )
  }

  await ctx.reply(
    `🔗 *Твоя ссылка-подписка:*\n\n\`${user.subLink}\`\n\n` +
    `Скопируй и вставь в приложение или открой инструкцию в кабинете.`,
    {
      parse_mode:   'Markdown',
      reply_markup: new InlineKeyboard()
        .webApp('📱 Открыть кабинет', `${config.appUrl}/dashboard`),
    },
  )
})

bot.command('ref', async (ctx) => {
  const telegramId = String(ctx.from?.id)
  const user = await prisma.user.findUnique({
    where:  { telegramId },
    select: { referralCode: true, _count: { select: { referrals: true } } },
  })

  if (!user) return ctx.reply('Сначала зарегистрируйся на сайте.')

  const refUrl = `${config.appUrl}?ref=${user.referralCode}`
  const botUrl = `https://t.me/${config.telegram.botName}?start=ref_${user.referralCode}`

  await ctx.reply(
    `🎁 *Реферальная программа*\n\n` +
    `За каждого друга, который оплатит подписку — ты получаешь *${config.referral.bonusDays} дней бесплатно*.\n\n` +
    `Твоя ссылка:\n\`${refUrl}\`\n\n` +
    `Через бот:\n\`${botUrl}\`\n\n` +
    `Приглашено: ${user._count.referrals} чел.`,
    { parse_mode: 'Markdown' },
  )
})

bot.command('help', async (ctx) => {
  await ctx.reply(
    `🛡️ *HIDEYOU VPN*\n\n` +
    `Команды:\n` +
    `/status — статус подписки\n` +
    `/sub — ссылка-подписка\n` +
    `/ref — реферальная программа\n` +
    `/help — эта справка`,
    { parse_mode: 'Markdown' },
  )
})

// ── Notification helpers ────────────────────────────────────────

export async function notifyPaymentSuccess(telegramId: string, tariffName: string, daysAdded: number) {
  try {
    await bot.api.sendMessage(
      telegramId,
      `✅ *Оплата прошла!*\n\n` +
      `Тариф: ${tariffName}\n` +
      `Добавлено дней: +${daysAdded}\n\n` +
      `Подписка активирована. Используй /sub для получения ссылки.`,
      {
        parse_mode:   'Markdown',
        reply_markup: new InlineKeyboard()
          .webApp('📱 Личный кабинет', `${config.appUrl}/dashboard`),
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
      `⚠️ *Подписка истекает через ${daysLeft} дней*\n\nПродли сейчас чтобы не потерять доступ.`,
      {
        parse_mode:   'Markdown',
        reply_markup: new InlineKeyboard()
          .webApp('💳 Продлить', `${config.appUrl}/dashboard/plans`),
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
      { parse_mode: 'Markdown' },
    )
  } catch (err) {
    logger.warn(`Cannot notify referral ${telegramId}:`, err)
  }
}

// ── Bot startup ─────────────────────────────────────────────────

export async function startBot() {
  logger.info('Starting Telegram bot...')
  bot.catch((err) => logger.error('Bot error:', err))
  await bot.start({
    onStart: (info) => logger.info(`Bot @${info.username} started`),
  })
}
