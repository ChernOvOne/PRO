import { bot } from './index'
import { InlineKeyboard } from 'grammy'
import { Context } from 'grammy'
import Redis from 'ioredis'
import { prisma } from '../db'
import { config } from '../config'
import { logger } from '../utils/logger'

// ── Redis for admin state management ────────────────────────
const redis = new Redis(config.redis.url)

// ── Helper: start/end of today (Moscow time) ────────────────
function todayRange(): { start: Date; end: Date } {
  const now = new Date()
  // Moscow is UTC+3
  const msk = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }))
  const start = new Date(msk)
  start.setHours(0, 0, 0, 0)
  const end = new Date(msk)
  end.setHours(23, 59, 59, 999)
  // Convert back to UTC
  const offset = msk.getTime() - now.getTime()
  return {
    start: new Date(start.getTime() - offset),
    end: new Date(end.getTime() - offset),
  }
}

// ── Admin panel keyboard ────────────────────────────────────
function adminPanelKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('📊 Статистика за сегодня', 'admin:stats_today').row()
    .text('💰 Добавить доход', 'admin:add_income')
    .text('💸 Добавить расход', 'admin:add_expense').row()
    .text('📋 Последние транзакции', 'admin:recent').row()
    .text('🔙 Главное меню', 'menu:main')
}

function backToAdmin(): InlineKeyboard {
  return new InlineKeyboard().text('◀️ Назад', 'menu:admin_panel')
}

// ── Check admin access ──────────────────────────────────────
async function isAdmin(telegramId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { telegramId },
    select: { role: true },
  })
  return !!user && user.role !== 'USER'
}

// ── Admin panel menu ────────────────────────────────────────
bot.callbackQuery('menu:admin_panel', async (ctx) => {
  await ctx.answerCallbackQuery()
  const telegramId = ctx.from.id.toString()

  if (!(await isAdmin(telegramId))) {
    await ctx.answerCallbackQuery({ text: 'Доступ запрещён' })
    return
  }

  await ctx.editMessageText(
    '🛠 *Админ-панель*\n\nВыберите действие:',
    { parse_mode: 'Markdown', reply_markup: adminPanelKeyboard() },
  )
})

// ── Stats today ─────────────────────────────────────────────
bot.callbackQuery('admin:stats_today', async (ctx) => {
  await ctx.answerCallbackQuery()
  const telegramId = ctx.from.id.toString()

  if (!(await isAdmin(telegramId))) {
    await ctx.answerCallbackQuery({ text: 'Доступ запрещён' })
    return
  }

  try {
    const { start, end } = todayRange()

    const transactions = await prisma.buhTransaction.findMany({
      where: { date: { gte: start, lte: end } },
    })

    let income = 0
    let expense = 0
    for (const t of transactions) {
      const amount = Number(t.amount)
      if (t.type === 'INCOME') income += amount
      else expense += amount
    }
    const profit = income - expense

    const newUsers = await prisma.user.count({
      where: { createdAt: { gte: start, lte: end } },
    })

    const dateStr = new Date().toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })

    const text =
      `📊 *Статистика за ${dateStr}*\n\n` +
      `💰 Доход: ${income.toLocaleString('ru-RU')} ₽\n` +
      `💸 Расход: ${expense.toLocaleString('ru-RU')} ₽\n` +
      `📈 Прибыль: ${profit.toLocaleString('ru-RU')} ₽\n\n` +
      `👥 Новых пользователей: ${newUsers}`

    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: backToAdmin(),
    })
  } catch (err) {
    logger.error('admin:stats_today error:', err)
    await ctx.editMessageText('❌ Ошибка при получении статистики.', {
      reply_markup: backToAdmin(),
    })
  }
})

// ── Add income ──────────────────────────────────────────────
bot.callbackQuery('admin:add_income', async (ctx) => {
  await ctx.answerCallbackQuery()
  const telegramId = ctx.from.id.toString()

  if (!(await isAdmin(telegramId))) {
    await ctx.answerCallbackQuery({ text: 'Доступ запрещён' })
    return
  }

  await redis.set(`bot:state:${ctx.from.id}`, 'awaiting_income_amount', 'EX', 300)

  await ctx.editMessageText(
    '💰 *Добавить доход*\n\nВведите сумму и описание через пробел.\nНапример: `5000 Оплата рекламы`',
    { parse_mode: 'Markdown', reply_markup: backToAdmin() },
  )
})

// ── Add expense ─────────────────────────────────────────────
bot.callbackQuery('admin:add_expense', async (ctx) => {
  await ctx.answerCallbackQuery()
  const telegramId = ctx.from.id.toString()

  if (!(await isAdmin(telegramId))) {
    await ctx.answerCallbackQuery({ text: 'Доступ запрещён' })
    return
  }

  await redis.set(`bot:state:${ctx.from.id}`, 'awaiting_expense_amount', 'EX', 300)

  await ctx.editMessageText(
    '💸 *Добавить расход*\n\nВведите сумму и описание через пробел.\nНапример: `5000 Оплата рекламы`',
    { parse_mode: 'Markdown', reply_markup: backToAdmin() },
  )
})

// ── Recent transactions ─────────────────────────────────────
bot.callbackQuery('admin:recent', async (ctx) => {
  await ctx.answerCallbackQuery()
  const telegramId = ctx.from.id.toString()

  if (!(await isAdmin(telegramId))) {
    await ctx.answerCallbackQuery({ text: 'Доступ запрещён' })
    return
  }

  try {
    const transactions = await prisma.buhTransaction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { category: true },
    })

    if (transactions.length === 0) {
      await ctx.editMessageText('📋 Транзакций пока нет.', {
        reply_markup: backToAdmin(),
      })
      return
    }

    const lines = transactions.map((t) => {
      const emoji = t.type === 'INCOME' ? '📈' : '📉'
      const amount = Number(t.amount).toLocaleString('ru-RU')
      const desc = t.description || '—'
      const date = t.date.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })
      return `${emoji} ${amount} ₽ — ${desc} (${date})`
    })

    const text = `📋 *Последние транзакции:*\n\n${lines.join('\n')}`

    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: backToAdmin(),
    })
  } catch (err) {
    logger.error('admin:recent error:', err)
    await ctx.editMessageText('❌ Ошибка при получении транзакций.', {
      reply_markup: backToAdmin(),
    })
  }
})

// ── Text input handler for admin flows ──────────────────────
export async function handleAdminTextInput(ctx: Context): Promise<boolean> {
  if (!ctx.from || !ctx.message?.text) return false

  const chatId = String(ctx.from.id)
  const state = await redis.get(`bot:state:${chatId}`)

  if (state !== 'awaiting_income_amount' && state !== 'awaiting_expense_amount') {
    return false
  }

  const isIncome = state === 'awaiting_income_amount'
  const type = isIncome ? 'INCOME' : 'EXPENSE'
  const input = ctx.message.text.trim()

  // Parse "amount description"
  const spaceIdx = input.indexOf(' ')
  const amountStr = spaceIdx > 0 ? input.substring(0, spaceIdx) : input
  const description = spaceIdx > 0 ? input.substring(spaceIdx + 1).trim() : ''

  const amount = parseFloat(amountStr.replace(',', '.'))

  if (isNaN(amount) || amount <= 0) {
    await ctx.reply(
      '❌ Некорректная сумма. Введите число и описание через пробел.\nНапример: `5000 Оплата рекламы`',
      { parse_mode: 'Markdown', reply_markup: backToAdmin() },
    )
    return true
  }

  try {
    // Find user for createdById
    const user = await prisma.user.findUnique({
      where: { telegramId: chatId },
      select: { id: true },
    })

    await prisma.buhTransaction.create({
      data: {
        type: type as any,
        amount,
        date: new Date(),
        description: description || undefined,
        createdById: user?.id ?? undefined,
      },
    })

    await redis.del(`bot:state:${chatId}`)

    const emoji = isIncome ? '💰' : '💸'
    const label = isIncome ? 'Доход' : 'Расход'
    const descLine = description ? `\nОписание: ${description}` : ''

    await ctx.reply(
      `✅ ${emoji} ${label} добавлен!\n\nСумма: ${amount.toLocaleString('ru-RU')} ₽${descLine}`,
      { reply_markup: backToAdmin() },
    )
  } catch (err) {
    logger.error('handleAdminTextInput error:', err)
    await redis.del(`bot:state:${chatId}`)
    await ctx.reply('❌ Ошибка при создании транзакции.', {
      reply_markup: backToAdmin(),
    })
  }

  return true
}
