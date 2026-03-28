'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Shield, Copy, CheckCircle2, RefreshCw, Download,
  Wifi, ArrowRight, AlertCircle, Clock, Activity,
  Signal, Calendar, Smartphone, Monitor, Tv,
  Laptop, Trash2, ChevronDown, ChevronUp, ExternalLink,
  Globe, Zap,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import toast from 'react-hot-toast'
import { userApi } from '@/lib/api'
import type { SubscriptionData, HwidDevice } from '@/types'
import { formatDate, formatBytes, formatRelative } from '@/lib/utils'

// ── Platform icon ─────────────────────────────────────────────
function PlatformIcon({ platform }: { platform: string }) {
  const p = platform?.toLowerCase() ?? ''
  if (p.includes('android') || p.includes('ios')) return <Smartphone className="w-4 h-4" />
  if (p.includes('windows') || p.includes('macos') || p.includes('linux')) return <Monitor className="w-4 h-4" />
  if (p.includes('tv')) return <Tv className="w-4 h-4" />
  return <Laptop className="w-4 h-4" />
}

// ── Status badge ──────────────────────────────────────────────
const STATUS_CFG = {
  ACTIVE:   { label: 'Активна',   bg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-400' },
  INACTIVE: { label: 'Неактивна', bg: 'bg-zinc-500/15   text-zinc-400   border-zinc-500/20',   dot: 'bg-zinc-400' },
  EXPIRED:  { label: 'Истекла',   bg: 'bg-red-500/15    text-red-400    border-red-500/20',    dot: 'bg-red-400' },
  TRIAL:    { label: 'Пробная',   bg: 'bg-amber-500/15  text-amber-400  border-amber-500/20',  dot: 'bg-amber-400' },
  LIMITED:  { label: 'Лимит',     bg: 'bg-orange-500/15 text-orange-400 border-orange-500/20', dot: 'bg-orange-400' },
  DISABLED: { label: 'Выключена', bg: 'bg-zinc-500/15   text-zinc-400   border-zinc-500/20',   dot: 'bg-zinc-400' },
}

// ── Copy button ───────────────────────────────────────────────
function CopyBtn({ text, label = 'Скопировать' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setDone(true)
    toast.success('Скопировано!')
    setTimeout(() => setDone(false), 2000)
  }
  return (
    <button onClick={copy}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                 bg-white/5 hover:bg-white/10 border border-white/10 transition-all">
      {done ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      {done ? 'Скопировано' : label}
    </button>
  )
}

// ── Device card ───────────────────────────────────────────────
function DeviceCard({ device, onDelete }: { device: HwidDevice; onDelete: (hwid: string) => void }) {
  const [deleting, setDeleting] = useState(false)
  const handleDelete = async () => {
    setDeleting(true)
    onDelete(device.hwid)
  }
  const lastSeen = device.updatedAt ? formatRelative(device.updatedAt) : '—'

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-white/3 border border-white/8
                    hover:bg-white/5 transition-all group">
      <div className="w-9 h-9 rounded-lg bg-white/8 flex items-center justify-center shrink-0 text-zinc-300">
        <PlatformIcon platform={device.platform} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{device.deviceModel || device.platform}</span>
          <span className="text-xs text-zinc-500 bg-white/5 px-1.5 py-0.5 rounded">{device.platform}</span>
        </div>
        <div className="text-xs text-zinc-500 mt-0.5">Был онлайн: {lastSeen}</div>
      </div>
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="shrink-0 p-2 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10
                   transition-all opacity-0 group-hover:opacity-100">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function SubscriptionContent() {
  const [sub,      setSub]      = useState<SubscriptionData | null>(null)
  const [devices,  setDevices]  = useState<HwidDevice[]>([])
  const [devTotal, setDevTotal] = useState(0)
  const [loading,  setLoading]  = useState(true)
  const [noSub,    setNoSub]    = useState(false)
  const [syncing,  setSyncing]  = useState(false)
  const [showQR,   setShowQR]   = useState(false)
  const [showDevs, setShowDevs] = useState(true)

  const loadSub = useCallback(async () => {
    try {
      const data = await userApi.subscription()
      setSub(data)
      setNoSub(false)
    } catch { setNoSub(true) }
  }, [])

  const loadDevices = useCallback(async () => {
    try {
      const d = await userApi.devices()
      setDevices(d.devices ?? [])
      setDevTotal(d.total ?? 0)
    } catch {}
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    await Promise.all([loadSub(), loadDevices()])
    setLoading(false)
  }, [loadSub, loadDevices])

  useEffect(() => { load() }, [load])

  const sync = async () => {
    setSyncing(true)
    try {
      const res = await userApi.sync() as any
      if (res.linked)       { toast.success('Подписка найдена и привязана!'); await load() }
      else if (res.synced)  { toast.success('Данные обновлены');              await loadSub() }
      else                  toast.error('Подписка не найдена в REMNAWAVE')
    } catch { toast.error('Ошибка синхронизации') }
    finally { setSyncing(false) }
  }

  const deleteDevice = async (hwid: string) => {
    try {
      await userApi.deleteDevice(hwid)
      toast.success('Устройство удалено')
      setDevices(d => d.filter(x => x.hwid !== hwid))
      setDevTotal(t => Math.max(0, t - 1))
    } catch { toast.error('Ошибка удаления') }
  }

  // ── Status ──────────────────────────────────────────────────
  const stCfg = (sub?.status && STATUS_CFG[sub.status as keyof typeof STATUS_CFG]) || STATUS_CFG.INACTIVE

  // ── Traffic ─────────────────────────────────────────────────
  const usedPct = sub?.trafficUsedPercent ??
    (sub?.trafficLimitBytes && sub.trafficLimitBytes > 0
      ? Math.min(100, Math.round((sub.usedTrafficBytes ?? 0) / sub.trafficLimitBytes * 100))
      : null)
  const barColor = !usedPct ? 'from-violet-500 to-blue-500'
    : usedPct >= 90 ? 'from-red-500 to-orange-400'
    : usedPct >= 70 ? 'from-orange-400 to-amber-400'
    : 'from-violet-500 to-blue-500'

  // ── Loading skeleton ─────────────────────────────────────────
  if (loading) return (
    <div className="space-y-3 animate-pulse">
      {[80, 44, 56, 64].map((h, i) => (
        <div key={i} className="rounded-2xl bg-white/5" style={{ height: `${h}px` }} />
      ))}
    </div>
  )

  // ── No subscription ──────────────────────────────────────────
  if (noSub) return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center space-y-5 max-w-sm w-full">
        <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10
                        flex items-center justify-center mx-auto">
          <Shield className="w-9 h-9 text-zinc-600" />
        </div>
        <div>
          <h2 className="text-xl font-semibold mb-2">Нет активной подписки</h2>
          <p className="text-zinc-500 text-sm leading-relaxed">
            Выбери тариф чтобы получить доступ к VPN
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Link href="/dashboard/plans">
            <button className="w-full py-3 px-6 rounded-xl font-medium text-sm
                               bg-gradient-to-r from-violet-600 to-blue-600
                               hover:from-violet-500 hover:to-blue-500 transition-all">
              Выбрать тариф
            </button>
          </Link>
          <button onClick={sync} disabled={syncing}
            className="w-full py-3 px-6 rounded-xl font-medium text-sm
                       bg-white/5 hover:bg-white/10 border border-white/10 transition-all
                       flex items-center justify-center gap-2">
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Поиск...' : 'Найти существующую'}
          </button>
        </div>
      </div>
    </div>
  )

  if (!sub) return null

  return (
    <div className="space-y-3 pb-6">

      {/* ── Header card: status + key stats ── */}
      <div className="rounded-2xl bg-white/4 border border-white/8 p-4 space-y-4">
        {/* Top row */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className={`w-2 h-2 rounded-full ${stCfg.dot} shadow-lg`}
                 style={{ boxShadow: `0 0 8px currentColor` }} />
            <span className="font-semibold">VPN подписка</span>
            <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${stCfg.bg}`}>
              {stCfg.label}
            </span>
          </div>
          <button onClick={sync} disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
                       bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-zinc-400">
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            Обновить
          </button>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-xl bg-white/4 p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Calendar className="w-3.5 h-3.5" />
              Осталось
            </div>
            <div className="text-2xl font-bold">
              {sub.daysLeft != null
                ? sub.daysLeft > 0
                  ? <>{sub.daysLeft}<span className="text-sm font-normal text-zinc-500 ml-1">дн</span></>
                  : <span className="text-red-400 text-lg">0 дн</span>
                : '—'}
            </div>
          </div>

          <div className="rounded-xl bg-white/4 p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Clock className="w-3.5 h-3.5" />
              Истекает
            </div>
            <div className="text-sm font-semibold leading-tight">
              {sub.expireAt
                ? formatDate(sub.expireAt, { day: 'numeric', month: 'short', year: 'numeric' })
                : <span className="text-zinc-600">—</span>}
            </div>
          </div>

          <div className="rounded-xl bg-white/4 p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Signal className="w-3.5 h-3.5" />
              Онлайн
            </div>
            <div className="text-sm font-semibold">
              {sub.onlineAt ? formatRelative(sub.onlineAt) : <span className="text-zinc-600">—</span>}
            </div>
          </div>

          <div className="rounded-xl bg-white/4 p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Activity className="w-3.5 h-3.5" />
              Приложение
            </div>
            <div className="text-xs text-zinc-400 leading-tight truncate">
              {sub.subLastUserAgent
                ? sub.subLastUserAgent.split('/').slice(0, 2).join(' ')
                : <span className="text-zinc-600">—</span>}
            </div>
          </div>
        </div>

        {/* Traffic bar */}
        {(sub.usedTrafficBytes !== undefined) && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-zinc-500">
                <Wifi className="w-3.5 h-3.5" />
                Трафик этого месяца
              </div>
              <span className="text-zinc-300 font-medium tabular-nums">
                {formatBytes(sub.usedTrafficBytes ?? 0)}
                {sub.trafficLimitBytes
                  ? ` / ${formatBytes(sub.trafficLimitBytes)}`
                  : ' / ∞'}
              </span>
            </div>
            <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
              <div className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-700`}
                   style={{ width: `${usedPct ?? 0}%` }} />
            </div>
            {usedPct != null && usedPct >= 80 && (
              <p className="text-xs text-orange-400">
                {usedPct >= 90 ? '⚠ Трафик почти исчерпан' : `Использовано ${usedPct}%`}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Warning: expires soon ── */}
      {sub.daysLeft != null && sub.daysLeft <= 7 && sub.daysLeft > 0 && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-300">
                Подписка истекает через {sub.daysLeft} {sub.daysLeft === 1 ? 'день' : 'дней'}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">Продли сейчас чтобы не потерять доступ</p>
            </div>
            <Link href="/dashboard/plans">
              <button className="shrink-0 py-1.5 px-3 rounded-lg text-xs font-medium
                                 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 transition-all">
                Продлить
              </button>
            </Link>
          </div>
        </div>
      )}

      {/* ── Subscription link ── */}
      <div className="rounded-2xl bg-white/4 border border-white/8 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Zap className="w-4 h-4 text-violet-400" />
            Ссылка подключения
          </div>
          <div className="flex items-center gap-2">
            <CopyBtn text={sub.subUrl} label="Копировать" />
            <button onClick={() => setShowQR(v => !v)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs
                         bg-white/5 hover:bg-white/10 border border-white/10 transition-all">
              QR
              {showQR ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* URL field */}
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-black/30 border border-white/8">
          <Globe className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
          <code className="flex-1 text-xs text-zinc-400 truncate font-mono">{sub.subUrl}</code>
        </div>

        {/* QR code */}
        {showQR && (
          <div className="flex flex-col items-center gap-3 pt-1">
            <div className="bg-white p-3 rounded-2xl">
              <QRCodeSVG value={sub.subUrl} size={180} level="M" includeMargin={false} />
            </div>
            <p className="text-xs text-zinc-500 text-center">
              Отсканируй в приложении Hiddify, V2RayN, Streisand
            </p>
          </div>
        )}

        <Link href="/dashboard/instructions">
          <button className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm
                             bg-white/4 hover:bg-white/8 border border-white/8 transition-all text-zinc-400">
            Инструкции по подключению
            <ArrowRight className="w-4 h-4" />
          </button>
        </Link>
      </div>

      {/* ── Devices ── */}
      <div className="rounded-2xl bg-white/4 border border-white/8 overflow-hidden">
        <button onClick={() => setShowDevs(v => !v)}
          className="w-full flex items-center justify-between p-4 hover:bg-white/3 transition-all">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Smartphone className="w-4 h-4 text-blue-400" />
            Подключённые устройства
            {devTotal > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/8 text-zinc-400">
                {devTotal}
              </span>
            )}
          </div>
          {showDevs ? <ChevronUp className="w-4 h-4 text-zinc-600" /> : <ChevronDown className="w-4 h-4 text-zinc-600" />}
        </button>

        {showDevs && (
          <div className="px-4 pb-4 space-y-2">
            {devices.length === 0 ? (
              <div className="text-center py-6 text-zinc-600 text-sm">
                Нет подключённых устройств
              </div>
            ) : (
              devices.map(d => (
                <DeviceCard key={d.hwid} device={d} onDelete={deleteDevice} />
              ))
            )}
            {devices.length > 0 && (
              <p className="text-xs text-zinc-600 pt-1">
                Удаляй неиспользуемые устройства чтобы освободить слоты
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Active squads ── */}
      {sub.activeSquads && sub.activeSquads.length > 0 && (
        <div className="rounded-2xl bg-white/4 border border-white/8 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Shield className="w-4 h-4 text-emerald-400" />
            Серверы подключения
          </div>
          <div className="flex flex-wrap gap-2">
            {sub.activeSquads.map(sq => (
              <span key={sq.uuid}
                className="text-xs px-2.5 py-1 rounded-lg bg-emerald-500/10
                           border border-emerald-500/20 text-emerald-400">
                {sq.name}
              </span>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
