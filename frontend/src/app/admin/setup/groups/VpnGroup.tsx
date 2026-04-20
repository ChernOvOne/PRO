'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Server, Package, Bot, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { adminApi } from '@/lib/api'
import { Field, inputCls, inputStyle } from '../components/GroupCard'
import type { SetupState } from '../hooks/useSetupState'

export function VpnGroup({
  state, patch, onDone,
}: {
  state: SetupState
  patch: (p: Partial<SetupState>) => void
  onDone: () => void
}) {
  const [section, setSection] = useState<'panel' | 'tariffs' | 'bot'>('panel')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 p-1 rounded-xl"
           style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
        <Tab active={section === 'panel'} onClick={() => setSection('panel')}>
          <Server className="w-4 h-4" /> REMNAWAVE
        </Tab>
        <Tab active={section === 'tariffs'} onClick={() => setSection('tariffs')}>
          <Package className="w-4 h-4" /> Тарифы
        </Tab>
        <Tab active={section === 'bot'} onClick={() => setSection('bot')}>
          <Bot className="w-4 h-4" /> Бот
        </Tab>
      </div>

      {section === 'panel' && <RemnawaveSection state={state} patch={patch} />}
      {section === 'tariffs' && <TariffsSection />}
      {section === 'bot' && <BotSection state={state} patch={patch} />}

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

/* ── REMNAWAVE ─────────────────────────────────────────────── */

function RemnawaveSection({ state, patch }: { state: SetupState; patch: any }) {
  const [saving, setSaving] = useState(false)
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [testErr, setTestErr] = useState('')

  const save = async () => {
    setSaving(true)
    try {
      await adminApi.saveSettingsRecord({
        remnawave_url: state.remnawave.url,
        remnawave_token: state.remnawave.token,
        remnawave_username_prefix: state.remnawave.username_prefix,
        remnawave_auto_create: state.remnawave.auto_create ? '1' : '0',
      })
      toast.success('REMNAWAVE сохранён')
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const test = async () => {
    if (!state.remnawave.url || !state.remnawave.token) {
      toast.error('Заполни URL и токен'); return
    }
    setTestState('testing')
    try {
      const r = await adminApi.setupTestRemnawave({ url: state.remnawave.url, token: state.remnawave.token })
      setTestState(r.ok ? 'ok' : 'fail')
      setTestErr(r.error || (r.status ? `HTTP ${r.status}` : ''))
    } catch (e: any) {
      setTestState('fail'); setTestErr(e.message)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="p-3 rounded-lg text-xs"
           style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)', color: 'var(--text-secondary)' }}>
        REMNAWAVE — это VPN-панель где управляются подписки клиентов. Если у тебя ещё нет панели — установи её отдельно (docs.remna.st).
        Без этого шага подписки не будут автоматически активироваться.
      </div>
      <Field label="URL панели (без /api в конце)" required>
        <input className={inputCls} style={inputStyle}
               placeholder="https://panel.my-vpn.com"
               value={state.remnawave.url}
               onChange={e => patch({ remnawave: { ...state.remnawave, url: e.target.value } })} />
      </Field>
      <Field label="API Token" required>
        <input type="password" className={inputCls} style={inputStyle}
               value={state.remnawave.token}
               onChange={e => patch({ remnawave: { ...state.remnawave, token: e.target.value } })} />
      </Field>
      <Field label="Префикс usernames" hint="Как будут именоваться юзеры в REMNAWAVE">
        <input className={inputCls} style={inputStyle}
               value={state.remnawave.username_prefix}
               onChange={e => patch({ remnawave: { ...state.remnawave, username_prefix: e.target.value } })} />
      </Field>
      <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        <input type="checkbox"
               checked={state.remnawave.auto_create}
               onChange={e => patch({ remnawave: { ...state.remnawave, auto_create: e.target.checked } })} />
        Автоматически создавать пользователя в панели при регистрации
      </label>
      <div className="flex items-center gap-2">
        <button onClick={test} disabled={testState === 'testing'}
                className="px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5"
                style={{ background: 'var(--surface-1)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)' }}>
          {testState === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          Проверить подключение
        </button>
        {testState === 'ok' && <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle2 className="w-4 h-4" /> API работает</span>}
        {testState === 'fail' && <span className="flex items-center gap-1 text-xs text-red-400"><XCircle className="w-4 h-4" /> {testErr || 'Ошибка'}</span>}
      </div>
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

/* ── Tariffs ───────────────────────────────────────────────── */

function TariffsSection() {
  return (
    <div className="flex flex-col gap-3">
      <div className="p-3 rounded-lg text-xs"
           style={{ background: 'var(--surface-1)', color: 'var(--text-tertiary)' }}>
        Дефолтные тарифы (5 штук) уже созданы сидом при установке. Можешь отредактировать их в
        <a href="/admin/tariffs" className="ml-1" style={{ color: 'var(--accent-1)' }}>/admin/tariffs</a> — тут ничего настраивать не нужно.
      </div>
    </div>
  )
}

/* ── Bot ───────────────────────────────────────────────────── */

function BotSection({ state, patch }: { state: SetupState; patch: any }) {
  const [saving, setSaving] = useState(false)
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [testInfo, setTestInfo] = useState('')

  const save = async () => {
    setSaving(true)
    try {
      await adminApi.saveSettingsRecord({
        bot_token: state.bot.token,
        bot_username: state.bot.username,
        bot_admin_id: state.bot.admin_id,
        notify_channel_id: state.bot.notify_channel_id,
        bot_welcome_text: state.bot.welcome_text,
      })
      toast.success('Бот сохранён')
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const test = async () => {
    if (!state.bot.token) { toast.error('Укажи токен'); return }
    setTestState('testing')
    try {
      const r = await adminApi.setupTestBot({ token: state.bot.token })
      if (r.ok) {
        setTestState('ok')
        setTestInfo(`@${r.username}`)
        if (r.username && !state.bot.username) {
          patch({ bot: { ...state.bot, username: r.username } })
        }
      } else {
        setTestState('fail'); setTestInfo(r.error || 'Неверный токен')
      }
    } catch (e: any) {
      setTestState('fail'); setTestInfo(e.message)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="p-3 rounded-lg text-xs"
           style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)', color: 'var(--text-secondary)' }}>
        Создай бота через @BotFather → /newbot → скопируй токен сюда.
      </div>
      <Field label="Bot Token" required>
        <input type="password" className={inputCls} style={inputStyle}
               value={state.bot.token}
               onChange={e => patch({ bot: { ...state.bot, token: e.target.value } })} />
      </Field>
      <Field label="Username (без @)" hint="Определится автоматически после проверки">
        <input className={inputCls} style={inputStyle}
               value={state.bot.username}
               onChange={e => patch({ bot: { ...state.bot, username: e.target.value } })} />
      </Field>
      <Field label="Telegram ID администратора" hint="Узнай через @userinfobot — будут приходить уведомления">
        <input className={inputCls} style={inputStyle}
               placeholder="123456789"
               value={state.bot.admin_id}
               onChange={e => patch({ bot: { ...state.bot, admin_id: e.target.value } })} />
      </Field>
      <Field label="ID канала для уведомлений" hint="Опционально. Формат: -1001234567890">
        <input className={inputCls} style={inputStyle}
               placeholder="-1001234567890"
               value={state.bot.notify_channel_id}
               onChange={e => patch({ bot: { ...state.bot, notify_channel_id: e.target.value } })} />
      </Field>
      <Field label="Приветственное сообщение">
        <textarea className={inputCls + ' h-20'} style={inputStyle}
                  value={state.bot.welcome_text}
                  onChange={e => patch({ bot: { ...state.bot, welcome_text: e.target.value } })} />
      </Field>

      <div className="flex items-center gap-2">
        <button onClick={test} disabled={testState === 'testing'}
                className="px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5"
                style={{ background: 'var(--surface-1)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)' }}>
          {testState === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          Проверить токен
        </button>
        {testState === 'ok' && <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle2 className="w-4 h-4" /> {testInfo}</span>}
        {testState === 'fail' && <span className="flex items-center gap-1 text-xs text-red-400"><XCircle className="w-4 h-4" /> {testInfo}</span>}
      </div>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--accent-1)', color: 'white' }}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Сохранить бота'}
        </button>
      </div>
    </div>
  )
}
