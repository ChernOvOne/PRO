'use client'

import { useEffect, useState } from 'react'
import { Wifi, Send, ExternalLink, Copy, CheckCircle2 } from 'lucide-react'
import type { TelegramProxy } from '@/types'

export default function ProxiesPage() {
  const [proxies, setProxies] = useState<TelegramProxy[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied]   = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/proxies', { credentials: 'include' })
      .then(r => r.json())
      .then(setProxies)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const copyLink = (link: string, id: string) => {
    navigator.clipboard.writeText(link)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Бесплатные прокси для Telegram</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Используйте прокси для доступа к Telegram без VPN
        </p>
      </div>

      <div className="glass-card" style={{ background: 'rgba(6,182,212,0.04)', border: '1px solid rgba(6,182,212,0.1)' }}>
        <div className="flex items-start gap-3">
          <Wifi className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent-1)' }} />
          <div>
            <p className="text-sm font-medium">Как использовать?</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              Нажмите "Открыть в TG" — приложение Telegram предложит включить прокси.
              Это не VPN — работает только для Telegram.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 gap-4">
          {[1,2].map(i => <div key={i} className="h-40 skeleton rounded-2xl" />)}
        </div>
      ) : proxies.length === 0 ? (
        <div className="glass-card text-center py-16">
          <Wifi className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
          <p className="font-medium">Прокси пока не добавлены</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4 stagger">
          {proxies.map((proxy) => (
            <div key={proxy.id} className="glass-card animate-slide-up">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold">{proxy.name}</h3>
                  {proxy.tag && <span className="badge-blue mt-1">{proxy.tag}</span>}
                </div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                     style={{ background: 'rgba(6,182,212,0.1)' }}>
                  <Wifi className="w-5 h-5" style={{ color: 'var(--accent-1)' }} />
                </div>
              </div>

              {proxy.description && (
                <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                  {proxy.description}
                </p>
              )}

              <div className="flex gap-2">
                {proxy.tgLink && (
                  <a href={proxy.tgLink} target="_blank" rel="noopener"
                     className="btn-primary text-xs py-2.5 px-4 flex-1 rounded-xl">
                    <Send className="w-3.5 h-3.5" /> Открыть в TG
                  </a>
                )}
                {proxy.httpsLink && (
                  <button onClick={() => copyLink(proxy.httpsLink!, proxy.id)}
                          className="btn-secondary text-xs py-2.5 px-3 rounded-xl">
                    {copied === proxy.id
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      : <Copy className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
