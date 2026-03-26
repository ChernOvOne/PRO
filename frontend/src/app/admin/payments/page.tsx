'use client'

import { useEffect, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Payment {
  id:string; amount:number; currency:string; status:string
  provider:string; createdAt:string; confirmedAt?:string
  user:{ email?:string; telegramName?:string; telegramId?:string }
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
  const [loading, setLoading]   = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    const q = new URLSearchParams({ page:String(page), limit:'30', status, provider })
    fetch(`/api/admin/payments?${q}`, { credentials:'include' })
      .then(r=>r.json())
      .then(d=>{ setPayments(d.payments); setTotal(d.total); setLoading(false) })
  }, [page, status, provider])

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
          <p className="text-gray-400 text-sm">{total} записей</p>
        </div>
        {totalPaid > 0 && (
          <div className="card py-2 px-4 text-sm">
            Оплачено на странице:{' '}
            <span className="text-emerald-400 font-semibold">
              {totalPaid.toLocaleString('ru')} ₽
            </span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select className="input w-auto py-2 text-sm" value={status}
                onChange={e=>{setStatus(e.target.value);setPage(1)}}>
          <option value="">Все статусы</option>
          <option value="PAID">Оплачен</option>
          <option value="PENDING">Ожидание</option>
          <option value="FAILED">Отклонён</option>
        </select>
        <select className="input w-auto py-2 text-sm" value={provider}
                onChange={e=>{setProvider(e.target.value);setPage(1)}}>
          <option value="">Все провайдеры</option>
          <option value="YUKASSA">ЮKassa</option>
          <option value="CRYPTOPAY">CryptoPay</option>
          <option value="MANUAL">Вручную</option>
        </select>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['ID','Пользователь','Тариф','Сумма','Статус','Провайдер','Дата']
                  .map(h=>(
                    <th key={h} className="text-left px-4 py-3 text-gray-500 font-medium text-xs">{h}</th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {loading ? [...Array(10)].map((_,i)=>(
                <tr key={i} className="border-b border-gray-800/50">
                  {[...Array(7)].map((_,j)=>(
                    <td key={j} className="px-4 py-3"><div className="h-4 skeleton rounded w-20"/></td>
                  ))}
                </tr>
              )) : payments.map(p=>(
                <tr key={p.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {p.id.slice(0,8)}…
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium truncate max-w-[140px]">
                      {p.user.telegramName || p.user.email?.split('@')[0] || '—'}
                    </p>
                    <p className="text-xs text-gray-500 truncate max-w-[140px]">
                      {p.user.email || p.user.telegramId}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{p.tariff?.name || '—'}</td>
                  <td className="px-4 py-3 font-semibold">
                    {p.currency==='RUB'
                      ? `${p.amount.toLocaleString('ru')} ₽`
                      : `${p.amount} ${p.currency}`}
                  </td>
                  <td className="px-4 py-3">
                    <span className={STATUS_CLASS[p.status]||'badge-gray'}>{p.status}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {PROVIDER_LABEL[p.provider]||p.provider}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
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
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
            <p className="text-sm text-gray-500">
              {Math.min((page-1)*30+1,total)}–{Math.min(page*30,total)} из {total}
            </p>
            <div className="flex gap-2 items-center">
              <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}
                      className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30
                                 hover:bg-gray-700 rounded-lg transition-colors">
                <ChevronLeft className="w-4 h-4"/>
              </button>
              <span className="text-sm text-gray-300 px-2">{page}/{totalPages}</span>
              <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}
                      className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30
                                 hover:bg-gray-700 rounded-lg transition-colors">
                <ChevronRight className="w-4 h-4"/>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
