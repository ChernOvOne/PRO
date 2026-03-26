'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Shield, ShieldOff, Plus, CreditCard,
  Calendar, Wifi, Users, Mail, MessageCircle,
  CheckCircle2, XCircle, Clock, ExternalLink,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { adminApi } from '@/lib/api'
import type { AdminUser } from '@/types'
import { Card, Badge, Button, Modal, Input, Skeleton } from '@/components/ui'

export default function AdminUserDetail() {
  const { id }   = useParams<{ id: string }>()
  const router   = useRouter()
  const [user,    setUser]    = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [extendModal, setExtendModal] = useState(false)
  const [extendDays,  setExtendDays]  = useState(30)
  const [extendNote,  setExtendNote]  = useState('')
  const [acting, setActing] = useState(false)

  const load = async () => {
    try {
      const u = await adminApi.userById(id)
      setUser(u)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [id])

  const toggleActive = async () => {
    setActing(true)
    try {
      const res = await adminApi.toggleUser(id)
      toast.success(res.isActive ? 'Пользователь разблокирован' : 'Заблокирован')
      await load()
    } catch { toast.error('Ошибка') }
    finally { setActing(false) }
  }

  const doExtend = async () => {
    setActing(true)
    try {
      const res = await adminApi.extendUser(id, extendDays, extendNote)
      toast.success(`+${extendDays} дней добавлено`)
      setExtendModal(false)
      setExtendNote('')
      await load()
    } catch { toast.error('Ошибка продления') }
    finally { setActing(false) }
  }

  if (loading) return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Skeleton className="h-8 w-32" />
      <div className="grid md:grid-cols-3 gap-6">
        <Skeleton className="h-64 rounded-2xl" />
        <div className="md:col-span-2 space-y-4">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      </div>
    </div>
  )

  if (!user) return (
    <div className="max-w-4xl mx-auto">
      <p className="text-gray-400">Пользователь не найден</p>
    </div>
  )

  const daysLeft = user.subExpireAt
    ? Math.max(0, Math.ceil((new Date(user.subExpireAt).getTime() - Date.now()) / 86400_000))
    : null

  const STATUS_COLOR: Record<string, 'green'|'red'|'gray'|'yellow'|'blue'> = {
    ACTIVE:   'green',
    INACTIVE: 'gray',
    EXPIRED:  'red',
    TRIAL:    'blue',
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back */}
      <button onClick={() => router.back()}
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm">
        <ArrowLeft className="w-4 h-4" /> Назад к пользователям
      </button>

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {user.telegramName || user.email?.split('@')[0] || 'Пользователь'}
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">{user.id}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setExtendModal(true)}>
            <Plus className="w-4 h-4" /> Добавить дни
          </Button>
          <Button
            variant={user.isActive ? 'danger' : 'secondary'}
            size="sm"
            loading={acting}
            onClick={toggleActive}>
            {user.isActive
              ? <><ShieldOff className="w-4 h-4" /> Заблокировать</>
              : <><Shield className="w-4 h-4" /> Разблокировать</>}
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Profile card */}
        <div className="space-y-4">
          <Card className="space-y-4">
            {/* Avatar */}
            <div className="flex flex-col items-center text-center pt-2">
              <div className="w-16 h-16 rounded-2xl bg-brand-600/20 border border-brand-500/30
                              flex items-center justify-center text-2xl font-bold text-brand-300 mb-3">
                {(user.telegramName || user.email || 'U')[0].toUpperCase()}
              </div>
              <p className="font-semibold">
                {user.telegramName || user.email?.split('@')[0] || 'Без имени'}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <Badge color={STATUS_COLOR[user.subStatus] || 'gray'}>
                  {user.subStatus}
                </Badge>
                {!user.isActive && <Badge color="red">БЛОК</Badge>}
                {user.role === 'ADMIN' && <Badge color="purple">ADMIN</Badge>}
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-gray-800">
              {user.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  <span className="text-gray-300 truncate">{user.email}</span>
                </div>
              )}
              {user.telegramId && (
                <div className="flex items-center gap-2 text-sm">
                  <MessageCircle className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  <span className="text-gray-300">@{user.telegramName || user.telegramId}</span>
                </div>
              )}
              {user.remnawaveUuid && (
                <div className="flex items-center gap-2 text-sm">
                  <Wifi className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  <span className="text-gray-500 font-mono text-xs truncate">
                    {user.remnawaveUuid.slice(0, 16)}…
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-1 pt-2 border-t border-gray-800 text-xs text-gray-500">
              <p>Регистрация: {new Date(user.createdAt).toLocaleDateString('ru')}</p>
              {user.lastLoginAt && (
                <p>Последний вход: {new Date(user.lastLoginAt).toLocaleDateString('ru')}</p>
              )}
              <p>Рефералов: {user._count?.referrals || 0}</p>
              <p>Платежей: {user._count?.payments || 0}</p>
            </div>
          </Card>

          {/* Referral */}
          <Card className="space-y-2">
            <p className="text-sm font-medium text-gray-400">Реферальный код</p>
            <code className="block text-xs bg-gray-800 px-3 py-2 rounded-lg
                             text-brand-300 font-mono">
              {user.referralCode}
            </code>
            {user.referredBy && (
              <p className="text-xs text-gray-500">
                Привёл: {user.referredBy?.telegramName || user.referredBy?.email || '—'}
              </p>
            )}
          </Card>
        </div>

        {/* Main content */}
        <div className="md:col-span-2 space-y-4">
          {/* Subscription */}
          <Card className="space-y-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Wifi className="w-4 h-4 text-brand-400" />
              Подписка
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  label: 'Статус',
                  value: <Badge color={STATUS_COLOR[user.subStatus] || 'gray'}>{user.subStatus}</Badge>,
                },
                {
                  label: 'Осталось',
                  value: daysLeft !== null ? `${daysLeft} дней` : '—',
                },
                {
                  label: 'Истекает',
                  value: user.subExpireAt
                    ? new Date(user.subExpireAt).toLocaleDateString('ru', {
                        day: 'numeric', month: 'long', year: 'numeric',
                      })
                    : '—',
                },
                {
                  label: 'REMNAWAVE UUID',
                  value: user.remnawaveUuid
                    ? <code className="text-xs text-brand-300 font-mono">
                        {user.remnawaveUuid.slice(0, 18)}…
                      </code>
                    : <span className="text-gray-500">не привязан</span>,
                },
              ].map(({ label, value }) => (
                <div key={label} className="p-3 bg-gray-800 rounded-xl">
                  <p className="text-xs text-gray-500 mb-1">{label}</p>
                  <div className="text-sm font-medium">{value}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* Payment history */}
          <Card className="space-y-4">
            <h2 className="font-semibold flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-brand-400" />
              История платежей
            </h2>
            {user.payments?.length === 0 ? (
              <p className="text-gray-500 text-sm py-4 text-center">Нет платежей</p>
            ) : (
              <div className="space-y-2">
                {user.payments?.map((p: any) => (
                  <div key={p.id}
                       className="flex items-center justify-between py-2.5
                                  border-b border-gray-800 last:border-0">
                    <div className="flex items-center gap-3">
                      {p.status === 'PAID'
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        : p.status === 'PENDING'
                        ? <Clock className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                        : <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
                      <div>
                        <p className="text-sm font-medium">{p.provider}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(p.createdAt).toLocaleDateString('ru')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">
                        {p.currency === 'RUB'
                          ? `${p.amount.toLocaleString('ru')} ₽`
                          : `${p.amount} ${p.currency}`}
                      </p>
                      <Badge color={p.status === 'PAID' ? 'green' : p.status === 'PENDING' ? 'yellow' : 'red'}>
                        {p.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Bonus history */}
          {user.bonusHistory?.length > 0 && (
            <Card className="space-y-3">
              <h2 className="font-semibold">Бонусные дни</h2>
              {user.bonusHistory.map((b: any) => (
                <div key={b.id} className="flex justify-between items-center
                                            border-b border-gray-800 last:border-0 py-2 text-sm">
                  <span className="text-gray-400">
                    {new Date(b.appliedAt).toLocaleDateString('ru')}
                  </span>
                  <span className="text-emerald-400 font-medium">+{b.bonusDays} дн.</span>
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>

      {/* Extend modal */}
      <Modal open={extendModal} onClose={() => setExtendModal(false)} title="Добавить дни подписки">
        <p className="text-sm text-gray-400">
          Пользователь:{' '}
          <span className="text-white font-medium">
            {user.telegramName || user.email || id.slice(0, 8)}
          </span>
        </p>
        <div className="space-y-1">
          <label className="text-sm text-gray-400">Количество дней</label>
          <Input
            type="number"
            min={1}
            max={3650}
            value={extendDays}
            onChange={e => setExtendDays(+e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-gray-400">Причина (необязательно)</label>
          <Input
            value={extendNote}
            onChange={e => setExtendNote(e.target.value)}
            placeholder="Компенсация, ручное продление..."
          />
        </div>
        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1 justify-center"
                  onClick={() => setExtendModal(false)}>
            Отмена
          </Button>
          <Button className="flex-1 justify-center" loading={acting} onClick={doExtend}>
            +{extendDays} дней
          </Button>
        </div>
      </Modal>
    </div>
  )
}
