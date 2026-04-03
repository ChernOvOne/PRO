import Redis from 'ioredis'
import { config } from '../config'
import { logger } from '../utils/logger'

const redis = new Redis(config.redis.url)

// ── Types ────────────────────────────────────────────────────

export interface UserState {
  waitingInput?: boolean
  blockId?: string
  inputVar?: string
  inputValidation?: string  // email | phone | number | text
  nextBlockId?: string | null
}

// ── Redis key helpers ────────────────────────────────────────

const STATE_PREFIX   = 'bot:state:'
const DELAYED_KEY    = 'bot:delayed'

function stateKey(userId: string): string {
  return `${STATE_PREFIX}${userId}`
}

function delayedMember(userId: string, blockId: string): string {
  return `${userId}:${blockId}`
}

// ── User State ───────────────────────────────────────────────

export async function getUserState(userId: string): Promise<UserState | null> {
  try {
    const raw = await redis.get(stateKey(userId))
    if (!raw) return null
    return JSON.parse(raw) as UserState
  } catch (e) {
    logger.error(`getUserState failed for ${userId}`, e)
    return null
  }
}

export async function setUserState(
  userId: string,
  state: UserState,
  ttlSeconds = 3600,
): Promise<void> {
  try {
    const key = stateKey(userId)
    await redis.set(key, JSON.stringify(state), 'EX', ttlSeconds)
  } catch (e) {
    logger.error(`setUserState failed for ${userId}`, e)
  }
}

export async function clearUserState(userId: string): Promise<void> {
  try {
    await redis.del(stateKey(userId))
  } catch (e) {
    logger.error(`clearUserState failed for ${userId}`, e)
  }
}

// ── Delayed / Scheduled Blocks ───────────────────────────────
// Uses a Redis sorted set where score = unix timestamp (ms)

export async function scheduleBlock(
  userId: string,
  blockId: string,
  executeAt: Date,
): Promise<void> {
  try {
    const member = delayedMember(userId, blockId)
    await redis.zadd(DELAYED_KEY, executeAt.getTime(), member)
    logger.debug(`Scheduled block ${blockId} for user ${userId} at ${executeAt.toISOString()}`)
  } catch (e) {
    logger.error(`scheduleBlock failed for ${userId}/${blockId}`, e)
  }
}

/**
 * Returns all blocks whose scheduled time has passed (score <= now).
 */
export async function getScheduledBlocks(): Promise<Array<{ userId: string; blockId: string }>> {
  try {
    const now = Date.now()
    const members = await redis.zrangebyscore(DELAYED_KEY, 0, now)
    return members.map((m) => {
      const [userId, blockId] = m.split(':')
      return { userId, blockId }
    })
  } catch (e) {
    logger.error('getScheduledBlocks failed', e)
    return []
  }
}

export async function removeScheduledBlock(userId: string, blockId: string): Promise<void> {
  try {
    await redis.zrem(DELAYED_KEY, delayedMember(userId, blockId))
  } catch (e) {
    logger.error(`removeScheduledBlock failed for ${userId}/${blockId}`, e)
  }
}

// ── Last Message ID (for deletePrev) ────────────────────────

export async function setLastMessageId(chatId: string, messageId: number): Promise<void> {
  try {
    await redis.set(`bot:lastmsg:${chatId}`, String(messageId), 'EX', 3600)
  } catch {}
}

export async function getLastMessageId(chatId: string): Promise<number | null> {
  try {
    const val = await redis.get(`bot:lastmsg:${chatId}`)
    return val ? parseInt(val, 10) : null
  } catch { return null }
}
