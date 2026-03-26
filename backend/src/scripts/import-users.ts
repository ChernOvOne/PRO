#!/usr/bin/env node
/**
 * HIDEYOU — Import existing user base
 * Reads ./data/import.csv or ./data/import.json
 * Matches users by email or telegram_id in REMNAWAVE
 */

import { PrismaClient } from '@prisma/client'
import { remnawave }    from '../services/remnawave'
import { logger }       from '../utils/logger'
import path             from 'path'
import fs               from 'fs'

const prisma = new PrismaClient()

interface ImportRow {
  email?:       string
  telegram_id?: string
}

async function parseImportFile(): Promise<ImportRow[]> {
  const csvPath  = path.resolve('./data/import.csv')
  const jsonPath = path.resolve('./data/import.json')

  if (fs.existsSync(jsonPath)) {
    logger.info(`Reading ${jsonPath}`)
    return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
  }

  if (fs.existsSync(csvPath)) {
    logger.info(`Reading ${csvPath}`)
    const lines = fs.readFileSync(csvPath, 'utf-8').split('\n').filter(Boolean)
    const headers = lines[0].split(',').map(h => h.trim())
    return lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim())
      return Object.fromEntries(headers.map((h, i) => [h, values[i]])) as ImportRow
    })
  }

  throw new Error('No import file found at ./data/import.csv or ./data/import.json')
}

async function importUsers() {
  logger.info('Starting user import...')
  const rows = await parseImportFile()
  logger.info(`Found ${rows.length} records to import`)

  let created  = 0
  let matched  = 0
  let skipped  = 0
  let errors   = 0

  for (const [i, row] of rows.entries()) {
    if (!row.email && !row.telegram_id) {
      logger.warn(`Row ${i + 1}: no email or telegram_id, skipping`)
      skipped++
      continue
    }

    try {
      // Check if already in our DB
      const existing = await prisma.user.findFirst({
        where: {
          OR: [
            row.email       ? { email:      row.email }                  : {},
            row.telegram_id ? { telegramId: row.telegram_id }            : {},
          ].filter(Boolean),
        },
      })

      if (existing?.remnawaveUuid) {
        skipped++
        continue
      }

      // Try to find in REMNAWAVE
      let rmUser = null
      let matchedBy = ''

      if (row.email) {
        rmUser = await remnawave.getUserByEmail(row.email)
        if (rmUser) matchedBy = 'email'
      }
      if (!rmUser && row.telegram_id) {
        rmUser = await remnawave.getUserByTelegramId(row.telegram_id)
        if (rmUser) matchedBy = 'telegram_id'
      }

      if (existing) {
        // Update existing user with REMNAWAVE data
        await prisma.user.update({
          where: { id: existing.id },
          data:  {
            remnawaveUuid: rmUser?.uuid || null,
            subStatus:     rmUser ? 'ACTIVE' : 'INACTIVE',
            subExpireAt:   rmUser?.expireAt ? new Date(rmUser.expireAt) : null,
            subLink:       rmUser ? remnawave.getSubscriptionUrl(rmUser.uuid) : null,
          },
        })

        await prisma.importRecord.upsert({
          where:  { userId: existing.id },
          create: {
            userId:          existing.id,
            sourceEmail:     row.email,
            sourceTelegramId: row.telegram_id,
            remnawaveUuid:   rmUser?.uuid,
            matchedBy,
            status:          rmUser ? 'matched' : 'pending',
          },
          update: {
            remnawaveUuid: rmUser?.uuid,
            matchedBy,
            status:        rmUser ? 'matched' : 'pending',
          },
        })

        matched++
      } else {
        // Create new user
        const newUser = await prisma.user.create({
          data: {
            email:         row.email || null,
            telegramId:    row.telegram_id || null,
            remnawaveUuid: rmUser?.uuid || null,
            subStatus:     rmUser ? 'ACTIVE' : 'INACTIVE',
            subExpireAt:   rmUser?.expireAt ? new Date(rmUser.expireAt) : null,
            subLink:       rmUser ? remnawave.getSubscriptionUrl(rmUser.uuid) : null,
          },
        })

        await prisma.importRecord.create({
          data: {
            userId:          newUser.id,
            sourceEmail:     row.email,
            sourceTelegramId: row.telegram_id,
            remnawaveUuid:   rmUser?.uuid,
            matchedBy,
            status:          rmUser ? 'matched' : 'pending',
          },
        })

        created++
      }

      if ((i + 1) % 50 === 0) {
        logger.info(`Progress: ${i + 1}/${rows.length} (created: ${created}, matched: ${matched}, skipped: ${skipped})`)
      }

    } catch (err) {
      logger.error(`Row ${i + 1} error:`, err)
      errors++
    }
  }

  logger.info('═══════════════════════════════════')
  logger.info(`Import complete!`)
  logger.info(`Created:  ${created}`)
  logger.info(`Matched:  ${matched}`)
  logger.info(`Skipped:  ${skipped}`)
  logger.info(`Errors:   ${errors}`)
  logger.info(`Total:    ${rows.length}`)
  logger.info('═══════════════════════════════════')

  await prisma.$disconnect()
}

importUsers().catch(err => {
  logger.error('Import failed:', err)
  process.exit(1)
})
