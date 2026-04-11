import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'crypto'
import ExcelJS from 'exceljs'
import { logger } from '../utils/logger'
import { prisma } from '../db'

// ── Types ────────────────────────────────────────────────────
interface ParsedFile {
  type: 'xlsx' | 'csv'
  headers: string[]
  rows: any[][]
  createdAt: number
}

interface ImportJob {
  id: string
  type: 'users' | 'payments'
  status: 'pending' | 'running' | 'done' | 'error'
  total: number
  processed: number
  created: number
  updated: number
  skipped: number
  errors: number
  errorMessages: string[]
  startedAt: Date
  finishedAt?: Date
}

// ── In-memory stores with TTL ────────────────────────────────
const files = new Map<string, ParsedFile>()
const jobs = new Map<string, ImportJob>()

const FILE_TTL_MS = 30 * 60 * 1000 // 30 min
const JOB_TTL_MS = 60 * 60 * 1000 // 1 hour

setInterval(() => {
  const now = Date.now()
  for (const [k, v] of files.entries()) {
    if (now - v.createdAt > FILE_TTL_MS) files.delete(k)
  }
  for (const [k, v] of jobs.entries()) {
    if (v.finishedAt && now - v.finishedAt.getTime() > JOB_TTL_MS) jobs.delete(k)
  }
}, 5 * 60 * 1000).unref()

// ── Helpers ──────────────────────────────────────────────────
function updateJob(jobId: string, patch: Partial<ImportJob>) {
  const j = jobs.get(jobId)
  if (!j) return
  Object.assign(j, patch)
}

function parseNumber(raw: any): number {
  if (raw == null || raw === '') return 0
  const s = String(raw).replace(',', '.').replace(/\s/g, '').replace(/[^\d.\-]/g, '')
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

function parseRussianDate(raw: any): Date | null {
  if (!raw) return null
  if (raw instanceof Date) return raw
  const s = String(raw).trim()
  // Format: DD.MM.YYYY HH:MM:SS or DD.MM.YYYY
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (m) {
    const [, dd, mm, yyyy, hh = '0', mi = '0', ss = '0'] = m
    const d = new Date(
      parseInt(yyyy),
      parseInt(mm) - 1,
      parseInt(dd),
      parseInt(hh),
      parseInt(mi),
      parseInt(ss),
    )
    return isNaN(d.getTime()) ? null : d
  }
  // Fallback ISO
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Parse a CSV line respecting quoted fields and the given delimiter.
 */
function parseCsvLine(line: string, delim: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === delim && !inQuotes) {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out.map((v) => v.trim())
}

function parseCsvBuffer(buf: Buffer): { headers: string[]; rows: any[][] } {
  let text = buf.toString('utf-8')
  // Strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  // Split on \r\n or \n, handle quoted newlines by simple split (the source is YuKassa — single-line rows)
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }

  // Detect delimiter: prefer `;` if present in the first line, else `,`
  const first = lines[0]
  const delim = first.includes(';') ? ';' : ','

  const headers = parseCsvLine(first, delim).map((h) => h.replace(/^"|"$/g, ''))
  const rows = lines.slice(1).map((line) => parseCsvLine(line, delim))
  return { headers, rows }
}

async function parseXlsxBuffer(buf: Buffer): Promise<{ headers: string[]; rows: any[][] }> {
  const wb = new ExcelJS.Workbook()
  // ExcelJS expects an ArrayBuffer-like value; cast keeps TS strictness happy
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  await wb.xlsx.load(ab as any)
  const ws = wb.worksheets[0]
  if (!ws) return { headers: [], rows: [] }

  const headers: string[] = []
  const rows: any[][] = []

  ws.eachRow((row, rowNum) => {
    const values = row.values as any[]
    // ExcelJS row.values is 1-indexed; first element is empty
    const arr: any[] = []
    for (let i = 1; i < values.length; i++) {
      let v = values[i]
      if (v == null) v = ''
      else if (typeof v === 'object' && 'text' in v) v = v.text
      else if (typeof v === 'object' && 'result' in v) v = v.result
      else if (v instanceof Date) v = v
      arr.push(v)
    }
    if (rowNum === 1) {
      for (const h of arr) headers.push(String(h ?? '').trim())
    } else {
      rows.push(arr)
    }
  })

  return { headers, rows }
}

function valueToString(v: any): string {
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') {
    if ('text' in v) return String((v as any).text ?? '')
    if ('result' in v) return String((v as any).result ?? '')
    return JSON.stringify(v)
  }
  return String(v)
}

// ── Routes ───────────────────────────────────────────────────
export async function adminImportRoutes(app: FastifyInstance) {
  const admin = { preHandler: [app.adminOnly] }

  // ── 1. Upload file ──────────────────────────────────────
  app.post('/upload', admin, async (req, reply) => {
    try {
      const data = await (req as any).file()
      if (!data) return reply.status(400).send({ error: 'No file uploaded' })

      const buf = await data.toBuffer()
      const filename: string = data.filename || 'upload'
      const ext = filename.split('.').pop()?.toLowerCase() || ''

      let parsed: { headers: string[]; rows: any[][] }
      let type: 'xlsx' | 'csv'
      if (ext === 'xlsx' || ext === 'xls') {
        parsed = await parseXlsxBuffer(buf)
        type = 'xlsx'
      } else if (ext === 'csv' || ext === 'txt') {
        parsed = parseCsvBuffer(buf)
        type = 'csv'
      } else {
        return reply.status(400).send({ error: `Unsupported file type: .${ext}` })
      }

      const fileId = randomUUID()
      files.set(fileId, {
        type,
        headers: parsed.headers,
        rows: parsed.rows,
        createdAt: Date.now(),
      })

      const preview = parsed.rows.slice(0, 10).map((r) => r.map(valueToString))

      logger.info(`Import file uploaded: ${filename} (${parsed.rows.length} rows, fileId=${fileId})`)

      return {
        fileId,
        type,
        headers: parsed.headers,
        preview,
        totalRows: parsed.rows.length,
      }
    } catch (err: any) {
      logger.error('Import upload failed: ' + (err?.message || String(err)))
      return reply.status(500).send({ error: 'Upload failed' })
    }
  })

  // ── 2. Start user import ────────────────────────────────
  app.post('/users/import', admin, async (req, reply) => {
    const { fileId, mapping } = req.body as { fileId: string; mapping: Record<string, string> }
    const file = files.get(fileId)
    if (!file) return reply.status(404).send({ error: 'File not found or expired' })

    const jobId = randomUUID()
    const job: ImportJob = {
      id: jobId,
      type: 'users',
      status: 'pending',
      total: file.rows.length,
      processed: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      errorMessages: [],
      startedAt: new Date(),
    }
    jobs.set(jobId, job)

    // Run async (fire-and-forget)
    runUserImport(jobId, file, mapping).catch((err) => {
      logger.error('User import crashed: ' + (err?.message || String(err)))
      updateJob(jobId, {
        status: 'error',
        errorMessages: [...(jobs.get(jobId)?.errorMessages || []), String(err?.message || err)],
        finishedAt: new Date(),
      })
    })

    return { jobId }
  })

  // ── 3. Start payment import ─────────────────────────────
  app.post('/payments/import', admin, async (req, reply) => {
    const { fileId, mapping } = req.body as { fileId: string; mapping: Record<string, string> }
    const file = files.get(fileId)
    if (!file) return reply.status(404).send({ error: 'File not found or expired' })

    const jobId = randomUUID()
    const job: ImportJob = {
      id: jobId,
      type: 'payments',
      status: 'pending',
      total: file.rows.length,
      processed: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      errorMessages: [],
      startedAt: new Date(),
    }
    jobs.set(jobId, job)

    runPaymentImport(jobId, file, mapping).catch((err) => {
      logger.error('Payment import crashed: ' + (err?.message || String(err)))
      updateJob(jobId, {
        status: 'error',
        errorMessages: [...(jobs.get(jobId)?.errorMessages || []), String(err?.message || err)],
        finishedAt: new Date(),
      })
    })

    return { jobId }
  })

  // ── 4. Progress (SSE) ───────────────────────────────────
  app.get('/jobs/:jobId', admin, async (req, reply) => {
    const { jobId } = req.params as { jobId: string }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    const interval = setInterval(() => {
      const job = jobs.get(jobId)
      if (!job) {
        clearInterval(interval)
        reply.raw.end()
        return
      }
      reply.raw.write(`data: ${JSON.stringify(job)}\n\n`)
      if (job.status === 'done' || job.status === 'error') {
        clearInterval(interval)
        setTimeout(() => reply.raw.end(), 1000)
      }
    }, 500)

    req.raw.on('close', () => clearInterval(interval))
  })

  // ── 5. Stats ────────────────────────────────────────────
  app.get('/stats', admin, async () => {
    try {
      const [usersWithLeadteh, paymentsWithCommission, commissionSumAgg] = await Promise.all([
        prisma.user.count({ where: { leadtehId: { not: null } } }),
        prisma.payment.count({ where: { commission: { gt: 0 } } }),
        prisma.payment.aggregate({
          _sum: { commission: true },
          where: { commission: { gt: 0 } },
        }),
      ])
      return {
        usersWithLeadtehId: usersWithLeadteh,
        paymentsWithCommission,
        totalCommission: Number(commissionSumAgg._sum.commission || 0),
      }
    } catch (err: any) {
      logger.error('Import stats failed: ' + (err?.message || String(err)))
      return { usersWithLeadtehId: 0, paymentsWithCommission: 0, totalCommission: 0 }
    }
  })

  // ── Legacy endpoints (preserved for compatibility) ──────
  app.get('/status', admin, async () => {
    try {
      const [total, matched, pending] = await Promise.all([
        prisma.importRecord.count(),
        prisma.importRecord.count({ where: { status: 'matched' } }),
        prisma.importRecord.count({ where: { status: 'pending' } }),
      ])
      return { total, matched, pending, unmatched: total - matched }
    } catch {
      return { total: 0, matched: 0, pending: 0, unmatched: 0 }
    }
  })
}

// ── Background workers ───────────────────────────────────────

async function runUserImport(
  jobId: string,
  file: ParsedFile,
  mapping: Record<string, string>,
) {
  updateJob(jobId, { status: 'running' })
  const job = jobs.get(jobId)!

  // Build column index by header
  const colIdx: Record<string, number> = {}
  for (const [header, field] of Object.entries(mapping)) {
    if (!field || field === '-') continue
    const idx = file.headers.indexOf(header)
    if (idx >= 0) colIdx[field] = idx
  }

  const getField = (row: any[], field: string): string => {
    const idx = colIdx[field]
    if (idx == null) return ''
    return valueToString(row[idx]).trim()
  }

  // Cache referrer data for pass 2
  const referrerMap: Array<{ userTelegramId: string; referrerLeadtehId?: string; referrerTgId?: string }> = []

  for (let i = 0; i < file.rows.length; i++) {
    const row = file.rows[i]
    try {
      const telegramId = getField(row, 'telegramId')
      if (!telegramId) {
        job.skipped += 1
        job.processed += 1
        continue
      }

      const leadtehId = getField(row, 'leadtehId') || null
      const telegramName = getField(row, 'telegramName') || null
      const email = getField(row, 'email') || null
      const remnawaveUuid = getField(row, 'remnawaveUuid') || null
      const balanceRaw = getField(row, 'balance')
      const balance = balanceRaw ? parseNumber(balanceRaw) : null
      const referrerLeadtehId = getField(row, 'referrerLeadtehId') || null
      const referrerTgId = getField(row, 'referrerTgId') || null

      if (referrerLeadtehId || referrerTgId) {
        referrerMap.push({
          userTelegramId: telegramId,
          referrerLeadtehId: referrerLeadtehId || undefined,
          referrerTgId: referrerTgId || undefined,
        })
      }

      const createData: any = { telegramId }
      const updateData: any = {}

      if (leadtehId) {
        createData.leadtehId = leadtehId
        updateData.leadtehId = leadtehId
      }
      if (telegramName) {
        createData.telegramName = telegramName
        updateData.telegramName = telegramName
      }
      if (email) {
        createData.email = email
        // Do not overwrite existing email by default — but the task says to fill fields. Keep safe update.
        updateData.email = email
      }
      if (remnawaveUuid) {
        createData.remnawaveUuid = remnawaveUuid
        updateData.remnawaveUuid = remnawaveUuid
      }
      if (balance != null) {
        createData.balance = balance
        updateData.balance = balance
      }

      // Upsert — check if user exists so we can increment created/updated
      const existing = await prisma.user.findUnique({ where: { telegramId } })
      try {
        await prisma.user.upsert({
          where: { telegramId },
          create: createData,
          update: updateData,
        })
        if (existing) job.updated += 1
        else job.created += 1
      } catch (err: any) {
        // Could fail due to unique email/leadtehId clash — retry without those fields
        const safeCreate = { ...createData }
        const safeUpdate = { ...updateData }
        delete safeCreate.email
        delete safeUpdate.email
        delete safeCreate.leadtehId
        delete safeUpdate.leadtehId
        try {
          await prisma.user.upsert({
            where: { telegramId },
            create: safeCreate,
            update: safeUpdate,
          })
          if (existing) job.updated += 1
          else job.created += 1
        } catch (err2: any) {
          job.errors += 1
          if (job.errorMessages.length < 20) {
            job.errorMessages.push(`Row ${i + 2}: ${String(err2?.message || err2).slice(0, 200)}`)
          }
        }
      }
    } catch (err: any) {
      job.errors += 1
      if (job.errorMessages.length < 20) {
        job.errorMessages.push(`Row ${i + 2}: ${String(err?.message || err).slice(0, 200)}`)
      }
    }
    job.processed += 1
  }

  // ── Pass 2: referrals ────────────────────────────────
  for (const rel of referrerMap) {
    try {
      let referrerUserId: string | null = null
      if (rel.referrerLeadtehId) {
        const r = await prisma.user.findUnique({
          where: { leadtehId: rel.referrerLeadtehId },
          select: { id: true },
        })
        if (r) referrerUserId = r.id
      }
      if (!referrerUserId && rel.referrerTgId) {
        const r = await prisma.user.findUnique({
          where: { telegramId: rel.referrerTgId },
          select: { id: true },
        })
        if (r) referrerUserId = r.id
      }
      if (referrerUserId) {
        await prisma.user.update({
          where: { telegramId: rel.userTelegramId },
          data: { referredById: referrerUserId },
        })
      }
    } catch {
      /* ignore individual referral failures */
    }
  }

  updateJob(jobId, { status: 'done', finishedAt: new Date() })
  logger.info(
    `User import done: created=${job.created} updated=${job.updated} skipped=${job.skipped} errors=${job.errors}`,
  )
}

async function runPaymentImport(
  jobId: string,
  file: ParsedFile,
  mapping: Record<string, string>,
) {
  updateJob(jobId, { status: 'running' })
  const job = jobs.get(jobId)!

  const colIdx: Record<string, number> = {}
  for (const [header, field] of Object.entries(mapping)) {
    if (!field || field === '-') continue
    const idx = file.headers.indexOf(header)
    if (idx >= 0) colIdx[field] = idx
  }

  const getField = (row: any[], field: string): string => {
    const idx = colIdx[field]
    if (idx == null) return ''
    return valueToString(row[idx]).trim()
  }

  // Find a default tariff (required for payment.tariffId)
  const defaultTariff = await prisma.tariff.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!defaultTariff) {
    updateJob(jobId, {
      status: 'error',
      finishedAt: new Date(),
      errorMessages: ['No tariff found in DB — create at least one tariff before importing payments'],
    })
    return
  }

  const idRegex = /\[ID(\d+)\]/

  for (let i = 0; i < file.rows.length; i++) {
    const row = file.rows[i]
    try {
      // Status must be explicitly "Оплачен" / "paid" / "succeeded".
      // Empty/missing status → skip (safety: we don't import rows without confirmed status).
      const status = (getField(row, 'status') || '').toLowerCase().trim()
      const isPaid = status === 'оплачен' || status === 'succeeded' || status === 'paid'
      if (!isPaid) {
        job.skipped += 1
        job.processed += 1
        continue
      }

      const description = getField(row, 'description')
      const m = description.match(idRegex)
      if (!m) {
        job.skipped += 1
        job.processed += 1
        continue
      }
      const leadtehId = m[1]

      const user = await prisma.user.findUnique({ where: { leadtehId } })
      if (!user) {
        job.skipped += 1
        job.processed += 1
        continue
      }

      const externalPaymentId = getField(row, 'externalPaymentId')
      if (externalPaymentId) {
        const existing = await prisma.payment.findUnique({ where: { externalPaymentId } })
        if (existing) {
          job.skipped += 1
          job.processed += 1
          continue
        }
      }

      const grossAmount = parseNumber(getField(row, 'grossAmount'))
      const amount = parseNumber(getField(row, 'amount'))
      if (!amount || amount <= 0) {
        job.skipped += 1
        job.processed += 1
        continue
      }
      const commission = Math.max(0, +(grossAmount - amount).toFixed(2))
      // Require valid date — if can't parse, skip (don't fall back to now)
      const createdAtRaw = getField(row, 'createdAt')
      const createdAt = parseRussianDate(createdAtRaw)
      if (!createdAt) {
        job.skipped += 1
        job.processed += 1
        continue
      }

      await prisma.$transaction(async (tx) => {
        await tx.payment.create({
          data: {
            userId: user.id,
            tariffId: defaultTariff.id,
            provider: 'YUKASSA',
            providerOrderId: externalPaymentId || null,
            externalPaymentId: externalPaymentId || null,
            amount,
            commission,
            currency: 'RUB',
            status: 'PAID',
            createdAt,
            confirmedAt: createdAt,
          },
        })
        await tx.user.update({
          where: { id: user.id },
          data: {
            totalPaid: { increment: amount },
            paymentsCount: { increment: 1 },
            lastPaymentAt: createdAt,
          },
        })
      })

      job.created += 1
    } catch (err: any) {
      job.errors += 1
      if (job.errorMessages.length < 20) {
        job.errorMessages.push(`Row ${i + 2}: ${String(err?.message || err).slice(0, 200)}`)
      }
    }
    job.processed += 1
  }

  updateJob(jobId, { status: 'done', finishedAt: new Date() })
  logger.info(
    `Payment import done: created=${job.created} skipped=${job.skipped} errors=${job.errors}`,
  )
}
