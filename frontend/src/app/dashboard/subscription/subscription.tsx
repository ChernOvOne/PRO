'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  Copy, CheckCircle2, RefreshCw, Wifi, AlertCircle,
  Clock, Signal, Smartphone, Monitor, Tv, Laptop,
  Trash2, ChevronDown, ChevronUp, X, QrCode,
  Apple, Globe, Download, Zap, Shield,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import toast from 'react-hot-toast'
import { userApi } from '@/lib/api'
import type { SubscriptionData, HwidDevice } from '@/types'
import { formatBytes, formatRelative, formatDate } from '@/lib/utils'

// ── Detect platform ───────────────────────────────────────────
function detectPlatform(): string {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent.toLowerCase()
  if (/iphone|ipad|ipod/.test(ua))              return 'ios'
  if (/android/.test(ua) && /mobile/.test(ua))  return 'android'
  if (/android/.test(ua))                        return 'tv'
  if (/windows/.test(ua))                        return 'windows'
  if (/mac os/.test(ua))                         return 'macos'
  if (/linux/.test(ua))                          return 'linux'
  return 'windows'
}

// ── Platform icon ─────────────────────────────────────────────
function DeviceIcon({ platform, className = 'w-4 h-4' }: { platform: string; className?: string }) {
  const p = (platform ?? '').toLowerCase()
  if (p.includes('android') || p.includes('ios')) return <Smartphone className={className} />
  if (p.includes('tv'))  return <Tv className={className} />
  if (p.includes('mac')) return <Laptop className={className} />
  return <Monitor className={className} />
}

// ── Status config ─────────────────────────────────────────────
const ST: Record<string, { label: string; color: string; glow: string }> = {
  ACTIVE:   { label: 'Активна',    color: 'text-emerald-400', glow: '#34d399' },
  INACTIVE: { label: 'Неактивна',  color: 'text-zinc-500',    glow: '#71717a' },
  EXPIRED:  { label: 'Истекла',    color: 'text-red-400',     glow: '#f87171' },
  TRIAL:    { label: 'Пробная',    color: 'text-amber-400',   glow: '#fbbf24' },
  LIMITED:  { label: 'Лимит',      color: 'text-orange-400',  glow: '#fb923c' },
  DISABLED: { label: 'Выключена',  color: 'text-zinc-500',    glow: '#71717a' },
}

// ── QR Modal ──────────────────────────────────────────────────
function QRModal({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
         onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative rounded-3xl p-6 w-full max-w-sm
                      animate-slide-up shadow-2xl"
           style={{ background: 'var(--surface-2)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--glass-border)' }}
           onClick={e => e.stopPropagation()}>
        <button onClick={onClose}
          className="absolute right-4 top-4 w-8 h-8 rounded-full bg-white/8
                     flex items-center justify-center hover:bg-white/15 transition-all">
          <X className="w-4 h-4" />
        </button>
        <h3 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Добавить на другое устройство</h3>
        <p className="text-sm mb-5" style={{ color: 'var(--text-tertiary)' }}>
          Отсканируй QR-код в VPN-приложении на другом устройстве
        </p>
        <div className="flex justify-center mb-5">
          <div className="bg-white p-4 rounded-2xl">
            <QRCodeSVG value={url} size={192} level="M" />
          </div>
        </div>
        <button onClick={() => { navigator.clipboard.writeText(url); toast.success('Скопировано!') }}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm
                     bg-white/8 hover:bg-white/12 transition-all"
          style={{ borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--glass-border)', color: 'var(--text-primary)' }}>
          <Copy className="w-4 h-4" />
          Скопировать ссылку
        </button>
      </div>
    </div>
  )
}

// ── Buy Traffic Modal ─────────────────────────────────────────
function TrafficModal({ addons, onClose, onBuy }: {
  addons: any[];
  onClose: () => void;
  onBuy: (id: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
         onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative rounded-3xl p-6 w-full max-w-sm
                      shadow-2xl animate-slide-up"
           style={{ background: 'var(--surface-2)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--glass-border)' }}
           onClick={e => e.stopPropagation()}>
        <button onClick={onClose}
          className="absolute right-4 top-4 w-8 h-8 rounded-full bg-white/8
                     flex items-center justify-center hover:bg-white/15 transition-all">
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-2xl bg-orange-500/15 flex items-center justify-center">
            <Zap className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Докупить трафик</h3>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Добавляется к текущему лимиту</p>
          </div>
        </div>
        <div className="space-y-2">
          {addons.map((a: any) => (
            <button key={a.id} onClick={() => onBuy(a.id)}
              className="w-full flex items-center justify-between p-4 rounded-2xl
                         bg-white/4 hover:bg-white/8 border border-white/8
                         hover:border-orange-500/30 transition-all group">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center
                                group-hover:bg-orange-500/20 transition-all">
                  <Wifi className="w-4 h-4 text-orange-400" />
                </div>
                <div className="text-left">
                  <div className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{a.name}</div>
                  <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>+{a.trafficAddonGb} ГБ</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{a.priceRub}₽</div>
                {a.priceUsdt && <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>${a.priceUsdt}</div>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────
export default function SubscriptionContent() {
  const [sub,       setSub]       = useState<SubscriptionData | null>(null)
  const [devices,   setDevices]   = useState<HwidDevice[]>([])
  const [addons,    setAddons]    = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [noSub,     setNoSub]     = useState(false)
  const [syncing,   setSyncing]   = useState(false)
  const [showQR,    setShowQR]    = useState(false)
  const [showBuy,   setShowBuy]   = useState(false)
  const [showDevs,  setShowDevs]  = useState(false)

  const loadAll = useCallback(async () => {
    setLoading(true)
    const [subRes, devsRes, addonRes] = await Promise.allSettled([
      userApi.subscription(),
      userApi.devices(),
      fetch('/api/tariffs/addons', { credentials: 'include' }).then(r => r.json()),
    ])
    if (subRes.status === 'fulfilled') { setSub(subRes.value); setNoSub(false) }
    else setNoSub(true)
    if (devsRes.status === 'fulfilled') setDevices(devsRes.value.devices ?? [])
    if (addonRes.status === 'fulfilled') setAddons(addonRes.value ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const sync = async () => {
    setSyncing(true)
    try {
      const res = await userApi.sync() as any
      if (res.linked)      { toast.success('Подписка найдена!'); await loadAll() }
      else if (res.synced) { toast.success('Данные обновлены');  await loadAll() }
      else                 toast.error('Подписка не найдена')
    } catch { toast.error('Ошибка') }
    finally { setSyncing(false) }
  }

  const deleteDevice = async (hwid: string) => {
    try {
      await userApi.deleteDevice(hwid)
      toast.success('Устройство удалено')
      setDevices(d => d.filter(x => x.hwid !== hwid))
    } catch { toast.error('Ошибка удаления') }
  }

  const buyAddon = async (tariffId: string) => {
    setShowBuy(false)
    // Redirect to payment
    window.location.href = `/dashboard/plans?addon=${tariffId}`
  }

  const st   = (sub?.status && ST[sub.status]) || ST.INACTIVE
  const pct  = sub?.trafficUsedPercent ?? null
  const warn = pct !== null && pct >= 70 && addons.length > 0

  if (loading) return (
    <div className="space-y-3 animate-pulse">
      <div className="h-40 rounded-3xl bg-white/4" />
      <div className="h-24 rounded-3xl bg-white/4" />
      <div className="h-32 rounded-3xl bg-white/4" />
    </div>
  )

  if (noSub) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 gap-5">
      <div className="w-24 h-24 rounded-3xl bg-white/4 border border-white/8
                      flex items-center justify-center">
        <Shield className="w-10 h-10" style={{ color: 'var(--text-tertiary)' }} />
      </div>
      <div>
        <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Нет подписки</h2>
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Выбери тариф для подключения VPN</p>
      </div>
      <div className="flex flex-col gap-2 w-full max-w-xs">
        <Link href="/dashboard/plans">
          <button className="w-full py-3.5 rounded-2xl font-semibold text-sm text-white
                             bg-gradient-to-r from-violet-600 to-blue-600
                             hover:opacity-90 transition-all">
            Выбрать тариф
          </button>
        </Link>
        <button onClick={sync} disabled={syncing}
          className="w-full py-3.5 rounded-2xl text-sm font-medium
                     bg-white/5 hover:bg-white/8 border border-white/10 transition-all"
          style={{ color: 'var(--text-primary)' }}>
          {syncing ? 'Поиск...' : 'Найти существующую подписку'}
        </button>
      </div>
    </div>
  )

  if (!sub) return null

  return (
    <>
      {showQR  && <QRModal url={sub.subUrl} onClose={() => setShowQR(false)} />}
      {showBuy && <TrafficModal addons={addons} onClose={() => setShowBuy(false)} onBuy={buyAddon} />}

      <div className="space-y-3 pb-8 max-w-lg mx-auto">

        {/* ── STATUS CARD ── */}
        <div className="rounded-3xl bg-white/4 border border-white/8 p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="relative w-2.5 h-2.5">
                <div className="absolute inset-0 rounded-full animate-ping opacity-40"
                     style={{ backgroundColor: st.glow }} />
                <div className="relative rounded-full w-2.5 h-2.5"
                     style={{ backgroundColor: st.glow }} />
              </div>
              <span className={`text-sm font-semibold ${st.color}`}>{st.label}</span>
            </div>
            <button onClick={sync} disabled={syncing}
              className="transition-colors p-1"
              style={{ color: 'var(--text-tertiary)' }}>
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Days */}
          <div className="flex items-end gap-2 mb-4">
            <span className="text-5xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
              {sub.daysLeft ?? '—'}
            </span>
            <span className="text-sm pb-2" style={{ color: 'var(--text-tertiary)' }}>
              {sub.daysLeft === 1 ? 'день' : sub.daysLeft != null && sub.daysLeft < 5 ? 'дня' : 'дней'}
            </span>
            {sub.expireAt && (
              <span className="text-xs pb-2 ml-auto" style={{ color: 'var(--text-tertiary)' }}>
                до {formatDate(sub.expireAt, { day: 'numeric', month: 'long' })}
              </span>
            )}
          </div>

          {/* Traffic */}
          {sub.usedTrafficBytes !== undefined && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs" style={{ color: 'var(--text-tertiary)' }}>
                <span className="flex items-center gap-1.5">
                  <Wifi className="w-3.5 h-3.5" />
                  Трафик
                </span>
                <span className="font-medium tabular-nums" style={{ color: 'var(--text-primary)' }}>
                  {formatBytes(sub.usedTrafficBytes ?? 0)}
                  {sub.trafficLimitBytes
                    ? ` / ${formatBytes(sub.trafficLimitBytes)}`
                    : ' / ∞'}
                </span>
              </div>
              <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                     style={{
                       width: `${pct ?? 0}%`,
                       background: pct && pct >= 90 ? 'linear-gradient(90deg,#ef4444,#f97316)'
                                 : pct && pct >= 70 ? 'linear-gradient(90deg,#f97316,#fbbf24)'
                                 : 'linear-gradient(90deg,#8b5cf6,#3b82f6)',
                     }} />
              </div>
            </div>
          )}

          {/* Buy traffic button */}
          {warn && (
            <button onClick={() => setShowBuy(true)}
              className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl
                         text-xs font-medium border border-orange-500/30 bg-orange-500/8
                         text-orange-400 hover:bg-orange-500/15 transition-all">
              <Zap className="w-3.5 h-3.5" />
              {pct !== null && pct >= 90 ? 'Трафик заканчивается — докупить' : 'Докупить трафик'}
            </button>
          )}
        </div>

        {/* ── EXPIRES SOON ── */}
        {sub.daysLeft != null && sub.daysLeft <= 7 && sub.daysLeft > 0 && (
          <div className="rounded-3xl border border-amber-500/20 bg-amber-500/6 p-4
                          flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-300">
                Подписка истекает через {sub.daysLeft} {sub.daysLeft === 1 ? 'день' : 'дней'}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Продли чтобы не потерять доступ</p>
            </div>
            <Link href="/dashboard/plans">
              <button className="shrink-0 py-2 px-3.5 rounded-xl text-xs font-semibold
                                 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-all">
                Продлить
              </button>
            </Link>
          </div>
        )}

        {/* ── CONNECT ── */}
        <div className="rounded-3xl bg-white/4 border border-white/8 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Подключение</span>
            <button onClick={() => setShowQR(true)}
              className="flex items-center gap-1.5 text-xs transition-colors"
              style={{ color: 'var(--text-tertiary)' }}>
              <QrCode className="w-3.5 h-3.5" />
              QR-код
            </button>
          </div>

          {/* URL */}
          <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-black/30 border border-white/8">
            <Globe className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
            <code className="flex-1 text-xs truncate font-mono" style={{ color: 'var(--text-tertiary)' }}>{sub.subUrl}</code>
            <button onClick={() => { navigator.clipboard.writeText(sub.subUrl); toast.success('Скопировано!') }}
              className="shrink-0 p-1 transition-colors"
              style={{ color: 'var(--text-tertiary)' }}>
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Copy button */}
          <button onClick={() => { navigator.clipboard.writeText(sub.subUrl); toast.success('Ссылка скопирована!') }}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl
                       text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-600
                       hover:opacity-90 transition-all">
            <Copy className="w-4 h-4" />
            Скопировать ссылку подписки
          </button>

          <Link href="/dashboard/instructions">
            <button className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl
                               text-sm bg-white/4
                               hover:bg-white/8 border border-white/8 transition-all"
              style={{ color: 'var(--text-secondary)' }}>
              <Download className="w-4 h-4" />
              Инструкции по подключению
            </button>
          </Link>
        </div>

        {/* ── DEVICES ── */}
        <div className="rounded-3xl bg-white/4 border border-white/8 overflow-hidden">
          <button onClick={() => setShowDevs(v => !v)}
            className="w-full flex items-center justify-between px-5 py-4
                       hover:bg-white/[0.03] transition-all">
            <div className="flex items-center gap-2.5 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              <Smartphone className="w-4 h-4 text-blue-400" />
              Мои устройства
              {devices.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-white/8 font-normal"
                      style={{ color: 'var(--text-tertiary)' }}>
                  {devices.length}
                </span>
              )}
            </div>
            {showDevs
              ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
              : <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />}
          </button>

          {showDevs && (
            <div className="px-4 pb-4 space-y-2">
              {devices.length === 0 ? (
                <div className="text-center py-6 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  Нет подключённых устройств
                </div>
              ) : devices.map(d => (
                <DeviceRow key={d.hwid} device={d} onDelete={deleteDevice} />
              ))}
              {devices.length > 0 && (
                <p className="text-xs pt-1 px-1" style={{ color: 'var(--text-tertiary)' }}>
                  Удали неиспользуемые устройства чтобы освободить слоты
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── LAST SEEN ── */}
        {(sub.onlineAt || sub.subLastOpenedAt) && (
          <div className="rounded-3xl bg-white/4 border border-white/8 px-5 py-4">
            <div className="grid grid-cols-2 gap-4">
              {sub.onlineAt && (
                <div>
                  <div className="flex items-center gap-1.5 text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>
                    <Signal className="w-3 h-3" />
                    Последний онлайн
                  </div>
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{formatRelative(sub.onlineAt)}</div>
                </div>
              )}
              {sub.subLastOpenedAt && (
                <div>
                  <div className="flex items-center gap-1.5 text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>
                    <Clock className="w-3 h-3" />
                    Подписка открыта
                  </div>
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{formatRelative(sub.subLastOpenedAt)}</div>
                </div>
              )}
            </div>
            {sub.subLastUserAgent && (
              <div className="mt-2 text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                {sub.subLastUserAgent.split('/').slice(0, 2).join(' ')}
              </div>
            )}
          </div>
        )}

      </div>
    </>
  )
}

// ── Device row ────────────────────────────────────────────────
function DeviceRow({ device, onDelete }: { device: HwidDevice; onDelete: (h: string) => void }) {
  const [confirm, setConfirm] = useState(false)
  const uaParts = device.userAgent ? device.userAgent.split('/') : []
  const appName = uaParts[0] || null
  const appVersion = uaParts[1] || null
  return (
    <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/3 border border-white/6
                    hover:bg-white/5 transition-all group">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
           style={{ background: 'rgba(6,182,212,0.08)', color: 'var(--accent-1)' }}>
        <DeviceIcon platform={device.platform} className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
          {device.deviceModel || device.platform || 'Устройство'}
        </div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          {[
            device.platform,
            device.osVersion ? `v${device.osVersion}` : null,
          ].filter(Boolean).join(' ')}
          {appName && (
            <span style={{ color: 'var(--text-tertiary)' }}> · {appName}{appVersion ? ` ${appVersion}` : ''}</span>
          )}
        </div>
      </div>
      {confirm ? (
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={() => onDelete(device.hwid)}
            className="text-xs px-2.5 py-1 rounded-lg bg-red-500/15 text-red-400
                       hover:bg-red-500/25 transition-all">
            Удалить
          </button>
          <button onClick={() => setConfirm(false)}
            className="text-xs px-2 py-1 rounded-lg bg-white/8
                       hover:bg-white/12 transition-all"
            style={{ color: 'var(--text-secondary)' }}>
            Отмена
          </button>
        </div>
      ) : (
        <button onClick={() => setConfirm(true)}
          className="shrink-0 p-2 rounded-xl hover:text-red-400
                     hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
          style={{ color: 'var(--text-tertiary)' }}>
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
