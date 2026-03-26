'use client'

import { useEffect, useState } from 'react'
import {
  Save, RefreshCw, Bot, CreditCard, Users,
  Globe, Bell, Shield, Loader2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { adminApi } from '@/lib/api'
import { Button, Card, Input, Toggle } from '@/components/ui'

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
          <div key={i} className="h-40 bg-gray-800 rounded-2xl animate-pulse" />
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
          <p className="text-gray-400 text-sm mt-0.5">Параметры платформы</p>
        </div>
        <div className="flex gap-2">
          {dirty && (
            <Button variant="ghost" size="sm" onClick={reset}>
              <RefreshCw className="w-4 h-4" /> Сбросить
            </Button>
          )}
          <Button onClick={save} loading={saving} disabled={!dirty}>
            <Save className="w-4 h-4" /> Сохранить
          </Button>
        </div>
      </div>

      {/* Sections */}
      {SECTIONS.map(section => {
        const Icon = section.icon
        return (
          <Card key={section.id} className="space-y-5">
            <div className="flex items-center gap-3 pb-1 border-b border-gray-800">
              <div className="w-8 h-8 rounded-lg bg-brand-600/15 flex items-center justify-center">
                <Icon className="w-4 h-4 text-brand-400" />
              </div>
              <h2 className="font-semibold">{section.title}</h2>
            </div>

            <div className="space-y-4">
              {section.fields.map(field => (
                <div key={field.key}>
                  {field.type === 'toggle' ? (
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-gray-300">{field.label}</p>
                        {field.hint && <p className="text-xs text-gray-500 mt-0.5">{field.hint}</p>}
                      </div>
                      <Toggle
                        checked={settings[field.key] === 'true'}
                        onChange={v => update(field.key, String(v))}
                      />
                    </div>
                  ) : field.type === 'textarea' ? (
                    <div className="space-y-1.5">
                      <label className="text-sm text-gray-400">{field.label}</label>
                      <textarea
                        className="input min-h-[90px] text-sm"
                        value={settings[field.key] || ''}
                        onChange={e => update(field.key, e.target.value)}
                        placeholder={field.placeholder}
                      />
                      {field.hint && <p className="text-xs text-gray-500">{field.hint}</p>}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="text-sm text-gray-400">{field.label}</label>
                      <Input
                        type={field.type}
                        value={settings[field.key] || ''}
                        onChange={e => update(field.key, e.target.value)}
                        placeholder={field.placeholder}
                      />
                      {field.hint && <p className="text-xs text-gray-500">{field.hint}</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )
      })}

      {/* Env info (read-only) */}
      <Card className="space-y-4">
        <div className="flex items-center gap-3 pb-1 border-b border-gray-800">
          <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center">
            <CreditCard className="w-4 h-4 text-gray-400" />
          </div>
          <h2 className="font-semibold">Платёжные системы</h2>
        </div>
        <p className="text-sm text-gray-400">
          Ключи платёжных систем задаются через файл{' '}
          <code className="text-brand-300 bg-gray-800 px-1.5 py-0.5 rounded">.env</code>{' '}
          и пересборку контейнеров.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'ЮKassa', envKey: 'YUKASSA_SHOP_ID' },
            { label: 'CryptoPay', envKey: 'CRYPTOPAY_API_TOKEN' },
            { label: 'Telegram Bot', envKey: 'TELEGRAM_BOT_TOKEN' },
            { label: 'REMNAWAVE', envKey: 'REMNAWAVE_URL' },
          ].map(({ label, envKey }) => (
            <div key={envKey} className="flex items-center gap-2 p-3 bg-gray-800 rounded-xl">
              <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-300">{label}</p>
                <p className="text-xs text-gray-600 font-mono truncate">{envKey}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-600">
          Для изменения: отредактируй <code className="text-gray-500">.env</code> →{' '}
          <code className="text-gray-500">bash install.sh</code> → пункт 15 (rebuild)
        </p>
      </Card>

      {/* Danger zone */}
      <Card className="space-y-4 border-red-900/30">
        <h2 className="font-semibold text-red-400">Опасная зона</h2>
        <div className="flex items-center justify-between p-4 bg-red-500/5
                        border border-red-900/30 rounded-xl">
          <div>
            <p className="text-sm font-medium text-gray-300">Сброс базы данных</p>
            <p className="text-xs text-gray-500">Необратимое удаление всех данных</p>
          </div>
          <Button variant="danger" size="sm"
                  onClick={() => toast.error('Используй install.sh → Полный сброс')}>
            Только через install.sh
          </Button>
        </div>
      </Card>
    </div>
  )
}
