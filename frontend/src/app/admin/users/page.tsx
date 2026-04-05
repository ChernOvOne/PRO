'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, Shield, ShieldOff, Plus, ChevronLeft,
         ChevronRight, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'

interface User {
  id: string; email?: string; telegramId?: string; telegramName?: string
  subStatus: string; subExpireAt?: string; role: string; isActive: boolean
  createdAt: string; lastLoginAt?: string; remnawaveUuid?: string
  customerSource?: string
  _count: { referrals: number; payments: number }
}

const STATUS_COLORS: Record<string,string> = {
  ACTIVE:   'badge-green',
  INACTIVE: 'badge-gray',
  EXPIRED:  'badge-red',
  TRIAL:    'badge-blue',
}

export default function AdminUsers() {
  const router = useRouter()
  const [users, setUsers]     = useState<User[]>([])
  const [total, setTotal]     = useState(0)
  const [search, setSearch]   = useState('')
  const [status, setStatus]   = useState('')
  const [page, setPage]       = useState(1)
  const [utm, setUtm]         = useState('')
  const [loading, setLoading] = useState(true)
  const [extendModal, setExtendModal] = useState<User|null>(null)
  const [extendDays, setExtendDays]   = useState(30)

  const load = useCallback(() => {
    setLoading(true)
    const q = new URLSearchParams({ page: String(page), limit:'20', search, status, ...(utm ? { utm } : {}) })
    fetch(`/api/admin/users?${q}`, { credentials:'include' })
      .then(r => r.json())
      .then(d => { setUsers(d.users); setTotal(d.total); setLoading(false) })
  }, [page, search, status, utm])

  useEffect(() => { load() }, [load])

  const toggle = async (user: User) => {
    await fetch(`/api/admin/users/${user.id}/toggle`, {
      method:'POST', credentials:'include',
    })
    toast.success(user.isActive ? 'Пользователь заблокирован' : 'Пользователь разблокирован')
    load()
  }

  const extend = async () => {
    if (!extendModal) return
    const res = await fetch(`/api/admin/users/${extendModal.id}/extend`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days: extendDays }),
    })
    if (res.ok) {
      toast.success(`+${extendDays} дней добавлено`)
      setExtendModal(null); load()
    }
  }

  const totalPages = Math.ceil(total / 20)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Пользователи</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{total} пользователей</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
          <input
            className="glass-input pl-9 py-2 text-sm w-full"
            placeholder="Поиск по email, Telegram..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <select
          className="glass-input w-auto py-2 text-sm"
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(1) }}>
          <option value="">Все статусы</option>
          <option value="ACTIVE">Активные</option>
          <option value="INACTIVE">Неактивные</option>
          <option value="EXPIRED">Истёкшие</option>
        </select>
        <input
          className="glass-input py-2 text-sm w-40"
          placeholder="UTM / Источник"
          value={utm}
          onChange={e => { setUtm(e.target.value); setPage(1) }}
        />
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                {['Пользователь','Источник','Статус','Истекает','Платежи','Рефералы','Действия']
                  .map(h => (
                    <th key={h} className="text-left px-4 py-3 font-medium text-xs"
                        style={{ color: 'var(--text-tertiary)' }}>
                      {h}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(8)].map((_,i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    {[...Array(7)].map((_,j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 skeleton rounded w-24" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : users.map(u => (
                <tr key={u.id}
                    className="hover:bg-white/[0.03] transition-colors cursor-pointer"
                    style={{ borderBottom: '1px solid var(--glass-border)' }}
                    onClick={() => router.push(`/admin/users/${u.id}`)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                           style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.15)', color: 'var(--accent-1)' }}>
                        {(u.telegramName || u.email || 'U')[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <Link href={`/admin/users/${u.id}`}
                              className="font-medium truncate max-w-[140px] block hover:underline"
                              style={{ color: 'var(--accent-1)' }}
                              onClick={e => e.stopPropagation()}>
                          {u.telegramName || u.email?.split('@')[0] || `ID:${u.id.slice(0,8)}`}
                        </Link>
                        <p className="text-xs truncate max-w-[140px]" style={{ color: 'var(--text-tertiary)' }}>
                          {u.email || (u.telegramId ? `@${u.telegramName}` : '')}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {u.customerSource || '—'}
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <span className={STATUS_COLORS[u.subStatus] || 'badge-gray'}>
                      {u.subStatus}
                    </span>
                    {!u.isActive && <span className="badge-red ml-1">Блок</span>}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {u.subExpireAt
                      ? new Date(u.subExpireAt).toLocaleDateString('ru', {day:'2-digit',month:'2-digit',year:'2-digit'})
                      : '—'}
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-primary)' }}>{u._count.payments}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-primary)' }}>{u._count.referrals}</td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setExtendModal(u); setExtendDays(30) }}
                        className="p-1.5 rounded-lg transition-colors text-xs font-medium px-2.5 py-1 hover:bg-white/[0.05]"
                        style={{ color: 'var(--text-secondary)' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent-1)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}>
                        +дни
                      </button>
                      <button
                        onClick={() => toggle(u)}
                        className={`p-1.5 rounded-lg transition-colors
                                    ${u.isActive
                                      ? 'hover:text-red-400 hover:bg-red-500/10'
                                      : 'hover:text-emerald-400 hover:bg-emerald-500/10'}`}
                        style={{ color: 'var(--text-secondary)' }}>
                        {u.isActive
                          ? <ShieldOff className="w-4 h-4" />
                          : <Shield className="w-4 h-4" />}
                      </button>
                      {u.remnawaveUuid && (
                        <a href="#" className="p-1.5 rounded-lg transition-colors hover:bg-white/[0.05]"
                           style={{ color: 'var(--text-secondary)' }}>
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3"
               style={{ borderTop: '1px solid var(--glass-border)' }}>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              Показано {Math.min((page-1)*20+1, total)}–{Math.min(page*20, total)} из {total}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p=>Math.max(1,p-1))} disabled={page===1}
                      className="p-1.5 disabled:opacity-30 hover:bg-white/[0.05] rounded-lg transition-colors"
                      style={{ color: 'var(--text-secondary)' }}>
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 py-1 text-sm" style={{ color: 'var(--text-primary)' }}>{page}/{totalPages}</span>
              <button onClick={() => setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}
                      className="p-1.5 disabled:opacity-30 hover:bg-white/[0.05] rounded-lg transition-colors"
                      style={{ color: 'var(--text-secondary)' }}>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Extend modal */}
      {extendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setExtendModal(null)} />
          <div className="relative glass-card w-full max-w-sm space-y-5">
            <h2 className="font-semibold">Добавить дни подписки</h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Пользователь: <span style={{ color: 'var(--text-primary)' }}>
                {extendModal.telegramName || extendModal.email || extendModal.id.slice(0,8)}
              </span>
            </p>
            <div className="space-y-1">
              <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>Количество дней</label>
              <input type="number" className="glass-input w-full" value={extendDays}
                     onChange={e => setExtendDays(+e.target.value)} min={1} />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setExtendModal(null)} className="btn-secondary flex-1 justify-center">
                Отмена
              </button>
              <button onClick={extend} className="btn-primary flex-1 justify-center">
                +{extendDays} дней
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
