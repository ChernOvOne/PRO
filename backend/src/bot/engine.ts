import { InlineKeyboard, Context } from 'grammy'
import Redis from 'ioredis'
import { prisma } from '../db'
import { config } from '../config'
import { logger } from '../utils/logger'
import { bot } from './index'
import { getUserState, setUserState, clearUserState, scheduleBlock, setLastMessageId, getLastMessageId } from './state'
import { createTrialForUser } from './trial'
import { remnawave } from '../services/remnawave'
import { balanceService } from '../services/balance'

const redis = new Redis(config.redis.url)

// ══════════════════════════════════════════════════════════════
// 1. Block Cache (in-memory with 60s TTL)
// ══════════════════════════════════════════════════════════════

let blockCache: Map<string, any> | null = null
let cacheTime = 0
const CACHE_TTL_MS = 300_000 // 5 min (invalidated by Redis pub/sub on publish)

export async function loadBlockCache(): Promise<void> {
  const now = Date.now()
  if (blockCache && now - cacheTime < CACHE_TTL_MS) return

  const blocks = await prisma.botBlock.findMany({
    where: { isDraft: false },
    include: {
      buttons: { orderBy: [{ row: 'asc' }, { col: 'asc' }, { sortOrder: 'asc' }] },
      triggers: true,
    },
  })

  blockCache = new Map()
  for (const b of blocks) {
    blockCache.set(b.id, b)
  }
  cacheTime = now
  logger.debug(`Block cache loaded: ${blocks.length} published blocks`)
}

export function invalidateBlockCache(): void {
  blockCache = null
  cacheTime = 0
}

/**
 * Subscribe to Redis pub/sub for cache invalidation signals
 * from the backend API container. Call this once at bot startup.
 */
export function subscribeCacheInvalidation(): void {
  try {
    const sub = new Redis(config.redis.url)
    sub.subscribe('bot:cache:invalidate', (err) => {
      if (err) {
        logger.error('Failed to subscribe to bot:cache:invalidate:', err)
        return
      }
      logger.info('Subscribed to bot:cache:invalidate channel')
    })
    sub.on('message', (_channel: string, _message: string) => {
      logger.info('Received cache invalidation signal — reloading block cache')
      invalidateBlockCache()
      // Eagerly reload cache in background
      loadBlockCache().catch(err => logger.warn('Failed to reload block cache:', err))
    })
  } catch (err) {
    logger.warn('Could not set up Redis cache invalidation subscriber:', err)
  }
}

async function getBlock(blockId: string): Promise<any | null> {
  await loadBlockCache()
  return blockCache?.get(blockId) ?? null
}

// ══════════════════════════════════════════════════════════════
// 2. Variable Substitution
// ══════════════════════════════════════════════════════════════

export async function resolveVariables(text: string, userId: string): Promise<string> {
  if (!text || !text.includes('{')) return text

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      referrals: { select: { id: true } },
    },
  })
  if (!user) return text

  // Try to get REMNAWAVE data if user has subscription
  let rmData: {
    status?: string
    expireAt?: string | null
    usedTrafficBytes?: number
    trafficLimitBytes?: number | null
    daysLeft?: number | null
    trafficUsedPercent?: number | null
  } | null = null

  if (user.remnawaveUuid && text.match(/\{(trafficUsed|trafficLimit|trafficPercent|deviceCount|deviceLimit|daysLeft|subStatus|subExpireDate)\}/)) {
    try {
      rmData = await remnawave.syncUserSubscription(user.remnawaveUuid)
    } catch {
      // fall back to DB fields
    }
  }

  // Device info from REMNAWAVE
  let deviceCount = 0
  let deviceLimit = 0
  if (user.remnawaveUuid && text.match(/\{device(Count|Limit)\}/)) {
    try {
      const devInfo = await remnawave.getDevices(user.remnawaveUuid)
      deviceCount = devInfo.total ?? 0
      const rmUser = await remnawave.getUserByUuid(user.remnawaveUuid)
      deviceLimit = rmUser.hwidDeviceLimit ?? 0
    } catch { /* use defaults */ }
  }

  // Referral counts
  const referralCount = user.referrals?.length ?? 0
  let referralPaidCount = 0
  if (text.includes('{referralPaidCount}')) {
    try {
      referralPaidCount = await prisma.user.count({
        where: {
          referredById: user.id,
          subStatus: { not: 'INACTIVE' },
        },
      })
    } catch { /* default 0 */ }
  }

  // User custom variables
  const customVarMatch = text.match(/\{user:(\w+)\}/g)
  const customVars: Record<string, string> = {}
  if (customVarMatch) {
    const keys = customVarMatch.map(m => m.replace('{user:', '').replace('}', ''))
    const vars = await prisma.userVariable.findMany({
      where: { userId, key: { in: keys } },
    })
    for (const v of vars) customVars[v.key] = v.value
  }

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 MB'
    const gb = bytes / (1024 * 1024 * 1024)
    if (gb >= 1) return `${gb.toFixed(1)} GB`
    return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
  }

  const formatDate = (d: Date | string | null): string => {
    if (!d) return '—'
    const date = typeof d === 'string' ? new Date(d) : d
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const daysLeft = rmData?.daysLeft
    ?? (user.subExpireAt
      ? Math.max(0, Math.ceil((new Date(user.subExpireAt).getTime() - Date.now()) / 86_400_000))
      : 0)

  const subStatus = rmData?.status ?? user.subStatus ?? 'INACTIVE'
  const expireDate = rmData?.expireAt ?? user.subExpireAt

  const referralUrl = `https://t.me/${config.telegram.botName}?start=ref_${user.referralCode}`

  const replacements: Record<string, string> = {
    '{name}':             user.telegramName || user.email || '—',
    '{email}':            user.email || '—',
    '{telegramName}':     user.telegramName || '—',
    '{telegramId}':       user.telegramId || '—',
    '{balance}':          user.balance.toString(),
    '{bonusDays}':        String(user.bonusDays ?? 0),
    '{subStatus}':        subStatus,
    '{subExpireDate}':    formatDate(expireDate),
    '{daysLeft}':         String(daysLeft),
    '{trafficUsed}':      formatBytes(rmData?.usedTrafficBytes ?? 0),
    '{trafficLimit}':     rmData?.trafficLimitBytes ? formatBytes(rmData.trafficLimitBytes) : '∞',
    '{trafficPercent}':   String(rmData?.trafficUsedPercent ?? 0),
    '{deviceCount}':      String(deviceCount),
    '{deviceLimit}':      String(deviceLimit),
    '{referralCode}':     user.referralCode,
    '{referralUrl}':      referralUrl,
    '{referralCount}':    String(referralCount),
    '{referralPaidCount}': String(referralPaidCount),
    '{appUrl}':           config.appUrl,
    '{admin_button}':     '', // handled separately — generates admin webapp button for staff
  }

  // Dynamic: tariff list from DB
  if (text.includes('{tariffs}')) {
    try {
      const tariffs = await prisma.tariff.findMany({
        where: { isActive: true, type: 'SUBSCRIPTION', isTrial: false },
        orderBy: [{ sortOrder: 'asc' }, { priceRub: 'asc' }],
      })
      const tariffLines = tariffs.map(t => {
        const price = `${t.priceRub} ₽`
        const days = t.durationDays > 0 ? `${t.durationDays} дн.` : ''
        const traffic = t.trafficGb ? `${t.trafficGb} ГБ` : '∞'
        const devices = t.deviceLimit > 0 ? `${t.deviceLimit} устр.` : ''
        return `▫️ *${t.name}* — ${price}${days ? ' / ' + days : ''}${traffic !== '∞' ? ' / ' + traffic : ''}${devices ? ' / ' + devices : ''}`
      })
      replacements['{tariffs}'] = tariffLines.length > 0 ? tariffLines.join('\n') : 'Нет доступных тарифов'
    } catch {
      replacements['{tariffs}'] = 'Ошибка загрузки тарифов'
    }
  }

  let result = text
  for (const [key, val] of Object.entries(replacements)) {
    result = result.replaceAll(key, val)
  }

  // Custom user variables: {user:keyName}
  result = result.replace(/\{user:(\w+)\}/g, (_, key) => customVars[key] ?? '')

  return result
}

// ══════════════════════════════════════════════════════════════
// 3. Condition Checker
// ══════════════════════════════════════════════════════════════

export async function checkCondition(block: any, userId: string): Promise<boolean> {
  // Compound conditions from JSON array
  const conditions: Array<{ type: string; value?: string }> = block.conditions
    ? (typeof block.conditions === 'string' ? JSON.parse(block.conditions) : block.conditions)
    : []

  // Single condition fallback
  if (conditions.length === 0 && block.conditionType) {
    conditions.push({ type: block.conditionType, value: block.conditionValue ?? '' })
  }

  if (conditions.length === 0) return true

  const logic = (block.conditionLogic || 'AND').toUpperCase()

  const results = await Promise.all(conditions.map(c => evaluateSingle(c.type, c.value ?? '', userId)))

  return logic === 'OR'
    ? results.some(Boolean)
    : results.every(Boolean)
}

async function evaluateSingle(type: string, value: string, userId: string): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return false

    switch (type) {
      case 'has_sub':
        return user.subStatus !== 'INACTIVE'

      case 'no_sub':
        return user.subStatus === 'INACTIVE'

      case 'has_remnawave':
        return !!user.remnawaveUuid

      case 'expired':
        return user.subStatus === 'EXPIRED' || (
          !!user.subExpireAt && new Date(user.subExpireAt).getTime() < Date.now()
        )

      case 'has_email':
        return !!user.email

      case 'has_referrer':
        return !!user.referredById

      default:
        break
    }

    // Parameterized conditions: expiring_N, traffic_N, etc.
    const expiringMatch = type.match(/^expiring_(\d+)$/)
    if (expiringMatch) {
      const days = parseInt(expiringMatch[1], 10)
      if (!user.subExpireAt) return false
      const daysLeft = Math.ceil((new Date(user.subExpireAt).getTime() - Date.now()) / 86_400_000)
      return daysLeft >= 0 && daysLeft <= days
    }

    const trafficMatch = type.match(/^traffic_(\d+)$/)
    if (trafficMatch) {
      const threshold = parseInt(trafficMatch[1], 10)
      if (!user.remnawaveUuid) return false
      try {
        const sync = await remnawave.syncUserSubscription(user.remnawaveUuid)
        return (sync?.trafficUsedPercent ?? 0) >= threshold
      } catch { return false }
    }

    if (type === 'has_tag') {
      const tag = await prisma.userTag.findUnique({
        where: { userId_tag: { userId, tag: value } },
      })
      return !!tag
    }

    if (type === 'no_tag') {
      const tag = await prisma.userTag.findUnique({
        where: { userId_tag: { userId, tag: value } },
      })
      return !tag
    }

    if (type === 'has_var') {
      const v = await prisma.userVariable.findUnique({
        where: { userId_key: { userId, key: value } },
      })
      return !!v
    }

    const balanceMatch = type.match(/^balance_gt_(\d+)$/)
    if (balanceMatch) {
      return user.balance.toNumber() > parseInt(balanceMatch[1], 10)
    }

    const bonusMatch = type.match(/^bonus_days_gt_(\d+)$/)
    if (bonusMatch) {
      return (user.bonusDays ?? 0) > parseInt(bonusMatch[1], 10)
    }

    const paymentsMatch = type.match(/^payments_gt_(\d+)$/)
    if (paymentsMatch) {
      return (user.paymentsCount ?? 0) > parseInt(paymentsMatch[1], 10)
    }

    const newMatch = type.match(/^is_new_(\d+)$/)
    if (newMatch) {
      const days = parseInt(newMatch[1], 10)
      const registeredAgo = Math.ceil((Date.now() - new Date(user.createdAt).getTime()) / 86_400_000)
      return registeredAgo <= days
    }

    if (type === 'time_range') {
      // value = "09:00-21:00"
      const parts = value.split('-')
      if (parts.length !== 2) return true
      const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' }))
      const hhmm = now.getHours() * 100 + now.getMinutes()
      const start = parseHHMM(parts[0])
      const end = parseHHMM(parts[1])
      return start <= end
        ? hhmm >= start && hhmm <= end
        : hhmm >= start || hhmm <= end // overnight range
    }

    if (type === 'day_of_week') {
      // value = "1,2,3,4,5" (Mon=1 .. Sun=7)
      const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' }))
      let dow = now.getDay() // 0=Sun
      if (dow === 0) dow = 7
      const allowedDays = value.split(',').map(Number)
      return allowedDays.includes(dow)
    }

    logger.warn(`Unknown condition type: ${type}`)
    return true
  } catch (e) {
    logger.error(`Condition check failed: ${type}/${value}`, e)
    return true // fail open
  }
}

function parseHHMM(s: string): number {
  const [h, m] = s.trim().split(':').map(Number)
  return (h || 0) * 100 + (m || 0)
}

// ══════════════════════════════════════════════════════════════
// 4. Action Performer
// ══════════════════════════════════════════════════════════════

export async function performAction(block: any, userId: string): Promise<void> {
  const actionType = block.actionType
  const actionValue = block.actionValue ?? ''

  try {
    switch (actionType) {
      case 'bonus_days': {
        const days = parseInt(actionValue, 10) || 0
        await prisma.user.update({
          where: { id: userId },
          data: { bonusDays: { increment: days } },
        })
        logger.info(`Action bonus_days: +${days} for user ${userId}`)
        break
      }

      case 'balance': {
        const amount = parseFloat(actionValue) || 0
        if (amount > 0) {
          await balanceService.credit({
            userId,
            amount,
            type: 'GIFT',
            description: `Bot action: balance +${amount}`,
          })
        } else if (amount < 0) {
          await balanceService.debit({
            userId,
            amount: Math.abs(amount),
            type: 'PURCHASE',
            description: `Bot action: balance ${amount}`,
          })
        }
        break
      }

      case 'trial': {
        await createTrialForUser(userId)
        break
      }

      case 'add_tag': {
        await prisma.userTag.upsert({
          where: { userId_tag: { userId, tag: actionValue } },
          create: { userId, tag: actionValue },
          update: {},
        })
        logger.info(`Action add_tag: "${actionValue}" for user ${userId}`)
        break
      }

      case 'remove_tag': {
        await prisma.userTag.deleteMany({
          where: { userId, tag: actionValue },
        })
        logger.info(`Action remove_tag: "${actionValue}" for user ${userId}`)
        break
      }

      case 'set_var': {
        // actionValue format: "key=value"
        const eqIdx = actionValue.indexOf('=')
        if (eqIdx > 0) {
          const key = actionValue.slice(0, eqIdx).trim()
          const val = actionValue.slice(eqIdx + 1).trim()
          await prisma.userVariable.upsert({
            where: { userId_key: { userId, key } },
            create: { userId, key, value: val },
            update: { value: val },
          })
          logger.info(`Action set_var: ${key}=${val} for user ${userId}`)
        }
        break
      }

      default:
        logger.warn(`Unknown action type: ${actionType}`)
    }
  } catch (e) {
    logger.error(`Action ${actionType} failed for user ${userId}`, e)
  }
}

// ══════════════════════════════════════════════════════════════
// 5. Block Executor (main function)
// ══════════════════════════════════════════════════════════════

export async function executeBlock(
  blockId: string,
  ctx: Context | null,
  userId: string,
  chatId: string,
): Promise<void> {
  const block = await getBlock(blockId)
  if (!block) {
    logger.warn(`Block not found: ${blockId}`)
    return
  }

  // Schedule check
  if (!isInSchedule(block)) {
    // If outside schedule, optionally redirect to scheduleBlockId
    if (block.scheduleBlockId) {
      await executeBlock(block.scheduleBlockId, ctx, userId, chatId)
    }
    return
  }

  // Throttle check
  if (block.throttleMinutes && await isThrottled(blockId, userId)) {
    logger.debug(`Block ${blockId} throttled for user ${userId}`)
    return
  }

  // Set throttle if configured
  if (block.throttleMinutes) {
    const ttl = block.throttleMinutes * 60
    await redis.set(`bot:throttle:${blockId}:${userId}`, '1', 'EX', ttl)
  }

  // Track view (fire-and-forget)
  trackView(blockId).catch(() => {})

  try {
    switch (block.type) {
      case 'MESSAGE':
        await handleMessage(block, ctx, userId, chatId)
        break

      case 'CONDITION':
        await handleCondition(block, ctx, userId, chatId)
        break

      case 'ACTION':
        await handleAction(block, ctx, userId, chatId)
        break

      case 'INPUT':
        await handleInput(block, ctx, userId, chatId)
        break

      case 'DELAY':
        await handleDelay(block, ctx, userId, chatId)
        break

      case 'SPLIT':
        await handleSplit(block, ctx, userId, chatId)
        break

      case 'REDIRECT':
        await handleRedirect(block, ctx, userId, chatId)
        break

      case 'PAYMENT':
        await handlePayment(block, ctx, userId, chatId)
        break

      case 'EFFECT':
        await handleEffect(block, ctx, userId, chatId)
        break

      case 'REACTION':
        await handleReaction(block, ctx, userId, chatId)
        break

      case 'STREAMING':
        await handleStreaming(block, ctx, userId, chatId)
        break

      case 'GIFT':
        await handleGift(block, ctx, userId, chatId)
        break

      case 'HTTP':
        await handleHttp(block, ctx, userId, chatId)
        break

      case 'EMAIL':
        await handleEmail(block, ctx, userId, chatId)
        break

      case 'NOTIFY_ADMIN':
        await handleNotifyAdmin(block, ctx, userId, chatId)
        break

      case 'ASSIGN':
        await handleAssign(block, ctx, userId, chatId)
        break

      case 'FUNNEL':
        await handleFunnel(block, ctx, userId, chatId)
        break

      case 'TARIFF_LIST':
        await handleTariffList(block, ctx, userId, chatId)
        break

      case 'PAYMENT_SUCCESS':
        await handleMessage(block, ctx, userId, chatId) // renders as regular message with resolved vars
        break

      case 'PAYMENT_FAIL':
        await handleMessage(block, ctx, userId, chatId)
        break

      case 'PROMO_ACTIVATE':
        await handlePromoActivate(block, ctx, userId, chatId)
        break

      default:
        logger.warn(`Unknown block type: ${block.type} (block ${blockId})`)
    }
  } catch (e) {
    logger.error(`executeBlock failed: ${block.type} / ${blockId}`, e)
  }
}

// ── Block Handlers ───────────────────────────────────────────

async function handleMessage(block: any, ctx: Context | null, userId: string, chatId: string) {
  const text = await resolveVariables(block.text || '', userId)

  // Build resolved variables map for button URLs
  const { config: appConfig } = await import('../config')
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true, subLink: true } })
  const vars: Record<string, string> = {
    appUrl: appConfig.appUrl,
    referralUrl: `${appConfig.appUrl}?ref=${user?.referralCode || ''}`,
    subLink: user?.subLink || '',
  }

  // Build inline keyboard from buttons
  let keyboard = buildKeyboard(block.buttons || [], vars)

  // Auto-generate tariff buttons if text contains {tariffs}
  if (block.text?.includes('{tariffs}')) {
    try {
      const tariffs = await prisma.tariff.findMany({
        where: { isActive: true, type: 'SUBSCRIPTION', isTrial: false },
        orderBy: [{ sortOrder: 'asc' }, { priceRub: 'asc' }],
      })
      if (tariffs.length > 0) {
        const tariffRows = tariffs.map(t => [{
          text: `${t.name} — ${t.priceRub} ₽`,
          callback_data: `engine:tariff:${t.id}`,
          style: 'success',
        }])
        // Append tariff buttons before existing buttons
        const existingRows = keyboard.inline_keyboard || []
        keyboard = { inline_keyboard: [...tariffRows, ...existingRows] }
      }
    } catch { /* ignore tariff load errors */ }
  }

  // Auto-add admin button for staff users (only if block text contains {admin_button})
  if (block.text?.includes('{admin_button}')) {
    const fullUser = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
    if (fullUser && fullUser.role !== 'USER') {
      const existingRows = keyboard.inline_keyboard || []
      keyboard = {
        inline_keyboard: [
          ...existingRows,
          [
            { text: '⚙️ Админка', callback_data: 'adm:menu' },
            { text: '🌐 Web-панель', web_app: { url: `${appConfig.appUrl}/admin` } },
          ],
        ],
      }
    }
  }

  // Delete previous message if configured
  // Try callback message first, then fall back to Redis-stored last message ID
  let prevMsgId: number | null = ctx?.callbackQuery?.message?.message_id ?? null
  if (!prevMsgId) {
    prevMsgId = await getLastMessageId(chatId)
  }
  // Handle non-replace deletePrev modes before sending
  if (block.deletePrev && !['none', 'replace'].includes(block.deletePrev) && prevMsgId) {
    try {
      if (block.deletePrev === 'full') {
        await bot.api.deleteMessage(chatId, prevMsgId)
      } else if (block.deletePrev === 'buttons') {
        await bot.api.editMessageReplyMarkup(chatId, prevMsgId, { reply_markup: { inline_keyboard: [] } })
      }
    } catch { /* message may already be deleted */ }
  }

  // Send media or text
  let sentMessage: any
  let parseMode: 'HTML' | 'Markdown' | 'MarkdownV2' = block.parseMode === 'HTML' ? 'HTML' : 'Markdown'
  let finalText = text

  // Auto-detect premium emoji in text and convert to HTML if needed
  // Markdown ![fallback](tg://emoji?id=XXX) → HTML <tg-emoji emoji-id="XXX">fallback</tg-emoji>
  if (finalText.includes('tg://emoji') && parseMode !== 'HTML') {
    // Convert Markdown premium emoji syntax to HTML
    finalText = finalText.replace(/!\[([^\]]*)\]\(tg:\/\/emoji\?id=(\d+)\)/g,
      '<tg-emoji emoji-id="$2">$1</tg-emoji>')
    // Convert basic Markdown to HTML
    finalText = finalText
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')          // **bold**
      .replace(/\*(.+?)\*/g, '<b>$1</b>')               // *bold*
      .replace(/__(.+?)__/g, '<i>$1</i>')                // __italic__
      .replace(/_(.+?)_/g, '<i>$1</i>')                  // _italic_
      .replace(/~~(.+?)~~/g, '<s>$1</s>')                // ~~strike~~
      .replace(/\|\|(.+?)\|\|/g, '<tg-spoiler>$1</tg-spoiler>') // ||spoiler||
      .replace(/`(.+?)`/g, '<code>$1</code>')            // `code`
    parseMode = 'HTML'
  }

  const replyMarkup = keyboard.inline_keyboard.length > 0 ? keyboard : undefined

  // Replace mode: edit previous message in-place instead of sending new
  if (block.deletePrev === 'replace' && prevMsgId && finalText) {
    if (!block.mediaUrl) {
      try {
        await bot.api.editMessageText(chatId, prevMsgId, finalText, {
          parse_mode: parseMode,
          reply_markup: replyMarkup as any ?? { inline_keyboard: [] },
        })
        logger.info('Replace OK: edited message ' + prevMsgId)
        setLastMessageId(chatId, prevMsgId).catch(() => {})
        // Note: outgoing message is logged by API transformer in bot/index.ts
        if (block.nextBlockId) {
          await executeBlock(block.nextBlockId, ctx, userId, chatId)
        }
        return
      } catch (replaceErr: any) {
        logger.warn('Replace FAILED: ' + (replaceErr?.description || replaceErr?.message || 'unknown'))
        try { await bot.api.deleteMessage(chatId, prevMsgId) } catch {}
      }
    } else {
      try { await bot.api.deleteMessage(chatId, prevMsgId) } catch {}
    }
  }

  // Message effect (confetti, fire, etc.)
  const effectId = block.messageEffectId || undefined

  try {
    if (block.mediaUrl && block.mediaType) {
      sentMessage = await sendMedia(chatId, block.mediaType, block.mediaUrl, finalText, parseMode, replyMarkup)
    } else if (finalText) {
      if (effectId) {
        // Use raw API to pass message_effect_id (not in grammy typings yet)
        sentMessage = await bot.api.raw.sendMessage({
          chat_id: chatId,
          text: finalText,
          parse_mode: parseMode,
          reply_markup: replyMarkup ? JSON.stringify(replyMarkup) : undefined,
          message_effect_id: effectId,
        } as any)
      } else {
        sentMessage = await bot.api.sendMessage(chatId, finalText, {
          parse_mode: parseMode,
          reply_markup: replyMarkup,
        })
      }
    }
  } catch (e: any) {
    // Retry without parse_mode and effect if fails
    if (e.message?.includes('parse') || e.error_code === 400) {
      try {
        if (block.mediaUrl && block.mediaType) {
          sentMessage = await sendMedia(chatId, block.mediaType, block.mediaUrl, finalText, undefined, replyMarkup)
        } else {
          sentMessage = await bot.api.sendMessage(chatId, finalText, { reply_markup: replyMarkup })
        }
      } catch (e2) {
        logger.error(`Message send retry failed for block ${block.id}`, e2)
        return
      }
    } else {
      throw e
    }
  }

  // Store last sent message ID for deletePrev in next block
  if (sentMessage?.message_id) {
    setLastMessageId(chatId, sentMessage.message_id).catch(() => {})
  }

  // Pin message if requested
  if (block.pinMessage && sentMessage?.message_id) {
    try {
      await bot.api.pinChatMessage(chatId, sentMessage.message_id, { disable_notification: true })
    } catch { /* may not have pin permission */ }
  }

  // Reply keyboard (custom keyboard, not inline)
  if (block.replyKeyboard) {
    try {
      const rkb = typeof block.replyKeyboard === 'string'
        ? JSON.parse(block.replyKeyboard)
        : block.replyKeyboard
      if (rkb?.keyboard?.length) {
        await bot.api.sendMessage(chatId, '⠀', { reply_markup: rkb })
      }
    } catch { /* ignore reply keyboard errors */ }
  }

  // Remove reply keyboard if requested
  if (block.removeReplyKb) {
    try {
      await bot.api.sendMessage(chatId, '⠀', {
        reply_markup: { remove_keyboard: true },
      })
    } catch { /* ignore */ }
  }

  // Note: outgoing message is logged by API transformer in bot/index.ts — no need to log here

  // Execute next block if there's one
  if (block.nextBlockId) {
    await executeBlock(block.nextBlockId, ctx, userId, chatId)
  }
}

async function handleCondition(block: any, ctx: Context | null, userId: string, chatId: string) {
  const result = await checkCondition(block, userId)
  const nextId = result ? block.nextBlockTrue : block.nextBlockFalse

  if (nextId) {
    await executeBlock(nextId, ctx, userId, chatId)
  }
}

async function handleAction(block: any, ctx: Context | null, userId: string, chatId: string) {
  await performAction(block, userId)

  if (block.nextBlockId) {
    await executeBlock(block.nextBlockId, ctx, userId, chatId)
  }
}

async function handleInput(block: any, ctx: Context | null, userId: string, chatId: string) {
  // Send the prompt message
  if (block.inputPrompt) {
    const prompt = await resolveVariables(block.inputPrompt, userId)
    try {
      await bot.api.sendMessage(chatId, prompt, {
        parse_mode: block.parseMode === 'HTML' ? 'HTML' : 'Markdown',
      })
    } catch {
      await bot.api.sendMessage(chatId, prompt)
    }
  }

  // Set user state to waiting for input
  await setUserState(userId, {
    waitingInput: true,
    blockId: block.id,
    inputVar: block.inputVar || 'input',
    inputValidation: block.inputValidation || 'text',
    nextBlockId: block.nextBlockId ?? null,
  })
}

async function handleDelay(block: any, ctx: Context | null, userId: string, chatId: string) {
  if (!block.nextBlockId) return

  let delayMs: number
  const amount = block.delayMinutes ?? 1

  switch (block.delayUnit) {
    case 'seconds':
      delayMs = amount * 1000
      break
    case 'hours':
      delayMs = amount * 3600_000
      break
    case 'days':
      delayMs = amount * 86_400_000
      break
    case 'minutes':
    default:
      delayMs = amount * 60_000
      break
  }

  const executeAt = new Date(Date.now() + delayMs)

  // Store chatId so the scheduler can send messages later
  await redis.set(`bot:chat:${userId}`, chatId, 'EX', Math.max(delayMs / 1000 + 3600, 86400))

  await scheduleBlock(userId, block.nextBlockId, executeAt)
  logger.debug(`Delay: block ${block.nextBlockId} scheduled for ${executeAt.toISOString()}`)
}

async function handleSplit(block: any, ctx: Context | null, userId: string, chatId: string) {
  const variants: Array<{ blockId: string; weight: number }> = block.splitVariants
    ? (typeof block.splitVariants === 'string' ? JSON.parse(block.splitVariants) : block.splitVariants)
    : []

  if (variants.length === 0) return

  // Weighted random selection
  const totalWeight = variants.reduce((sum, v) => sum + (v.weight || 1), 0)
  let rand = Math.random() * totalWeight
  let winner = variants[0]

  for (const v of variants) {
    rand -= (v.weight || 1)
    if (rand <= 0) {
      winner = v
      break
    }
  }

  if (winner.blockId) {
    await executeBlock(winner.blockId, ctx, userId, chatId)
  }
}

async function handleRedirect(block: any, ctx: Context | null, userId: string, chatId: string) {
  if (block.redirectBlockId) {
    await executeBlock(block.redirectBlockId, ctx, userId, chatId)
  }
}

async function handlePayment(block: any, ctx: Context | null, userId: string, chatId: string) {
  const amount = block.paymentAmount ?? 0
  if (amount <= 0) {
    logger.warn(`Payment block ${block.id} has no amount`)
    if (block.nextBlockId) {
      await executeBlock(block.nextBlockId, ctx, userId, chatId)
    }
    return
  }

  try {
    // Telegram Stars invoice
    await bot.api.sendInvoice(
      chatId,
      block.paymentTitle || 'Payment',
      block.paymentDescription || 'Payment via bot',
      block.paymentPayload || `pay:${block.id}:${userId}`,
      'XTR',  // Telegram Stars currency
      [{ label: block.paymentTitle || 'Payment', amount }],
    )
  } catch (e) {
    logger.error(`Payment invoice failed for block ${block.id}`, e)
  }
}

async function handleEffect(block: any, ctx: Context | null, userId: string, chatId: string) {
  const text = await resolveVariables(block.text || block.streamingText || '', userId)
  if (!text) return

  try {
    // Send message with message_effect_id via raw API
    await bot.api.raw.sendMessage({
      chat_id: chatId,
      text,
      parse_mode: block.parseMode === 'HTML' ? 'HTML' : 'Markdown',
      message_effect_id: block.messageEffectId || undefined,
    } as any)
  } catch {
    // Fallback: send as normal message
    try {
      await bot.api.sendMessage(chatId, text, {
        parse_mode: block.parseMode === 'HTML' ? 'HTML' : 'Markdown',
      })
    } catch {
      await bot.api.sendMessage(chatId, text)
    }
  }

  if (block.nextBlockId) {
    await executeBlock(block.nextBlockId, ctx, userId, chatId)
  }
}

async function handleReaction(block: any, ctx: Context | null, userId: string, chatId: string) {
  if (!block.reactionEmoji || !ctx?.message?.message_id) {
    // Try callback query message
    const msgId = ctx?.callbackQuery?.message?.message_id ?? ctx?.message?.message_id
    if (!msgId || !block.reactionEmoji) return

    try {
      await bot.api.setMessageReaction(chatId, msgId, [
        { type: 'emoji', emoji: block.reactionEmoji },
      ])
    } catch (e) {
      logger.debug(`Reaction failed for block ${block.id}`, e)
    }
    return
  }

  if (ctx?.message?.message_id) {
    try {
      await bot.api.setMessageReaction(chatId, ctx.message.message_id, [
        { type: 'emoji', emoji: block.reactionEmoji },
      ])
    } catch (e) {
      logger.debug(`Reaction failed for block ${block.id}`, e)
    }
  }

  if (block.nextBlockId) {
    await executeBlock(block.nextBlockId, ctx, userId, chatId)
  }
}

async function handleStreaming(block: any, ctx: Context | null, userId: string, chatId: string) {
  const text = await resolveVariables(block.streamingText || block.text || '', userId)
  if (!text) return

  // Try sendMessageDraft for streaming effect, fall back to normal send
  try {
    await (bot.api.raw as any).sendMessageDraft?.({
      chat_id: chatId,
      text,
      parse_mode: block.parseMode === 'HTML' ? 'HTML' : 'Markdown',
    })
  } catch {
    try {
      await bot.api.sendMessage(chatId, text, {
        parse_mode: block.parseMode === 'HTML' ? 'HTML' : 'Markdown',
      })
    } catch {
      await bot.api.sendMessage(chatId, text)
    }
  }

  if (block.nextBlockId) {
    await executeBlock(block.nextBlockId, ctx, userId, chatId)
  }
}

async function handleGift(block: any, _ctx: Context | null, userId: string, chatId: string) {
  // Placeholder — log and notify admin
  logger.info(`Gift block triggered: ${block.id}, giftId=${block.giftId}, user=${userId}`)

  try {
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', telegramId: { not: null } },
      select: { telegramId: true },
    })
    for (const admin of admins) {
      if (admin.telegramId) {
        await bot.api.sendMessage(
          admin.telegramId,
          `🎁 Gift block triggered\nBlock: ${block.name || block.id}\nUser: ${userId}\nGift ID: ${block.giftId || 'N/A'}`,
        ).catch(() => {})
      }
    }
  } catch { /* ignore */ }

  if (block.nextBlockId) {
    await executeBlock(block.nextBlockId, null, userId, chatId)
  }
}

async function handleHttp(block: any, ctx: Context | null, userId: string, chatId: string) {
  const url = await resolveVariables(block.httpUrl || '', userId)
  if (!url) {
    logger.warn(`HTTP block ${block.id} has no URL`)
    return
  }

  try {
    const method = (block.httpMethod || 'GET').toUpperCase()

    // Resolve variables in headers
    let headers: Record<string, string> = {}
    if (block.httpHeaders) {
      const raw = typeof block.httpHeaders === 'string' ? JSON.parse(block.httpHeaders) : block.httpHeaders
      for (const [k, v] of Object.entries(raw)) {
        headers[k] = await resolveVariables(String(v), userId)
      }
    }

    // Resolve variables in body
    let body: string | undefined
    if (block.httpBody && method !== 'GET') {
      body = await resolveVariables(block.httpBody, userId)
    }

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body || undefined,
      signal: AbortSignal.timeout(15_000),
    })

    const responseText = await response.text()

    // Save response to user variable if configured
    if (block.httpSaveVar) {
      let saveValue = responseText
      // Try to parse JSON and extract meaningful value
      try {
        const json = JSON.parse(responseText)
        saveValue = typeof json === 'object' ? JSON.stringify(json) : String(json)
      } catch { /* keep as text */ }

      await prisma.userVariable.upsert({
        where: { userId_key: { userId, key: block.httpSaveVar } },
        create: { userId, key: block.httpSaveVar, value: saveValue },
        update: { value: saveValue },
      })
    }

    logger.debug(`HTTP ${method} ${url} → ${response.status}`)
  } catch (e) {
    logger.error(`HTTP block ${block.id} failed`, e)
  }

  if (block.nextBlockId) {
    await executeBlock(block.nextBlockId, ctx, userId, chatId)
  }
}

async function handleEmail(block: any, ctx: Context | null, userId: string, chatId: string) {
  if (!config.smtp.configured) {
    logger.debug(`Email block ${block.id} skipped: SMTP not configured`)
  } else {
    // Placeholder — would send email here
    logger.info(`Email block ${block.id} triggered for user ${userId} (subject: ${block.emailSubject})`)
  }

  if (block.nextBlockId) {
    await executeBlock(block.nextBlockId, ctx, userId, chatId)
  }
}

async function handleNotifyAdmin(block: any, _ctx: Context | null, userId: string, chatId: string) {
  const text = await resolveVariables(block.notifyAdminText || block.text || 'Admin notification', userId)

  try {
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', telegramId: { not: null } },
      select: { telegramId: true },
    })

    for (const admin of admins) {
      if (admin.telegramId) {
        await bot.api.sendMessage(admin.telegramId, text).catch(() => {})
      }
    }
  } catch (e) {
    logger.error(`NotifyAdmin block ${block.id} failed`, e)
  }

  if (block.nextBlockId) {
    await executeBlock(block.nextBlockId, null, userId, chatId)
  }
}

async function handleAssign(block: any, _ctx: Context | null, userId: string, chatId: string) {
  // Placeholder — notify admin that user needs live support
  logger.info(`Assign block ${block.id}: user ${userId} needs live support`)

  try {
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', telegramId: { not: null } },
      select: { telegramId: true, telegramName: true },
    })

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { telegramName: true, telegramId: true, email: true },
    })

    const info = user
      ? `${user.telegramName || user.email || user.telegramId || userId}`
      : userId

    for (const admin of admins) {
      if (admin.telegramId) {
        await bot.api.sendMessage(
          admin.telegramId,
          `👤 User needs live support\nUser: ${info}\nChat: ${chatId}`,
        ).catch(() => {})
      }
    }
  } catch (e) {
    logger.error(`Assign block ${block.id} failed`, e)
  }
}

async function handleFunnel(block: any, _ctx: Context | null, userId: string, _chatId: string) {
  logger.info(`Funnel block ${block.id}: funnelId=${block.funnelId}, user=${userId}`)
}

// ── TARIFF_LIST: auto-generate tariff list with payment buttons ──
async function handleTariffList(block: any, ctx: Context | null, userId: string, chatId: string) {
  const { config: appConfig } = await import('../config')

  const tariffs = await prisma.tariff.findMany({
    where: { isActive: true, type: 'SUBSCRIPTION', isTrial: false },
    orderBy: [{ sortOrder: 'asc' }, { priceRub: 'asc' }],
  })

  if (tariffs.length === 0) {
    await bot.api.sendMessage(chatId, '😕 Нет доступных тарифов', { reply_markup: { inline_keyboard: [[{ text: '◀️ Назад', callback_data: 'engine:back:start' }]] } })
    return
  }

  // Build tariff description
  const headerText = await resolveVariables(block.text || '💳 *Выберите тариф:*', userId)
  const tariffLines = tariffs.map(t => {
    const traffic = t.trafficGb ? `${t.trafficGb} ГБ` : '∞'
    return `▫️ *${t.name}* — ${t.priceRub} ₽ / ${t.durationDays} дн. / ${traffic} / ${t.deviceLimit} устр.`
  })

  const text = `${headerText}\n\n${tariffLines.join('\n')}`

  // Build tariff buttons
  const tariffRows = tariffs.map(t => [{
    text: `💳 ${t.name} — ${t.priceRub} ₽`,
    callback_data: `engine:tariff:${t.id}`,
  }])

  // Add existing block buttons (like "Назад")
  const blockButtons = buildKeyboard(block.buttons || [], { appUrl: appConfig.appUrl })
  const allRows = [...tariffRows, ...(blockButtons.inline_keyboard || [])]

  // Handle deletePrev
  let prevMsgId: number | null = ctx?.callbackQuery?.message?.message_id ?? null
  if (!prevMsgId) prevMsgId = await getLastMessageId(chatId)

  let sentMessage: any
  if (block.deletePrev === 'replace' && prevMsgId) {
    try {
      await bot.api.editMessageText(chatId, prevMsgId, text, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: allRows } as any,
      })
      setLastMessageId(chatId, prevMsgId).catch(() => {})
      return
    } catch {
      try { await bot.api.deleteMessage(chatId, prevMsgId) } catch {}
    }
  } else if (block.deletePrev === 'full' && prevMsgId) {
    try { await bot.api.deleteMessage(chatId, prevMsgId) } catch {}
  }

  sentMessage = await bot.api.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: allRows },
  })

  if (sentMessage?.message_id) {
    setLastMessageId(chatId, sentMessage.message_id).catch(() => {})
  }
}

// ── PROMO_ACTIVATE: validate and activate promo code ────────
async function handlePromoActivate(block: any, ctx: Context | null, userId: string, chatId: string) {
  // Get the promo code from user variable (set by preceding INPUT block)
  const varName = block.inputVar || 'promo_code'
  const userVar = await prisma.userVariable.findUnique({
    where: { userId_key: { userId, key: varName } },
  })
  const code = userVar?.value?.trim().toUpperCase()

  if (!code) {
    await bot.api.sendMessage(chatId, '❌ Промокод не указан.')
    if (block.nextBlockFalse) await executeBlock(block.nextBlockFalse, ctx, userId, chatId)
    return
  }

  // Find promo
  const promo = await prisma.promoCode.findUnique({ where: { code } })

  if (!promo || !promo.isActive) {
    await bot.api.sendMessage(chatId, `❌ Промокод *${code}* не найден или неактивен.`, { parse_mode: 'Markdown' })
    if (block.nextBlockFalse) await executeBlock(block.nextBlockFalse, ctx, userId, chatId)
    return
  }

  // Check expiry
  if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) {
    await bot.api.sendMessage(chatId, `❌ Промокод *${code}* истёк.`, { parse_mode: 'Markdown' })
    if (block.nextBlockFalse) await executeBlock(block.nextBlockFalse, ctx, userId, chatId)
    return
  }

  // Check usage limit
  if (promo.maxUses && promo.usedCount >= promo.maxUses) {
    await bot.api.sendMessage(chatId, `❌ Промокод *${code}* больше не действует.`, { parse_mode: 'Markdown' })
    if (block.nextBlockFalse) await executeBlock(block.nextBlockFalse, ctx, userId, chatId)
    return
  }

  // Check per-user usage
  const existingUsage = await prisma.promoUsage.findUnique({
    where: { promoId_userId: { promoId: promo.id, userId } },
  })
  if (existingUsage) {
    await bot.api.sendMessage(chatId, `❌ Вы уже использовали промокод *${code}*.`, { parse_mode: 'Markdown' })
    if (block.nextBlockFalse) await executeBlock(block.nextBlockFalse, ctx, userId, chatId)
    return
  }

  // Apply promo
  try {
    if (promo.type === 'bonus_days' && promo.bonusDays) {
      await prisma.user.update({ where: { id: userId }, data: { bonusDays: { increment: promo.bonusDays } } })
    } else if (promo.type === 'balance' && promo.balanceAmount) {
      const { balanceService } = await import('../services/balance')
      await balanceService.credit({ userId, amount: promo.balanceAmount, type: 'GIFT', description: `Промокод ${code}` })
    }

    // Record usage
    await prisma.promoUsage.create({ data: { promoId: promo.id, userId } })
    await prisma.promoCode.update({ where: { id: promo.id }, data: { usedCount: { increment: 1 } } })

    // Save result to user variable for display
    let resultText = ''
    if (promo.type === 'bonus_days') resultText = `+${promo.bonusDays} бонусных дней`
    else if (promo.type === 'balance') resultText = `+${promo.balanceAmount} ₽ на баланс`
    else if (promo.type === 'discount') resultText = `Скидка ${promo.discountPct}% на тарифы`
    else if (promo.type === 'trial') resultText = 'Пробный период активирован'

    await prisma.userVariable.upsert({
      where: { userId_key: { userId, key: 'promo_result' } },
      create: { userId, key: 'promo_result', value: resultText },
      update: { value: resultText },
    })

    // Go to success block
    if (block.nextBlockTrue) {
      await executeBlock(block.nextBlockTrue, ctx, userId, chatId)
    } else {
      await bot.api.sendMessage(chatId, `✅ Промокод *${code}* активирован!\n\n${resultText}`, { parse_mode: 'Markdown' })
    }
  } catch (err: any) {
    logger.warn(`Promo activation failed: ${err.message}`)
    await bot.api.sendMessage(chatId, '❌ Ошибка активации промокода')
    if (block.nextBlockFalse) await executeBlock(block.nextBlockFalse, ctx, userId, chatId)
  }
}

// ── Media Sender ─────────────────────────────────────────────

async function sendMedia(
  chatId: string,
  mediaType: string,
  mediaUrl: string,
  caption: string,
  parseMode?: string,
  replyMarkup?: any,
): Promise<any> {
  // Convert relative URLs to absolute (uploads stored locally)
  let url = mediaUrl
  if (url.startsWith('/')) {
    const { config: appConfig } = await import('../config')
    url = `${appConfig.appUrl}${url}`
  }

  const opts: any = {
    caption: caption || undefined,
    parse_mode: parseMode || undefined,
    reply_markup: replyMarkup || undefined,
  }

  switch (mediaType) {
    case 'photo':
      return bot.api.sendPhoto(chatId, url, opts)
    case 'video':
      return bot.api.sendVideo(chatId, url, opts)
    case 'animation':
      return bot.api.sendAnimation(chatId, url, opts)
    case 'document':
      return bot.api.sendDocument(chatId, url, opts)
    default:
      return bot.api.sendPhoto(chatId, url, opts)
  }
}

// ── Keyboard Builder ─────────────────────────────────────────

function buildKeyboard(buttons: any[], resolvedVars?: Record<string, string>): { inline_keyboard: any[][] } {
  if (!buttons.length) return { inline_keyboard: [] }

  // Simple variable replacement for URLs and copyText
  const resolve = (text: string) => {
    if (!text || !resolvedVars) return text
    return text.replace(/\{(\w+)\}/g, (_, key) => resolvedVars[key] ?? `{${key}}`)
  }

  // Group buttons by row
  const rows = new Map<number, any[]>()
  for (const btn of buttons) {
    const row = btn.row ?? 0
    if (!rows.has(row)) rows.set(row, [])
    rows.get(row)!.push(btn)
  }

  const sortedRows = [...rows.entries()].sort((a, b) => a[0] - b[0])
  const keyboard: any[][] = []

  for (const [_, rowButtons] of sortedRows) {
    rowButtons.sort((a: any, b: any) => (a.col ?? 0) - (b.col ?? 0) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

    const row: any[] = []
    for (const btn of rowButtons) {
      // Build raw InlineKeyboardButton with style support (Bot API 9.4)
      const button: any = { text: btn.label }

      // Set action
      if (btn.type === 'url' && btn.url) {
        button.url = resolve(btn.url)
      } else if (btn.type === 'webapp' && btn.url) {
        button.web_app = { url: resolve(btn.url) }
      } else if (btn.type === 'copy_text' && btn.copyText) {
        button.copy_text = { text: resolve(btn.copyText) }
      } else {
        button.callback_data = `blk:${btn.id}`
      }

      // Colored buttons (Bot API 9.4) — field: "style", values: "success" | "danger" | "primary"
      if (btn.style && btn.style !== 'default') {
        button.style = btn.style  // success → green, danger → red, primary → blue
      }

      // Premium emoji icon on button (Bot API 9.4)
      if (btn.iconCustomEmojiId) {
        button.icon_custom_emoji_id = btn.iconCustomEmojiId
      }

      row.push(button)
    }
    if (row.length > 0) keyboard.push(row)
  }

  return { inline_keyboard: keyboard }
}

// ══════════════════════════════════════════════════════════════
// 6. Trigger Resolution
// ══════════════════════════════════════════════════════════════

export async function findTriggerBlock(type: string, value: string): Promise<string | null> {
  await loadBlockCache()

  if (!blockCache) return null

  let bestMatch: { blockId: string; priority: number } | null = null

  for (const [_, block] of blockCache) {
    if (!block.triggers) continue
    for (const trigger of block.triggers) {
      if (trigger.type !== type) continue

      // Exact match
      if (trigger.value === value) {
        if (!bestMatch || trigger.priority > bestMatch.priority) {
          bestMatch = { blockId: block.id, priority: trigger.priority }
        }
      }

      // Wildcard / regex match for text triggers
      if (type === 'text' && trigger.value.startsWith('/') && trigger.value.endsWith('/')) {
        try {
          const regex = new RegExp(trigger.value.slice(1, -1), 'i')
          if (regex.test(value)) {
            if (!bestMatch || trigger.priority > bestMatch.priority) {
              bestMatch = { blockId: block.id, priority: trigger.priority }
            }
          }
        } catch { /* invalid regex, skip */ }
      }

      // Wildcard "*" matches everything
      if (trigger.value === '*') {
        if (!bestMatch || trigger.priority > bestMatch.priority) {
          bestMatch = { blockId: block.id, priority: trigger.priority }
        }
      }
    }
  }

  return bestMatch?.blockId ?? null
}

// ══════════════════════════════════════════════════════════════
// 7. Stats Tracking
// ══════════════════════════════════════════════════════════════

export async function trackView(blockId: string): Promise<void> {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    await prisma.botBlockStat.upsert({
      where: { blockId_date: { blockId, date: today } },
      create: { blockId, date: today, views: 1 },
      update: { views: { increment: 1 } },
    })
  } catch (e) {
    logger.debug(`trackView failed for ${blockId}`, e)
  }
}

export async function trackClick(buttonId: string): Promise<void> {
  try {
    // Increment click count on button itself
    await prisma.botButton.update({
      where: { id: buttonId },
      data: { clickCount: { increment: 1 } },
    })

    // Also track in block stats
    const button = await prisma.botButton.findUnique({
      where: { id: buttonId },
      select: { blockId: true },
    })
    if (button) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      await prisma.botBlockStat.upsert({
        where: { blockId_date: { blockId: button.blockId, date: today } },
        create: { blockId: button.blockId, date: today, clicks: 1 },
        update: { clicks: { increment: 1 } },
      })
    }
  } catch (e) {
    logger.debug(`trackClick failed for ${buttonId}`, e)
  }
}

// ══════════════════════════════════════════════════════════════
// 8. Throttle Check
// ══════════════════════════════════════════════════════════════

async function isThrottled(blockId: string, userId: string): Promise<boolean> {
  try {
    const exists = await redis.exists(`bot:throttle:${blockId}:${userId}`)
    return exists === 1
  } catch {
    return false
  }
}

// ══════════════════════════════════════════════════════════════
// 9. Schedule Check
// ══════════════════════════════════════════════════════════════

function isInSchedule(block: any): boolean {
  // If no schedule configured, always allow
  if (!block.scheduleStart && !block.scheduleEnd && !block.scheduleDays) {
    return true
  }

  // Moscow time
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' }))
  const hhmm = now.getHours() * 100 + now.getMinutes()

  // Check day of week (1=Mon .. 7=Sun)
  if (block.scheduleDays) {
    const days: number[] = typeof block.scheduleDays === 'string'
      ? JSON.parse(block.scheduleDays)
      : block.scheduleDays

    if (Array.isArray(days) && days.length > 0) {
      let dow = now.getDay()
      if (dow === 0) dow = 7
      if (!days.includes(dow)) return false
    }
  }

  // Check time range
  if (block.scheduleStart || block.scheduleEnd) {
    const start = block.scheduleStart ? parseHHMM(block.scheduleStart) : 0
    const end = block.scheduleEnd ? parseHHMM(block.scheduleEnd) : 2359

    if (start <= end) {
      // Normal range: 09:00 - 21:00
      if (hhmm < start || hhmm > end) return false
    } else {
      // Overnight range: 22:00 - 06:00
      if (hhmm < start && hhmm > end) return false
    }
  }

  return true
}
