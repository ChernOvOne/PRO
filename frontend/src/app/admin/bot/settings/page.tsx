'use client'

import { useEffect, useState } from 'react'
import { Save, RefreshCw, Loader2, MessageSquare, Mouse, Link2, ToggleLeft } from 'lucide-react'
import toast from 'react-hot-toast'

/* ── Types ─────────────────────────────────────────────────── */

interface BotSettings {
  /* Тексты сообщений */
  bot_start_text:             string
  bot_subscription_active:    string
  bot_subscription_inactive:  string
  bot_tariff_header:          string
  bot_promo_prompt:           string
  bot_promo_success:          string
  /* Кнопки главного меню */
  bot_btn_subscription:       string
  bot_btn_tariffs:            string
  bot_btn_referral:           string
  bot_btn_balance:            string
  bot_btn_promo:              string
  bot_btn_devices:            string
  bot_btn_instructions:       string
  bot_btn_open_lk:            string
  /* Ссылки */
  bot_support_url:            string
  bot_channel_url:            string
  /* Переключатели */
  bot_feature_promo:          string
  bot_feature_devices:        string
  bot_feature_instructions:   string
  bot_feature_balance:        string
  [key: string]: string
}

const DEFAULTS: BotSettings = {
  bot_start_text:            '\u{1f44b} \u041f\u0440\u0438\u0432\u0435\u0442! \u042f \u0431\u043e\u0442 \u0441\u0435\u0440\u0432\u0438\u0441\u0430 HIDEYOU VPN.',
  bot_subscription_active:   '\u2705 \u041f\u043e\u0434\u043f\u0438\u0441\u043a\u0430 \u0430\u043a\u0442\u0438\u0432\u043d\u0430',
  bot_subscription_inactive: '\u274c \u0423 \u0432\u0430\u0441 \u043d\u0435\u0442 \u0430\u043a\u0442\u0438\u0432\u043d\u043e\u0439 \u043f\u043e\u0434\u043f\u0438\u0441\u043a\u0438',
  bot_tariff_header:         '\u{1f4b3} \u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0442\u0430\u0440\u0438\u0444:',
  bot_promo_prompt:          '\u{1f39f} \u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043f\u0440\u043e\u043c\u043e\u043a\u043e\u0434:',
  bot_promo_success:         '\u2705 \u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434 \u0430\u043a\u0442\u0438\u0432\u0438\u0440\u043e\u0432\u0430\u043d!',
  bot_btn_subscription:      '\u{1f511} \u041f\u043e\u0434\u043f\u0438\u0441\u043a\u0430',
  bot_btn_tariffs:           '\u{1f4b3} \u0422\u0430\u0440\u0438\u0444\u044b',
  bot_btn_referral:          '\u{1f465} \u0420\u0435\u0444\u0435\u0440\u0430\u043b\u044b',
  bot_btn_balance:           '\u{1f4b0} \u0411\u0430\u043b\u0430\u043d\u0441',
  bot_btn_promo:             '\u{1f39f} \u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434',
  bot_btn_devices:           '\u{1f4f1} \u0423\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432\u0430',
  bot_btn_instructions:      '\u{1f4d6} \u0418\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0438\u0438',
  bot_btn_open_lk:           '\u{1f310} \u041e\u0442\u043a\u0440\u044b\u0442\u044c \u041b\u041a',
  bot_support_url:           '',
  bot_channel_url:           '',
  bot_feature_promo:         'true',
  bot_feature_devices:       'true',
  bot_feature_instructions:  'true',
  bot_feature_balance:       'true',
}

/* ── Section configs ───────────────────────────────────────── */

type FieldDef =
  | { key: string; label: string; type: 'textarea'; placeholder?: string }
  | { key: string; label: string; type: 'text'; placeholder?: string }
  | { key: string; label: string; type: 'url'; placeholder?: string }
  | { key: string; label: string; type: 'toggle' }

interface Section {
  id:     string
  icon:   any
  title:  string
  fields: FieldDef[]
}

const SECTIONS: Section[] = [
  {
    id: 'messages', icon: MessageSquare, title: '\u0422\u0435\u043a\u0441\u0442\u044b \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0439',
    fields: [
      { key: 'bot_start_text',            label: '\u041f\u0440\u0438\u0432\u0435\u0442\u0441\u0442\u0432\u0438\u0435',            type: 'textarea', placeholder: '\u0422\u0435\u043a\u0441\u0442 \u043f\u0440\u0438\u0432\u0435\u0442\u0441\u0442\u0432\u0438\u044f \u0431\u043e\u0442\u0430...' },
      { key: 'bot_subscription_active',   label: '\u041f\u043e\u0434\u043f\u0438\u0441\u043a\u0430 \u0430\u043a\u0442\u0438\u0432\u043d\u0430',   type: 'textarea', placeholder: '\u0422\u0435\u043a\u0441\u0442 \u0430\u043a\u0442\u0438\u0432\u043d\u043e\u0439 \u043f\u043e\u0434\u043f\u0438\u0441\u043a\u0438...' },
      { key: 'bot_subscription_inactive', label: '\u041f\u043e\u0434\u043f\u0438\u0441\u043a\u0430 \u043d\u0435\u0430\u043a\u0442\u0438\u0432\u043d\u0430', type: 'textarea', placeholder: '\u0422\u0435\u043a\u0441\u0442 \u043d\u0435\u0430\u043a\u0442\u0438\u0432\u043d\u043e\u0439 \u043f\u043e\u0434\u043f\u0438\u0441\u043a\u0438...' },
      { key: 'bot_tariff_header',         label: '\u0417\u0430\u0433\u043e\u043b\u043e\u0432\u043e\u043a \u0442\u0430\u0440\u0438\u0444\u043e\u0432',         type: 'textarea', placeholder: '\u0417\u0430\u0433\u043e\u043b\u043e\u0432\u043e\u043a \u0441\u043f\u0438\u0441\u043a\u0430 \u0442\u0430\u0440\u0438\u0444\u043e\u0432...' },
      { key: 'bot_promo_prompt',          label: '\u0417\u0430\u043f\u0440\u043e\u0441 \u043f\u0440\u043e\u043c\u043e\u043a\u043e\u0434\u0430',          type: 'textarea', placeholder: '\u0422\u0435\u043a\u0441\u0442 \u0437\u0430\u043f\u0440\u043e\u0441\u0430 \u043f\u0440\u043e\u043c\u043e\u043a\u043e\u0434\u0430...' },
      { key: 'bot_promo_success',         label: '\u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434 \u043f\u0440\u0438\u043c\u0435\u043d\u0451\u043d',         type: 'textarea', placeholder: '\u0422\u0435\u043a\u0441\u0442 \u0443\u0441\u043f\u0435\u0445\u0430 \u043f\u0440\u043e\u043c\u043e\u043a\u043e\u0434\u0430...' },
    ],
  },
  {
    id: 'buttons', icon: Mouse, title: '\u041a\u043d\u043e\u043f\u043a\u0438 \u0433\u043b\u0430\u0432\u043d\u043e\u0433\u043e \u043c\u0435\u043d\u044e',
    fields: [
      { key: 'bot_btn_subscription',  label: '\u041f\u043e\u0434\u043f\u0438\u0441\u043a\u0430',    type: 'text', placeholder: '\u{1f511} \u041f\u043e\u0434\u043f\u0438\u0441\u043a\u0430' },
      { key: 'bot_btn_tariffs',       label: '\u0422\u0430\u0440\u0438\u0444\u044b',       type: 'text', placeholder: '\u{1f4b3} \u0422\u0430\u0440\u0438\u0444\u044b' },
      { key: 'bot_btn_referral',      label: '\u0420\u0435\u0444\u0435\u0440\u0430\u043b\u044b',      type: 'text', placeholder: '\u{1f465} \u0420\u0435\u0444\u0435\u0440\u0430\u043b\u044b' },
      { key: 'bot_btn_balance',       label: '\u0411\u0430\u043b\u0430\u043d\u0441',       type: 'text', placeholder: '\u{1f4b0} \u0411\u0430\u043b\u0430\u043d\u0441' },
      { key: 'bot_btn_promo',         label: '\u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434',         type: 'text', placeholder: '\u{1f39f} \u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434' },
      { key: 'bot_btn_devices',       label: '\u0423\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432\u0430',       type: 'text', placeholder: '\u{1f4f1} \u0423\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432\u0430' },
      { key: 'bot_btn_instructions',  label: '\u0418\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0438\u0438',  type: 'text', placeholder: '\u{1f4d6} \u0418\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0438\u0438' },
      { key: 'bot_btn_open_lk',       label: '\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u041b\u041a',       type: 'text', placeholder: '\u{1f310} \u041e\u0442\u043a\u0440\u044b\u0442\u044c \u041b\u041a' },
    ],
  },
  {
    id: 'links', icon: Link2, title: '\u0421\u0441\u044b\u043b\u043a\u0438',
    fields: [
      { key: 'bot_support_url', label: '\u0421\u0441\u044b\u043b\u043a\u0430 \u043d\u0430 \u043f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0443', type: 'url', placeholder: 'https://t.me/support' },
      { key: 'bot_channel_url', label: '\u041a\u0430\u043d\u0430\u043b Telegram',   type: 'url', placeholder: 'https://t.me/channel' },
    ],
  },
  {
    id: 'toggles', icon: ToggleLeft, title: '\u041f\u0435\u0440\u0435\u043a\u043b\u044e\u0447\u0430\u0442\u0435\u043b\u0438',
    fields: [
      { key: 'bot_feature_promo',        label: '\u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434\u044b \u0432 \u0431\u043e\u0442\u0435',        type: 'toggle' },
      { key: 'bot_feature_devices',      label: '\u0423\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432\u0430 \u0432 \u0431\u043e\u0442\u0435',      type: 'toggle' },
      { key: 'bot_feature_instructions', label: '\u0418\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0438\u0438 \u0432 \u0431\u043e\u0442\u0435', type: 'toggle' },
      { key: 'bot_feature_balance',      label: '\u0411\u0430\u043b\u0430\u043d\u0441 \u0432 \u0431\u043e\u0442\u0435',      type: 'toggle' },
    ],
  },
]

/* ── Toggle component ──────────────────────────────────────── */

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

/* ── Page ───────────────────────────────────────────────────── */

export default function BotSettingsPage() {
  const [settings, setSettings] = useState<BotSettings>(DEFAULTS)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [dirty, setDirty]       = useState(false)

  useEffect(() => {
    fetch('/api/admin/bot/settings', { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(d => { setSettings({ ...DEFAULTS, ...d }); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const update = (key: string, value: string) => {
    setSettings(s => ({ ...s, [key]: value }))
    setDirty(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/bot/settings', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) throw new Error()
      toast.success('\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u0431\u043e\u0442\u0430 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u044b')
      setDirty(false)
    } catch {
      toast.error('\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u044f')
    } finally {
      setSaving(false)
    }
  }

  const reset = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/bot/settings', { credentials: 'include' })
      if (!res.ok) throw new Error()
      const d = await res.json()
      setSettings({ ...DEFAULTS, ...d })
    } catch { /* keep defaults */ }
    setLoading(false)
    setDirty(false)
  }

  /* ── Loading state ──────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-tertiary)' }} />
      </div>
    )
  }

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {'\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u0431\u043e\u0442\u0430'}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
            {'\u0422\u0435\u043a\u0441\u0442\u044b, \u043a\u043d\u043e\u043f\u043a\u0438 \u0438 \u0444\u0443\u043d\u043a\u0446\u0438\u0438 Telegram-\u0431\u043e\u0442\u0430'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={reset}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all glass-card"
                  style={{ color: 'var(--text-secondary)' }}>
            <RefreshCw className="w-4 h-4" />
            {'\u0421\u0431\u0440\u043e\u0441\u0438\u0442\u044c'}
          </button>
          <button onClick={save} disabled={!dirty || saving}
                  className="btn-primary flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {'\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c'}
          </button>
        </div>
      </div>

      {/* Sections */}
      {SECTIONS.map(section => {
        const Icon = section.icon
        return (
          <div key={section.id} className="glass-card rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                   style={{ background: 'rgba(139,92,246,0.12)' }}>
                <Icon className="w-[18px] h-[18px]" style={{ color: '#a78bfa' }} />
              </div>
              <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                {section.title}
              </h2>
            </div>

            <div className="space-y-4">
              {section.fields.map(field => {
                if (field.type === 'toggle') {
                  return (
                    <div key={field.key} className="flex items-center justify-between py-2">
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {field.label}
                      </span>
                      <ToggleSwitch
                        checked={settings[field.key] === 'true'}
                        onChange={v => update(field.key, v ? 'true' : 'false')}
                      />
                    </div>
                  )
                }

                if (field.type === 'textarea') {
                  return (
                    <div key={field.key}>
                      <label className="block text-xs font-medium mb-1.5"
                             style={{ color: 'var(--text-tertiary)' }}>
                        {field.label}
                      </label>
                      <textarea
                        rows={3}
                        value={settings[field.key] || ''}
                        onChange={e => update(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        className="glass-input w-full rounded-xl px-4 py-3 text-sm resize-y"
                        style={{ color: 'var(--text-primary)', minHeight: '72px' }}
                      />
                    </div>
                  )
                }

                return (
                  <div key={field.key}>
                    <label className="block text-xs font-medium mb-1.5"
                           style={{ color: 'var(--text-tertiary)' }}>
                      {field.label}
                    </label>
                    <input
                      type={field.type === 'url' ? 'url' : 'text'}
                      value={settings[field.key] || ''}
                      onChange={e => update(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className="glass-input w-full rounded-xl px-4 py-2.5 text-sm"
                      style={{ color: 'var(--text-primary)' }}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
