#!/usr/bin/env node
/**
 * HIDEYOU Updater sidecar.
 *
 * Listens on Redis list `update:queue` for jobs and publishes progress
 * to `update:events` channel (the backend forwards them to admin UI via SSE).
 *
 * Job types:
 *   { type: 'check' }                              — fetch tags, report latest
 *   { type: 'install', tag, eventId }              — backup → pull → build → migrate → up → healthcheck
 *   { type: 'rollback', eventId, backupId }        — restore from backup then rebuild
 *   { type: 'backup', reason, eventId? }           — create backup without update
 *
 * Safety:
 *   - Full backup BEFORE each install
 *   - Maintenance mode ON before install, OFF after success or on failure-then-restore
 *   - Auto-rollback on healthcheck failure
 *   - One concurrent job via Redis lock
 */

const fs       = require('fs')
const path     = require('path')
const { execSync, spawn } = require('child_process')
const Redis    = require('ioredis')
const { Client: PgClient } = require('pg')

const REDIS_URL         = process.env.REDIS_URL || 'redis://redis:6379'
const QUEUE_KEY         = 'update:queue'
const EVENTS_CHANNEL    = 'update:events'
const LOCK_KEY          = 'update:lock'

// Same path inside container and on host — see volumes: in docker-compose.
// This eliminates the in-container vs host-path confusion that was breaking
// docker compose bind-mount resolution.
const REPO_DIR          = process.env.REPO_DIR || '/opt/pro/LKHY'
const BACKUPS_DIR       = '/backups'
const DATABASE_URL      = process.env.DATABASE_URL
const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD
const NGINX_CONTAINER   = process.env.NGINX_CONTAINER || 'hideyou_nginx'
const COMPOSE_PROJECT   = process.env.COMPOSE_PROJECT || 'lkhy'

// Telegram backup credentials — env is a fallback; runtime config lives in
// the `settings` table (keys backup_tg_token / backup_tg_chat) so the admin
// UI can change them without redeploying.
const TG_MAX_BYTES      = 50 * 1024 * 1024 // 50 MB limit for Bot API

async function loadBackupSettings() {
  const c = new PgClient({ connectionString: DATABASE_URL })
  await c.connect()
  try {
    const r = await c.query(
      `SELECT key, value FROM settings WHERE key IN (
         'backup_tg_token','backup_tg_chat',
         'backup_daily_enabled','backup_daily_hour','backup_retention'
       )`
    )
    const m = {}
    for (const row of r.rows) m[row.key] = row.value
    return {
      tgToken:      m['backup_tg_token']      || process.env.TG_BACKUP_TOKEN || '',
      tgChat:       m['backup_tg_chat']       || process.env.TG_BACKUP_CHAT  || '',
      dailyEnabled: m['backup_daily_enabled'] == null ? true : m['backup_daily_enabled'] !== '0',
      dailyHour:    parseInt(m['backup_daily_hour'] || '4', 10),
      retention:    parseInt(m['backup_retention']  || '20', 10),
    }
  } finally { await c.end() }
}

const GITHUB_REPO       = 'ChernOvOne/PRO'
const HEALTH_TIMEOUT_MS = 90_000
// Default retention — can be overridden from settings.backup_retention.
const BACKUP_RETENTION_DEFAULT = 20
// Daily auto-backup: run if most recent backup is older than this.
const DAILY_THRESHOLD_MS = 20 * 60 * 60 * 1000 // 20 h

const BASE_URL          = process.env.INTERNAL_HEALTH_URL || 'http://backend:4000'

const log = (...a) => console.log('[updater]', new Date().toISOString(), ...a)
const err = (...a) => console.error('[updater ERR]', new Date().toISOString(), ...a)

const pub = new Redis(REDIS_URL)
const sub = new Redis(REDIS_URL)

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }) }

async function emit(eventId, phase, message, opts = {}) {
  const payload = { eventId, phase, message, ts: Date.now(), ...opts }
  log(`[${eventId || '-'}] ${phase}: ${message}`)
  await pub.publish(EVENTS_CHANNEL, JSON.stringify(payload))
}

function sh(cmd, opts = {}) {
  log('$', cmd)
  return execSync(cmd, { stdio: 'pipe', encoding: 'utf8', ...opts }).toString().trim()
}

function shStream(cmd, args, onLine) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let buf = ''
    const handle = chunk => {
      buf += chunk.toString()
      const lines = buf.split('\n')
      buf = lines.pop()
      lines.forEach(l => onLine(l))
    }
    p.stdout.on('data', handle)
    p.stderr.on('data', handle)
    p.on('exit', code => code === 0 ? resolve() : reject(new Error(`exit ${code}`)))
    p.on('error', reject)
  })
}

/* ── Git helpers ──────────────────────────────────────────── */

function gitCurrentSha() {
  try { return sh(`git -C ${REPO_DIR} rev-parse HEAD`) } catch { return null }
}
function gitCurrentTag() {
  try { return sh(`git -C ${REPO_DIR} describe --tags --abbrev=0 2>/dev/null`) || null } catch { return null }
}
function gitFetch() {
  sh(`git -C ${REPO_DIR} fetch origin --tags --prune --quiet`)
}

/* ── GitHub helpers ───────────────────────────────────────── */

async function fetchLatestReleases(limit = 10) {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=${limit}`, {
    headers: { 'User-Agent': 'hideyou-updater' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`GitHub API ${res.status}`)
  return res.json()
}

/* ── DB helpers ───────────────────────────────────────────── */

async function updateEventRow(id, data) {
  if (!id) return
  const c = new PgClient({ connectionString: DATABASE_URL })
  await c.connect()
  try {
    const sets = []
    const values = []
    let i = 1
    for (const [k, v] of Object.entries(data)) {
      sets.push(`"${k}" = $${i++}`)
      values.push(v)
    }
    values.push(id)
    await c.query(`UPDATE update_events SET ${sets.join(', ')} WHERE id = $${i}`, values)
  } finally { await c.end() }
}

async function createBackupRow(data) {
  const c = new PgClient({ connectionString: DATABASE_URL })
  await c.connect()
  try {
    const r = await c.query(
      `INSERT INTO backups (id, filename, size_bytes, git_sha, git_tag, uploaded_to_tg, tg_file_id, tg_message_url, reason, created_by)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [data.filename, data.size, data.sha, data.tag, !!data.tg_file_id, data.tg_file_id, data.tg_message_url, data.reason, data.createdBy],
    )
    return r.rows[0].id
  } finally { await c.end() }
}

/**
 * Persist current installed version (tag + sha) in settings.
 * Backend's /api/admin/updates/status reads it to display "Текущая версия".
 */
async function saveCurrentVersion(tag, sha) {
  const c = new PgClient({ connectionString: DATABASE_URL })
  await c.connect()
  try {
    const value = JSON.stringify({ tag: tag || null, sha: sha || null })
    await c.query(`
      INSERT INTO settings (key, value, updated_at) VALUES ('current_version', $1, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `, [value])
  } catch (e) {
    err('saveCurrentVersion failed:', e.message)
  } finally { await c.end() }
}

async function setMaintenance(on, message = '🔧 Платформа обновляется. Это займёт 3-5 минут. Скоро вернёмся!') {
  const c = new PgClient({ connectionString: DATABASE_URL })
  await c.connect()
  try {
    await c.query(`
      INSERT INTO settings (key, value, updated_at) VALUES ('maintenance_mode', $1, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `, [on ? '1' : '0'])
    if (on) {
      await c.query(`
        INSERT INTO settings (key, value, updated_at) VALUES ('maintenance_message', $1, NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `, [message])
    }
  } finally { await c.end() }
}

/* ── Telegram backup upload ───────────────────────────────── */

async function uploadToTelegram(filePath, caption, creds) {
  const token = creds?.tgToken
  const chat  = creds?.tgChat
  if (!token || !chat) {
    log('TG backup skipped — no token/chat configured')
    return null
  }
  const size = fs.statSync(filePath).size
  if (size > TG_MAX_BYTES) {
    log(`TG backup skipped — size ${size} > ${TG_MAX_BYTES}`)
    return { skipped: true, reason: 'file too large' }
  }
  try {
    const form = new FormData()
    form.append('chat_id', chat)
    form.append('caption', caption || '')
    form.append('document', new Blob([fs.readFileSync(filePath)]), path.basename(filePath))
    const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(300_000),
    })
    const data = await res.json()
    if (!data.ok) {
      err('TG upload failed:', data.description)
      return null
    }
    const fileId = data.result?.document?.file_id
    const messageId = data.result?.message_id
    const url = chat.startsWith('-100')
      ? `https://t.me/c/${chat.slice(4)}/${messageId}`
      : null
    log('TG backup uploaded, file_id:', fileId)
    return { fileId, messageUrl: url }
  } catch (e) {
    err('TG upload error:', e.message)
    return null
  }
}

/* ── Backup creation ──────────────────────────────────────── */

async function createFullBackup({ reason, eventId, createdBy }) {
  const settings = await loadBackupSettings().catch(() => ({
    tgToken: '', tgChat: '',
    retention: BACKUP_RETENTION_DEFAULT,
  }))
  const retention = Number.isFinite(settings.retention) && settings.retention > 0
    ? settings.retention
    : BACKUP_RETENTION_DEFAULT

  const sha = gitCurrentSha() || 'unknown'
  const tag = gitCurrentTag() || null
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `backup__${timestamp}__${(tag || sha.slice(0, 7))}.tar.gz`
  const fullPath = path.join(BACKUPS_DIR, filename)

  ensureDir(BACKUPS_DIR)

  await emit(eventId, 'backup', `Создаю бэкап: ${filename}`)
  sh(`/app/backup.sh "${fullPath}" "${sha}" "${tag || ''}"`, {
    env: { ...process.env, POSTGRES_PASSWORD, GIT_SHA: sha, GIT_TAG: tag || '' },
  })

  const stats = fs.statSync(fullPath)
  await emit(eventId, 'backup', `Бэкап создан: ${(stats.size / 1024 / 1024).toFixed(1)} MB`)

  // Upload to Telegram (small files only; else upload db-only)
  let tgResult = null
  if (settings.tgToken && settings.tgChat) {
    if (stats.size <= TG_MAX_BYTES) {
      await emit(eventId, 'backup', 'Загружаю в Telegram…')
      tgResult = await uploadToTelegram(fullPath,
        `🗄 HIDEYOU backup\nreason: ${reason}\ngit: ${tag || sha.slice(0, 7)}\nsize: ${(stats.size / 1024 / 1024).toFixed(1)} MB`,
        settings)
    } else {
      await emit(eventId, 'backup', `Бэкап слишком большой для Telegram (${(stats.size / 1024 / 1024).toFixed(1)} MB), сохранён только локально`)
    }
  } else {
    await emit(eventId, 'backup', 'Telegram не настроен — сохранён только локально')
  }

  // Rotate: keep `retention` most recent
  const files = fs.readdirSync(BACKUPS_DIR)
    .filter(f => f.startsWith('backup__') && f.endsWith('.tar.gz'))
    .map(f => ({ name: f, path: path.join(BACKUPS_DIR, f), mtime: fs.statSync(path.join(BACKUPS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
  for (const old of files.slice(retention)) {
    fs.unlinkSync(old.path)
    await emit(eventId, 'backup', `Удалён старый бэкап: ${old.name}`)
  }

  // DB row
  const backupId = await createBackupRow({
    filename, size: stats.size, sha, tag,
    tg_file_id:   tgResult?.fileId || null,
    tg_message_url: tgResult?.messageUrl || null,
    reason, createdBy,
  })

  return { backupId, filename, size: stats.size, sha, tag }
}

/* ── Update flow ──────────────────────────────────────────── */

async function healthCheck() {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(5_000) })
      if (res.ok) return true
    } catch {}
    await new Promise(r => setTimeout(r, 3_000))
  }
  return false
}

async function runInstall(job) {
  const { tag, eventId, triggeredBy } = job
  const oldSha = gitCurrentSha()
  const oldTag = gitCurrentTag()

  await updateEventRow(eventId, { status: 'running', phase: 'sanity' })

  // ── Sanity check BEFORE maintenance mode, so a broken system
  //    doesn't get flagged as "under maintenance" for no reason.
  try {
    await emit(eventId, 'sanity', 'Проверяю текущее состояние…')
    await preUpdateSanityCheck()
  } catch (e) {
    await emit(eventId, 'failed', `Система не в рабочем состоянии: ${e.message}. Почини сначала текущее, потом обновляй.`)
    await updateEventRow(eventId, {
      status: 'failed', phase: null,
      error_message: `sanity: ${e.message}`,
      finished_at: new Date(),
    })
    return
  }

  // ── Enable maintenance mode ────────────────────────────
  await emit(eventId, 'maintenance', 'Включаю режим обслуживания…')
  await setMaintenance(true)

  let backupId = null
  let backupPath = null
  try {
    // 1. Backup
    const bk = await createFullBackup({ reason: 'pre-update', eventId, createdBy: triggeredBy })
    backupId = bk.backupId
    backupPath = path.join(BACKUPS_DIR, bk.filename)
    // Verify before we touch anything — if backup is bogus, abort NOW.
    try {
      verifyBackup(backupPath)
      await emit(eventId, 'backup', `✓ Бэкап прошёл проверку`)
    } catch (e) {
      throw new Error(`Бэкап невалиден (${e.message}) — обновление отменено, система не тронута`)
    }
    await updateEventRow(eventId, { backup_id: backupId, phase: 'fetch' })

    // 2. Fetch & checkout target tag
    await emit(eventId, 'fetch', `Загружаю ${tag}…`)
    gitFetch()
    sh(`git -C ${REPO_DIR} reset --hard "${tag}"`)
    const newSha = gitCurrentSha()
    await updateEventRow(eventId, { to_sha: newSha, to_tag: tag, phase: 'build' })

    // 3. Build images (excludes updater and certbot for self-safety)
    await emit(eventId, 'build', 'Сборка Docker-образов…')
    await shStream('docker', [
      'compose', '-p', COMPOSE_PROJECT, '-f', `${REPO_DIR}/docker-compose.yml`,
      'build', 'backend', 'frontend', 'bot',
    ], line => emit(eventId, 'build', line).catch(() => {}))

    // 4. Apply DB migrations.
    // We're tolerant here: if the backend image was bumped, migrate deploy
    // might see pre-existing rows for migrations that were applied manually
    // during development (common on long-lived DBs). We log warnings but
    // continue — if a real schema mismatch happens, backend healthcheck will
    // catch it and trigger rollback.
    await emit(eventId, 'migrate', 'Применяю миграции БД…')
    await updateEventRow(eventId, { phase: 'migrate' })
    try {
      sh(`docker exec hideyou_backend npx prisma migrate deploy`)
      await emit(eventId, 'migrate', 'Миграции применены')
    } catch (e) {
      const msg = String(e.message || e).slice(0, 400)
      await emit(eventId, 'migrate', `WARN: ${msg} — продолжаю (healthcheck поймает проблему)`)
    }

    // 5. Deploy
    await emit(eventId, 'deploy', 'Перезапуск сервисов…')
    await updateEventRow(eventId, { phase: 'deploy' })
    // --no-deps: don't touch postgres/redis even if their config is drifted;
    // --force-recreate: we want fresh containers for the services we rebuilt.
    await shStream('docker', [
      'compose', '-p', COMPOSE_PROJECT, '-f', `${REPO_DIR}/docker-compose.yml`,
      'up', '-d', '--no-deps', '--force-recreate',
      'backend', 'frontend', 'bot', 'nginx',
    ], line => emit(eventId, 'deploy', line).catch(() => {}))

    // 6. Health check
    await emit(eventId, 'health', 'Проверка работоспособности…')
    await updateEventRow(eventId, { phase: 'health' })
    const healthy = await healthCheck()
    if (!healthy) throw new Error('Healthcheck failed after update')

    // 7. Done
    await setMaintenance(false)
    await updateEventRow(eventId, {
      status: 'ok',
      phase: null,
      finished_at: new Date(),
    })

    // Persist current version so admin UI shows it even if update_events history is cleared.
    await saveCurrentVersion(tag, newSha)

    await emit(eventId, 'done', `✓ Успешно обновлено до ${tag}`, { ok: true })

  } catch (e) {
    err('Install failed:', e.message)
    await emit(eventId, 'failed', `Ошибка: ${e.message}. Восстанавливаю из бэкапа…`)

    // Auto-rollback using backup we just created
    if (backupId) {
      try {
        await restoreFromBackupId(backupId, eventId)
        await emit(eventId, 'rolled_back', 'Платформа восстановлена из бэкапа')
        await updateEventRow(eventId, {
          status: 'rolled_back',
          phase: null,
          error_message: e.message,
          finished_at: new Date(),
        })
      } catch (restoreErr) {
        err('Restore failed:', restoreErr.message)
        await emit(eventId, 'failed', `КРИТИЧНО: бэкап не восстановился: ${restoreErr.message}. Требуется ручное вмешательство.`)
        await updateEventRow(eventId, {
          status: 'failed',
          phase: null,
          error_message: `${e.message} | restore failed: ${restoreErr.message}`,
          finished_at: new Date(),
        })
      }
    } else {
      await updateEventRow(eventId, {
        status: 'failed',
        phase: null,
        error_message: e.message,
        finished_at: new Date(),
      })
    }
    // Leave maintenance ON for failed → admin investigates
  }
}

/* ── Restore (rollback) ───────────────────────────────────── */

async function restoreFromBackupId(backupId, eventId) {
  // Lookup filename
  const c = new PgClient({ connectionString: DATABASE_URL })
  await c.connect()
  let backup
  try {
    const r = await c.query(`SELECT filename FROM backups WHERE id = $1`, [backupId])
    backup = r.rows[0]
  } finally { await c.end() }
  if (!backup) throw new Error(`Backup ${backupId} not found`)
  const backupPath = path.join(BACKUPS_DIR, backup.filename)
  if (!fs.existsSync(backupPath)) throw new Error(`Backup file missing: ${backup.filename}`)

  await emit(eventId, 'restore', `Восстанавливаю ${backup.filename}…`)
  sh(`/app/restore.sh "${backupPath}"`, {
    env: { ...process.env, POSTGRES_PASSWORD },
  })

  await emit(eventId, 'restore-build', 'Пересборка образов к состоянию бэкапа…')
  await shStream('docker', [
    'compose', '-p', COMPOSE_PROJECT, '-f', `${REPO_DIR}/docker-compose.yml`,
    'build', 'backend', 'frontend', 'bot',
  ], line => emit(eventId, 'restore-build', line).catch(() => {}))

  await emit(eventId, 'restore-up', 'Запуск сервисов…')
  await shStream('docker', [
    'compose', '-p', COMPOSE_PROJECT, '-f', `${REPO_DIR}/docker-compose.yml`,
    'up', '-d', '--no-deps', '--force-recreate',
    'backend', 'frontend', 'bot', 'nginx',
  ], line => emit(eventId, 'restore-up', line).catch(() => {}))

  await emit(eventId, 'restore-health', 'Проверка…')
  const healthy = await healthCheck()
  if (!healthy) throw new Error('Post-restore healthcheck failed')
  await setMaintenance(false)
}

async function runRollback(job) {
  const { eventId, backupId, triggeredBy } = job
  await updateEventRow(eventId, { status: 'running', phase: 'restore', is_rollback: true })
  await setMaintenance(true)
  try {
    await restoreFromBackupId(backupId, eventId)
    await updateEventRow(eventId, {
      status: 'ok',
      phase: null,
      finished_at: new Date(),
    })
    await emit(eventId, 'done', '✓ Откат выполнен', { ok: true })
  } catch (e) {
    await updateEventRow(eventId, {
      status: 'failed',
      phase: null,
      error_message: e.message,
      finished_at: new Date(),
    })
    await emit(eventId, 'failed', `Ошибка отката: ${e.message}`)
  }
}

async function runCheck() {
  gitFetch()
  const current = gitCurrentTag()
  const releases = await fetchLatestReleases(20)
  const latest = releases[0]?.tag_name
  await pub.publish(EVENTS_CHANNEL, JSON.stringify({
    type: 'check_result',
    current,
    latest,
    available: releases.filter(r => r.tag_name !== current).map(r => ({
      tag: r.tag_name,
      name: r.name,
      body: r.body?.slice(0, 2000) || null,
      publishedAt: r.published_at,
      prerelease: r.prerelease,
    })),
    ts: Date.now(),
  }))
}

/* ── Main loop ────────────────────────────────────────────── */

async function processJob(job) {
  // One job at a time: acquire Redis lock
  const ok = await pub.set(LOCK_KEY, '1', 'EX', 1800, 'NX')
  if (!ok) {
    log('Another job is running, skipping')
    return
  }
  try {
    switch (job.type) {
      case 'check':    await runCheck(); break
      case 'install':  await runInstall(job); break
      case 'rollback': await runRollback(job); break
      case 'backup':   await createFullBackup({ reason: job.reason || 'manual', eventId: job.eventId, createdBy: job.triggeredBy }); break
      default:
        err('Unknown job type:', job.type)
    }
  } finally {
    await pub.del(LOCK_KEY)
  }
}

/* ── Daily auto-backup ─────────────────────────────────────
 * Checks every hour. At DAILY_CHECK_HOUR local time, if no backup
 * has been created in DAILY_THRESHOLD_MS, enqueues one. Doesn't
 * hold the Redis lock — uses the standard queue so it serializes
 * with updates/rollbacks naturally.
 */
async function maybeRunDailyBackup() {
  try {
    const settings = await loadBackupSettings().catch(() => null)
    if (!settings || !settings.dailyEnabled) return
    const now = new Date()
    if (now.getHours() !== settings.dailyHour) return

    const c = new PgClient({ connectionString: DATABASE_URL })
    await c.connect()
    let last
    try {
      const r = await c.query(
        `SELECT created_at FROM backups ORDER BY created_at DESC LIMIT 1`
      )
      last = r.rows[0]?.created_at
    } finally { await c.end() }

    if (last && (Date.now() - new Date(last).getTime()) < DAILY_THRESHOLD_MS) {
      return
    }
    log('Daily backup threshold met, enqueueing…')
    await pub.rpush(QUEUE_KEY, JSON.stringify({ type: 'backup', reason: 'daily' }))
  } catch (e) {
    err('daily backup check failed:', e.message)
  }
}

/* ── Pre-update safety gate ────────────────────────────────
 * Before applying an update, make sure current system is sane
 * enough that rollback would actually work. If it's already
 * broken, we refuse to proceed rather than bury the corpse.
 */
async function preUpdateSanityCheck() {
  // 1. DB reachable
  const c = new PgClient({ connectionString: DATABASE_URL })
  await c.connect()
  try {
    await c.query('SELECT 1')
  } finally { await c.end() }

  // 2. Repo has .git
  if (!fs.existsSync(path.join(REPO_DIR, '.git'))) {
    throw new Error(`Repo at ${REPO_DIR} is not a git checkout`)
  }

  // 3. No uncommitted local changes that git reset --hard would silently nuke
  //    (we reset anyway, but log a warning)
  try {
    const dirty = sh(`git -C ${REPO_DIR} status --porcelain`)
    if (dirty) log('WARN: working tree has local changes, they will be reset')
  } catch {}
}

/* ── Verify backup is actually usable ──────────────────────
 * Tarball must exist, be non-empty, contain meta.json + db.sql.
 */
function verifyBackup(fullPath) {
  if (!fs.existsSync(fullPath)) throw new Error('Backup file missing after creation')
  const size = fs.statSync(fullPath).size
  if (size < 10_000) throw new Error(`Backup too small (${size} bytes) — likely empty`)
  const names = sh(`tar tzf "${fullPath}"`).split('\n')
  if (!names.some(n => n.endsWith('meta.json'))) throw new Error('Backup missing meta.json')
  if (!names.some(n => n.endsWith('db.sql'))) throw new Error('Backup missing db.sql')
}

async function main() {
  log('Updater worker starting')
  log(`REPO_DIR=${REPO_DIR}, GITHUB_REPO=${GITHUB_REPO}`)

  ensureDir(BACKUPS_DIR)

  // Daily backup scheduler — tick every 60 min. Using wall-clock tick rather
  // than node-cron keeps container dependencies slim.
  setInterval(() => { maybeRunDailyBackup().catch(() => {}) }, 60 * 60 * 1000)
  // Also run once on startup in case the container was restarted during the
  // window and we missed the slot.
  maybeRunDailyBackup().catch(() => {})

  // Record current version so the admin UI has something to show on first run.
  try {
    const sha = gitCurrentSha()
    const tag = gitCurrentTag()
    if (sha) {
      await saveCurrentVersion(tag, sha)
      log(`Current version recorded: ${tag || '(no tag)'} / ${sha.slice(0, 7)}`)
    }
  } catch (e) {
    err('Initial version record failed:', e.message)
  }

  // Ensure repo is initialized
  if (!fs.existsSync(path.join(REPO_DIR, '.git'))) {
    log('Initializing git repo…')
    try {
      sh(`git -C ${REPO_DIR} init`)
      sh(`git -C ${REPO_DIR} remote add origin https://github.com/${GITHUB_REPO}.git`)
      sh(`git -C ${REPO_DIR} fetch origin --tags --quiet`)
      log('Git initialized')
    } catch (e) {
      err('git init failed:', e.message)
    }
  }

  while (true) {
    try {
      const [, payload] = await sub.blpop(QUEUE_KEY, 0)
      const job = JSON.parse(payload)
      await processJob(job)
    } catch (e) {
      err('Loop error:', e.message)
      await new Promise(r => setTimeout(r, 2_000))
    }
  }
}

main().catch(e => { err('Fatal:', e); process.exit(1) })
