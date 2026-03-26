import Link from 'next/link'
import { Shield, ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Политика конфиденциальности',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-950">
      <div className="max-w-3xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="flex items-center gap-3 mb-12">
          <div className="w-9 h-9 rounded-xl bg-brand-600/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <p className="font-bold text-lg">HIDEYOU</p>
            <p className="text-xs text-gray-500">VPN Service</p>
          </div>
        </div>

        <h1 className="text-4xl font-bold mb-3">Политика конфиденциальности</h1>
        <p className="text-gray-400 mb-12">
          Последнее обновление:{' '}
          {new Date().toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>

        <div className="prose-custom space-y-8 text-gray-300 leading-relaxed">
          {SECTIONS.map(({ title, content }) => (
            <section key={title}>
              <h2 className="text-xl font-semibold text-white mb-3">{title}</h2>
              <div className="text-gray-400 space-y-2">
                {content.map((p, i) => <p key={i}>{p}</p>)}
              </div>
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

const SECTIONS = [
  {
    title: '1. Какие данные мы собираем',
    content: [
      'При регистрации через Telegram мы получаем ваш Telegram ID, имя пользователя и публичное имя — только те данные, которые Telegram предоставляет при авторизации.',
      'При регистрации через Email мы сохраняем ваш адрес электронной почты и хэш пароля (пароль хранится в защищённом виде и не может быть восстановлен нами).',
      'При оплате мы сохраняем идентификатор транзакции, сумму, провайдера и дату. Данные банковских карт мы не храним — они обрабатываются платёжными провайдерами (ЮKassa, CryptoPay).',
      'Технические данные: IP-адрес при входе, информация об устройстве (User-Agent). Эти данные используются исключительно для безопасности аккаунта.',
    ],
  },
  {
    title: '2. Политика no-logs',
    content: [
      'HIDEYOU не ведёт логи вашей VPN-активности: мы не отслеживаем, какие сайты вы посещаете, какой трафик передаёте, в какое время используете VPN.',
      'Единственная статистика, которую собирает VPN-инфраструктура — это суммарный объём трафика (в гигабайтах) для контроля лимитов тарифного плана.',
    ],
  },
  {
    title: '3. Как мы используем данные',
    content: [
      'Авторизация и идентификация пользователя в сервисе.',
      'Обработка платежей и активация/продление подписки.',
      'Отправка уведомлений об истечении подписки через Telegram-бот или email.',
      'Реферальная программа: отслеживание связей для начисления бонусов.',
      'Техническая поддержка при обращении.',
    ],
  },
  {
    title: '4. Передача данных третьим лицам',
    content: [
      'Мы не продаём и не передаём ваши персональные данные третьим лицам в коммерческих целях.',
      'Для обработки платежей данные передаются платёжным провайдерам (ЮKassa, CryptoPay) в соответствии с их политиками конфиденциальности.',
      'В случае требования со стороны уполномоченных органов в соответствии с действующим законодательством.',
    ],
  },
  {
    title: '5. Хранение и защита данных',
    content: [
      'Данные хранятся на серверах под защитой современных методов шифрования.',
      'Передача данных между вами и нашими серверами защищена TLS 1.3.',
      'Пароли хранятся только в виде хэша bcrypt и не могут быть восстановлены.',
      'Вы можете запросить удаление своего аккаунта и всех связанных данных, написав в поддержку.',
    ],
  },
  {
    title: '6. Ваши права',
    content: [
      'Вы вправе запросить выгрузку своих персональных данных.',
      'Вы вправе запросить исправление или удаление своих данных.',
      'Для удаления аккаунта или реализации иных прав свяжитесь с нами через Telegram-поддержку.',
    ],
  },
  {
    title: '7. Контакт',
    content: [
      'По вопросам, связанным с обработкой персональных данных, обращайтесь в нашу поддержку через Telegram.',
    ],
  },
]
