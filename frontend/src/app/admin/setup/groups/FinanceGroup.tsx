'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { CreditCard, Mail, Gift, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { adminApi } from '@/lib/api'
import { Field, inputCls, inputStyle } from '../components/GroupCard'
import type { SetupState } from '../hooks/useSetupState'

export function FinanceGroup({
  state, patch, onDone,
}: {
  state: SetupState
  patch: (p: Partial<SetupState>) => void
  onDone: () => void
}) {
  const [section, setSection] = useState<'pay' | 'smtp' | 'ref'>('pay')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 p-1 rounded-xl"
           style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
        <Tab active={section === 'pay'} onClick={() => setSection('pay')}>
          <CreditCard className="w-4 h-4" /> Платёжки
        </Tab>
        <Tab active={section === 'smtp'} onClick={() => setSection('smtp')}>
          <Mail className="w-4 h-4" /> SMTP
        </Tab>
        <Tab active={section === 'ref'} onClick={() => setSection('ref')}>
          <Gift className="w-4 h-4" /> Рефералы
        </Tab>
      </div>

      {section === 'pay' && <PaymentsSection state={state} patch={patch} />}
      {section === 'smtp' && <SmtpSection state={state} patch={patch} />}
      {section === 'ref' && <ReferralsSection state={state} patch={patch} />}

      <div className="flex justify-end">
        <button onClick={onDone}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: '#22c55e', color: 'white' }}>
          Готово — дальше
        </button>
      </div>
    </div>
  )
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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

function TestButton({ onTest, label }: { onTest: () => Promise<{ ok: boolean; detail?: string }>; label: string }) {
  const [state, setState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [detail, setDetail] = useState<string>('')
  const run = async () => {
    setState('testing')
    try {
      const r = await onTest()
      setState(r.ok ? 'ok' : 'fail')
      setDetail(r.detail || '')
    } catch (e: any) {
      setState('fail')
      setDetail(e.message || '')
    }
  }
  return (
    <div className="flex items-center gap-2">
      <button onClick={run} disabled={state === 'testing'}
              className="px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5"
              style={{ background: 'var(--surface-1)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)' }}>
        {state === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
        {label}
      </button>
      {state === 'ok' && <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle2 className="w-4 h-4" /> Работает</span>}
      {state === 'fail' && <span className="flex items-center gap-1 text-xs text-red-400"><XCircle className="w-4 h-4" /> {detail || 'Ошибка'}</span>}
    </div>
  )
}

/* ── Payments ──────────────────────────────────────────────── */

function PaymentsSection({ state, patch }: { state: SetupState; patch: any }) {
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await adminApi.saveSettingsRecord({
        yukassa_shop_id: state.payments.yukassa_shop_id,
        yukassa_secret_key: state.payments.yukassa_secret_key,
        yukassa_test_mode: state.payments.yukassa_test_mode ? '1' : '0',
        crypto_token: state.payments.crypto_token,
        balance_min: String(state.payments.balance_min),
        balance_max: String(state.payments.balance_max),
        balance_auto_confirm: state.payments.auto_confirm ? '1' : '0',
      })
      toast.success('Платёжки сохранены')
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="p-3 rounded-lg"
           style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
        <div className="text-xs font-semibold mb-1" style={{ color: '#f59e0b' }}>💳 YuKassa</div>
        <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
          ID магазина и secret key находятся в кабинете YuKassa → Настройки → Ключи API
        </div>
      </div>
      <Field label="ID магазина YuKassa">
        <input className={inputCls} style={inputStyle}
               value={state.payments.yukassa_shop_id}
               onChange={e => patch({ payments: { ...state.payments, yukassa_shop_id: e.target.value } })} />
      </Field>
      <Field label="Secret Key YuKassa">
        <input type="password" className={inputCls} style={inputStyle}
               value={state.payments.yukassa_secret_key}
               onChange={e => patch({ payments: { ...state.payments, yukassa_secret_key: e.target.value } })} />
      </Field>
      <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        <input type="checkbox"
               checked={state.payments.yukassa_test_mode}
               onChange={e => patch({ payments: { ...state.payments, yukassa_test_mode: e.target.checked } })} />
        Тестовый режим (test-ключи)
      </label>

      <TestButton label="Проверить YuKassa"
                  onTest={async () => {
                    if (!state.payments.yukassa_shop_id || !state.payments.yukassa_secret_key) {
                      return { ok: false, detail: 'Заполни поля' }
                    }
                    const r = await adminApi.setupTestYukassa({
                      shopId: state.payments.yukassa_shop_id,
                      secretKey: state.payments.yukassa_secret_key,
                    })
                    return { ok: r.ok, detail: r.error || (r.status ? `HTTP ${r.status}` : '') }
                  }} />

      <div className="h-px my-2" style={{ background: 'var(--glass-border)' }} />

      <div className="p-3 rounded-lg"
           style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
        <div className="text-xs font-semibold mb-1" style={{ color: '#8b5cf6' }}>🪙 CryptoPay</div>
        <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
          Токен бота CryptoPay: @CryptoBot → /pay → создать app
        </div>
      </div>
      <Field label="CryptoPay API Token">
        <input type="password" className={inputCls} style={inputStyle}
               value={state.payments.crypto_token}
               onChange={e => patch({ payments: { ...state.payments, crypto_token: e.target.value } })} />
      </Field>

      <div className="h-px my-2" style={{ background: 'var(--glass-border)' }} />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Мин. пополнение баланса (₽)">
          <input type="number" className={inputCls} style={inputStyle}
                 value={state.payments.balance_min}
                 onChange={e => patch({ payments: { ...state.payments, balance_min: +e.target.value || 0 } })} />
        </Field>
        <Field label="Макс. пополнение баланса (₽)">
          <input type="number" className={inputCls} style={inputStyle}
                 value={state.payments.balance_max}
                 onChange={e => patch({ payments: { ...state.payments, balance_max: +e.target.value || 0 } })} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        <input type="checkbox"
               checked={state.payments.auto_confirm}
               onChange={e => patch({ payments: { ...state.payments, auto_confirm: e.target.checked } })} />
        Автоматически подтверждать платежи
      </label>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--accent-1)', color: 'white' }}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Сохранить платёжки'}
        </button>
      </div>
    </div>
  )
}

/* ── SMTP ──────────────────────────────────────────────────── */

function SmtpSection({ state, patch }: { state: SetupState; patch: any }) {
  const [saving, setSaving] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [testing, setTesting] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await adminApi.saveSettingsRecord({
        smtp_host: state.smtp.host,
        smtp_port: state.smtp.port,
        smtp_user: state.smtp.user,
        smtp_password: state.smtp.password,
        smtp_encryption: state.smtp.encryption,
        from_email: state.smtp.from_email,
        from_name: state.smtp.from_name,
      })
      toast.success('SMTP сохранён')
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const sendTest = async () => {
    if (!testEmail) { toast.error('Введи email'); return }
    setTesting(true)
    try {
      await fetch('/api/admin/settings/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ to: testEmail }),
      })
      toast.success(`Письмо отправлено на ${testEmail}`)
    } catch (e: any) { toast.error(e.message) }
    finally { setTesting(false) }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="p-3 rounded-lg text-xs"
           style={{ background: 'var(--surface-1)', color: 'var(--text-tertiary)' }}>
        Для Gmail: <code>smtp.gmail.com:587</code>, TLS, пароль приложения (не основной).
        Для Yandex: <code>smtp.yandex.ru:465</code>, SSL.
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <Field label="Хост" required>
            <input className={inputCls} style={inputStyle}
                   placeholder="smtp.gmail.com"
                   value={state.smtp.host}
                   onChange={e => patch({ smtp: { ...state.smtp, host: e.target.value } })} />
          </Field>
        </div>
        <Field label="Порт" required>
          <input className={inputCls} style={inputStyle}
                 value={state.smtp.port}
                 onChange={e => patch({ smtp: { ...state.smtp, port: e.target.value } })} />
        </Field>
      </div>
      <Field label="Логин / email">
        <input className={inputCls} style={inputStyle}
               value={state.smtp.user}
               onChange={e => patch({ smtp: { ...state.smtp, user: e.target.value } })} />
      </Field>
      <Field label="Пароль">
        <input type="password" className={inputCls} style={inputStyle}
               value={state.smtp.password}
               onChange={e => patch({ smtp: { ...state.smtp, password: e.target.value } })} />
      </Field>
      <Field label="Шифрование">
        <select className={inputCls} style={inputStyle}
                value={state.smtp.encryption}
                onChange={e => patch({ smtp: { ...state.smtp, encryption: e.target.value } })}>
          <option value="tls">TLS (STARTTLS)</option>
          <option value="ssl">SSL</option>
          <option value="none">Без шифрования</option>
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From email">
          <input className={inputCls} style={inputStyle}
                 value={state.smtp.from_email}
                 onChange={e => patch({ smtp: { ...state.smtp, from_email: e.target.value } })} />
        </Field>
        <Field label="From name">
          <input className={inputCls} style={inputStyle}
                 value={state.smtp.from_name}
                 onChange={e => patch({ smtp: { ...state.smtp, from_name: e.target.value } })} />
        </Field>
      </div>

      <div className="flex gap-2 items-end">
        <Field label="Проверить отправку на...">
          <input className={inputCls} style={inputStyle}
                 type="email" placeholder="my@mail.com"
                 value={testEmail} onChange={e => setTestEmail(e.target.value)} />
        </Field>
        <button onClick={sendTest} disabled={testing || !testEmail}
                className="px-3 py-2 rounded-lg text-sm flex items-center gap-1.5"
                style={{ background: 'var(--surface-1)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)' }}>
          {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Отправить тест'}
        </button>
      </div>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--accent-1)', color: 'white' }}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Сохранить SMTP'}
        </button>
      </div>
    </div>
  )
}

/* ── Referrals ─────────────────────────────────────────────── */

function ReferralsSection({ state, patch }: { state: SetupState; patch: any }) {
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    try {
      await adminApi.saveSettingsRecord({
        referral_enabled: state.referrals.enabled ? '1' : '0',
        referral_inviter_days: String(state.referrals.inviter_days),
        referral_invitee_days: String(state.referrals.invitee_days),
        referral_max_monthly: String(state.referrals.max_monthly),
      })
      toast.success('Рефералка сохранена')
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        <input type="checkbox"
               checked={state.referrals.enabled}
               onChange={e => patch({ referrals: { ...state.referrals, enabled: e.target.checked } })} />
        Включить реферальную программу
      </label>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Дней бонуса пригласившему" hint="Когда реферал оплатит первый тариф">
          <input type="number" className={inputCls} style={inputStyle}
                 value={state.referrals.inviter_days}
                 onChange={e => patch({ referrals: { ...state.referrals, inviter_days: +e.target.value || 0 } })} />
        </Field>
        <Field label="Дней бонуса приглашённому" hint="Сразу при регистрации">
          <input type="number" className={inputCls} style={inputStyle}
                 value={state.referrals.invitee_days}
                 onChange={e => patch({ referrals: { ...state.referrals, invitee_days: +e.target.value || 0 } })} />
        </Field>
      </div>
      <Field label="Макс. бонусов в месяц на одного юзера" hint="0 = без лимита">
        <input type="number" className={inputCls} style={inputStyle}
               value={state.referrals.max_monthly}
               onChange={e => patch({ referrals: { ...state.referrals, max_monthly: +e.target.value || 0 } })} />
      </Field>
      <div className="flex justify-end">
        <button onClick={save} disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--accent-1)', color: 'white' }}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Сохранить'}
        </button>
      </div>
    </div>
  )
}
