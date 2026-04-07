'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Shield, ShieldOff, Plus, CreditCard,
  Wifi, Users, Mail, MessageCircle, Copy,
  CheckCircle2, XCircle, Clock, Trash2, Bell,
  RefreshCw, Ban, UserX, Calendar, Smartphone,
  Globe, FileText, DollarSign, ChevronRight, ChevronDown,
  Wallet, Tag, Gift, Star, Filter, Edit2, X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { adminApi } from '@/lib/api'
import type { AdminNote } from '@/types'

export default function AdminUserDetail() {
  const { id }   = useParams<{ id: string }>()
  const router   = useRouter()
  const [user, setUser]       = useState<any>(null)
  const [notes, setNotes]     = useState<AdminNote[]>([])
  const [devices, setDevices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing]   = useState(false)
  const [copied, setCopied]   = useState<string | null>(null)

  // Modals
  const [showExtend, setShowExtend]     = useState(false)
  const [showNotify, setShowNotify]     = useState(false)
  const [showNote, setShowNote]         = useState(false)
  const [showBalance, setShowBalance]   = useState(false)
  const [showGrantDays, setShowGrantDays] = useState(false)
  const [showDelete, setShowDelete]     = useState(false)
  const [showEditProfile, setShowEditProfile] = useState(false)
  const [editEmail, setEditEmail] = useState('')
  const [editTgId, setEditTgId] = useState('')
  const [devicesOpen, setDevicesOpen]   = useState(false)
  const [activityFilter, setActivityFilter] = useState<string>('all')
  const [activities, setActivities]   = useState<any[]>([])
  const [activitiesLoading, setActivitiesLoading] = useState(false)

  // Form state
  const [extendDays, setExtendDays]     = useState(30)
  const [extendNote, setExtendNote]     = useState('')
  const [notifyTitle, setNotifyTitle]   = useState('')
  const [notifyMsg, setNotifyMsg]       = useState('')
  const [noteText, setNoteText]         = useState('')
  const [balanceAmount, setBalanceAmount] = useState(0)
  const [balanceDesc, setBalanceDesc]   = useState('')
  const [grantDaysCount, setGrantDaysCount] = useState(30)
  const [grantDaysDesc, setGrantDaysDesc]   = useState('')

  const loadActivities = async () => {
    setActivitiesLoading(true)
    try {
      const res = await fetch(`/api/admin/users/${id}/activity?limit=50`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setActivities(data.items || data.activities || [])
      }
    } catch {
      // Activities endpoint may not exist yet; fall back to parsing payments
    } finally {
      setActivitiesLoading(false)
    }
  }

  const load = async () => {
    try {
      const [u, n] = await Promise.all([
        adminApi.userById(id),
        adminApi.userNotes(id).catch(() => []),
      ])
      setUser(u)
      setNotes(n)

      // Load devices for THIS user via admin endpoint
      if (u.remnawaveUuid) {
        adminApi.userDevices(id)
          .then(d => setDevices(d.devices || []))
          .catch(() => {})
      }

      loadActivities()
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
    toast.success('Скопировано')
  }

  const action = async (fn: () => Promise<any>, successMsg: string) => {
    setActing(true)
    try {
      await fn()
      toast.success(successMsg)
      await load()
    } catch (err: any) {
      toast.error(err.message || 'Ошибка')
    } finally {
      setActing(false)
    }
  }

  if (loading) return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="h-8 skeleton w-32" />
      <div className="grid md:grid-cols-3 gap-6">
        <div className="h-80 skeleton rounded-2xl" />
        <div className="md:col-span-2 space-y-4">
          <div className="h-48 skeleton rounded-2xl" />
          <div className="h-48 skeleton rounded-2xl" />
        </div>
      </div>
    </div>
  )

  if (!user) return (
    <div className="max-w-5xl mx-auto">
      <p style={{ color: 'var(--text-tertiary)' }}>Пользователь не найден</p>
    </div>
  )

  const daysLeft = user.subExpireAt
    ? Math.max(0, Math.ceil((new Date(user.subExpireAt).getTime() - Date.now()) / 86400_000))
    : null

  const statusColor: Record<string, string> = {
    ACTIVE: '#34d399', INACTIVE: 'var(--text-tertiary)', EXPIRED: '#f87171', TRIAL: '#22d3ee',
  }

  const CopyField = ({ label, value }: { label: string; value: string }) => (
    <div className="copy-field" onClick={() => copyText(value, label)}>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
        <p className="text-sm font-mono truncate" style={{ color: 'var(--text-primary)' }}>{value}</p>
      </div>
      {copied === label
        ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
        : <Copy className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />}
    </div>
  )

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Back */}
      <button onClick={() => router.back()}
              className="flex items-center gap-2 text-sm transition-opacity hover:opacity-80"
              style={{ color: 'var(--text-secondary)' }}>
        <ArrowLeft className="w-4 h-4" /> Назад
      </button>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {user.telegramName || user.email?.split('@')[0] || 'Пользователь'}
          </h1>
          <p className="text-xs font-mono mt-1" style={{ color: 'var(--text-tertiary)' }}>{user.id}</p>
        </div>
      </div>

      {/* Action buttons — grouped cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Подписка */}
        <div className="rounded-2xl p-4 space-y-2.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--accent-1)' }}>Подписка</div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setShowExtend(true)}
              className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-all hover:scale-[1.02]"
              style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.15)', color: 'var(--accent-1)' }}>
              <Plus className="w-5 h-5" />
              <span className="text-[12px] font-medium">Добавить дни</span>
            </button>
            <button onClick={() => setShowGrantDays(true)}
              className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-all hover:scale-[1.02]"
              style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.15)', color: 'var(--accent-1)' }}>
              <Calendar className="w-5 h-5" />
              <span className="text-[12px] font-medium">Выдать дни</span>
            </button>
            <button onClick={() => action(() => adminApi.revokeUser(id), 'Ссылка подписки обновлена')} disabled={acting}
              className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-all hover:scale-[1.02]"
              style={{ background: 'var(--surface-3)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}>
              <RefreshCw className="w-5 h-5" />
              <span className="text-[12px] font-medium">Обновить ссылку</span>
            </button>
            <button onClick={() => action(() => adminApi.resetTraffic(id), 'Трафик сброшен')} disabled={acting}
              className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-all hover:scale-[1.02]"
              style={{ background: 'var(--surface-3)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}>
              <RefreshCw className="w-5 h-5" />
              <span className="text-[12px] font-medium">Сброс трафика</span>
            </button>
          </div>
        </div>

        {/* Коммуникация */}
        <div className="rounded-2xl p-4 space-y-2.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#f472b6' }}>Коммуникация</div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setShowBalance(true)}
              className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-all hover:scale-[1.02]"
              style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)', color: '#34d399' }}>
              <DollarSign className="w-5 h-5" />
              <span className="text-[12px] font-medium">Баланс</span>
            </button>
            <button onClick={() => setShowNotify(true)}
              className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-all hover:scale-[1.02]"
              style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.15)', color: '#fbbf24' }}>
              <Bell className="w-5 h-5" />
              <span className="text-[12px] font-medium">Уведомление</span>
            </button>
            <button onClick={() => setShowNote(true)}
              className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-all hover:scale-[1.02] col-span-2"
              style={{ background: 'var(--surface-3)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}>
              <FileText className="w-5 h-5" />
              <span className="text-[12px] font-medium">Добавить заметку</span>
            </button>
          </div>
        </div>

        {/* Управление */}
        <div className="rounded-2xl p-4 space-y-2.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#f87171' }}>Управление</div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => action(
              () => user.isActive ? adminApi.disableUser(id) : adminApi.enableUser(id),
              user.isActive ? 'Пользователь заблокирован' : 'Пользователь разблокирован'
            )} disabled={acting}
              className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-all hover:scale-[1.02]"
              style={{
                background: user.isActive ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)',
                border: `1px solid ${user.isActive ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)'}`,
                color: user.isActive ? '#f87171' : '#34d399',
              }}>
              {user.isActive ? <Ban className="w-5 h-5" /> : <Shield className="w-5 h-5" />}
              <span className="text-[12px] font-medium">{user.isActive ? 'Заблокировать' : 'Разблокировать'}</span>
            </button>
            <button onClick={() => setShowDelete(true)}
              className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-all hover:scale-[1.02]"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
              <Trash2 className="w-5 h-5" />
              <span className="text-[12px] font-medium">Удалить</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        {/* Left column — profile */}
        <div className="space-y-4">
          <div className="glass-card space-y-4">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold  mb-3"
                   style={{ background: 'rgba(6,182,212,0.1)', color: '#a78bfa' }}>
                {(user.telegramName || user.email || 'U')[0].toUpperCase()}
              </div>
              <p className="font-semibold">
                {user.telegramName || user.email?.split('@')[0] || 'Без имени'}
              </p>
              <div className="flex items-center gap-2 mt-2 flex-wrap justify-center">
                <span className="badge" style={{
                  background: `${statusColor[user.subStatus]}15`,
                  color: statusColor[user.subStatus],
                }}>{user.subStatus}</span>
                {!user.isActive && <span className="badge-red">БЛОК</span>}
                {user.role === 'ADMIN' && <span className="badge-violet">ADMIN</span>}
              </div>
            </div>

            <div className="space-y-2 pt-3" style={{ borderTop: '1px solid var(--glass-border)' }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Контакты</span>
                <button onClick={() => {
                  setEditEmail(user.email || '')
                  setEditTgId(user.telegramId || '')
                  setShowEditProfile(true)
                }} className="text-xs px-2 py-1 rounded-lg flex items-center gap-1 hover:bg-white/5"
                        style={{ color: '#a78bfa' }}>
                  <Edit2 className="w-3 h-3" /> Изменить
                </button>
              </div>
              {user.rmData?.username && <CopyField label="RW Username" value={user.rmData.username} />}
              {user.email && <CopyField label="Email" value={user.email} />}
              {user.telegramId && <CopyField label="Telegram ID" value={user.telegramId} />}
              {user.telegramName && <CopyField label="TG Username" value={`@${user.telegramName}`} />}
              {user.remnawaveUuid && <CopyField label="RW UUID" value={user.remnawaveUuid} />}
              <CopyField label="ID" value={user.id} />
              {user.referralCode && <CopyField label="Реферальный код" value={user.referralCode} />}
              {user.rmData?.subscriptionUrl && <CopyField label="Ссылка подписки" value={user.rmData.subscriptionUrl} />}
            </div>

            <div className="space-y-1.5 pt-3 text-xs" style={{ borderTop: '1px solid var(--glass-border)', color: 'var(--text-tertiary)' }}>
              <p>Регистрация: {new Date(user.createdAt).toLocaleString('ru')}</p>
              {user.lastLoginAt && <p>Последний вход ЛК: {new Date(user.lastLoginAt).toLocaleString('ru')}</p>}
              {user.rmData?.firstConnectedAt && <p>Первое подключение: {new Date(user.rmData.firstConnectedAt).toLocaleString('ru')}</p>}
              {user.rmData?.onlineAt && <p>Онлайн: {new Date(user.rmData.onlineAt).toLocaleString('ru')}</p>}
              {user.rmData?.subLastOpenedAt && <p>Последнее открытие подписки: {new Date(user.rmData.subLastOpenedAt).toLocaleString('ru')}</p>}
              {user.rmData?.subLastUserAgent && <p>Приложение: {user.rmData.subLastUserAgent}</p>}
              <p>Рефералов: {user._count?.referrals || user.referrals?.length || 0}</p>
              <p>Платежей: {user._count?.payments || user.payments?.length || 0}</p>
              <p>Баланс: {Number(user.balance || 0).toFixed(2)} ₽</p>
              <p>Бонусные дни: {user.bonusDays ?? 0}</p>
            </div>

            {/* IP & Geo info */}
            {(user.lastIp || user.geoInfo) && (
              <div className="pt-3 space-y-2" style={{ borderTop: '1px solid var(--glass-border)' }}>
                <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
                  Последний IP
                </p>
                {user.lastIp && <CopyField label="IP адрес" value={user.lastIp} />}
                {user.geoInfo && (
                  <div className="space-y-1.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {user.geoInfo.country && (
                      <div className="flex items-center gap-2">
                        <Globe className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{user.geoInfo.country}{user.geoInfo.city ? `, ${user.geoInfo.city}` : ''}</span>
                      </div>
                    )}
                    {user.geoInfo.region && user.geoInfo.region !== user.geoInfo.city && (
                      <div className="flex items-center gap-2">
                        <span className="w-3.5" />
                        <span>{user.geoInfo.region}</span>
                      </div>
                    )}
                    {user.geoInfo.isp && (
                      <div className="flex items-center gap-2">
                        <Wifi className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{user.geoInfo.isp}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Referrals */}
          {user.referrals?.length > 0 && (
            <div className="glass-card space-y-2">
              <h3 className="font-medium text-sm flex items-center gap-2">
                <Users className="w-4 h-4" style={{ color: 'var(--accent-1)' }} />
                Рефералы ({user.referrals.length})
              </h3>
              {user.referrals.map((ref: any) => (
                <button key={ref.id}
                        onClick={() => router.push(`/admin/users/${ref.id}`)}
                        className="w-full flex items-center gap-2 p-2 rounded-lg text-left text-sm hover:bg-white/[0.03] transition-all">
                  <span style={{ color: 'var(--text-primary)' }}>
                    {ref.telegramName || ref.email?.split('@')[0] || ref.id.slice(0, 8)}
                  </span>
                  <ChevronRight className="w-3 h-3 ml-auto" style={{ color: 'var(--text-tertiary)' }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right column — details */}
        <div className="md:col-span-2 space-y-4">
          {/* Subscription details */}
          <div className="glass-card space-y-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Wifi className="w-4 h-4" style={{ color: 'var(--accent-1)' }} />
              Подписка
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: 'Статус', value: user.rmData?.status || user.subStatus, color: statusColor[user.rmData?.status || user.subStatus] },
                { label: 'Осталось', value: daysLeft !== null ? `${daysLeft} дней` : '—' },
                { label: 'Истекает', value: user.subExpireAt ? new Date(user.subExpireAt).toLocaleDateString('ru') : '—' },
                { label: 'Трафик', value: user.rmData ? formatTraffic(user.rmData.usedTrafficBytes, user.rmData.trafficLimitBytes) : '—' },
                { label: 'Устройств лимит', value: user.rmData?.hwidDeviceLimit === 0 ? 'Безлимит' : String(user.rmData?.hwidDeviceLimit ?? '—') },
                { label: 'Тег', value: user.rmData?.tag || '—' },
              ].map(({ label, value, color }) => (
                <div key={label} className="p-3 rounded-xl" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                  <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
                  <p className="text-sm font-semibold" style={{ color: color || 'var(--text-primary)' }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Traffic bar */}
            {user.rmData && user.rmData.trafficLimitBytes > 0 && (
              <div>
                <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--glass-bg)' }}>
                  <div className="h-full rounded-full transition-all" style={{
                    width: `${Math.min(100, Math.round(user.rmData.usedTrafficBytes / user.rmData.trafficLimitBytes * 100))}%`,
                    background: 'var(--accent-gradient)',
                  }} />
                </div>
              </div>
            )}
          </div>

          {/* Devices (collapsible) */}
          <div className="glass-card">
            <button onClick={() => setDevicesOpen(!devicesOpen)}
                    className="w-full flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2">
                <Smartphone className="w-4 h-4" style={{ color: 'var(--accent-1)' }} />
                Устройства ({devices.length})
              </h2>
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${devicesOpen ? 'rotate-180' : ''}`}
                           style={{ color: 'var(--text-tertiary)' }} />
            </button>
            {devicesOpen && (
            <div className="space-y-3 mt-3">
            {devices.length === 0 ? (
              <p className="text-sm py-2" style={{ color: 'var(--text-tertiary)' }}>Нет подключённых устройств</p>
            ) : (
              devices.map((d: any) => (
                <div key={d.hwid} className="flex items-center gap-3 p-3 rounded-xl"
                     style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                  {/* Platform icon */}
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                       style={{ background: 'rgba(6,182,212,0.08)' }}>
                    {d.platform === 'iOS' ? <Smartphone className="w-5 h-5" style={{ color: 'var(--accent-1)' }} /> :
                     d.platform === 'Android' ? <Smartphone className="w-5 h-5" style={{ color: '#34d399' }} /> :
                     <Globe className="w-5 h-5" style={{ color: 'var(--accent-1)' }} />}
                  </div>

                  <div className="min-w-0 flex-1">
                    {/* Device model + platform */}
                    <p className="text-sm font-semibold">
                      {d.deviceModel || d.platform || 'Неизвестное устройство'}
                    </p>
                    {/* OS + app version */}
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      {[d.platform, d.osVersion ? `v${d.osVersion}` : null].filter(Boolean).join(' ')}
                      {d.userAgent && (() => {
                        const parts = d.userAgent.split('/')
                        const appName = parts[0] || ''
                        const appVersion = parts[1] || ''
                        return <span style={{ color: 'var(--text-tertiary)' }}> · {appName} {appVersion}</span>
                      })()}
                    </p>
                    {/* HWID */}
                    <p className="text-[10px] font-mono mt-0.5 truncate" style={{ color: 'var(--text-tertiary)' }}>
                      HWID: {d.hwid}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                    <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                      {new Date(d.createdAt).toLocaleDateString('ru')}
                    </span>
                    <button
                      onClick={() => action(
                        () => adminApi.deleteUserDevice(id, d.hwid),
                        'Устройство удалено'
                      )}
                      className="p-2 rounded-lg hover:bg-red-500/10 transition-all"
                      title="Удалить устройство">
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </div>
              ))
            )}
            </div>
            )}
          </div>

          {/* Activity History */}
          <div className="glass-card space-y-3">
            <h2 className="font-semibold flex items-center gap-2">
              <CreditCard className="w-4 h-4" style={{ color: 'var(--accent-1)' }} />
              История активности
            </h2>

            {/* Filter tabs */}
            <div className="flex flex-wrap gap-1.5">
              {([
                { key: 'all', label: 'Все' },
                { key: 'payment', label: 'Платежи' },
                { key: 'bonus_redeem', label: 'Бонусные дни' },
                { key: 'referral_redeem', label: 'Реферальные дни' },
                { key: 'promo', label: 'Промокоды' },
                { key: 'balance', label: 'Баланс' },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActivityFilter(tab.key)}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
                  style={{
                    background: activityFilter === tab.key ? 'var(--accent-1)' : 'var(--glass-bg)',
                    color: activityFilter === tab.key ? '#fff' : 'var(--text-secondary)',
                    border: `1px solid ${activityFilter === tab.key ? 'var(--accent-1)' : 'var(--glass-border)'}`,
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Timeline */}
            {(() => {
              // Build unified activity list from payments + activities endpoint
              const allItems: any[] = []

              // Parse payments into activity items
              if (user.payments?.length) {
                for (const p of user.payments) {
                  let meta: any = null
                  try { meta = JSON.parse(p.yukassaStatus || '{}') } catch {}

                  if (meta?._type === 'referral_redeem') {
                    allItems.push({
                      id: p.id,
                      type: 'referral_redeem',
                      description: `Активация реферальных дней`,
                      value: `+${meta.days} дней`,
                      date: p.createdAt,
                      status: p.status,
                      meta,
                    })
                  } else if (meta?._type === 'bonus_redeem') {
                    allItems.push({
                      id: p.id,
                      type: 'bonus_redeem',
                      description: `Активация бонусных дней`,
                      value: `+${meta.days} дней`,
                      date: p.createdAt,
                      status: p.status,
                      meta,
                    })
                  } else {
                    const modeLabel = meta?._mode === 'variant' ? meta.variantName || meta.tariffName || ''
                      : meta?._mode === 'configurator' ? `${meta.days || ''}д / ${meta.devices || ''}устр`
                      : ''
                    const promoLabel = meta?.promoCode ? ` (промо: ${meta.promoCode}${meta.discountPct ? ` -${meta.discountPct}%` : ''})` : ''

                    allItems.push({
                      id: p.id,
                      type: 'payment',
                      description: [
                        p.provider,
                        modeLabel,
                        p.purpose === 'GIFT' ? 'Подарок' : '',
                        promoLabel,
                      ].filter(Boolean).join(' · '),
                      value: (() => {
                        if (p.purpose === 'GIFT' && p.amount === 0) return 'Подарок'
                        if (p.amount === 0 && p.provider === 'MANUAL') return 'Бонус'
                        const amt = p.currency === 'RUB' ? `${p.amount.toLocaleString('ru')} ₽` : `${p.amount} ${p.currency}`
                        return amt
                      })(),
                      originalAmount: meta?.originalAmount ?? null,
                      amount: p.amount,
                      currency: p.currency,
                      date: p.createdAt,
                      status: p.status,
                      meta,
                    })
                  }
                }
              }

              // Merge in activities from the API (promo, balance, etc.)
              for (const a of activities) {
                // Avoid duplicates if the activity endpoint also returns payments
                if (a.type === 'payment' && allItems.some(i => i.id === a.id)) continue
                allItems.push({
                  id: a.id,
                  type: a.type,
                  description: a.description,
                  value: a.amount != null
                    ? (a.currency === 'RUB' ? `${a.amount > 0 ? '+' : ''}${a.amount} ₽` : `${a.amount} ${a.currency || ''}`)
                    : '',
                  amount: a.amount,
                  date: a.date,
                  status: a.status,
                  meta: a.metadata,
                })
              }

              // Sort by date descending
              allItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

              // Apply filter
              const filtered = activityFilter === 'all'
                ? allItems
                : allItems.filter(i => i.type === activityFilter)

              if (filtered.length === 0) {
                return (
                  <p className="text-sm py-6 text-center" style={{ color: 'var(--text-tertiary)' }}>
                    {activitiesLoading ? 'Загрузка...' : 'Нет записей'}
                  </p>
                )
              }

              const typeConfig: Record<string, { icon: React.ReactNode; dotColor: string; badgeClass: string; badgeLabel: string }> = {
                payment: {
                  icon: <CreditCard className="w-4 h-4" />,
                  dotColor: '#34d399',
                  badgeClass: 'badge-green',
                  badgeLabel: 'Платёж',
                },
                bonus_redeem: {
                  icon: <Star className="w-4 h-4" />,
                  dotColor: '#a78bfa',
                  badgeClass: 'badge-violet',
                  badgeLabel: 'Бонус',
                },
                referral_redeem: {
                  icon: <Users className="w-4 h-4" />,
                  dotColor: '#22d3ee',
                  badgeClass: 'badge-cyan',
                  badgeLabel: 'Реферал',
                },
                promo: {
                  icon: <Tag className="w-4 h-4" />,
                  dotColor: '#fbbf24',
                  badgeClass: 'badge-yellow',
                  badgeLabel: 'Промокод',
                },
                balance: {
                  icon: <Wallet className="w-4 h-4" />,
                  dotColor: '#60a5fa',
                  badgeClass: 'badge-blue',
                  badgeLabel: 'Баланс',
                },
              }

              return (
                <div className="space-y-0">
                  {filtered.map((item, idx) => {
                    const cfg = typeConfig[item.type] || typeConfig.payment
                    const isLast = idx === filtered.length - 1

                    return (
                      <div key={item.id} className="flex gap-3 relative">
                        {/* Timeline line + dot */}
                        <div className="flex flex-col items-center flex-shrink-0" style={{ width: 32 }}>
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ background: `${cfg.dotColor}15`, color: cfg.dotColor }}
                          >
                            {cfg.icon}
                          </div>
                          {!isLast && (
                            <div className="flex-1 w-px my-1" style={{ background: 'var(--glass-border)' }} />
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 pb-4">
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                                  {item.description}
                                </p>
                                <span className={cfg.badgeClass} style={{ fontSize: '10px' }}>
                                  {cfg.badgeLabel}
                                </span>
                                {item.status && item.status !== 'PAID' && item.status !== 'completed' && (
                                  <span className={`badge-${item.status === 'PENDING' ? 'yellow' : 'red'}`} style={{ fontSize: '10px' }}>
                                    {item.status}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                                {new Date(item.date).toLocaleString('ru')}
                              </p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-semibold" style={{
                                color: item.type === 'payment' ? '#34d399'
                                  : item.type === 'bonus_redeem' ? '#a78bfa'
                                  : item.type === 'referral_redeem' ? '#22d3ee'
                                  : item.type === 'balance' ? '#60a5fa'
                                  : 'var(--text-primary)',
                              }}>
                                {item.value}
                              </p>
                              {item.originalAmount != null && item.originalAmount !== item.amount && (
                                <p className="text-[10px] line-through" style={{ color: 'var(--text-tertiary)' }}>
                                  {item.currency === 'RUB' ? `${item.originalAmount.toLocaleString('ru')} ₽` : `${item.originalAmount}`}
                                </p>
                              )}
                              {item.meta?.promoCode && (
                                <p className="text-[10px] mt-0.5" style={{ color: '#a78bfa' }}>
                                  {item.meta.promoCode}{item.meta.discountPct ? ` -${item.meta.discountPct}%` : ''}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>

          {/* Admin Notes */}
          <div className="glass-card space-y-3">
            <h2 className="font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4" style={{ color: 'var(--accent-1)' }} />
              Заметки администратора
            </h2>
            {notes.length === 0 ? (
              <p className="text-sm py-2" style={{ color: 'var(--text-tertiary)' }}>Нет заметок</p>
            ) : (
              <div className="space-y-2">
                {notes.map(note => (
                  <div key={note.id} className="p-3 rounded-xl flex items-start justify-between"
                       style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                    <div>
                      <p className="text-sm">{note.text}</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                        {note.admin?.telegramName || note.admin?.email || 'Admin'} · {new Date(note.createdAt).toLocaleString('ru')}
                      </p>
                    </div>
                    <button onClick={() => action(
                      () => adminApi.deleteUserNote(id, note.id),
                      'Заметка удалена'
                    )} className="p-1 rounded hover:bg-red-500/10 flex-shrink-0">
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Modals ── */}

      {/* Extend */}
      {showExtend && (
        <ModalOverlay onClose={() => setShowExtend(false)} title="Добавить дни">
          <input type="number" className="glass-input" placeholder="Количество дней"
                 value={extendDays} onChange={e => setExtendDays(+e.target.value)} min={1} />
          <input className="glass-input" placeholder="Причина (необязательно)"
                 value={extendNote} onChange={e => setExtendNote(e.target.value)} />
          <button onClick={() => {
            action(() => adminApi.addDays(id, extendDays, extendNote), `+${extendDays} дней`)
            setShowExtend(false)
          }} className="btn-primary w-full justify-center" disabled={acting}>
            +{extendDays} дней
          </button>
        </ModalOverlay>
      )}

      {/* Notify */}
      {showNotify && (
        <ModalOverlay onClose={() => setShowNotify(false)} title="Отправить уведомление">
          <input className="glass-input" placeholder="Заголовок"
                 value={notifyTitle} onChange={e => setNotifyTitle(e.target.value)} />
          <textarea className="glass-input min-h-[80px] resize-y" placeholder="Сообщение"
                    value={notifyMsg} onChange={e => setNotifyMsg(e.target.value)} />
          <button onClick={() => {
            action(() => adminApi.notifyUser(id, notifyTitle, notifyMsg), 'Уведомление отправлено')
            setShowNotify(false); setNotifyTitle(''); setNotifyMsg('')
          }} className="btn-primary w-full justify-center" disabled={acting || !notifyTitle || !notifyMsg}>
            Отправить
          </button>
        </ModalOverlay>
      )}

      {/* Note */}
      {showNote && (
        <ModalOverlay onClose={() => setShowNote(false)} title="Добавить заметку">
          <textarea className="glass-input min-h-[80px] resize-y" placeholder="Текст заметки"
                    value={noteText} onChange={e => setNoteText(e.target.value)} />
          <button onClick={() => {
            action(() => adminApi.addUserNote(id, noteText), 'Заметка добавлена')
            setShowNote(false); setNoteText('')
          }} className="btn-primary w-full justify-center" disabled={acting || !noteText}>
            Сохранить
          </button>
        </ModalOverlay>
      )}

      {/* Balance */}
      {showBalance && (
        <ModalOverlay onClose={() => setShowBalance(false)} title="Изменить баланс">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Текущий баланс: <strong>{Number(user.balance || 0).toFixed(2)} ₽</strong>
          </p>
          <input type="number" className="glass-input" placeholder="Сумма (+ пополнение, - списание)"
                 value={balanceAmount} onChange={e => setBalanceAmount(+e.target.value)} />
          <input className="glass-input" placeholder="Описание"
                 value={balanceDesc} onChange={e => setBalanceDesc(e.target.value)} />
          <button onClick={() => {
            action(() => adminApi.adjustBalance(id, balanceAmount, balanceDesc), 'Баланс обновлён')
            setShowBalance(false); setBalanceAmount(0); setBalanceDesc('')
          }} className="btn-primary w-full justify-center" disabled={acting || balanceAmount === 0}>
            {balanceAmount >= 0 ? `+${balanceAmount} ₽` : `${balanceAmount} ₽`}
          </button>
        </ModalOverlay>
      )}

      {/* Grant Days */}
      {showGrantDays && (
        <ModalOverlay onClose={() => setShowGrantDays(false)} title="Выдать бонусные дни">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Текущие бонусные дни: <strong>{user.bonusDays ?? 0}</strong>
          </p>
          <input type="number" className="glass-input" placeholder="Количество дней"
                 value={grantDaysCount} onChange={e => setGrantDaysCount(+e.target.value)} min={1} />
          <input className="glass-input" placeholder="Описание (необязательно)"
                 value={grantDaysDesc} onChange={e => setGrantDaysDesc(e.target.value)} />
          <button onClick={() => {
            action(() => adminApi.grantDays(id, grantDaysCount, grantDaysDesc), `+${grantDaysCount} бонусных дней`)
            setShowGrantDays(false); setGrantDaysCount(30); setGrantDaysDesc('')
          }} className="btn-primary w-full justify-center" disabled={acting || grantDaysCount < 1}>
            +{grantDaysCount} бонусных дней
          </button>
        </ModalOverlay>
      )}

      {/* Delete options */}
      {showEditProfile && (
        <ModalOverlay onClose={() => setShowEditProfile(false)} title="Изменить профиль">
          <div className="space-y-3">
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-tertiary)' }}>Email</label>
              <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)}
                     placeholder="user@example.com"
                     className="w-full px-3 py-2 rounded-lg text-sm"
                     style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--text-tertiary)' }}>Telegram ID</label>
              <input type="text" value={editTgId} onChange={e => setEditTgId(e.target.value.replace(/\D/g, ''))}
                     placeholder="123456789"
                     className="w-full px-3 py-2 rounded-lg text-sm"
                     style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
            </div>
            <div className="text-[10px] p-2 rounded-lg" style={{ background: 'rgba(6,182,212,0.08)', color: 'var(--text-tertiary)' }}>
              ℹ️ Изменения синхронизируются с REMNAWAVE
            </div>
            <div className="flex gap-2">
              <button onClick={async () => {
                try {
                  await adminApi.updateUserProfile(id, {
                    email: editEmail.trim() || null,
                    telegramId: editTgId.trim() || null,
                  })
                  toast.success('Профиль обновлён')
                  setShowEditProfile(false)
                  load()
                } catch (e: any) {
                  toast.error(e.message || 'Ошибка')
                }
              }} className="flex-1 py-2 rounded-lg text-sm font-medium"
                 style={{ background: 'var(--accent-1)', color: '#fff' }}>
                Сохранить
              </button>
              <button onClick={() => setShowEditProfile(false)}
                      className="px-4 py-2 rounded-lg text-sm"
                      style={{ color: 'var(--text-tertiary)' }}>
                Отмена
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {showDelete && (
        <ModalOverlay onClose={() => setShowDelete(false)} title="Удаление пользователя">
          <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Выберите что удалить:</p>
          <div className="space-y-2">
            {/* Full delete */}
            <button onClick={() => {
              action(() => adminApi.deleteUser(id), 'Пользователь полностью удалён').then(() => router.push('/admin/users'))
              setShowDelete(false)
            }} disabled={acting}
              className="w-full text-left p-3 rounded-xl transition-all hover:brightness-110"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <p className="text-sm font-medium" style={{ color: '#f87171' }}>Удалить полностью</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                Из БД + REMNAWAVE + бот. Необратимо.
              </p>
            </button>

            {/* REMNAWAVE only */}
            {user.remnawaveUuid && (
              <button onClick={() => {
                action(
                  () => fetch(`/api/admin/users/${id}/delete-remnawave`, { method: 'POST', credentials: 'include' }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
                  'Подписка REMNAWAVE удалена'
                )
                setShowDelete(false)
              }} disabled={acting}
                className="w-full text-left p-3 rounded-xl transition-all hover:brightness-110"
                style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
                <p className="text-sm font-medium" style={{ color: '#fbbf24' }}>Только подписку REMNAWAVE</p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                  Удалит из VPN-панели, аккаунт в системе останется.
                </p>
              </button>
            )}

            {/* Web account only */}
            <button onClick={() => {
              action(
                () => fetch(`/api/admin/users/${id}/delete-web`, { method: 'POST', credentials: 'include' }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
                'Веб-аккаунт удалён'
              ).then(() => router.push('/admin/users'))
              setShowDelete(false)
            }} disabled={acting}
              className="w-full text-left p-3 rounded-xl transition-all hover:brightness-110"
              style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.15)' }}>
              <p className="text-sm font-medium" style={{ color: '#a78bfa' }}>Только из веб-системы</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                Удалит из БД, REMNAWAVE не затронет.
              </p>
            </button>

            {/* Remove from bot */}
            {user.telegramId && (
              <button onClick={() => {
                action(
                  () => fetch(`/api/admin/users/${id}/delete-bot`, { method: 'POST', credentials: 'include' }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
                  'Пользователь удалён из бота'
                )
                setShowDelete(false)
              }} disabled={acting}
                className="w-full text-left p-3 rounded-xl transition-all hover:brightness-110"
                style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Только из бота</p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                  Удалит историю чата и отвяжет Telegram. Веб-аккаунт и подписка останутся.
                </p>
              </button>
            )}

            <button onClick={() => setShowDelete(false)} className="btn-secondary w-full justify-center mt-1">
              Отмена
            </button>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}

function formatTraffic(used: number, limit: number): string {
  const usedGb = (used / (1024 * 1024 * 1024)).toFixed(1)
  if (!limit || limit === 0) return `${usedGb} ГБ / Безлимит`
  const limitGb = (limit / (1024 * 1024 * 1024)).toFixed(0)
  return `${usedGb} / ${limitGb} ГБ`
}

function ModalOverlay({ children, onClose, title }: {
  children: React.ReactNode; onClose: () => void; title: string
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 " onClick={onClose} />
      <div className="relative glass-card w-full max-w-md space-y-4 animate-scale-in"
           style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
        <h3 className="font-semibold text-lg">{title}</h3>
        {children}
      </div>
    </div>
  )
}
