import Link from 'next/link'
import { Shield, ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Условия использования' }

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-950">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="flex items-center gap-3 mb-12">
          <div className="w-9 h-9 rounded-xl bg-brand-600/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <p className="font-bold text-lg">HIDEYOU</p>
            <p className="text-xs text-gray-500">VPN Service</p>
          </div>
        </div>

        <h1 className="text-4xl font-bold mb-3">Условия использования</h1>
        <p className="text-gray-400 mb-12">
          Последнее обновление:{' '}
          {new Date().toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>

        <div className="space-y-8 text-gray-400 leading-relaxed">
          {TERMS.map(({ title, items }) => (
            <section key={title}>
              <h2 className="text-xl font-semibold text-white mb-3">{title}</h2>
              <ul className="space-y-2 list-disc list-inside">
                {items.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </section>
          ))}
        </div>

        <div className="mt-16 pt-8 border-t border-gray-800">
          <Link href="/"
                className="inline-flex items-center gap-2 text-gray-400 hover:text-white
                           transition-colors text-sm">
            <ArrowLeft className="w-4 h-4" />
            Вернуться на главную
          </Link>
        </div>
      </div>
    </div>
  )
}

const TERMS = [
  {
    title: '1. Использование сервиса',
    items: [
      'Сервис предназначен для защиты конфиденциальности и обхода географических ограничений.',
      'Запрещено использование сервиса для незаконной деятельности.',
      'Запрещена перепродажа или передача доступа третьим лицам.',
      'Запрещено создание автоматизированных запросов, перегружающих инфраструктуру.',
    ],
  },
  {
    title: '2. Оплата и возврат',
    items: [
      'Оплата производится единовременно за выбранный период.',
      'Подписка активируется автоматически сразу после подтверждения платежа.',
      'Возврат средств возможен в течение 24 часов с момента оплаты при наличии технических проблем.',
      'Для возврата обратитесь в поддержку с указанием ID платежа.',
    ],
  },
  {
    title: '3. Ответственность',
    items: [
      'Сервис предоставляется "как есть". Мы не гарантируем 100% аптайм.',
      'При технических работах возможны кратковременные перерывы в работе.',
      'Мы не несём ответственности за действия пользователей в интернете.',
      'При нарушении правил аккаунт может быть заблокирован без возврата средств.',
    ],
  },
  {
    title: '4. Изменение условий',
    items: [
      'Мы оставляем за собой право изменять условия с уведомлением пользователей.',
      'Продолжение использования сервиса означает согласие с новыми условиями.',
    ],
  },
]
