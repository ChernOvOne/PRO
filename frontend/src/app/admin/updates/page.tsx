'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import {
  Download, Package, History, HardDrive, Loader2, GitBranch,
  RefreshCw, PlayCircle, Undo2, AlertTriangle, CheckCircle2,
  XCircle, Clock, Trash2, Plus, Power, ExternalLink, Upload,
  Settings, Send, Save,
} from 'lucide-react'
import { adminApi } from '@/lib/api'

function fmtSize(b: number | string) {
  const n = typeof b === 'string' ? parseInt(b) : b
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`
}
function fmtTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('ru', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

type Tab = 'overview' | 'history' | 'backups' | 'settings'

export default function UpdatesPage() {
  const [tab, setTab] = useState<Tab>('overview')

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Обновления платформы
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          Установка новых релизов с GitHub, бэкапы, история обновлений
        </p>
      </div>

      <div className="flex gap-1 p-1 rounded-xl w-fit"
           style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
        <TabBtn active={tab === 'overview'} onClick={() => setTab('overview')}>
          <Package className="w-4 h-4" /> Обновления
        </TabBtn>
        <TabBtn active={tab === 'history'} onClick={() => setTab('history')}>
          <History className="w-4 h-4" /> История
        </TabBtn>
        <TabBtn active={tab === 'backups'} onClick={() => setTab('backups')}>
          <HardDrive className="w-4 h-4" /> Бэкапы
        </TabBtn>
        <TabBtn active={tab === 'settings'} onClick={() => setTab('settings')}>
          <Settings className="w-4 h-4" /> Настройки
        </TabBtn>
      </div>

      {tab === 'overview' && <OverviewTab />}
      {tab === 'history' && <HistoryTab />}
      {tab === 'backups' && <BackupsTab />}
      {tab === 'settings' && <BackupSettingsTab />}
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition"
            style={{
              background: active ? 'var(--accent-1)' : 'transparent',
              color: active ? 'white' : 'var(--text-secondary)',
              fontWeight: active ? 600 : 400,
            }}>
      {children}
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════
   Overview — current version + available + install progress
   ═══════════════════════════════════════════════════════════ */

function OverviewTab() {
  const [status, setStatus] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [installing, setInstalling] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ tag: string; name: string } | null>(null)
  const [progress, setProgress] = useState<Array<{ eventId?: string; phase: string; message: string; ts: number; ok?: boolean }>>([])
  const [activeEvent, setActiveEvent] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await adminApi.updatesStatus()
      setStatus(data)
    } catch (e: any) {
      toast.error(e.message || 'Ошибка загрузки')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // SSE progress stream
  useEffect(() => {
    const es = new EventSource('/api/admin/updates/stream', { withCredentials: true })
    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data)
        if (payload.type === 'check_result') {
          load()
          return
        }
        setProgress(p => [...p, payload].slice(-200))
        if (payload.phase === 'done') {
          setInstalling(null)
          toast.success(payload.message || '✓ Успешно обновлено', { duration: 6000 })
          setTimeout(() => load(), 1000)
        } else if (payload.phase === 'failed') {
          setInstalling(null)
          toast.error(payload.message || 'Ошибка обновления', { duration: 8000 })
          setTimeout(() => load(), 1000)
        } else if (payload.phase === 'rolled_back') {
          setInstalling(null)
          toast(payload.message || 'Платформа восстановлена из бэкапа', { duration: 8000, icon: '↩️' })
          setTimeout(() => load(), 1000)
        }
      } catch {}
    }
    es.onerror = () => { /* auto-reconnect */ }
    return () => es.close()
  }, [load])

  // Polling fallback — SSE drops while backend is being recreated and the
  // `done` event is published in that gap. Every 4s while installing,
  // poll the event row directly.
  useEffect(() => {
    if (!activeEvent) return
    const id = setInterval(async () => {
      try {
        const ev = await adminApi.updatesEvent(activeEvent)
        if (!ev) return
        if (ev.status === 'ok') {
          setInstalling(null)
          setActiveEvent(null)
          toast.success(`✓ Обновление до ${ev.toTag || ev.toSha?.slice(0, 7)} завершено`, { duration: 6000 })
          load()
        } else if (ev.status === 'failed') {
          setInstalling(null)
          setActiveEvent(null)
          toast.error(`Ошибка: ${ev.errorMessage || 'обновление не удалось'}`, { duration: 8000 })
          load()
        } else if (ev.status === 'rolled_back') {
          setInstalling(null)
          setActiveEvent(null)
          toast(`↩️ Откачено к предыдущей версии${ev.errorMessage ? `: ${ev.errorMessage}` : ''}`, { duration: 8000, icon: '↩️' })
          load()
        }
      } catch {
        // Backend probably restarting — try again next tick
      }
    }, 4000)
    return () => clearInterval(id)
  }, [activeEvent, load])

  const runCheck = async () => {
    setChecking(true)
    try {
      await adminApi.updatesCheck()
      setTimeout(async () => { await load(); setChecking(false) }, 2000)
    } catch (e: any) { toast.error(e.message); setChecking(false) }
  }

  const install = async (tag: string) => {
    setInstalling(tag)
    setProgress([])
    try {
      const { eventId } = await adminApi.updatesInstall(tag)
      setActiveEvent(eventId)
      toast.success('Обновление запущено')
      setConfirm(null)
    } catch (e: any) {
      toast.error(e.message || 'Ошибка')
      setInstalling(null)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent-1)' }} />
      </div>
    )
  }

  const current = status?.current || {}
  const available = status?.available || []
  const latest = status?.latest
  const isUpToDate = current.tag && latest && current.tag === latest.tag_name

  return (
    <div className="space-y-4">
      {/* Current version card */}
      <div className="rounded-xl p-4"
           style={{
             background: isUpToDate
               ? 'rgba(34,197,94,0.08)'
               : 'rgba(245,158,11,0.08)',
             border: `1px solid ${isUpToDate ? 'rgba(34,197,94,0.25)' : 'rgba(245,158,11,0.25)'}`,
           }}>
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
               style={{
                 background: isUpToDate ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                 color: isUpToDate ? '#22c55e' : '#f59e0b',
               }}>
            <GitBranch className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-wider font-semibold"
                 style={{ color: 'var(--text-tertiary)' }}>
              Текущая версия
            </div>
            <div className="text-xl font-bold mt-0.5"
                 style={{ color: 'var(--text-primary)' }}>
              {current.tag || 'unknown'}
              {isUpToDate && <span className="ml-2 text-sm font-normal" style={{ color: '#22c55e' }}>
                ✓ актуальная
              </span>}
            </div>
            {current.sha && (
              <div className="text-[11px] font-mono mt-0.5"
                   style={{ color: 'var(--text-tertiary)' }}>
                {current.sha.slice(0, 12)}
              </div>
            )}
          </div>
          <button onClick={runCheck} disabled={checking}
                  className="px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)' }}>
            {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Проверить
          </button>
        </div>
      </div>

      {/* Progress console (shown during install) */}
      {(installing || progress.length > 0) && (
        <div className="rounded-xl overflow-hidden"
             style={{ background: '#0a0a0a', border: '1px solid var(--glass-border)' }}>
          <div className="px-3 py-2 flex items-center gap-2 text-xs font-semibold"
               style={{ background: '#1a1a1a', color: '#f59e0b' }}>
            {installing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />}
            {installing ? `Установка ${installing}...` : 'Журнал прошлого обновления'}
          </div>
          <pre className="p-3 text-[11px] font-mono max-h-80 overflow-y-auto"
               style={{ color: '#aaf', lineHeight: 1.5 }}>
            {progress.map((p, i) => {
              const timeStr = new Date(p.ts).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
              const color = p.phase === 'failed' ? '#ef4444'
                : p.phase === 'done' ? '#22c55e'
                : p.phase === 'rolled_back' ? '#f59e0b'
                : '#aaf'
              return <div key={i} style={{ color }}>
                <span style={{ color: '#666' }}>[{timeStr}]</span>{' '}
                <span style={{ color: '#888' }}>{p.phase}:</span>{' '}
                {p.message}
              </div>
            })}
          </pre>
        </div>
      )}

      {/* Available releases */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider"
            style={{ color: 'var(--text-tertiary)' }}>
          {available.length > 0 ? `Доступно ${available.length} обновлений` : 'Нет доступных обновлений'}
        </h2>
        {available.length === 0 && !loading && (
          <div className="p-6 rounded-xl text-center"
               style={{ background: 'var(--surface-2)', color: 'var(--text-tertiary)' }}>
            <CheckCircle2 className="w-10 h-10 mx-auto mb-2" style={{ color: '#22c55e', opacity: 0.5 }} />
            <p className="text-sm">Установлена последняя версия</p>
          </div>
        )}
        {available.map((r: any) => (
          <div key={r.tag} className="rounded-xl p-4"
               style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
                    {r.tag}
                  </span>
                  {r.prerelease && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                      pre-release
                    </span>
                  )}
                  <a href={r.htmlUrl} target="_blank" rel="noreferrer"
                     className="text-xs flex items-center gap-1"
                     style={{ color: 'var(--accent-1)' }}>
                    GitHub <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                  {fmtTime(r.publishedAt)}
                </div>
                {r.body && (
                  <div className="text-xs mt-2 whitespace-pre-wrap line-clamp-6"
                       style={{ color: 'var(--text-secondary)' }}>
                    {r.body}
                  </div>
                )}
              </div>
              <button onClick={() => setConfirm({ tag: r.tag, name: r.name })}
                      disabled={!!installing}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
                      style={{ background: '#22c55e', color: 'white' }}>
                <Download className="w-4 h-4" /> Установить
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Confirm install dialog */}
      {confirm && (
        <ConfirmInstallDialog
          version={confirm}
          onCancel={() => setConfirm(null)}
          onConfirm={() => install(confirm.tag)} />
      )}
    </div>
  )
}

function ConfirmInstallDialog({ version, onCancel, onConfirm }: {
  version: { tag: string; name: string }
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl p-5 space-y-4"
           style={{ background: 'var(--surface-1)', border: '1px solid rgba(245,158,11,0.3)' }}
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" style={{ color: '#f59e0b' }} />
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Установить {version.tag}?
          </h3>
        </div>
        <div className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <p>Процесс установки:</p>
          <ol className="text-xs space-y-1 ml-4 list-decimal" style={{ color: 'var(--text-tertiary)' }}>
            <li>Включается режим обслуживания</li>
            <li>Создаётся полный бэкап (БД + uploads + конфиги)</li>
            <li>Бэкап загружается в Telegram (если &lt; 50 МБ)</li>
            <li>Загружается новая версия из GitHub</li>
            <li>Пересобираются Docker-образы</li>
            <li>Применяются миграции БД</li>
            <li>Сервисы перезапускаются</li>
            <li>Проверка работоспособности</li>
          </ol>
          <p className="text-xs pt-2" style={{ color: '#f59e0b' }}>
            ⚠️ При ошибке платформа автоматически восстановится из бэкапа.
            Процесс занимает 3-5 минут.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel}
                  className="px-4 py-1.5 rounded-lg text-sm"
                  style={{ color: 'var(--text-secondary)' }}>
            Отмена
          </button>
          <button onClick={onConfirm}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5"
                  style={{ background: '#22c55e', color: 'white' }}>
            <PlayCircle className="w-4 h-4" /> Начать установку
          </button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   History tab
   ═══════════════════════════════════════════════════════════ */

function HistoryTab() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await adminApi.updatesHistory()
      setItems(data || [])
    } catch (e: any) {
      toast.error(e.message || 'Ошибка')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent-1)' }} /></div>
  }
  if (items.length === 0) {
    return (
      <div className="p-8 rounded-xl text-center"
           style={{ background: 'var(--surface-2)', color: 'var(--text-tertiary)' }}>
        <History className="w-10 h-10 mx-auto mb-2 opacity-40" />
        <p className="text-sm">История обновлений пуста</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {items.map(e => <EventRow key={e.id} event={e} />)}
    </div>
  )
}

function EventRow({ event: e }: { event: any }) {
  const statusColor = {
    ok:            { bg: 'rgba(34,197,94,0.1)',  fg: '#22c55e', icon: CheckCircle2, label: 'Успешно' },
    failed:        { bg: 'rgba(239,68,68,0.1)',  fg: '#ef4444', icon: XCircle,     label: 'Ошибка' },
    rolled_back:   { bg: 'rgba(245,158,11,0.1)', fg: '#f59e0b', icon: Undo2,       label: 'Откачено' },
    running:       { bg: 'rgba(6,182,212,0.1)',  fg: '#06b6d4', icon: Loader2,     label: 'В процессе' },
    pending:       { bg: 'var(--surface-2)',     fg: 'var(--text-tertiary)', icon: Clock, label: 'Ожидание' },
  }[e.status as string] || { bg: 'var(--surface-2)', fg: 'var(--text-tertiary)', icon: Clock, label: e.status }

  const Icon = statusColor.icon
  const duration = e.finishedAt
    ? Math.round((new Date(e.finishedAt).getTime() - new Date(e.startedAt).getTime()) / 1000)
    : null

  return (
    <div className="rounded-xl p-3"
         style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
             style={{ background: statusColor.bg, color: statusColor.fg }}>
          <Icon className={`w-4 h-4 ${e.status === 'running' ? 'animate-spin' : ''}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              {e.isRollback ? 'Откат' : 'Обновление'}:
              {e.fromTag && ` ${e.fromTag}`}
              {e.fromTag && e.toTag && ' → '}
              {e.toTag}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{ background: statusColor.bg, color: statusColor.fg }}>
              {statusColor.label}
            </span>
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            {fmtTime(e.startedAt)}
            {duration !== null && ` · ${duration}с`}
            {e.backup && ` · бэкап: ${e.backup.filename}`}
          </div>
          {e.errorMessage && (
            <div className="text-[11px] mt-1 truncate" style={{ color: '#ef4444' }}>
              ⚠ {e.errorMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Backups tab
   ═══════════════════════════════════════════════════════════ */

function BackupsTab() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [rollbackConfirm, setRollbackConfirm] = useState<any>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await adminApi.backupsList()
      setItems(data || [])
    } catch (e: any) { toast.error(e.message || 'Ошибка') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const create = async () => {
    setCreating(true)
    try {
      await adminApi.backupsCreate()
      toast.success('Бэкап запущен — займёт 1-2 минуты')
      setTimeout(load, 30000)
    } catch (e: any) { toast.error(e.message || 'Ошибка') }
    finally { setCreating(false) }
  }

  const del = async (b: any) => {
    if (!confirm(`Удалить бэкап ${b.filename}?`)) return
    try {
      await adminApi.backupsDelete(b.id)
      await load()
      toast.success('Удалено')
    } catch (e: any) { toast.error(e.message || 'Ошибка') }
  }

  const rollback = async () => {
    if (!rollbackConfirm) return
    try {
      await adminApi.updatesRollback(rollbackConfirm.id)
      toast.success('Откат запущен')
      setRollbackConfirm(null)
      setTimeout(load, 2000)
    } catch (e: any) { toast.error(e.message || 'Ошибка') }
  }

  const download = (b: any) => {
    window.open(adminApi.backupsDownloadUrl(b.id), '_blank')
  }

  const onUploadClick = () => fileInputRef.current?.click()
  const onFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    if (!/\.tar\.gz$/i.test(file.name)) {
      toast.error('Нужен .tar.gz'); return
    }
    setUploading(true); setUploadPct(0)
    try {
      await adminApi.backupsUpload(file, (loaded, total) => setUploadPct(Math.round(loaded / total * 100)))
      toast.success('Бэкап загружен — теперь можно откатиться на него')
      await load()
    } catch (err: any) {
      toast.error(err.message || 'Ошибка загрузки')
    } finally {
      setUploading(false); setUploadPct(0)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent-1)' }} /></div>
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Автобэкап перед каждым обновлением + ежедневно в 04:00. Можно скачать и загрузить свой.
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".tar.gz,application/gzip"
            className="hidden"
            onChange={onFilePicked}
          />
          <button onClick={onUploadClick} disabled={uploading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}>
            {uploading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> {uploadPct}%</>
              : <><Upload className="w-4 h-4" /> Загрузить бэкап</>}
          </button>
          <button onClick={create} disabled={creating}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
                  style={{ background: 'var(--accent-1)', color: 'white' }}>
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Создать бэкап
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="p-8 rounded-xl text-center"
             style={{ background: 'var(--surface-2)', color: 'var(--text-tertiary)' }}>
          <HardDrive className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Бэкапов пока нет</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(b => (
            <div key={b.id} className="rounded-xl p-3 flex items-center gap-3 flex-wrap"
                 style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs" style={{ color: 'var(--text-primary)' }}>
                    {b.filename}
                  </span>
                  {b.gitTag && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{ background: 'rgba(6,182,212,0.15)', color: '#06b6d4' }}>
                      {b.gitTag}
                    </span>
                  )}
                  {b.uploadedToTg && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                      ✓ Telegram
                    </span>
                  )}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                  {fmtTime(b.createdAt)} · {fmtSize(b.sizeBytes)}
                  {b.reason && ` · ${b.reason}`}
                </div>
              </div>
              <button onClick={() => download(b)}
                      title="Скачать"
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs"
                      style={{ background: 'rgba(6,182,212,0.1)', color: '#06b6d4', border: '1px solid rgba(6,182,212,0.3)' }}>
                <Download className="w-3.5 h-3.5" /> Скачать
              </button>
              <button onClick={() => setRollbackConfirm(b)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs"
                      style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
                <Undo2 className="w-3.5 h-3.5" /> Откатиться
              </button>
              <button onClick={() => del(b)}
                      className="p-1.5 rounded hover:bg-red-500/10 hover:text-red-400"
                      style={{ color: 'var(--text-tertiary)' }}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Rollback confirm dialog */}
      {rollbackConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ background: 'rgba(0,0,0,0.6)' }}
             onClick={() => setRollbackConfirm(null)}>
          <div className="w-full max-w-md rounded-2xl p-5 space-y-4"
               style={{ background: 'var(--surface-1)', border: '1px solid rgba(245,158,11,0.3)' }}
               onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" style={{ color: '#f59e0b' }} />
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                Откатить платформу?
              </h3>
            </div>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Платформа будет восстановлена к состоянию на момент бэкапа:
            </p>
            <div className="p-3 rounded-lg text-xs font-mono"
                 style={{ background: 'var(--surface-2)', color: 'var(--text-primary)' }}>
              <div>{rollbackConfirm.filename}</div>
              <div style={{ color: 'var(--text-tertiary)' }}>
                {fmtTime(rollbackConfirm.createdAt)} · {rollbackConfirm.gitTag || '(без тега)'}
              </div>
            </div>
            <p className="text-xs" style={{ color: '#ef4444' }}>
              ⚠️ Все данные созданные ПОСЛЕ этого бэкапа будут потеряны.
              Процесс занимает 2-3 минуты.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setRollbackConfirm(null)}
                      className="px-4 py-1.5 rounded-lg text-sm"
                      style={{ color: 'var(--text-secondary)' }}>
                Отмена
              </button>
              <button onClick={rollback}
                      className="px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5"
                      style={{ background: '#f59e0b', color: 'white' }}>
                <Undo2 className="w-4 h-4" /> Откатиться
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Backup settings tab — where/when/how backups go
   ═══════════════════════════════════════════════════════════ */

function BackupSettingsTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testingGh, setTestingGh] = useState(false)
  const [tgToken, setTgToken] = useState('')
  const [tgChat, setTgChat] = useState('')
  const [dailyEnabled, setDailyEnabled] = useState(true)
  const [dailyHour, setDailyHour] = useState(4)
  const [retention, setRetention] = useState(20)
  const [githubToken, setGithubToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [showGhToken, setShowGhToken] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const d = await adminApi.backupSettingsGet()
        setTgToken(d.tgToken)
        setTgChat(d.tgChat)
        setDailyEnabled(d.dailyEnabled)
        setDailyHour(d.dailyHour)
        setRetention(d.retention)
        setGithubToken((d as any).githubToken || '')
      } catch (e: any) { toast.error(e.message || 'Ошибка') }
      finally { setLoading(false) }
    })()
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await adminApi.backupSettingsSave({ tgToken, tgChat, dailyEnabled, dailyHour, retention, githubToken } as any)
      toast.success('Сохранено')
    } catch (e: any) { toast.error(e.message || 'Ошибка') }
    finally { setSaving(false) }
  }

  const testGithub = async () => {
    setTestingGh(true)
    try {
      // If user typed a new token, test that. Otherwise test stored value.
      const data = await adminApi.githubTokenTest({
        token: githubToken && githubToken !== '***' ? githubToken : undefined,
      })
      toast.success(`Токен валиден. Репо: ${data.private ? 'приватный' : 'публичный'}.`)
    } catch (e: any) { toast.error(e.message || 'Не валидный токен') }
    finally { setTestingGh(false) }
  }

  const testTg = async () => {
    setTesting(true)
    try {
      await adminApi.backupSettingsTestTg({ tgToken, tgChat })
      toast.success('Тестовое сообщение отправлено — проверь Telegram')
    } catch (e: any) { toast.error(e.message || 'Не доставлено') }
    finally { setTesting(false) }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent-1)' }} /></div>
  }

  const cardStyle = { background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }
  const inputStyle = {
    background: 'var(--surface-1)',
    color: 'var(--text-primary)',
    border: '1px solid var(--glass-border)',
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Telegram */}
      <div className="rounded-2xl p-5 space-y-3" style={cardStyle}>
        <div className="flex items-start gap-2">
          <Send className="w-5 h-5 mt-0.5" style={{ color: '#29b6f6' }} />
          <div className="flex-1">
            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              Отправка в Telegram
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              Бэкапы ≤ 50 МБ после создания отправляются документом в канал/чат.
              Создай бота у <span className="font-mono">@BotFather</span>, добавь его
              администратором в приватный канал, возьми chat_id через <span className="font-mono">@getidsbot</span>.
            </p>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>
            Токен бота
          </label>
          <div className="flex gap-2">
            <input
              type={showToken ? 'text' : 'password'}
              value={tgToken}
              onChange={e => setTgToken(e.target.value)}
              placeholder="123456789:AAH..."
              className="flex-1 px-3 py-2 rounded-lg text-sm font-mono"
              style={inputStyle}
            />
            <button onClick={() => setShowToken(v => !v)}
                    className="px-3 py-2 rounded-lg text-xs"
                    style={{ background: 'var(--surface-1)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)' }}>
              {showToken ? 'Скрыть' : 'Показать'}
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>
            Chat ID (канала или личного чата)
          </label>
          <input
            type="text"
            value={tgChat}
            onChange={e => setTgChat(e.target.value)}
            placeholder="-1001234567890 или 123456789"
            className="w-full px-3 py-2 rounded-lg text-sm font-mono"
            style={inputStyle}
          />
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
            Каналы начинаются с <span className="font-mono">-100…</span>
          </p>
        </div>

        <div className="flex justify-end">
          <button onClick={testTg} disabled={testing || !tgToken || !tgChat}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm disabled:opacity-50"
                  style={{ background: 'rgba(41,182,246,0.1)', color: '#29b6f6', border: '1px solid rgba(41,182,246,0.3)' }}>
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Отправить тестовое
          </button>
        </div>
      </div>

      {/* Schedule */}
      <div className="rounded-2xl p-5 space-y-3" style={cardStyle}>
        <div className="flex items-start gap-2">
          <Clock className="w-5 h-5 mt-0.5" style={{ color: '#a78bfa' }} />
          <div className="flex-1">
            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              Ежедневный автобэкап
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              Пропускается если свежий бэкап моложе 20 часов.
              Время — по часовому поясу сервера.
            </p>
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={dailyEnabled}
            onChange={e => setDailyEnabled(e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
            Включить ежедневный бэкап
          </span>
        </label>

        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>
            Час запуска (0–23)
          </label>
          <select
            value={dailyHour}
            onChange={e => setDailyHour(parseInt(e.target.value, 10))}
            disabled={!dailyEnabled}
            className="w-32 px-3 py-2 rounded-lg text-sm disabled:opacity-50"
            style={inputStyle}
          >
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
            ))}
          </select>
        </div>
      </div>

      {/* Retention */}
      <div className="rounded-2xl p-5 space-y-3" style={cardStyle}>
        <div className="flex items-start gap-2">
          <HardDrive className="w-5 h-5 mt-0.5" style={{ color: '#22c55e' }} />
          <div className="flex-1">
            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              Ретеншен локальных копий
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              Сколько последних бэкапов держать в <span className="font-mono">./data/backups/</span>.
              Более старые удаляются автоматически.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="range"
            min={3}
            max={100}
            value={retention}
            onChange={e => setRetention(parseInt(e.target.value, 10))}
            className="flex-1"
          />
          <input
            type="number"
            min={3}
            max={100}
            value={retention}
            onChange={e => setRetention(Math.max(3, Math.min(100, parseInt(e.target.value, 10) || 20)))}
            className="w-20 px-3 py-2 rounded-lg text-sm text-center"
            style={inputStyle}
          />
        </div>
      </div>

      {/* GitHub token */}
      <div className="rounded-2xl p-5 space-y-3" style={cardStyle}>
        <div className="flex items-start gap-2">
          <GitBranch className="w-5 h-5 mt-0.5" style={{ color: '#a78bfa' }} />
          <div className="flex-1">
            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              GitHub Token (для приватного репо)
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              Нужен только если репозиторий ChernOvOne/PRO приватный.
              Создай <span className="font-mono">fine-grained PAT</span> на github.com → Settings →
              Developer settings → Personal access tokens → только этот репо, права: <span className="font-mono">Contents: Read</span>.
            </p>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>
            Token
          </label>
          <div className="flex gap-2">
            <input
              type={showGhToken ? 'text' : 'password'}
              value={githubToken}
              onChange={e => setGithubToken(e.target.value)}
              placeholder="github_pat_… или ghp_… (или *** = не менять)"
              className="flex-1 px-3 py-2 rounded-lg text-sm font-mono"
              style={inputStyle}
            />
            <button onClick={() => setShowGhToken(v => !v)}
                    className="px-3 py-2 rounded-lg text-xs"
                    style={{ background: 'var(--surface-1)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)' }}>
              {showGhToken ? 'Скрыть' : 'Показать'}
            </button>
          </div>
        </div>

        <div className="flex justify-end">
          <button onClick={testGithub} disabled={testingGh}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm disabled:opacity-50"
                  style={{ background: 'rgba(167,139,250,0.1)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)' }}>
            {testingGh ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Проверить токен
          </button>
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button onClick={save} disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--accent-1)', color: 'white' }}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Сохранить
        </button>
      </div>
    </div>
  )
}
