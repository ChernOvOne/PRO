import { bot } from './index'
import { InlineKeyboard, InputFile } from 'grammy'
import type { Context } from 'grammy'
import { prisma } from '../db'
import { logger } from '../utils/logger'
import { generatePdfReport, generateExcelReport } from '../services/report-generator'

// ── Formatting Helpers ──────────────────────────────────────

function fmt(amount: number): string {
  const rounded = Math.round(amount)
  return rounded.toLocaleString('ru-RU').replace(/,/g, ' ') + ' \u20BD'
}

function fmtDate(date: Date): string {
  const months = [
    'янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.',
    'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.',
  ]
  const d = new Date(date)
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

// ── Access Control ──────────────────────────────────────────

async function isStaff(telegramId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { telegramId },
    select: { role: true },
  })
  return !!user && user.role !== 'USER'
}

async function guardStaff(ctx: Context): Promise<boolean> {
  const telegramId = ctx.from?.id?.toString()
  if (!telegramId || !(await isStaff(telegramId))) {
    await ctx.answerCallbackQuery({ text: 'Доступ запрещён' })
    return false
  }
  return true
}

// ── Period Helpers ───────────────────────────────────────────

type Period = 'today' | 'week' | 'month' | 'year'

const periodLabels: Record<Period, string> = {
  today: 'Сегодня',
  week:  'Неделя',
  month: 'Месяц',
  year:  'Год',
}

function periodRange(period: Period): { start: Date; end: Date } {
  const now = new Date()
  const msk = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }))
  const end = new Date(msk)
  end.setHours(23, 59, 59, 999)

  const start = new Date(msk)
  start.setHours(0, 0, 0, 0)

  switch (period) {
    case 'today':
      break
    case 'week':
      start.setDate(start.getDate() - 6)
      break
    case 'month':
      start.setDate(1)
      break
    case 'year':
      start.setMonth(0, 1)
      break
  }

  // Convert back to UTC
  const offset = msk.getTime() - now.getTime()
  return {
    start: new Date(start.getTime() - offset),
    end:   new Date(end.getTime() - offset),
  }
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(1, Math.round(Math.abs(b.getTime() - a.getTime()) / 86_400_000))
}

// ── Keyboard Builders ───────────────────────────────────────

function adminMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('📊 Отчёт за сегодня', 'adm:report:today')
    .text('📊 Отчёт за месяц', 'adm:report:month').row()
    .text('💰 Баланс', 'adm:balance')
    .text('💳 VPN платежи', 'adm:payments').row()
    .text('🏦 Партнёры', 'adm:partners')
    .text('📄 PDF отчёт', 'adm:pdf').row()
    .text('📊 Excel отчёт', 'adm:excel')
    .text('🏠 Главное меню', 'menu:main').row()
}

function backToAdmin(): InlineKeyboard {
  return new InlineKeyboard().text('◀️ В админку', 'adm:menu')
}

function periodSelectorKeyboard(prefix: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('Сегодня', `${prefix}:today`)
    .text('Неделя', `${prefix}:week`).row()
    .text('Месяц', `${prefix}:month`)
    .text('Год', `${prefix}:year`).row()
    .text('🏠 В админку', 'adm:menu')
}

// ── Registration ────────────────────────────────────────────

export function registerAdminPanel(): void {
  // ── Main Admin Menu ─────────────────────────────────────
  bot.callbackQuery('adm:menu', async (ctx) => {
    await ctx.answerCallbackQuery()
    if (!(await guardStaff(ctx))) return

    await ctx.editMessageText(
      '🛠 *Расширенная админ\\-панель*\n\n' +
      'Выберите действие\\.\n' +
      '_Быстрый ввод: отправьте `\\+1000 описание` или `\\-500 описание` для дохода/расхода_',
      { parse_mode: 'MarkdownV2', reply_markup: adminMenuKeyboard() },
    )
  })

  // ── Reports ─────────────────────────────────────────────
  bot.callbackQuery(/^adm:report:(today|week|month|year)$/, async (ctx) => {
    await ctx.answerCallbackQuery()
    if (!(await guardStaff(ctx))) return

    const period = ctx.match![1] as Period
    const label = periodLabels[period]

    try {
      const { start, end } = periodRange(period)
      const days = daysBetween(start, end)

      const transactions = await prisma.buhTransaction.findMany({
        where: { date: { gte: start, lte: end } },
        include: { category: true },
        orderBy: { date: 'desc' },
      })

      let income = 0
      let expense = 0
      const expByCategory = new Map<string, { name: string; amount: number }>()

      for (const t of transactions) {
        const amount = Number(t.amount)
        if (t.type === 'INCOME') {
          income += amount
        } else {
          expense += amount
          const catName = t.category?.name ?? 'Без категории'
          const cur = expByCategory.get(catName) || { name: catName, amount: 0 }
          cur.amount += amount
          expByCategory.set(catName, cur)
        }
      }

      const profit = income - expense
      const avgPerDay = profit / days

      // Top 5 expense categories
      const topExpenses = [...expByCategory.values()]
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5)

      // Recent inkas
      const recentInkas = await prisma.buhInkasRecord.findMany({
        where: { date: { gte: start, lte: end } },
        include: { partner: true },
        orderBy: { date: 'desc' },
        take: 5,
      })

      // Partner debts
      const partners = await prisma.buhPartner.findMany({
        where: { isActive: true },
        include: { inkasRecords: true },
      })

      const partnerDebts = partners
        .map((p) => {
          const totalReturned = p.inkasRecords
            .filter((r) => r.type === 'RETURN_INV')
            .reduce((s, r) => s + Number(r.amount), 0) + p.initialReturned
          const debt = p.initialInvestment - totalReturned
          return { name: p.name, debt }
        })
        .filter((p) => p.debt > 0)

      // Build message
      let text = `📊 *Отчёт: ${label}*\n`
      text += `_${fmtDate(start)} — ${fmtDate(end)}_\n\n`

      text += `💰 Доход: *${fmt(income)}*\n`
      text += `💸 Расход: *${fmt(expense)}*\n`
      text += `📈 Прибыль: *${fmt(profit)}*\n`
      text += `📅 Среднее/день: *${fmt(avgPerDay)}*\n`
      text += `📋 Операций: ${transactions.length}\n`

      if (topExpenses.length > 0) {
        text += `\n🏷 *Топ расходов:*\n`
        for (const cat of topExpenses) {
          const pct = expense > 0 ? ((cat.amount / expense) * 100).toFixed(1) : '0'
          text += `  • ${cat.name}: ${fmt(cat.amount)} (${pct}%)\n`
        }
      }

      if (recentInkas.length > 0) {
        text += `\n🏦 *Последние выплаты:*\n`
        for (const r of recentInkas) {
          const typeLabel = r.type === 'DIVIDEND' ? 'Дивиденды' :
            r.type === 'RETURN_INV' ? 'Возврат' : 'Инвестиция'
          text += `  • ${r.partner.name}: ${fmt(Number(r.amount))} (${typeLabel})\n`
        }
      }

      if (partnerDebts.length > 0) {
        text += `\n💳 *Долги партнёрам:*\n`
        for (const p of partnerDebts) {
          text += `  • ${p.name}: ${fmt(p.debt)}\n`
        }
      }

      await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        reply_markup: backToAdmin(),
      })
    } catch (err) {
      logger.error('adm:report error:', err)
      await ctx.editMessageText('❌ Ошибка при формировании отчёта.', {
        reply_markup: backToAdmin(),
      })
    }
  })

  // ── Balance ─────────────────────────────────────────────
  bot.callbackQuery('adm:balance', async (ctx) => {
    await ctx.answerCallbackQuery()
    if (!(await guardStaff(ctx))) return

    try {
      // Starting balance from Settings
      const startBalSetting = await prisma.setting.findUnique({
        where: { key: 'starting_balance' },
      })
      const startingBalance = startBalSetting ? parseFloat(startBalSetting.value) : 0

      // All transactions
      const allTx = await prisma.buhTransaction.findMany({
        select: { type: true, amount: true },
      })
      let totalIncome = 0
      let totalExpense = 0
      for (const t of allTx) {
        const amount = Number(t.amount)
        if (t.type === 'INCOME') totalIncome += amount
        else totalExpense += amount
      }

      // All inkas (DIVIDEND + RETURN_INV)
      const allInkas = await prisma.buhInkasRecord.findMany({
        where: { type: { in: ['DIVIDEND', 'RETURN_INV'] } },
        select: { amount: true },
      })
      const totalInkas = allInkas.reduce((s, r) => s + Number(r.amount), 0)

      const balance = startingBalance + totalIncome - totalExpense - totalInkas

      let text = `💰 *Баланс компании*\n\n`
      text += `🏦 Начальный баланс: ${fmt(startingBalance)}\n`
      text += `📈 Всего доходов: ${fmt(totalIncome)}\n`
      text += `📉 Всего расходов: ${fmt(totalExpense)}\n`
      text += `🏦 Выплаты (инкасс): ${fmt(totalInkas)}\n`
      text += `\n💎 *Текущий баланс: ${fmt(balance)}*`

      await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        reply_markup: backToAdmin(),
      })
    } catch (err) {
      logger.error('adm:balance error:', err)
      await ctx.editMessageText('❌ Ошибка при расчёте баланса.', {
        reply_markup: backToAdmin(),
      })
    }
  })

  // ── VPN Payments ────────────────────────────────────────
  bot.callbackQuery('adm:payments', async (ctx) => {
    await ctx.answerCallbackQuery()
    if (!(await guardStaff(ctx))) return

    try {
      const now = new Date()
      const msk = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }))
      const todayStart = new Date(msk)
      todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date(msk)
      todayEnd.setHours(23, 59, 59, 999)
      const offset = msk.getTime() - now.getTime()
      const utcStart = new Date(todayStart.getTime() - offset)
      const utcEnd = new Date(todayEnd.getTime() - offset)

      // Today's payments (PAID)
      const todayPayments = await prisma.payment.findMany({
        where: {
          status: 'PAID',
          confirmedAt: { gte: utcStart, lte: utcEnd },
        },
      })
      const todayCount = todayPayments.length
      const todayAmount = todayPayments.reduce((s, p) => s + p.amount, 0)

      // Active subscriptions
      const activeCount = await prisma.user.count({
        where: { subStatus: 'ACTIVE' },
      })

      // Expiring in 3 days
      const threeDaysLater = new Date(now.getTime() + 3 * 86_400_000)
      const expiringCount = await prisma.user.count({
        where: {
          subStatus: 'ACTIVE',
          subExpireAt: { lte: threeDaysLater, gte: now },
        },
      })

      // Breakdown by tariff (last 30 days)
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000)
      const recentPayments = await prisma.payment.findMany({
        where: {
          status: 'PAID',
          confirmedAt: { gte: thirtyDaysAgo },
        },
        include: { tariff: true },
      })

      const byTariff = new Map<string, { name: string; count: number; amount: number }>()
      for (const p of recentPayments) {
        const name = p.tariff?.name ?? 'Неизвестный'
        const cur = byTariff.get(name) || { name, count: 0, amount: 0 }
        cur.count++
        cur.amount += p.amount
        byTariff.set(name, cur)
      }

      let text = `💳 *VPN платежи*\n\n`
      text += `📅 *Сегодня:*\n`
      text += `  Платежей: ${todayCount}\n`
      text += `  Сумма: ${fmt(todayAmount)}\n\n`
      text += `✅ Активных подписок: *${activeCount}*\n`
      text += `⏳ Истекают в 3 дня: *${expiringCount}*\n`

      if (byTariff.size > 0) {
        text += `\n📊 *По тарифам (30 дней):*\n`
        const sorted = [...byTariff.values()].sort((a, b) => b.amount - a.amount)
        for (const t of sorted) {
          text += `  • ${t.name}: ${t.count} шт, ${fmt(t.amount)}\n`
        }
      }

      await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        reply_markup: backToAdmin(),
      })
    } catch (err) {
      logger.error('adm:payments error:', err)
      await ctx.editMessageText('❌ Ошибка при получении платежей.', {
        reply_markup: backToAdmin(),
      })
    }
  })

  // ── Partners List ───────────────────────────────────────
  bot.callbackQuery('adm:partners', async (ctx) => {
    await ctx.answerCallbackQuery()
    if (!(await guardStaff(ctx))) return

    try {
      const partners = await prisma.buhPartner.findMany({
        where: { isActive: true },
        include: { inkasRecords: true },
        orderBy: { name: 'asc' },
      })

      if (partners.length === 0) {
        await ctx.editMessageText('🏦 Активных партнёров нет.', {
          reply_markup: backToAdmin(),
        })
        return
      }

      let text = `🏦 *Партнёры*\n\n`

      const kb = new InlineKeyboard()

      for (const p of partners) {
        const totalReturned = p.inkasRecords
          .filter((r) => r.type === 'RETURN_INV')
          .reduce((s, r) => s + Number(r.amount), 0) + p.initialReturned
        const debt = p.initialInvestment - totalReturned
        const status = debt > 0 ? `🔴 долг ${fmt(debt)}` : '🟢 выплачено'

        text += `• *${p.name}* (${p.roleLabel}) — ${status}\n`
        kb.text(`${p.name}`, `adm:partner:${p.id}`).row()
      }

      kb.text('◀️ В админку', 'adm:menu')

      await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        reply_markup: kb,
      })
    } catch (err) {
      logger.error('adm:partners error:', err)
      await ctx.editMessageText('❌ Ошибка при получении партнёров.', {
        reply_markup: backToAdmin(),
      })
    }
  })

  // ── Partner Detail ──────────────────────────────────────
  bot.callbackQuery(/^adm:partner:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery()
    if (!(await guardStaff(ctx))) return

    const partnerId = ctx.match![1]

    try {
      const partner = await prisma.buhPartner.findUnique({
        where: { id: partnerId },
        include: {
          inkasRecords: {
            orderBy: { date: 'desc' },
          },
        },
      })

      if (!partner) {
        await ctx.editMessageText('❌ Партнёр не найден.', {
          reply_markup: new InlineKeyboard().text('◀️ К партнёрам', 'adm:partners'),
        })
        return
      }

      // Summaries
      const totalDividends = partner.inkasRecords
        .filter((r) => r.type === 'DIVIDEND')
        .reduce((s, r) => s + Number(r.amount), 0) + partner.initialDividends

      const totalReturned = partner.inkasRecords
        .filter((r) => r.type === 'RETURN_INV')
        .reduce((s, r) => s + Number(r.amount), 0) + partner.initialReturned

      const totalInvested = partner.inkasRecords
        .filter((r) => r.type === 'INVESTMENT')
        .reduce((s, r) => s + Number(r.amount), 0) + partner.initialInvestment

      const remainingDebt = totalInvested - totalReturned

      let text = `🏦 *${partner.name}*\n`
      text += `Роль: ${partner.roleLabel}\n`
      if (partner.tgUsername) text += `Telegram: @${partner.tgUsername}\n`
      if (partner.sharePercent) text += `Доля: ${partner.sharePercent}%\n`
      text += `\n`

      text += `📊 *Сводка:*\n`
      text += `  💼 Инвестиции: ${fmt(totalInvested)}\n`
      text += `  💰 Дивиденды: ${fmt(totalDividends)}\n`
      text += `  🔄 Возвращено: ${fmt(totalReturned)}\n`
      text += `  💳 Остаток долга: *${fmt(remainingDebt)}*\n`

      // Recent 5 inkas
      const recent = partner.inkasRecords.slice(0, 5)
      if (recent.length > 0) {
        text += `\n📋 *Последние операции:*\n`
        for (const r of recent) {
          const typeLabel = r.type === 'DIVIDEND' ? '💰 Дивиденды' :
            r.type === 'RETURN_INV' ? '🔄 Возврат' : '💼 Инвестиция'
          text += `  ${typeLabel}: ${fmt(Number(r.amount))} (${fmtDate(r.date)})\n`
        }
      }

      if (partner.notes) {
        text += `\n📝 _${partner.notes}_`
      }

      const kb = new InlineKeyboard()
        .text('◀️ К партнёрам', 'adm:partners').row()
        .text('🏠 В админку', 'adm:menu')

      await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        reply_markup: kb,
      })
    } catch (err) {
      logger.error('adm:partner detail error:', err)
      await ctx.editMessageText('❌ Ошибка при получении данных партнёра.', {
        reply_markup: new InlineKeyboard().text('◀️ К партнёрам', 'adm:partners'),
      })
    }
  })

  // ── PDF Period Selector ─────────────────────────────────
  bot.callbackQuery('adm:pdf', async (ctx) => {
    await ctx.answerCallbackQuery()
    if (!(await guardStaff(ctx))) return

    await ctx.editMessageText('📄 *PDF отчёт*\n\nВыберите период:', {
      parse_mode: 'Markdown',
      reply_markup: periodSelectorKeyboard('adm:pdf'),
    })
  })

  // ── PDF Generation ──────────────────────────────────────
  bot.callbackQuery(/^adm:pdf:(today|week|month|year)$/, async (ctx) => {
    await ctx.answerCallbackQuery()
    if (!(await guardStaff(ctx))) return

    const period = ctx.match![1] as Period
    const label = periodLabels[period]

    try {
      await ctx.editMessageText(`⏳ Генерирую PDF отчёт за "${label}"...`)

      const { start, end } = periodRange(period)
      const html = await generatePdfReport(start, end)

      const fileName = `report_${period}_${new Date().toISOString().slice(0, 10)}.html`
      const buf = Buffer.from(html, 'utf-8')

      await bot.api.sendDocument(
        ctx.chat!.id,
        new InputFile(buf, fileName),
        { caption: `📄 Финансовый отчёт: ${label}` },
      )

      await ctx.editMessageText(`✅ PDF отчёт за "${label}" отправлен.`, {
        reply_markup: backToAdmin(),
      })
    } catch (err) {
      logger.error('adm:pdf generation error:', err)
      await ctx.editMessageText('❌ Ошибка при генерации PDF отчёта.', {
        reply_markup: backToAdmin(),
      })
    }
  })

  // ── Excel Period Selector ───────────────────────────────
  bot.callbackQuery('adm:excel', async (ctx) => {
    await ctx.answerCallbackQuery()
    if (!(await guardStaff(ctx))) return

    await ctx.editMessageText('📊 *Excel отчёт*\n\nВыберите период:', {
      parse_mode: 'Markdown',
      reply_markup: periodSelectorKeyboard('adm:excel'),
    })
  })

  // ── Excel Generation ────────────────────────────────────
  bot.callbackQuery(/^adm:excel:(today|week|month|year)$/, async (ctx) => {
    await ctx.answerCallbackQuery()
    if (!(await guardStaff(ctx))) return

    const period = ctx.match![1] as Period
    const label = periodLabels[period]

    try {
      await ctx.editMessageText(`⏳ Генерирую Excel отчёт за "${label}"...`)

      const { start, end } = periodRange(period)
      const csv = await generateExcelReport(start, end)

      const fileName = `report_${period}_${new Date().toISOString().slice(0, 10)}.csv`
      const buf = Buffer.from(csv, 'utf-8')

      await bot.api.sendDocument(
        ctx.chat!.id,
        new InputFile(buf, fileName),
        { caption: `📊 Excel отчёт: ${label}` },
      )

      await ctx.editMessageText(`✅ Excel отчёт за "${label}" отправлен.`, {
        reply_markup: backToAdmin(),
      })
    } catch (err) {
      logger.error('adm:excel generation error:', err)
      await ctx.editMessageText('❌ Ошибка при генерации Excel отчёта.', {
        reply_markup: backToAdmin(),
      })
    }
  })

  logger.info('[admin-panel] Registered all adm: callback handlers')
}
