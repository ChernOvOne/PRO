'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Shield, CheckCircle2, Loader2 } from 'lucide-react'

export default function RecoverPage() {
  const [step, setStep] = useState<'form' | 'done'>('form')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [tgUsername, setTgUsername] = useState('')
  const [tgId, setTgId] = useState('')
  const [desiredEmail, setDesiredEmail] = useState('')
  const [paymentProof, setPaymentProof] = useState('')
  const [description, setDescription] = useState('')
  const [contactMethod, setContactMethod] = useState<'email' | 'telegram'>('email')

  const submit = async () => {
    setError(null)
    if (!tgUsername.trim()) return setError('Укажите ваш Telegram username')
    if (!desiredEmail.trim() || !desiredEmail.includes('@')) return setError('Укажите корректный email')
    if (!paymentProof.trim() || paymentProof.length < 10) return setError('Укажите доказательство оплаты: номер чека, дата, сумма')

    setLoading(true)
    try {
      const res = await fetch('/api/public/tickets/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tgUsername: tgUsername.trim(),
          tgId: tgId.trim() || undefined,
          desiredEmail: desiredEmail.trim(),
          paymentProof: paymentProof.trim(),
          description: description.trim() || undefined,
          contactMethod,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка отправки')
      setStep('done')
    } catch (e: any) {
      setError(e.message || 'Не удалось отправить заявку')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
         style={{ background: 'var(--surface-0)' }}>
      <div className="w-full max-w-xl">
        <Link href="/login" className="inline-flex items-center gap-2 mb-4 text-sm"
              style={{ color: 'var(--text-tertiary)' }}>
          <ArrowLeft className="w-4 h-4" /> Ко входу
        </Link>

        <div className="glass-card p-6 md:p-8 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                 style={{ background: 'rgba(245,158,11,0.12)' }}>
              <Shield className="w-6 h-6" style={{ color: '#f59e0b' }} />
            </div>
            <div>
              <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                Восстановление доступа
              </h1>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Для клиентов у которых заблокирован Telegram
              </p>
            </div>
          </div>

          {step === 'form' && (
            <>
              <div className="p-4 rounded-xl text-sm"
                   style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)', color: 'var(--text-secondary)' }}>
                <p className="font-medium mb-1" style={{ color: 'var(--accent-1)' }}>Как это работает:</p>
                <ol className="list-decimal pl-5 space-y-1 text-xs">
                  <li>Вы заполняете эту форму с данными для идентификации</li>
                  <li>Администратор проверяет вас по чекам / истории платежей / TG username</li>
                  <li>Мы привязываем указанный email к вашему аккаунту и присылаем пароль от веб-ЛК</li>
                  <li>Вы заходите на сайт через новый email/пароль и продлеваете подписку</li>
                </ol>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>
                    Telegram username (без @) *
                  </label>
                  <input value={tgUsername}
                         onChange={e => setTgUsername(e.target.value.replace(/^@/, ''))}
                         placeholder="my_username"
                         className="glass-input w-full" />
                </div>

                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>
                    Telegram ID (если знаете — ускорит поиск)
                  </label>
                  <input value={tgId}
                         onChange={e => setTgId(e.target.value.replace(/\D/g, ''))}
                         placeholder="123456789"
                         className="glass-input w-full" />
                </div>

                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>
                    На какой email привязать аккаунт? *
                  </label>
                  <input type="email" value={desiredEmail}
                         onChange={e => setDesiredEmail(e.target.value.trim())}
                         placeholder="you@example.com"
                         className="glass-input w-full" />
                  <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
                    На этот email мы пришлём сгенерированный пароль после верификации. Проверьте папку «Спам».
                  </p>
                </div>

                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>
                    Подтверждение оплаты *
                  </label>
                  <textarea value={paymentProof}
                            onChange={e => setPaymentProof(e.target.value)}
                            rows={4}
                            placeholder="Номер чека, дата платежа, сумма, последние 4 цифры карты — всё что поможет идентифицировать вас как владельца"
                            className="glass-input w-full resize-none" />
                </div>

                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>
                    Дополнительная информация
                  </label>
                  <textarea value={description}
                            onChange={e => setDescription(e.target.value)}
                            rows={3}
                            placeholder="Опишите ситуацию: почему не можете зайти в бота, когда купили подписку и т.п."
                            className="glass-input w-full resize-none" />
                </div>

                <div>
                  <label className="text-xs font-medium block mb-2" style={{ color: 'var(--text-tertiary)' }}>
                    Как с вами связаться для уточнений?
                  </label>
                  <div className="flex gap-2">
                    {(['email', 'telegram'] as const).map(m => (
                      <button key={m}
                              onClick={() => setContactMethod(m)}
                              className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
                              style={{
                                background: contactMethod === m ? 'var(--accent-1)' : 'var(--surface-2)',
                                color: contactMethod === m ? '#fff' : 'var(--text-secondary)',
                              }}>
                        {m === 'email' ? '📧 Email' : '💬 Telegram'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-lg text-sm"
                     style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171' }}>
                  {error}
                </div>
              )}

              <button onClick={submit}
                      disabled={loading}
                      className="btn-primary w-full justify-center py-3 disabled:opacity-60">
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Отправка...</>
                ) : 'Отправить заявку'}
              </button>

              <p className="text-[10px] text-center" style={{ color: 'var(--text-tertiary)' }}>
                Лимит — 3 заявки с одного IP в сутки. Обычно обрабатываем в течение нескольких часов.
              </p>
            </>
          )}

          {step === 'done' && (
            <div className="text-center space-y-4 py-4">
              <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center"
                   style={{ background: 'rgba(16,185,129,0.12)' }}>
                <CheckCircle2 className="w-8 h-8" style={{ color: '#34d399' }} />
              </div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                Заявка отправлена!
              </h2>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Администратор проверит ваши данные и свяжется с вами по указанному способу связи.
              </p>
              <div className="p-3 rounded-lg text-xs text-left space-y-1"
                   style={{ background: 'var(--surface-2)', color: 'var(--text-tertiary)' }}>
                <p>• Обычно обрабатываем в течение 2-6 часов</p>
                <p>• После верификации на email <b>{desiredEmail}</b> придёт пароль</p>
                <p>• Проверьте папку «Спам»</p>
              </div>
              <Link href="/login"
                    className="inline-block text-sm transition-colors"
                    style={{ color: 'var(--accent-1)' }}>
                ← Вернуться ко входу
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
