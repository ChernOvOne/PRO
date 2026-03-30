'use client'

import { useEffect, useState } from 'react'
import {
  Save, RefreshCw, Bot, CreditCard, Users,
  Globe, Bell, Shield, Loader2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { adminApi } from '@/lib/api'

interface Settings {
  support_url:        string
  channel_url:        string
  trial_enabled:      string
  trial_days:         string
  referral_bonus_days: string
  maintenance_mode:   string
  welcome_message:    string
  [key: string]: string
}

const DEFAULT: Settings = {
  support_url:         'https://t.me/hideyou_support',
  channel_url:         'https://t.me/hideyouvpn',
  trial_enabled:       'false',
  trial_days:          '3',
  referral_bonus_days: '30',
  maintenance_mode:    'false',
  welcome_message:     '',
}

type SettingSection = {
  id:     string
  icon:   any
  title:  string
  fields: SettingField[]
}

type SettingField =
  | { key: string; label: string; type: 'text' | 'url' | 'number'; placeholder?: string; hint?: string }
  | { key: string; label: string; type: 'toggle'; hint?: string }
  | { key: string; label: string; type: 'textarea'; placeholder?: string; hint?: string }

const SECTIONS: SettingSection[] = [
  {
    id: 'general', icon: Globe, title: 'Общие',
    fields: [
      { key: 'support_url',    label: 'Ссылка на поддержку', type: 'url', placeholder: 'https://t.me/...' },
      { key: 'channel_url',    label: 'Telegram-канал',       type: 'url', placeholder: 'https://t.me/...' },
      { key: 'welcome_message',label: 'Приветственное сообщение', type: 'textarea',
        placeholder: 'Текст для новых пользователей...', hint: 'Показывается при первом входе' },
    ],
  },
  {
    id: 'referral', icon: Users, title: 'Реферальная программа',
    fields: [
      { key: 'referral_bonus_days', label: 'Бонус за реферала (дней)', type: 'number',
        hint: 'Сколько дней добавляется рефереру за каждого оплатившего' },
    ],
  },
  {
    id: 'trial', icon: Shield, title: 'Пробный период',
    fields: [
      { key: 'trial_enabled', label: 'Включить пробный период', type: 'toggle' },
      { key: 'trial_days',    label: 'Длительность пробного (дней)', type: 'number' },
    ],
  },
  {
    id: 'maintenance', icon: Bell, title: 'Обслуживание',
    fields: [
      { key: 'maintenance_mode', label: 'Режим обслуживания',
        type: 'toggle', hint: 'Блокирует новые регистрации и покупки' },
    ],
  },
]

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)}
            className="relative w-11 h-6 rounded-full transition-all duration-300"
            style={{
              background: checked ? 'var(--accent-gradient)' : 'rgba(255,255,255,0.08)',
            }}>
      <span className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-300"
            style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }} />
    </button>
  )
}

export default function AdminSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT)
  const [loading, setLoading]   = useState(true)
  const [saving,  setSaving]    = useState(false)
  const [dirty,   setDirty]     = useState(false)

  useEffect(() => {
    adminApi.settings()
      .then(d => { setSettings({ ...DEFAULT, ...d }); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const update = (key: string, value: string) => {
    setSettings(s => ({ ...s, [key]: value }))
    setDirty(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      await adminApi.updateSettings(settings)
      toast.success('Настройки сохранены')
      setDirty(false)
    } catch { toast.error('Ошибка сохранения') }
    finally { setSaving(false) }
  }

  const reset = async () => {
    setLoading(true)
    const d = await adminApi.settings()
    setSettings({ ...DEFAULT, ...d })
    setLoading(false)
    setDirty(false)
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-40 rounded-2xl animate-pulse" style={{ background: 'var(--glass-bg)' }} />
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Настройки</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Параметры платформы</p>
        </div>
        <div className="flex gap-2">
          {dirty && (
            <button className="btn-secondary inline-flex items-center gap-2 text-sm" onClick={reset}>
              <RefreshCw className="w-4 h-4" /> Сбросить
            </button>
          )}
          <button className="btn-primary inline-flex items-center gap-2 text-sm" onClick={save} disabled={!dirty || saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            <Save className="w-4 h-4" /> Сохранить
          </button>
        </div>
      </div>

      {/* Sections */}
      {SECTIONS.map(section => {
        const Icon = section.icon
        return (
          <div key={section.id} className="glass-card space-y-5">
            <div className="flex items-center gap-3 pb-1" style={{ borderBottom: '1px solid var(--glass-border)' }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                   style={{ background: 'rgba(6,182,212,0.1)' }}>
                <Icon className="w-4 h-4" style={{ color: 'var(--accent-1)' }} />
              </div>
              <h2 className="font-semibold">{section.title}</h2>
            </div>

            <div className="space-y-4">
              {section.fields.map(field => (
                <div key={field.key}>
                  {field.type === 'toggle' ? (
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{field.label}</p>
                        {field.hint && <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{field.hint}</p>}
                      </div>
                      <ToggleSwitch
                        checked={settings[field.key] === 'true'}
                        onChange={v => update(field.key, String(v))}
                      />
                    </div>
                  ) : field.type === 'textarea' ? (
                    <div className="space-y-1.5">
                      <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>{field.label}</label>
                      <textarea
                        className="glass-input min-h-[90px] text-sm w-full"
                        value={settings[field.key] || ''}
                        onChange={e => update(field.key, e.target.value)}
                        placeholder={field.placeholder}
                      />
                      {field.hint && <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{field.hint}</p>}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>{field.label}</label>
                      <input
                        type={field.type}
                        className="glass-input text-sm w-full"
                        value={settings[field.key] || ''}
                        onChange={e => update(field.key, e.target.value)}
                        placeholder={field.placeholder}
                      />
                      {field.hint && <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{field.hint}</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {/* Env info (read-only) */}
      <div className="glass-card space-y-4">
        <div className="flex items-center gap-3 pb-1" style={{ borderBottom: '1px solid var(--glass-border)' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
               style={{ background: 'var(--surface-3)' }}>
            <CreditCard className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          </div>
          <h2 className="font-semibold">Платёжные системы</h2>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Ключи платёжных систем задаются через файл{' '}
          <code className="px-1.5 py-0.5 rounded" style={{ color: 'var(--accent-1)', background: 'var(--glass-bg)' }}>.env</code>{' '}
          и пересборку контейнеров.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'ЮKassa', envKey: 'YUKASSA_SHOP_ID' },
            { label: 'CryptoPay', envKey: 'CRYPTOPAY_API_TOKEN' },
            { label: 'Telegram Bot', envKey: 'TELEGRAM_BOT_TOKEN' },
            { label: 'REMNAWAVE', envKey: 'REMNAWAVE_URL' },
          ].map(({ label, envKey }) => (
            <div key={envKey} className="flex items-center gap-2 p-3 rounded-xl"
                 style={{ background: 'var(--glass-bg)' }}>
              <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{label}</p>
                <p className="text-xs font-mono truncate" style={{ color: 'var(--text-tertiary)' }}>{envKey}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Для изменения: отредактируй <code style={{ color: 'var(--text-tertiary)' }}>.env</code> →{' '}
          <code style={{ color: 'var(--text-tertiary)' }}>bash install.sh</code> → пункт 15 (rebuild)
        </p>
      </div>

      {/* Danger zone */}
      <div className="glass-card space-y-4" style={{ borderColor: 'rgba(127,29,29,0.3)' }}>
        <h2 className="font-semibold text-red-400">Опасная зона</h2>
        <div className="flex items-center justify-between p-4 rounded-xl"
             style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(127,29,29,0.3)' }}>
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Сброс базы данных</p>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Необратимое удаление всех данных</p>
          </div>
          <button className="text-red-400 text-sm font-medium px-3 py-1.5 rounded-xl transition-colors hover:bg-red-500/10"
                  style={{ border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.08)' }}
                  onClick={() => toast.error('Используй install.sh → Полный сброс')}>
            Только через install.sh
          </button>
        </div>
      </div>
    </div>
  )
}
