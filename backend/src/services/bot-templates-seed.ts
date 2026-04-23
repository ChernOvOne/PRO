/**
 * Bot & funnel templates seeder.
 *
 * Writes ready-to-use bot constructor blocks + 8 broadcast funnels so a fresh
 * install has something on the canvas immediately.
 *
 * Every INSERT in the SQL is `ON CONFLICT (id) DO NOTHING`, so re-running is
 * completely safe — admin edits via UI are never overwritten.
 *
 * Why we always run the INSERTs (and don't short-circuit on "some data exists"):
 * the first boot can fail mid-way (network hiccup, race with schema push,
 * constraint error on a single row). A short-circuit check meant that after
 * a partial first run the second boot skipped everything and the admin was
 * left with a half-populated canvas. Now we always attempt the full file —
 * successful rows are no-ops, missing rows get added.
 *
 * Exports:
 *   - seedBotTemplates()        — called on backend bootstrap
 *   - reseedBotTemplates()      — public API for the admin "reseed" button
 */

import fs from 'fs'
import path from 'path'
import { prisma } from '../db'
import { logger } from '../utils/logger'

const SQL_PATH = path.join(__dirname, 'seed-data', 'bot-templates-raw.sql')

type SeedResult = { ok: number; fail: number; total: number; skipped?: true; reason?: string }

async function runSeedFile(): Promise<SeedResult> {
  let sql: string
  try {
    sql = fs.readFileSync(SQL_PATH, 'utf-8')
  } catch (e: any) {
    logger.warn(`[bot-templates-seed] seed file missing at ${SQL_PATH} — ${e.message}`)
    return { ok: 0, fail: 0, total: 0, skipped: true, reason: `seed file missing: ${e.message}` }
  }

  // pg_dump --inserts --column-inserts writes one logical INSERT per "row", but
  // a value that contains a literal newline (happens in bot_blocks.text) breaks
  // naive ";$" splitting. Split on the ON CONFLICT marker instead — pg_dump
  // puts that at the end of every statement and it cannot occur inside values.
  const statements = sql
    .split(/ON CONFLICT DO NOTHING;\s*/)
    .map(chunk => {
      const idx = chunk.indexOf('INSERT')
      if (idx < 0) return null
      return chunk.slice(idx).trim() + ' ON CONFLICT DO NOTHING;'
    })
    .filter((s): s is string => s !== null && s.length > 40)

  let ok = 0
  let fail = 0
  for (const stmt of statements) {
    try {
      await prisma.$executeRawUnsafe(stmt + ';')
      ok++
    } catch (e: any) {
      fail++
      logger.warn(`[bot-templates-seed] statement failed: ${e.message?.slice(0, 200)}`)
    }
  }
  return { ok, fail, total: statements.length }
}

/**
 * Called at backend boot. Always attempts INSERTs because ON CONFLICT DO
 * NOTHING makes it idempotent — already-present rows simply don't count.
 */
export async function seedBotTemplates(): Promise<void> {
  const res = await runSeedFile()
  if (res.skipped) {
    logger.info(`[bot-templates-seed] skipped — ${res.reason}`)
    return
  }
  // ok === new inserts, fail === non-conflict errors.
  // Conflicts (ON CONFLICT DO NOTHING) succeed silently with ok++ (they just
  // don't affect any row), which is what we want.
  logger.info(`[bot-templates-seed] finished — ${res.ok} statements applied, ${res.fail} failed (out of ${res.total})`)
}

/**
 * Explicit "redeploy templates" action triggered by the admin from the UI.
 * Same logic as boot-time seeding but returns counts for the response.
 */
export async function reseedBotTemplates(): Promise<SeedResult> {
  return runSeedFile()
}
