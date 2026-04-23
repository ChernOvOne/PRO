import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import Redis from 'ioredis'
import { logger } from '../utils/logger'
import * as fs from 'fs'
import * as path from 'path'

const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379'
const BACKUPS_DIR = '/app/data/backups'  // mounted from host
const GITHUB_REPO = 'ChernOvOne/PRO'

let ghCache: { ts: number; releases: any[] } = { ts: 0, releases: [] }

async function fetchReleases(): Promise<any[]> {
  if (Date.now() - ghCache.ts < 60_000) return ghCache.releases
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=30`, {
      headers: { 'User-Agent': 'hideyou-backend' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`GitHub ${res.status}`)
    const releases = await res.json() as any[]
    ghCache = { ts: Date.now(), releases }
    return releases
  } catch (e: any) {
    logger.warn('GitHub releases fetch failed', { error: e.message })
    return ghCache.releases
  }
}

export async function adminUpdatesRoutes(app: FastifyInstance) {
  const admin = { preHandler: [app.adminOnly] }

  /**
   * GET /status — current installed version + available releases
   */
  app.get('/status', admin, async () => {
    // Derive current version from the most recent successful (non-failed) update event.
    // Falls back to a version file written by the updater, or a stored setting.
    let current: { sha: string | null; tag: string | null } = { sha: null, tag: null }

    const lastOk = await prisma.updateEvent.findFirst({
      where: { status: 'ok' },
      orderBy: { finishedAt: 'desc' },
      select: { toSha: true, toTag: true },
    })
    if (lastOk) {
      current = { sha: lastOk.toSha, tag: lastOk.toTag }
    } else {
      // Fallback: settings row set by bootstrap / manual update
      const row = await prisma.setting.findUnique({ where: { key: 'current_version' } })
      if (row?.value) {
        try { current = JSON.parse(row.value) } catch {}
      }
      // Last-resort: the JSON file the updater may have written
      try {
        const vfile = path.join('/app/data', 'current-version.json')
        if (fs.existsSync(vfile) && !current.tag) {
          current = JSON.parse(fs.readFileSync(vfile, 'utf8'))
        }
      } catch {}
    }

    const releases = await fetchReleases()
    // Find "available" releases: anything newer than current tag, ordered.
    const currentIdx = releases.findIndex(r => r.tag_name === current.tag)
    const available = currentIdx > 0 ? releases.slice(0, currentIdx) : releases

    // Maintenance flag
    const maint = await prisma.setting.findUnique({ where: { key: 'maintenance_mode' } })

    return {
      current,
      latest: releases[0] || null,
      available: available.map(r => ({
        tag: r.tag_name,
        name: r.name,
        body: r.body?.slice(0, 4000) || null,
        publishedAt: r.published_at,
        prerelease: r.prerelease,
        htmlUrl: r.html_url,
      })),
      maintenance: maint?.value === '1',
    }
  })

  /**
   * POST /check — ask updater to refresh GitHub state + git fetch
   */
  app.post('/check', admin, async () => {
    const client = new Redis(REDIS_URL)
    try {
      await client.rpush('update:queue', JSON.stringify({ type: 'check' }))
    } finally { client.disconnect() }
    // Also refresh our own cache
    ghCache.ts = 0
    return { ok: true }
  })

  /**
   * POST /install — queue an update job
   * Body: { tag: 'v5.7.0' }
   */
  app.post('/install', admin, async (req, reply) => {
    const body = z.object({ tag: z.string().min(1) }).parse(req.body)
    const userId = (req as any).user?.sub

    // Create event row in 'pending' state
    const event = await prisma.updateEvent.create({
      data: {
        status: 'pending',
        toTag: body.tag,
        triggeredBy: userId || null,
      },
    })

    const client = new Redis(REDIS_URL)
    try {
      await client.rpush('update:queue', JSON.stringify({
        type: 'install',
        tag: body.tag,
        eventId: event.id,
        triggeredBy: userId,
      }))
    } finally { client.disconnect() }
    return { ok: true, eventId: event.id }
  })

  /**
   * POST /rollback/:backupId — restore from backup
   */
  app.post('/rollback/:backupId', admin, async (req, reply) => {
    const { backupId } = z.object({ backupId: z.string() }).parse(req.params)
    const userId = (req as any).user?.sub

    const backup = await prisma.backup.findUnique({ where: { id: backupId } })
    if (!backup) return reply.status(404).send({ error: 'Backup not found' })

    const event = await prisma.updateEvent.create({
      data: {
        status: 'pending',
        isRollback: true,
        backupId,
        fromTag: backup.gitTag || null,
        fromSha: backup.gitSha || null,
        toTag: backup.gitTag || null,
        toSha: backup.gitSha || null,
        triggeredBy: userId || null,
      },
    })

    const client = new Redis(REDIS_URL)
    try {
      await client.rpush('update:queue', JSON.stringify({
        type: 'rollback',
        backupId,
        eventId: event.id,
        triggeredBy: userId,
      }))
    } finally { client.disconnect() }
    return { ok: true, eventId: event.id }
  })

  /**
   * GET /events/:id — single event status (for polling when SSE drops)
   */
  app.get('/events/:id', admin, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    const ev = await prisma.updateEvent.findUnique({ where: { id } })
    if (!ev) return reply.status(404).send({ error: 'Not found' })
    return ev
  })

  /**
   * GET /history — paginated update events
   */
  app.get('/history', admin, async (req) => {
    const q = z.object({
      limit: z.coerce.number().min(1).max(100).default(20),
    }).parse(req.query || {})
    const items = await prisma.updateEvent.findMany({
      orderBy: { startedAt: 'desc' },
      take: q.limit,
      include: { backup: { select: { filename: true, sizeBytes: true, createdAt: true } } },
    })
    return items.map(i => ({
      ...i,
      backup: i.backup ? { ...i.backup, sizeBytes: String(i.backup.sizeBytes) } : null,
    }))
  })

  /**
   * GET /backups — list backups
   */
  app.get('/backups', admin, async () => {
    const items = await prisma.backup.findMany({ orderBy: { createdAt: 'desc' } })
    return items.map(b => ({ ...b, sizeBytes: String(b.sizeBytes) }))
  })

  /**
   * POST /backups — create manual backup
   */
  app.post('/backups', admin, async (req) => {
    const userId = (req as any).user?.sub
    const event = await prisma.updateEvent.create({
      data: { status: 'pending', triggeredBy: userId || null },
    })
    const client = new Redis(REDIS_URL)
    try {
      await client.rpush('update:queue', JSON.stringify({
        type: 'backup',
        reason: 'manual',
        eventId: event.id,
        triggeredBy: userId,
      }))
    } finally { client.disconnect() }
    return { ok: true, eventId: event.id }
  })

  /**
   * DELETE /backups/:id — remove backup file + DB row
   */
  app.delete('/backups/:id', admin, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    const b = await prisma.backup.findUnique({ where: { id } })
    if (!b) return reply.status(404).send({ error: 'Not found' })
    try {
      fs.unlinkSync(path.join(BACKUPS_DIR, b.filename))
    } catch {}
    await prisma.backup.delete({ where: { id } })
    return { ok: true }
  })

  /**
   * GET /stream — SSE of update:events + maintenance toggle
   */
  app.get('/stream', admin, async (req, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    reply.raw.write(':ok\n\n')

    const client = new Redis(REDIS_URL)
    client.on('message', (_channel, message) => {
      reply.raw.write(`data: ${message}\n\n`)
    })
    client.subscribe('update:events', (err) => {
      if (err) logger.error('SSE subscribe failed', { error: err.message })
    })

    const heartbeat = setInterval(() => {
      try { reply.raw.write(':hb\n\n') } catch {}
    }, 15000)

    req.raw.on('close', () => {
      clearInterval(heartbeat)
      client.disconnect()
    })
  })

  /**
   * POST /maintenance — manually toggle maintenance mode
   */
  app.post('/maintenance', admin, async (req) => {
    const body = z.object({
      enabled: z.boolean(),
      message: z.string().optional(),
    }).parse(req.body)

    await prisma.setting.upsert({
      where: { key: 'maintenance_mode' },
      update: { value: body.enabled ? '1' : '0' },
      create: { key: 'maintenance_mode', value: body.enabled ? '1' : '0' },
    })
    if (body.message) {
      await prisma.setting.upsert({
        where: { key: 'maintenance_message' },
        update: { value: body.message },
        create: { key: 'maintenance_message', value: body.message },
      })
    }
    return { ok: true }
  })
}
