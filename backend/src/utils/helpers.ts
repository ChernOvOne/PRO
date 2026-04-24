/**
 * Simple in-process rate limiter for non-HTTP use cases
 * (e.g. throttling REMNAWAVE API calls during bulk sync)
 */
export class RateLimiter {
  private queue:     Array<() => void> = []
  private running:   number = 0
  private readonly maxConcurrent: number
  private readonly delayMs:       number

  constructor(options: { maxConcurrent?: number; delayMs?: number } = {}) {
    this.maxConcurrent = options.maxConcurrent ?? 5
    this.delayMs       = options.delayMs       ?? 100
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.waitForSlot()
    this.running++
    try {
      const result = await fn()
      if (this.delayMs > 0) await sleep(this.delayMs)
      return result
    } finally {
      this.running--
      this.next()
    }
  }

  private waitForSlot(): Promise<void> {
    if (this.running < this.maxConcurrent) return Promise.resolve()
    return new Promise<void>(resolve => this.queue.push(resolve))
  }

  private next() {
    if (this.queue.length > 0 && this.running < this.maxConcurrent) {
      const resolve = this.queue.shift()!
      resolve()
    }
  }
}

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * Chunk an array into smaller arrays
 */
export function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k     = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i     = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

/**
 * Format days to human-readable period (Russian)
 */
export function formatDaysRu(days: number): string {
  if (days === 1)              return '1 день'
  if (days >= 2 && days <= 4) return `${days} дня`
  if (days === 30)             return '1 месяц'
  if (days === 90)             return '3 месяца'
  if (days === 180)            return '6 месяцев'
  if (days === 365)            return '1 год'
  return `${days} дней`
}

/**
 * Safe JSON parse — returns null on failure
 */
export function safeJson<T>(str: string): T | null {
  try { return JSON.parse(str) as T }
  catch { return null }
}

/**
 * Generate a random referral-friendly code (6 chars, no ambiguous chars).
 * Uses CSPRNG — referral codes back balance/days credits, predictable
 * codes would let an attacker enumerate and steal pending bonuses.
 */
export function generateCode(length = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  // require here to keep this util usable in environments without crypto
  // shimming (it's always available in Node).
  const { randomInt } = require('crypto') as typeof import('crypto')
  return Array.from(
    { length },
    () => chars[randomInt(0, chars.length)],
  ).join('')
}
