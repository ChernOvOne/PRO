import { prisma } from '../db'
import { bot } from '../bot/index'
import { logger } from '../utils/logger'

// ── Helper: start/end of today (Moscow time) ────────────────
function todayRange(): { start: Date; end: Date } {
  const now = new Date()
  const msk = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }))
  const start = new Date(msk)
  start.setHours(0, 0, 0, 0)
  const end = new Date(msk)
  end.setHours(23, 59, 59, 999)
  const offset = msk.getTime() - now.getTime()
  return {
    start: new Date(start.getTime() - offset),
    end: new Date(end.getTime() - offset),
  }
}

// ── Send daily financial report ─────────────────────────────
export async function sendDailyReport(): Promise<void> {
  try {
    // 1. Get all active notification channels
    const channels = await prisma.buhNotificationChannel.findMany({
      where: { isActive: true },
    })

    if (channels.length === 0) {
      logger.info('daily-report: no active notification channels, skipping')
      return
    }

    const { start, end } = todayRange()

    // 2. Today's transactions
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

    // 3. New users today
    const newUsersCount = await prisma.user.count({
      where: { createdAt: { gte: start, lte: end } },
    })

    // 4. Payments today
    const paymentsCount = await prisma.buhWebhookPayment.count({
      where: { createdAt: { gte: start, lte: end } },
    })

    // 5. Server warnings (nextPaymentDate within 3 days)
    const warningDate = new Date()
    warningDate.setDate(warningDate.getDate() + 3)

    const warningServers = await prisma.buhVpnServer.findMany({
      where: {
        isActive: true,
        nextPaymentDate: {
          lte: warningDate,
          gte: new Date(),
        },
      },
      orderBy: { nextPaymentDate: 'asc' },
    })

    // 6. Format message
    const dateStr = new Date().toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })

    let message =
      `📊 *Отчёт за день: ${dateStr}*\n\n` +
      `💰 Доход: ${income.toLocaleString('ru-RU')} ₽\n` +
      `💸 Расход: ${expense.toLocaleString('ru-RU')} ₽\n` +
      `📈 Прибыль: ${profit.toLocaleString('ru-RU')} ₽\n\n` +
      `👥 Новых пользователей: ${newUsersCount}\n` +
      `💳 Платежей: ${paymentsCount}`

    if (warningServers.length > 0) {
      message += '\n\n⚠️ Серверы требуют оплаты:'
      for (const server of warningServers) {
        const payDate = server.nextPaymentDate!
        const daysLeft = Math.max(0, Math.ceil((payDate.getTime() - Date.now()) / 86400_000))
        message += `\n- ${server.name} через ${daysLeft} дн.`
      }
    }

    // 7. Send to each channel
    let sent = 0
    for (const channel of channels) {
      try {
        await bot.api.sendMessage(channel.chatId, message, { parse_mode: 'Markdown' })
        sent++
      } catch (err) {
        logger.error(`daily-report: failed to send to channel ${channel.name} (${channel.chatId}):`, err)
      }
    }

    // 8. Log result
    logger.info(`daily-report: sent to ${sent}/${channels.length} channels`)
  } catch (err) {
    logger.error('daily-report: failed to generate report:', err)
  }
}

// ── Cron-like scheduler: run sendDailyReport at 23:00 MSK ───
export function setupDailyReportCron(): void {
  function scheduleNext() {
    const now = new Date()
    // Calculate next 23:00 Moscow time
    const msk = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }))
    const target = new Date(msk)
    target.setHours(23, 0, 0, 0)

    // If 23:00 already passed today (in Moscow), schedule for tomorrow
    if (msk >= target) {
      target.setDate(target.getDate() + 1)
    }

    // Convert target back to UTC by computing offset
    const offset = msk.getTime() - now.getTime()
    const targetUtc = new Date(target.getTime() - offset)
    const delay = targetUtc.getTime() - Date.now()

    logger.info(`daily-report: next report scheduled in ${Math.round(delay / 60000)} minutes`)

    setTimeout(async () => {
      await sendDailyReport()
      // Schedule the next day
      scheduleNext()
    }, delay)
  }

  scheduleNext()
  logger.info('daily-report: cron scheduler started (23:00 MSK)')
}
