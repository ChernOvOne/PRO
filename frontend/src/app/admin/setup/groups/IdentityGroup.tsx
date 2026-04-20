'use client'

import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { Globe, Palette, UserPlus, Plus, Trash2, Loader2, Shield, RefreshCw, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { adminApi } from '@/lib/api'
import { Field, inputCls, inputStyle, StatusPill } from '../components/GroupCard'
import type { SetupState } from '../hooks/useSetupState'

const DOMAIN_ROLES: Array<{ value: string; label: string; description: string }> = [
  { value: 'landing',  label: 'Лендинг',         description: 'Главная страница / маркетинг' },
  { value: 'app',      label: 'ЛК клиента',       description: 'Dashboard + login' },
  { value: 'admin',    label: 'Админ-панель',     description: 'Только /admin' },
  { value: 'api',      label: 'API',              description: 'Только /api/* — для бота/моб. приложений' },
  { value: 'webhook',  label: 'Webhook платежей', description: 'Для приёма webhook от платёжек' },
  { value: 'payments', label: 'Возврат YuKassa',  description: 'Куда возвращает юзер после оплаты' },
  { value: 'custom',   label: 'Другое',           description: 'Без role-ограничений' },
]

/* ════════════════════════════════════════════════════════════
   Identity Group: Admin account + Branding + Domains
   ════════════════════════════════════════════════════════════ */

export function IdentityGroup({
  state, patch, onDone, hasAdmin,
}: {
  state: SetupState
  patch: (p: Partial<SetupState>) => void
  onDone: () => void
  hasAdmin: boolean
}) {
  const [section, setSection] = useState<'admin' | 'brand' | 'domains'>(hasAdmin ? 'brand' : 'admin')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 p-1 rounded-xl"
           style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
        {!hasAdmin && (
          <SectionTab active={section === 'admin'} onClick={() => setSection('admin')}>
            <UserPlus className="w-4 h-4" /> Админ
          </SectionTab>
        )}
        <SectionTab active={section === 'brand'} onClick={() => setSection('brand')}>
          <Palette className="w-4 h-4" /> Бренд
        </SectionTab>
        <SectionTab active={section === 'domains'} onClick={() => setSection('domains')}>
          <Globe className="w-4 h-4" /> Домены
        </SectionTab>
      </div>

      {section === 'admin' && !hasAdmin && <AdminCreateSection onCreated={() => setSection('brand')} />}
      {section === 'brand' && <BrandSection state={state} patch={patch} />}
      {section === 'domains' && <DomainsSection />}

      <div className="flex justify-end">
        <button onClick={onDone}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: '#22c55e', color: 'white' }}>
          Готово — к следующей группе
        </button>
      </div>
    </div>
  )
}

function SectionTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition"
            style={{
              background: active ? 'var(--accent-1)' : 'transparent',
              color: active ? 'white' : 'var(--text-secondary)',
              fontWeight: active ? 600 : 400,
            }}>
      {children}
    </button>
  )
}

/* ── Admin creation (first-run only) ───────────────────────── */

function AdminCreateSection({ onCreated }: { onCreated: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!email || !password) { toast.error('Заполните email и пароль'); return }
    if (password !== password2) { toast.error('Пароли не совпадают'); return }
    if (password.length < 8) { toast.error('Пароль минимум 8 символов'); return }

    setSaving(true)
    try {
      await adminApi.setupCreateFirstAdmin({ email, password })
      toast.success('Админ создан. Войдите под этими данными.')
      // Redirect to login after short delay
      setTimeout(() => { window.location.href = '/login' }, 1500)
      onCreated()
    } catch (e: any) {
      toast.error(e.message || 'Не удалось создать')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 p-3 rounded-lg"
           style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)' }}>
        <Shield className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#06b6d4' }} />
        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Создайте первый аккаунт администратора. Под ним вы будете заходить в админку.
        </div>
      </div>
      <Field label="Email" required>
        <input type="email" className={inputCls} style={inputStyle}
               value={email} onChange={e => setEmail(e.target.value)}
               placeholder="admin@hideyou.com" />
      </Field>
      <Field label="Пароль (мин. 8 символов)" required>
        <input type="password" className={inputCls} style={inputStyle}
               value={password} onChange={e => setPassword(e.target.value)} />
      </Field>
      <Field label="Повторите пароль" required>
        <input type="password" className={inputCls} style={inputStyle}
               value={password2} onChange={e => setPassword2(e.target.value)} />
      </Field>
      <button onClick={submit} disabled={saving}
              className="flex items-center gap-2 justify-center px-4 py-2 rounded-lg text-sm font-medium transition"
              style={{ background: 'var(--accent-1)', color: 'white' }}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
        Создать администратора
      </button>
    </div>
  )
}

/* ── Brand section ─────────────────────────────────────────── */

function BrandSection({ state, patch }: { state: SetupState; patch: any }) {
  const [saving, setSaving] = useState(false)
  const logoInput = useRef<HTMLInputElement>(null)

  const save = async () => {
    setSaving(true)
    try {
      await adminApi.saveSettingsRecord({
        app_name: state.branding.app_name,
        app_description: state.branding.description,
        support_email: state.branding.support_email,
        primary_color: state.branding.primary_color,
        logo_url: state.branding.logo_url || '',
      })
      toast.success('Брендинг сохранён')
    } catch (e: any) {
      toast.error(e.message || 'Ошибка')
    } finally { setSaving(false) }
  }

  const uploadLogo = async (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    try {
      const { url } = await adminApi.uploadFile(fd)
      patch({ branding: { ...state.branding, logo_url: url } })
      toast.success('Логотип загружен')
    } catch (e: any) {
      toast.error(e.message || 'Не удалось загрузить')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label="Название проекта" required>
        <input className={inputCls} style={inputStyle}
               value={state.branding.app_name}
               onChange={e => patch({ branding: { ...state.branding, app_name: e.target.value } })}
               placeholder="HIDEYOU" />
      </Field>
      <Field label="Описание (slogan)">
        <input className={inputCls} style={inputStyle}
               value={state.branding.description}
               onChange={e => patch({ branding: { ...state.branding, description: e.target.value } })}
               placeholder="Private. Fast. Reliable." />
      </Field>
      <Field label="Email поддержки">
        <input type="email" className={inputCls} style={inputStyle}
               value={state.branding.support_email}
               onChange={e => patch({ branding: { ...state.branding, support_email: e.target.value } })}
               placeholder="support@hideyou.com" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Основной цвет">
          <div className="flex gap-2 items-center">
            <input type="color" className="w-10 h-10 rounded cursor-pointer"
                   value={state.branding.primary_color}
                   onChange={e => patch({ branding: { ...state.branding, primary_color: e.target.value } })} />
            <input className={inputCls} style={inputStyle}
                   value={state.branding.primary_color}
                   onChange={e => patch({ branding: { ...state.branding, primary_color: e.target.value } })} />
          </div>
        </Field>
        <Field label="Логотип">
          <div className="flex gap-2 items-center">
            {state.branding.logo_url && (
              <img src={state.branding.logo_url} alt="logo"
                   className="w-10 h-10 rounded-lg object-cover"
                   style={{ background: 'var(--surface-1)' }} />
            )}
            <input ref={logoInput} type="file" accept="image/*"
                   className="hidden"
                   onChange={e => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
            <button type="button" onClick={() => logoInput.current?.click()}
                    className="px-3 py-2 rounded-lg text-sm"
                    style={{ background: 'var(--surface-1)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)' }}>
              Загрузить
            </button>
          </div>
        </Field>
      </div>
      <div className="flex justify-end">
        <button onClick={save} disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--accent-1)', color: 'white' }}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Сохранить брендинг'}
        </button>
      </div>
    </div>
  )
}

/* ── Domains section ───────────────────────────────────────── */

interface DomainRec {
  id: string
  domain: string
  role: string
  status: 'pending' | 'dns_ok' | 'cert_ok' | 'failed'
  lastError?: string | null
  certExpiresAt?: string | null
}

function DomainsSection() {
  const [domains, setDomains] = useState<DomainRec[]>([])
  const [loading, setLoading] = useState(true)
  const [newDomain, setNewDomain] = useState('')
  const [newRole, setNewRole] = useState<string>('app')
  const [dnsChecking, setDnsChecking] = useState(false)
  const [dnsResult, setDnsResult] = useState<{ resolved: string[]; publicIp: string | null; matches: boolean; error?: string } | null>(null)
  const [adding, setAdding] = useState(false)

  const load = async () => {
    try {
      const data = await adminApi.setupListDomains()
      setDomains(data || [])
    } finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 5000)  // poll for cert status updates
    return () => clearInterval(interval)
  }, [])

  const checkDns = async () => {
    if (!newDomain) return
    setDnsChecking(true)
    setDnsResult(null)
    try {
      const r = await adminApi.setupCheckDns(newDomain.trim())
      setDnsResult(r)
    } catch (e: any) {
      setDnsResult({ resolved: [], publicIp: null, matches: false, error: e.message })
    } finally { setDnsChecking(false) }
  }

  const addDomain = async () => {
    if (!newDomain) return
    setAdding(true)
    try {
      await adminApi.setupAddDomain({ domain: newDomain.trim().toLowerCase(), role: newRole })
      setNewDomain('')
      setDnsResult(null)
      await load()
      toast.success('Домен добавлен. Выпускаем сертификат...')
    } catch (e: any) {
      toast.error(e.message || 'Не удалось добавить')
    } finally { setAdding(false) }
  }

  const retryDomain = async (id: string) => {
    try {
      await adminApi.setupRetryDomain(id)
      await load()
      toast.success('Повторяем выпуск сертификата')
    } catch (e: any) { toast.error(e.message || 'Ошибка') }
  }

  const deleteDomain = async (id: string, domain: string) => {
    if (!confirm(`Удалить домен ${domain}?`)) return
    try {
      await adminApi.setupDeleteDomain(id)
      await load()
    } catch (e: any) { toast.error(e.message || 'Ошибка') }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Add new domain */}
      <div className="rounded-xl p-3 flex flex-col gap-3"
           style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
        <div className="text-xs font-semibold uppercase tracking-wider"
             style={{ color: 'var(--text-tertiary)' }}>
          Добавить домен
        </div>

        <div className="flex gap-2 items-end">
          <Field label="Домен" required>
            <input className={inputCls} style={inputStyle}
                   placeholder="admin.hideyou.com"
                   value={newDomain}
                   onChange={e => { setNewDomain(e.target.value); setDnsResult(null) }} />
          </Field>
        </div>

        <Field label="Роль">
          <select className={inputCls} style={inputStyle}
                  value={newRole}
                  onChange={e => setNewRole(e.target.value)}>
            {DOMAIN_ROLES.map(r => (
              <option key={r.value} value={r.value}>
                {r.label} — {r.description}
              </option>
            ))}
          </select>
        </Field>

        <div className="flex gap-2">
          <button onClick={checkDns} disabled={!newDomain || dnsChecking}
                  className="px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)' }}>
            {dnsChecking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Проверить DNS
          </button>
          <button onClick={addDomain}
                  disabled={!newDomain || adding || !dnsResult?.matches}
                  className="flex-1 px-3 py-1.5 rounded-lg text-sm flex items-center justify-center gap-1.5"
                  style={{
                    background: !dnsResult?.matches ? 'var(--surface-2)' : '#22c55e',
                    color: !dnsResult?.matches ? 'var(--text-tertiary)' : 'white',
                  }}>
            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Добавить + выпустить TLS
          </button>
        </div>

        {dnsResult && (
          <div className="text-xs p-2 rounded"
               style={{
                 background: dnsResult.matches ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                 color: dnsResult.matches ? '#22c55e' : '#ef4444',
               }}>
            {dnsResult.error ? (
              <>❌ {dnsResult.error}</>
            ) : dnsResult.matches ? (
              <>✅ DNS резолвится в IP сервера ({dnsResult.publicIp}). Можно добавлять.</>
            ) : (
              <>
                ⚠️ DNS указывает на {dnsResult.resolved.join(', ') || '(ничего)'},<br />
                но IP сервера — {dnsResult.publicIp || '(неизвестен)'}.<br />
                Настрой A-запись в DNS-провайдере и нажми «Проверить» ещё раз.
              </>
            )}
          </div>
        )}
      </div>

      {/* Domain list */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider mb-2"
             style={{ color: 'var(--text-tertiary)' }}>
          Настроенные домены ({domains.length})
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--accent-1)' }} />
          </div>
        ) : domains.length === 0 ? (
          <div className="text-sm py-6 text-center" style={{ color: 'var(--text-tertiary)' }}>
            Пока нет доменов. Добавь первый сверху.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {domains.map(d => {
              const roleLabel = DOMAIN_ROLES.find(r => r.value === d.role)?.label || d.role
              return (
                <div key={d.id} className="rounded-lg p-3 flex items-center gap-3"
                     style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                        {d.domain}
                      </span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded"
                            style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}>
                        {roleLabel}
                      </span>
                      <DomainStatus status={d.status} />
                    </div>
                    {d.lastError && (
                      <div className="text-[11px] mt-1 text-red-400 truncate">{d.lastError}</div>
                    )}
                  </div>
                  {d.status === 'failed' && (
                    <button onClick={() => retryDomain(d.id)}
                            className="p-1.5 rounded hover:bg-white/5"
                            style={{ color: 'var(--text-secondary)' }}
                            title="Повторить">
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => deleteDomain(d.id, d.domain)}
                          className="p-1.5 rounded hover:bg-red-500/10 hover:text-red-400"
                          style={{ color: 'var(--text-tertiary)' }}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function DomainStatus({ status }: { status: string }) {
  if (status === 'cert_ok')
    return <StatusPill status="ok" text="✓ TLS готов" />
  if (status === 'failed')
    return <StatusPill status="error" text="✗ Ошибка" />
  if (status === 'dns_ok')
    return <StatusPill status="pending" text="⏳ Выпуск TLS" />
  return <StatusPill status="pending" text="⏳ В обработке" />
}
