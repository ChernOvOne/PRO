'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Shield, Copy, CheckCircle2, RefreshCw, Download,
  Wifi, ArrowRight, AlertCircle,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import toast from 'react-hot-toast'
import { userApi } from '@/lib/api'
import type { SubscriptionData } from '@/types'
import { Button, Badge, Card, Skeleton } from '@/components/ui'

export default function SubscriptionPage() {
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
      const res = await userApi.sync()
      const r = res as any
      if (r.linked) {
        toast.success('Подписка найдена и привязана!')
        await load()
      } else if (r.synced) {
        toast.success('Данные обновлены')
        await load()
      } else {
        toast.error('Подписка не найдена в REMNAWAVE')
      }
    } catch { toast.error('Ошибка синхронизации') }
    finally { setSyncing(false) }
  }

  const downloadConfig = () => {
    if (!sub?.subUrl) return
    const blob = new Blob([sub.subUrl], { type: 'text/plain' })
    const a    = document.createElement('a')
    a.href     = URL.createObjectURL(blob)
    a.download = 'hideyou-subscription.txt'
    a.click()
  }

  if (loading) return <SubSkeleton />

  const daysLeft = sub?.expireAt
    ? Math.max(0, Math.ceil((new Date(sub.expireAt).getTime() - Date.now()) / 86400_000))
    : null

  const isExpiringSoon = daysLeft !== null && daysLeft <= 5 && daysLeft > 0

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Моя подписка</h1>
          <p className="text-gray-400 text-sm mt-0.5">QR-код и ссылка для подключения</p>
        </div>
        <Button variant="ghost" size="sm" loading={syncing} onClick={sync}>
          <RefreshCw className="w-4 h-4" />
          Синхронизировать
        </Button>
      </div>

      {/* No subscription */}
      {(noSub || !sub) && (
        <Card className="text-center py-14 space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center
                          justify-center mx-auto">
            <Shield className="w-8 h-8 text-gray-600" />
          </div>
          <div>
            <p className="font-semibold text-lg">Нет активной подписки</p>
            <p className="text-gray-500 text-sm mt-1">
              Выбери тариф — доступ откроется сразу после оплаты
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/dashboard/plans" className="btn-primary">
              Выбрать тариф <ArrowRight className="w-4 h-4" />
            </Link>
            <Button variant="secondary" onClick={sync} loading={syncing}>
              <RefreshCw className="w-4 h-4" />
              У меня уже есть подписка
            </Button>
          </div>
        </Card>
      )}

      {sub && (
        <>
          {/* Status banner */}
          <div className={`rounded-2xl p-4 border flex items-center gap-3
                           ${sub.status === 'ACTIVE'
                             ? 'bg-emerald-500/10 border-emerald-500/20'
                             : 'bg-red-500/10 border-red-500/20'}`}>
            <div className={`w-2 h-2 rounded-full flex-shrink-0
                              ${sub.status === 'ACTIVE' ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
            <div className="flex-1">
              <p className={`font-medium text-sm ${sub.status === 'ACTIVE' ? 'text-emerald-300' : 'text-red-300'}`}>
                {sub.status === 'ACTIVE' ? 'Подписка активна' : 'Подписка неактивна'}
              </p>
              {sub.expireAt && (
                <p className={`text-xs mt-0.5 ${sub.status === 'ACTIVE' ? 'text-emerald-500' : 'text-red-500'}`}>
                  {sub.status === 'ACTIVE' ? 'Действует до' : 'Истекла'}{' '}
                  {new Date(sub.expireAt).toLocaleDateString('ru', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })}
                  {daysLeft !== null && sub.status === 'ACTIVE' && ` (${daysLeft} дн.)`}
                </p>
              )}
            </div>
            {sub.status === 'ACTIVE' && (
              <Link href="/dashboard/plans">
                <Button variant="secondary" size="sm">Продлить</Button>
              </Link>
            )}
          </div>

          {/* Expiry warning */}
          {isExpiringSoon && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10
                            border border-amber-500/20 text-amber-300">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Подписка истекает через {daysLeft} дн.</p>
                <p className="text-xs text-amber-400/70 mt-0.5">
                  Продли сейчас чтобы не потерять доступ
                </p>
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6">
            {/* QR Code */}
            <Card className="flex flex-col items-center space-y-4">
              <p className="font-semibold w-full">QR-код для подключения</p>
              <div className="p-4 bg-white rounded-2xl shadow-lg">
                <QRCodeSVG
                  value={sub.subUrl}
                  size={200}
                  errorCorrectionLevel="M"
                  includeMargin={false}
                />
              </div>
              <p className="text-xs text-gray-500 text-center">
                Отсканируй QR-кодом в приложении
              </p>
              <Button variant="secondary" size="sm" onClick={downloadConfig}>
                <Download className="w-3.5 h-3.5" />
                Скачать ссылку как файл
              </Button>
            </Card>

            {/* Sub URL + stats */}
            <div className="space-y-4">
              <Card className="space-y-3">
                <p className="font-semibold">Ссылка-подписка</p>
                <div className="flex items-center gap-2 p-3 bg-gray-800
                                rounded-xl border border-gray-700">
                  <p className="flex-1 text-xs font-mono text-gray-400 truncate">
                    {sub.subUrl}
                  </p>
                  <button
                    onClick={() => copy(sub.subUrl, 'url')}
                    className="flex-shrink-0 p-1.5 text-gray-400 hover:text-white
                               hover:bg-gray-700 rounded-lg transition-colors">
                    {copied === 'url'
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  Вставь эту ссылку в поле «Добавить подписку» в приложении
                </p>
              </Card>

              {/* How to use */}
              <Card className="space-y-3">
                <p className="font-semibold flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-brand-400" />
                  Как подключиться
                </p>
                <ol className="space-y-2">
                  {[
                    'Установи одно из рекомендуемых приложений',
                    'Скопируй ссылку-подписку или отсканируй QR-код',
                    'Вставь в приложение → "Добавить подписку"',
                    'Нажми "Подключиться" и готово',
                  ].map((s, i) => (
                    <li key={i} className="flex gap-2.5 text-sm">
                      <span className="w-5 h-5 rounded-full bg-brand-600/20 text-brand-400
                                       text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-gray-400">{s}</span>
                    </li>
                  ))}
                </ol>
                <Link href="/dashboard/instructions"
                      className="flex items-center gap-1.5 text-brand-400 hover:text-brand-300
                                 text-sm transition-colors font-medium">
                  Подробные инструкции для каждого устройства
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </Card>
            </div>
          </div>

          {/* Recommended apps */}
          <Card className="space-y-4">
            <p className="font-semibold">Рекомендуемые приложения</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {APPS.map(app => (
                <a key={app.name} href={app.url} target="_blank" rel="noopener"
                   className="flex flex-col items-center gap-2 p-4 bg-gray-800 hover:bg-gray-750
                              border border-gray-700 hover:border-gray-600
                              rounded-xl text-center transition-colors group">
                  <span className="text-2xl">{app.icon}</span>
                  <div>
                    <p className="text-sm font-medium group-hover:text-white transition-colors">
                      {app.name}
                    </p>
                    <p className="text-xs text-gray-500">{app.platform}</p>
                  </div>
                </a>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

const APPS = [
  { name: 'Streisand',  platform: 'iOS',     icon: '📱', url: 'https://apps.apple.com/app/streisand/id6450534064' },
  { name: 'v2rayNG',    platform: 'Android', icon: '🤖', url: 'https://play.google.com/store/apps/details?id=com.v2ray.ang' },
  { name: 'Hiddify',    platform: 'Windows', icon: '🪟', url: 'https://github.com/hiddify/hiddify-next/releases/latest' },
  { name: 'Hiddify',    platform: 'macOS',   icon: '🍎', url: 'https://github.com/hiddify/hiddify-next/releases/latest' },
]

function SubSkeleton() {
  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-pulse">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-20 rounded-2xl" />
      <div className="grid md:grid-cols-2 gap-6">
        <Skeleton className="h-80 rounded-2xl" />
        <div className="space-y-4">
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-44 rounded-2xl" />
        </div>
      </div>
    </div>
  )
}
