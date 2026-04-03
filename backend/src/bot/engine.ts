import { InlineKeyboard, Context } from 'grammy'
import Redis from 'ioredis'
import { prisma } from '../db'
import { config } from '../config'
import { logger } from '../utils/logger'
import { bot } from './index'
import { getUserState, setUserState, clearUserState, scheduleBlock } from './state'
import { createTrialForUser } from './trial'
import { remnawave } from '../services/remnawave'
import { balanceService } from '../services/balance'

const redis = new Redis(config.redis.url)

// ══════════════════════════════════════════════════════════════
// 1. Block Cache (in-memory with 60s TTL)
// ══════════════════════════════════════════════════════════════

let blockCache: Map<string, any> | null = null
let cacheTime = 0
const CACHE_TTL_MS = 60_000

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

  // Build inline keyboard from buttons
  const keyboard = buildKeyboard(block.buttons || [])

  // Delete previous message if configured
  if (block.deletePrev === 'last' && ctx?.callbackQuery?.message) {
    try {
      await bot.api.deleteMessage(chatId, ctx.callbackQuery.message.message_id)
    } catch { /* message may already be deleted */ }
  }

  // Send media or text
  let sentMessage: any
  const parseMode = block.parseMode === 'HTML' ? 'HTML' : 'Markdown'
  const replyMarkup = keyboard.inline_keyboard.length > 0 ? keyboard : undefined

  try {
    if (block.mediaUrl && block.mediaType) {
      sentMessage = await sendMedia(chatId, block.mediaType, block.mediaUrl, text, parseMode, replyMarkup)
    } else if (text) {
      sentMessage = await bot.api.sendMessage(chatId, text, {
        parse_mode: parseMode,
        reply_markup: replyMarkup,
      })
    }
  } catch (e: any) {
    // Retry without parse_mode if Markdown fails
    if (e.message?.includes('parse') || e.error_code === 400) {
      try {
        if (block.mediaUrl && block.mediaType) {
          sentMessage = await sendMedia(chatId, block.mediaType, block.mediaUrl, text, undefined, replyMarkup)
        } else {
          sentMessage = await bot.api.sendMessage(chatId, text, { reply_markup: replyMarkup })
        }
      } catch (e2) {
        logger.error(`Message send retry failed for block ${block.id}`, e2)
        return
      }
    } else {
      throw e
    }
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

  try {
    await bot.api.setMessageReaction(chatId, ctx.message.message_id, [
      { type: 'emoji', emoji: block.reactionEmoji },
    ])
  } catch (e) {
    logger.debug(`Reaction failed for block ${block.id}`, e)
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
  // Placeholder — log funnel trigger
  logger.info(`Funnel block ${block.id}: funnelId=${block.funnelId}, user=${userId}`)
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
  const opts: any = {
    caption: caption || undefined,
    parse_mode: parseMode || undefined,
    reply_markup: replyMarkup || undefined,
  }

  switch (mediaType) {
    case 'photo':
      return bot.api.sendPhoto(chatId, mediaUrl, opts)
    case 'video':
      return bot.api.sendVideo(chatId, mediaUrl, opts)
    case 'animation':
      return bot.api.sendAnimation(chatId, mediaUrl, opts)
    case 'document':
      return bot.api.sendDocument(chatId, mediaUrl, opts)
    default:
      // Fallback: try as photo
      return bot.api.sendPhoto(chatId, mediaUrl, opts)
  }
}

// ── Keyboard Builder ─────────────────────────────────────────

function buildKeyboard(buttons: any[]): InlineKeyboard {
  const kb = new InlineKeyboard()
  if (!buttons.length) return kb

  // Group buttons by row
  const rows = new Map<number, any[]>()
  for (const btn of buttons) {
    const row = btn.row ?? 0
    if (!rows.has(row)) rows.set(row, [])
    rows.get(row)!.push(btn)
  }

  // Sort rows by key
  const sortedRows = [...rows.entries()].sort((a, b) => a[0] - b[0])

  for (const [_, rowButtons] of sortedRows) {
    rowButtons.sort((a: any, b: any) => (a.col ?? 0) - (b.col ?? 0) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

    for (const btn of rowButtons) {
      const label = btn.iconCustomEmojiId
        ? `${btn.label}`  // emoji handled by Telegram, label stays as-is
        : btn.label

      if (btn.type === 'url' && btn.url) {
        kb.url(label, btn.url)
      } else if (btn.type === 'copy' && btn.copyText) {
        // Copy button via callback that triggers copy
        kb.text(label, `copy:${btn.id}`)
      } else {
        // Default: block navigation via callback
        kb.text(label, `blk:${btn.id}`)
      }
    }
    kb.row()
  }

  return kb
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
