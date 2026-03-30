'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'

interface Payment {
  id:string; amount:number; currency:string; status:string
  provider:string; createdAt:string; confirmedAt?:string
  user:{ id?:string; email?:string; telegramName?:string; telegramId?:string }
  tariff:{ name:string }
}

const STATUS_CLASS: Record<string,string> = {
  PAID:'badge-green', PENDING:'badge-yellow', FAILED:'badge-red',
  REFUNDED:'badge-gray', EXPIRED:'badge-red',
}
const PROVIDER_LABEL: Record<string,string> = {
  YUKASSA:'ЮKassa', CRYPTOPAY:'CryptoPay', MANUAL:'Вручную',
}

export default function AdminPayments() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [status, setStatus]     = useState('')
  const [provider, setProvider] = useState('')
  const [search, setSearch]     = useState('')
  const [loading, setLoading]   = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    const q = new URLSearchParams({ page:String(page), limit:'30', status, provider, search })
    fetch(`/api/admin/payments?${q}`, { credentials:'include' })
      .then(r=>r.json())
      .then(d=>{ setPayments(d.payments); setTotal(d.total); setLoading(false) })
  }, [page, status, provider, search])

  useEffect(()=>{load()},[load])

  const totalPages = Math.ceil(total / 30)

  const totalPaid = payments
    .filter(p=>p.status==='PAID')
    .reduce((s,p)=>s+(p.currency==='RUB'?p.amount:0),0)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Платежи</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{total} записей</p>
        </div>
        {totalPaid > 0 && (
          <div className="glass-card py-2 px-4 text-sm">
            Оплачено на странице:{' '}
            <span className="font-semibold" style={{ color: '#34d399' }}>
              {totalPaid.toLocaleString('ru')} ₽
            </span>
          </div>
        )}
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
        <select className="glass-input w-auto py-2 text-sm" value={status}
                onChange={e=>{setStatus(e.target.value);setPage(1)}}>
          <option value="">Все статусы</option>
          <option value="PAID">Оплачен</option>
          <option value="PENDING">Ожидание</option>
          <option value="FAILED">Отклонён</option>
        </select>
        <select className="glass-input w-auto py-2 text-sm" value={provider}
                onChange={e=>{setProvider(e.target.value);setPage(1)}}>
          <option value="">Все провайдеры</option>
          <option value="YUKASSA">ЮKassa</option>
          <option value="CRYPTOPAY">CryptoPay</option>
          <option value="MANUAL">Вручную</option>
        </select>
      </div>

      <div className="glass-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                {['ID','Пользователь','Тариф','Сумма','Статус','Провайдер','Дата']
                  .map(h=>(
                    <th key={h} className="text-left px-4 py-3 font-medium text-xs"
                        style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {loading ? [...Array(10)].map((_,i)=>(
                <tr key={i} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  {[...Array(7)].map((_,j)=>(
                    <td key={j} className="px-4 py-3"><div className="h-4 skeleton rounded w-20"/></td>
                  ))}
                </tr>
              )) : payments.map(p=>(
                <tr key={p.id} className="hover:bg-white/[0.03] transition-colors"
                    style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {p.id.slice(0,8)}...
                  </td>
                  <td className="px-4 py-3">
                    {p.user.id ? (
                      <Link href={`/admin/users/${p.user.id}`} className="block hover:underline"
                            style={{ color: 'var(--accent-1)' }}>
                        <p className="font-medium truncate max-w-[140px]">
                          {p.user.telegramName || p.user.email?.split('@')[0] || '—'}
                        </p>
                      </Link>
                    ) : (
                      <p className="font-medium truncate max-w-[140px]">
                        {p.user.telegramName || p.user.email?.split('@')[0] || '—'}
                      </p>
                    )}
                    <p className="text-xs truncate max-w-[140px]" style={{ color: 'var(--text-tertiary)' }}>
                      {p.user.email || p.user.telegramId}
                    </p>
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-primary)' }}>{p.tariff?.name || '—'}</td>
                  <td className="px-4 py-3 font-semibold">
                    {p.currency==='RUB'
                      ? `${p.amount.toLocaleString('ru')} ₽`
                      : `${p.amount} ${p.currency}`}
                  </td>
                  <td className="px-4 py-3">
                    <span className={STATUS_CLASS[p.status]||'badge-gray'}>{p.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {PROVIDER_LABEL[p.provider]||p.provider}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {new Date(p.createdAt).toLocaleDateString('ru',{day:'2-digit',month:'2-digit',year:'2-digit'})}
                    {' '}
                    {new Date(p.createdAt).toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'})}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3"
               style={{ borderTop: '1px solid var(--glass-border)' }}>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              {Math.min((page-1)*30+1,total)}–{Math.min(page*30,total)} из {total}
            </p>
            <div className="flex gap-2 items-center">
              <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}
                      className="p-1.5 disabled:opacity-30 hover:bg-white/[0.05] rounded-lg transition-colors"
                      style={{ color: 'var(--text-secondary)' }}>
                <ChevronLeft className="w-4 h-4"/>
              </button>
              <span className="text-sm px-2" style={{ color: 'var(--text-primary)' }}>{page}/{totalPages}</span>
              <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}
                      className="p-1.5 disabled:opacity-30 hover:bg-white/[0.05] rounded-lg transition-colors"
                      style={{ color: 'var(--text-secondary)' }}>
                <ChevronRight className="w-4 h-4"/>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
