import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'
import Redis from 'ioredis'
import { logger } from '../utils/logger'
import * as fs from 'fs'
import * as path from 'path'
import { pipeline } from 'stream/promises'
import { createWriteStream } from 'fs'
import { execSync } from 'child_process'

const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379'
const BACKUPS_DIR = '/app/data/backups'  // mounted from host
const GITHUB_REPO = 'ChernOvOne/PRO'

let ghCache: { ts: number; releases: any[] } = { ts: 0, releases: [] }

async function getGithubToken(): Promise<string> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: 'github_token' } })
    if (row?.value?.trim()) return row.value.trim()
  } catch {}
  return (process.env.GITHUB_TOKEN || '').trim()
}

async function fetchReleases(): Promise<any[]> {
  if (Date.now() - ghCache.ts < 60_000) return ghCache.releases
  try {
    const headers: Record<string, string> = { 'User-Agent': 'hideyou-backend' }
    const token = await getGithubToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=30`, {
      headers,
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
   *
   * Tag is forwarded to git/shell inside the updater container (which mounts
   * docker.sock). We strictly whitelist allowed characters here so a malicious
   * admin token can't leverage shell expansion to break out of the container.
   */
  app.post('/install', admin, async (req, reply) => {
    const body = z.object({
      tag: z.string().min(1).max(64).regex(/^v?[A-Za-z0-9._-]+$/, {
        message: 'tag must be alphanumeric/dot/dash/underscore only',
      }),
    }).parse(req.body)
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
   * GET /backups/:id/download — stream backup tar.gz to admin
   */
  app.get('/backups/:id/download', admin, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    const b = await prisma.backup.findUnique({ where: { id } })
    if (!b) return reply.status(404).send({ error: 'Not found' })
    const fp = path.join(BACKUPS_DIR, b.filename)
    if (!fs.existsSync(fp)) return reply.status(404).send({ error: 'File missing on disk' })
    const stat = fs.statSync(fp)
    reply.header('Content-Type', 'application/gzip')
    reply.header('Content-Length', stat.size)
    reply.header('Content-Disposition', `attachment; filename="${b.filename}"`)
    return reply.send(fs.createReadStream(fp))
  })

  /**
   * POST /backups/upload — accept uploaded tar.gz, place it into backups dir,
   * create a DB row so admin can trigger rollback to it via the standard flow.
   * Accepts up to 500 MB.
   */
  app.post('/backups/upload', admin, async (req, reply) => {
    const userId = (req as any).user?.sub
    // @ts-ignore - multipart is registered in index.ts
    const data = await (req as any).file({ limits: { fileSize: 500 * 1024 * 1024 } })
    if (!data) return reply.status(400).send({ error: 'No file' })
    const origName = String(data.filename || 'backup.tar.gz')
    if (!/\.tar\.gz$/i.test(origName)) {
      return reply.status(400).send({ error: 'Only .tar.gz backups are accepted' })
    }

    // Normalize filename: keep timestamp+uploaded marker
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const safeBase = origName.replace(/[^A-Za-z0-9._-]/g, '_').replace(/\.tar\.gz$/i, '')
    const finalName = `backup__${ts}__uploaded__${safeBase}.tar.gz`
    const finalPath = path.join(BACKUPS_DIR, finalName)

    try {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true })
      await pipeline(data.file, createWriteStream(finalPath))
    } catch (e: any) {
      try { fs.unlinkSync(finalPath) } catch {}
      return reply.status(500).send({ error: `Upload failed: ${e.message}` })
    }

    // Validate: must be a valid gzip tarball containing meta.json + db.sql
    try {
      execSync(`tar tzf "${finalPath}" | grep -E '^\\./(meta\\.json|db\\.sql)$' | wc -l`, { encoding: 'utf8' })
    } catch {
      try { fs.unlinkSync(finalPath) } catch {}
      return reply.status(400).send({ error: 'Archive is not a valid HIDEYOU backup (missing meta.json or db.sql)' })
    }

    const stat = fs.statSync(finalPath)
    // Parse meta for sha/tag (best-effort)
    let sha: string | null = null
    let tag: string | null = null
    try {
      const meta = execSync(`tar xzf "${finalPath}" -O ./meta.json 2>/dev/null`, { encoding: 'utf8' })
      const parsed = JSON.parse(meta)
      sha = parsed.git_sha || null
      tag = parsed.git_tag || null
    } catch {}

    const row = await prisma.backup.create({
      data: {
        filename: finalName,
        sizeBytes: BigInt(stat.size),
        gitSha: sha,
        gitTag: tag,
        reason: 'uploaded',
        createdBy: userId || null,
      },
    })

    return { ok: true, id: row.id, filename: finalName, size: stat.size }
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
   * POST /github-token/test — verify a token has read access to GITHUB_REPO.
   * Body: { token: string } (optional — if absent, tests stored value)
   */
  app.post('/github-token/test', admin, async (req, reply) => {
    const body = (req.body || {}) as { token?: string }
    const token = (body.token || '').trim() || await getGithubToken()
    if (!token) return reply.status(400).send({ error: 'no token provided or stored' })
    try {
      const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
        headers: {
          'User-Agent': 'hideyou-backend',
          'Authorization': `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(10_000),
      })
      if (res.status === 200) {
        const data = await res.json() as any
        return { ok: true, private: !!data.private, permissions: data.permissions || null }
      }
      return reply.status(400).send({ error: `GitHub returned ${res.status}` })
    } catch (e: any) {
      return reply.status(500).send({ error: e.message })
    }
  })

  /**
   * GET /backup-settings — where/when/how backups go + GitHub token.
   * Secrets returned as '***' if set, '' if not (H7-style masking).
   */
  app.get('/backup-settings', admin, async () => {
    const keys = [
      'backup_tg_token', 'backup_tg_chat',
      'backup_daily_enabled', 'backup_daily_hour',
      'backup_retention',
      'github_token',
    ]
    const rows = await prisma.setting.findMany({ where: { key: { in: keys } } })
    const m: Record<string, string> = {}
    for (const r of rows) m[r.key] = r.value
    const mask = (v?: string) => v && v.length > 0 ? '***' : ''
    return {
      tgToken:        mask(m['backup_tg_token']),
      tgChat:         m['backup_tg_chat']       || '',
      dailyEnabled:   m['backup_daily_enabled'] !== '0',  // default on
      dailyHour:      parseInt(m['backup_daily_hour']     || '4', 10),
      retention:      parseInt(m['backup_retention']      || '20', 10),
      githubToken:    mask(m['github_token']),
    }
  })

  /**
   * POST /backup-settings — save. Sending '***' means "keep current value".
   */
  app.post('/backup-settings', admin, async (req, reply) => {
    const body = z.object({
      tgToken:      z.string().max(200).optional(),
      tgChat:       z.string().max(100).optional(),
      dailyEnabled: z.boolean().optional(),
      dailyHour:    z.number().int().min(0).max(23).optional(),
      retention:    z.number().int().min(3).max(100).optional(),
      githubToken:  z.string().max(200).optional(),
    }).parse(req.body)

    const skipMask = (v?: string) => v === '***' ? undefined : v

    const upserts: Array<[string, string]> = []
    const t = skipMask(body.tgToken);     if (t !== undefined) upserts.push(['backup_tg_token', t])
    if (body.tgChat !== undefined)        upserts.push(['backup_tg_chat',       body.tgChat])
    if (body.dailyEnabled !== undefined)  upserts.push(['backup_daily_enabled', body.dailyEnabled ? '1' : '0'])
    if (body.dailyHour !== undefined)     upserts.push(['backup_daily_hour',    String(body.dailyHour)])
    if (body.retention !== undefined)     upserts.push(['backup_retention',     String(body.retention)])
    const gh = skipMask(body.githubToken); if (gh !== undefined) upserts.push(['github_token', gh])

    for (const [key, value] of upserts) {
      await prisma.setting.upsert({
        where:  { key },
        update: { value },
        create: { key, value },
      })
    }
    return { ok: true }
  })

  /**
   * POST /backup-settings/test-tg — send a test message to the TG channel
   * using the currently-saved (or body-override) token+chat. Useful right
   * after filling the form to verify credentials without creating a backup.
   */
  app.post('/backup-settings/test-tg', admin, async (req, reply) => {
    const body = z.object({
      tgToken: z.string().optional(),
      tgChat:  z.string().optional(),
    }).parse(req.body || {})

    let token = body.tgToken
    let chat  = body.tgChat
    if (!token || !chat) {
      const rows = await prisma.setting.findMany({
        where: { key: { in: ['backup_tg_token', 'backup_tg_chat'] } },
      })
      const m: Record<string, string> = {}
      for (const r of rows) m[r.key] = r.value
      token = token || m['backup_tg_token']
      chat  = chat  || m['backup_tg_chat']
    }
    if (!token || !chat) return reply.status(400).send({ error: 'Не заполнены token и chat' })

    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chat,
          text: '✅ HIDEYOU: тестовое сообщение. Сюда будут приходить бэкапы.',
          parse_mode: 'HTML',
        }),
        signal: AbortSignal.timeout(10_000),
      })
      const data = await res.json() as any
      if (!data.ok) return reply.status(400).send({ error: data.description || 'Telegram API отказал' })
      return { ok: true }
    } catch (e: any) {
      return reply.status(500).send({ error: e.message })
    }
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
