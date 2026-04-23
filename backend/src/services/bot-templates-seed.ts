/**
 * Bot & funnel templates seeder.
 *
 * On fresh installs the admin gets:
 *   - ready-to-use bot constructor blocks (menus, welcome flow, support, etc.)
 *   - 8 pre-built broadcast funnels (trial reminders, expiring alerts, etc.)
 *
 * Every INSERT in the accompanying .sql is guarded with `ON CONFLICT (id) DO
 * NOTHING`, so re-running is a no-op. Admin edits via UI always win — the
 * seeder never overwrites modified records.
 *
 * Safety rails:
 *   - Runs once per boot (skipped if the data already looks populated)
 *   - A single failed INSERT does NOT block the rest (we split on ';' and
 *     execute statements one by one, logging failures)
 *   - Loading this file does not touch the DB — only `seedBotTemplates()` does
 */

import fs from 'fs'
import path from 'path'
import { prisma } from '../db'
import { logger } from '../utils/logger'

const SQL_PATH = path.join(__dirname, 'seed-data', 'bot-templates-raw.sql')

export async function seedBotTemplates(): Promise<void> {
  // Quick probe — if admin already has custom blocks, don't reseed.
  // (New installs start at 0 so this skip only fires on established servers.)
  const alreadyHasData = await prisma.botBlock.count().catch(() => 0)
  if (alreadyHasData > 0) {
    logger.info(`[bot-templates-seed] skipped — ${alreadyHasData} blocks already present`)
    return
  }

  let sql: string
  try {
    sql = fs.readFileSync(SQL_PATH, 'utf-8')
  } catch (e: any) {
    logger.warn(`[bot-templates-seed] seed file missing at ${SQL_PATH} — ${e.message}`)
    return
  }

  // Split into individual statements. The file is a straight list of INSERTs
  // (one per line), so a naive split is fine here. Do NOT split the giant
  // CSV-like value blocks — Postgres INSERT stays on one line in pg_dump.
  const statements = sql
    .split(/;\s*$/m)
    .map(s => s.trim())
    .filter(s => s.startsWith('INSERT'))

  let ok = 0
  let fail = 0
  for (const stmt of statements) {
    try {
      await prisma.$executeRawUnsafe(stmt + ';')
      ok++
    } catch (e: any) {
      fail++
      logger.warn(`[bot-templates-seed] statement failed: ${e.message?.slice(0, 160)}`)
    }
  }
  logger.info(`[bot-templates-seed] inserted ${ok} rows (${fail} failed) — ${statements.length} total`)
}
