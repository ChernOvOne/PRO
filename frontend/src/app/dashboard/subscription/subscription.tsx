'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Shield, Copy, CheckCircle2, RefreshCw, Download,
  Wifi, ArrowRight, AlertCircle, Clock, Activity,
  Signal, Calendar,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import toast from 'react-hot-toast'
import { userApi } from '@/lib/api'
import type { SubscriptionData } from '@/types'
import { Button, Badge, Card, Skeleton } from '@/components/ui'
import { formatDate, formatBytes, formatRelative } from '@/lib/utils'

export default function SubscriptionContent() {
  const [sub,     setSub]     = useState<SubscriptionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [noSub,   setNoSub]   = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [copied,  setCopied]  = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await userApi.subscription()
      setSub(data)
      setNoSub(false)
    } catch {
      setNoSub(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    toast.success('Скопировано!')
    setTimeout(() => setCopied(null), 2500)
  }

  const sync = async () => {
    setSyncing(true)
    try {
      const res = await userApi.sync() as any
      if (res.linked) {
        toast.success('Подписка найдена и привязана!')
        await load()
      } else if (res.synced) {
        toast.success('Данные обновлены')
        await load()
      } else {
        toast.error('Подписка не найдена в REMNAWAVE')
      }
    } catch { toast.error('Ошибка синхронизации') }
    finally { setSyncing(false) }
  }

  // ── Статус ──────────────────────────────────────────────────
  const statusConfig = {
    ACTIVE:   { label: 'Активна',    color: 'bg-green-500/20  text-green-400',  dot: 'bg-green-400'  },
    INACTIVE: { label: 'Неактивна',  color: 'bg-gray-500/20   text-gray-400',   dot: 'bg-gray-400'   },
    EXPIRED:  { label: 'Истекла',    color: 'bg-red-500/20    text-red-400',    dot: 'bg-red-400'    },
    TRIAL:    { label: 'Пробная',    color: 'bg-yellow-500/20 text-yellow-400', dot: 'bg-yellow-400' },
    LIMITED:  { label: 'Лимит',      color: 'bg-orange-500/20 text-orange-400', dot: 'bg-orange-400' },
    DISABLED: { label: 'Отключена',  color: 'bg-gray-500/20   text-gray-400',   dot: 'bg-gray-400'   },
  }
  const st = (sub?.status && statusConfig[sub.status as keyof typeof statusConfig])
    || statusConfig.INACTIVE

  if (loading) return (
    <div className="space-y-4">
      {[1,2,3].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}
    </div>
  )

  if (noSub) return (
    <div className="space-y-6">
      <Card className="p-8 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center mx-auto">
          <Shield className="w-8 h-8 text-gray-600" />
        </div>
        <div>
          <h2 className="text-xl font-semibold mb-2">Нет активной подписки</h2>
          <p className="text-gray-400 text-sm">Выбери тариф чтобы начать пользоваться VPN</p>
        </div>
        <div className="flex gap-3 justify-center flex-wrap">
          <Link href="/dashboard/plans">
            <Button variant="primary">Выбрать тариф</Button>
          </Link>
          <Button variant="ghost" onClick={sync} loading={syncing}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Найти существующую
          </Button>
        </div>
      </Card>
    </div>
  )

  if (!sub) return null

  const usedPct = sub.trafficUsedPercent ?? (
    sub.trafficLimitBytes && sub.trafficLimitBytes > 0
      ? Math.min(100, Math.round((sub.usedTrafficBytes ?? 0) / sub.trafficLimitBytes * 100))
      : null
  )
  const usedColor = !usedPct ? 'bg-brand-500'
    : usedPct >= 90 ? 'bg-red-500'
    : usedPct >= 70 ? 'bg-orange-500'
    : 'bg-brand-500'

  return (
    <div className="space-y-4">

      {/* Статус и сроки */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${st.dot} animate-pulse`} />
            <span className="font-semibold">Подписка</span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
              {st.label}
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={sync} loading={syncing}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Обновить
          </Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Дней осталось */}
          <div className="bg-gray-800/50 rounded-xl p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Calendar className="w-3.5 h-3.5" />
              Осталось дней
            </div>
            <div className="text-xl font-bold">
              {sub.daysLeft !== null && sub.daysLeft !== undefined
                ? sub.daysLeft > 0 ? sub.daysLeft : <span className="text-red-400">0</span>
                : '—'}
            </div>
          </div>

          {/* Истекает */}
          <div className="bg-gray-800/50 rounded-xl p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Clock className="w-3.5 h-3.5" />
              Истекает
            </div>
            <div className="text-sm font-medium">
              {sub.expireAt
                ? formatDate(sub.expireAt, { day: 'numeric', month: 'short', year: 'numeric' })
                : '—'}
            </div>
          </div>

          {/* Онлайн */}
          <div className="bg-gray-800/50 rounded-xl p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Signal className="w-3.5 h-3.5" />
              Последний онлайн
            </div>
            <div className="text-sm font-medium">
              {sub.onlineAt ? formatRelative(sub.onlineAt) : '—'}
            </div>
          </div>

          {/* Открыта подписка */}
          <div className="bg-gray-800/50 rounded-xl p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Activity className="w-3.5 h-3.5" />
              Синхронизация
            </div>
            <div className="text-sm font-medium">
              {sub.subLastOpenedAt ? formatRelative(sub.subLastOpenedAt) : '—'}
            </div>
          </div>
        </div>
      </Card>

      {/* Трафик */}
      {(sub.usedTrafficBytes !== undefined || sub.trafficLimitBytes !== undefined) && (
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-gray-400">
              <Wifi className="w-4 h-4" />
              Трафик
            </div>
            <span className="text-gray-300 font-medium">
              {formatBytes(sub.usedTrafficBytes ?? 0)}
              {sub.trafficLimitBytes
                ? ` / ${formatBytes(sub.trafficLimitBytes)}`
                : ' / ∞'}
            </span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${usedColor}`}
              style={{ width: `${usedPct ?? 0}%` }}
            />
          </div>
          {usedPct !== null && (
            <p className="text-xs text-gray-500">
              Использовано {usedPct}%
              {usedPct >= 90 && (
                <span className="text-orange-400 ml-2">— скоро закончится</span>
              )}
            </p>
          )}
        </Card>
      )}

      {/* Ссылка подписки */}
      <Card className="p-5 space-y-4">
        <h3 className="font-medium flex items-center gap-2">
          <Download className="w-4 h-4 text-brand-400" />
          Ссылка для подключения
        </h3>

        <div className="bg-gray-800 rounded-xl p-3 flex items-center gap-2 group">
          <code className="flex-1 text-xs text-gray-300 truncate font-mono">
            {sub.subUrl}
          </code>
          <button
            onClick={() => copy(sub.subUrl, 'url')}
            className="shrink-0 text-gray-500 hover:text-white transition-colors"
          >
            {copied === 'url'
              ? <CheckCircle2 className="w-4 h-4 text-green-400" />
              : <Copy className="w-4 h-4" />}
          </button>
        </div>

        <p className="text-xs text-gray-500">
          Вставь эту ссылку в приложение VPN: Hiddify, NekoRay, V2RayN, Streisand и другие.
        </p>

        <Link href="/dashboard/instructions">
          <Button variant="ghost" size="sm" className="w-full justify-center">
            Инструкции по подключению
            <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
          </Button>
        </Link>
      </Card>

      {/* QR-код */}
      <Card className="p-5 space-y-4">
        <h3 className="font-medium flex items-center gap-2">
          <Wifi className="w-4 h-4 text-brand-400" />
          QR-код для мобильных приложений
        </h3>

        <div className="flex justify-center">
          <div className="bg-white p-4 rounded-2xl">
            <QRCodeSVG
              value={sub.subUrl}
              size={200}
              level="M"
              includeMargin={false}
            />
          </div>
        </div>

        <p className="text-xs text-gray-500 text-center">
          Отсканируй камерой в приложении Hiddify или другом VPN-клиенте
        </p>
      </Card>

      {/* Предупреждение если скоро истекает */}
      {sub.daysLeft !== null && sub.daysLeft !== undefined && sub.daysLeft <= 7 && sub.daysLeft > 0 && (
        <Card className="p-4 border border-yellow-500/30 bg-yellow-500/5">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-yellow-300">
                Подписка истекает через {sub.daysLeft} {sub.daysLeft === 1 ? 'день' : 'дней'}
              </p>
              <p className="text-xs text-gray-400">Продли сейчас чтобы не потерять доступ</p>
            </div>
            <Link href="/dashboard/plans" className="ml-auto shrink-0">
              <Button variant="primary" size="sm">Продлить</Button>
            </Link>
          </div>
        </Card>
      )}

    </div>
  )
}
