'use client'

import { useEffect, useState, useCallback } from 'react'
import { Search, Shield, ShieldOff, Plus, ChevronLeft,
         ChevronRight, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'

interface User {
  id: string; email?: string; telegramId?: string; telegramName?: string
  subStatus: string; subExpireAt?: string; role: string; isActive: boolean
  createdAt: string; lastLoginAt?: string; remnawaveUuid?: string
  _count: { referrals: number; payments: number }
}

const STATUS_COLORS: Record<string,string> = {
  ACTIVE:   'badge-green',
  INACTIVE: 'badge-gray',
  EXPIRED:  'badge-red',
  TRIAL:    'badge-blue',
}

export default function AdminUsers() {
  const [users, setUsers]     = useState<User[]>([])
  const [total, setTotal]     = useState(0)
  const [search, setSearch]   = useState('')
  const [status, setStatus]   = useState('')
  const [page, setPage]       = useState(1)
  const [loading, setLoading] = useState(true)
  const [extendModal, setExtendModal] = useState<User|null>(null)
  const [extendDays, setExtendDays]   = useState(30)

  const load = useCallback(() => {
    setLoading(true)
    const q = new URLSearchParams({ page: String(page), limit:'20', search, status })
    fetch(`/api/admin/users?${q}`, { credentials:'include' })
      .then(r => r.json())
      .then(d => { setUsers(d.users); setTotal(d.total); setLoading(false) })
  }, [page, search, status])

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
          <p className="text-gray-400 text-sm">{total} пользователей</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            className="input pl-9 py-2 text-sm"
            placeholder="Поиск по email, Telegram..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <select
          className="input w-auto py-2 text-sm"
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(1) }}>
          <option value="">Все статусы</option>
          <option value="ACTIVE">Активные</option>
          <option value="INACTIVE">Неактивные</option>
          <option value="EXPIRED">Истёкшие</option>
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['Пользователь','Статус','Истекает','Платежи','Рефералы','Действия']
                  .map(h => (
                    <th key={h} className="text-left px-4 py-3 text-gray-500 font-medium text-xs">
                      {h}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(8)].map((_,i) => (
                  <tr key={i} className="border-b border-gray-800/50">
                    {[...Array(6)].map((_,j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 skeleton rounded w-24" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : users.map(u => (
                <tr key={u.id}
                    className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-brand-600/20 border border-brand-500/20
                                      flex items-center justify-center text-xs font-semibold text-brand-300 flex-shrink-0">
                        {(u.telegramName || u.email || 'U')[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate max-w-[140px]">
                          {u.telegramName || u.email?.split('@')[0] || `ID:${u.id.slice(0,8)}`}
                        </p>
                        <p className="text-gray-500 text-xs truncate max-w-[140px]">
                          {u.email || (u.telegramId ? `@${u.telegramName}` : '')}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={STATUS_COLORS[u.subStatus] || 'badge-gray'}>
                      {u.subStatus}
                    </span>
                    {!u.isActive && <span className="badge-red ml-1">Блок</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {u.subExpireAt
                      ? new Date(u.subExpireAt).toLocaleDateString('ru', {day:'2-digit',month:'2-digit',year:'2-digit'})
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-300">{u._count.payments}</td>
                  <td className="px-4 py-3 text-gray-300">{u._count.referrals}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setExtendModal(u); setExtendDays(30) }}
                        className="p-1.5 text-gray-400 hover:text-brand-400 hover:bg-brand-500/10
                                   rounded-lg transition-colors text-xs font-medium px-2.5 py-1">
                        +дни
                      </button>
                      <button
                        onClick={() => toggle(u)}
                        className={`p-1.5 rounded-lg transition-colors
                                    ${u.isActive
                                      ? 'text-gray-400 hover:text-red-400 hover:bg-red-500/10'
                                      : 'text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/10'}`}>
                        {u.isActive
                          ? <ShieldOff className="w-4 h-4" />
                          : <Shield className="w-4 h-4" />}
                      </button>
                      {u.remnawaveUuid && (
                        <a href="#" className="p-1.5 text-gray-400 hover:text-white rounded-lg transition-colors">
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
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
            <p className="text-sm text-gray-500">
              Показано {Math.min((page-1)*20+1, total)}–{Math.min(page*20, total)} из {total}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p=>Math.max(1,p-1))} disabled={page===1}
                      className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30
                                 hover:bg-gray-700 rounded-lg transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 py-1 text-sm text-gray-300">{page}/{totalPages}</span>
              <button onClick={() => setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}
                      className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30
                                 hover:bg-gray-700 rounded-lg transition-colors">
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
          <div className="relative card w-full max-w-sm space-y-5">
            <h2 className="font-semibold">Добавить дни подписки</h2>
            <p className="text-sm text-gray-400">
              Пользователь: <span className="text-white">
                {extendModal.telegramName || extendModal.email || extendModal.id.slice(0,8)}
              </span>
            </p>
            <div className="space-y-1">
              <label className="text-sm text-gray-400">Количество дней</label>
              <input type="number" className="input" value={extendDays}
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
