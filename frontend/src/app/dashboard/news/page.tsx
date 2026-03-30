'use client'

import { useEffect, useState } from 'react'
import { Newspaper, Tag, ChevronRight } from 'lucide-react'
import type { News } from '@/types'

export default function NewsPage() {
  const [news, setNews]       = useState<News[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState<'all' | 'NEWS' | 'PROMOTION'>('all')

  useEffect(() => {
    fetch('/api/news?limit=50', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setNews(d.news || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = filter === 'all' ? news : news.filter(n => n.type === filter)

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Новости и акции</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Последние обновления сервиса
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {[
          { key: 'all' as const, label: 'Все' },
          { key: 'NEWS' as const, label: 'Новости' },
          { key: 'PROMOTION' as const, label: 'Акции' },
        ].map(({ key, label }) => (
          <button key={key}
                  onClick={() => setFilter(key)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    filter === key ? 'text-white' : ''
                  }`}
                  style={{
                    background: filter === key ? 'var(--accent-gradient)' : 'var(--glass-bg)',
                    border: `1px solid ${filter === key ? 'transparent' : 'var(--glass-border)'}`,
                    color: filter === key ? 'white' : 'var(--text-secondary)',
                  }}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1,2,3].map(i => <div key={i} className="h-32 skeleton rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card text-center py-16">
          <Newspaper className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
          <p className="font-medium">Пока нет новостей</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>Следите за обновлениями</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(item => (
            <article key={item.id} className="glass-card">
              <div className="flex items-center gap-3 mb-3">
                <span className={item.type === 'PROMOTION' ? 'badge-violet' : 'badge-blue'}>
                  {item.type === 'PROMOTION' ? 'Акция' : 'Новость'}
                </span>
                {item.isPinned && <span className="badge-yellow">Закреплено</span>}
                <span className="text-xs ml-auto" style={{ color: 'var(--text-tertiary)' }}>
                  {new Date(item.publishedAt).toLocaleDateString('ru', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })}
                </span>
              </div>

              {item.imageUrl && (
                <img src={item.imageUrl} alt={item.title}
                     className="w-full h-48 object-cover rounded-xl mb-4" />
              )}

              <h2 className="text-lg font-semibold mb-2">{item.title}</h2>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {item.content}
              </p>

              {item.discountCode && (
                <div className="mt-4 p-3 rounded-xl flex items-center gap-3"
                     style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}>
                  <Tag className="w-4 h-4" style={{ color: '#a78bfa' }} />
                  <div>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Промокод</p>
                    <p className="font-mono font-bold" style={{ color: '#a78bfa' }}>{item.discountCode}</p>
                  </div>
                  {item.discountPct && (
                    <span className="ml-auto badge-violet">-{item.discountPct}%</span>
                  )}
                </div>
              )}

              {item.buttons && Array.isArray(item.buttons) && item.buttons.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {item.buttons.map((btn: any, i: number) => (
                    <a key={i} href={btn.url} target="_blank" rel="noopener"
                       className="btn-primary text-sm py-2 px-4">
                      {btn.label} <ChevronRight className="w-3.5 h-3.5" />
                    </a>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
