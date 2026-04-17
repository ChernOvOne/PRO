'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function FunnelGuidePage() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link href="/admin/communications/funnel-builder"
            className="inline-flex items-center gap-2 text-[13px] mb-4"
            style={{ color: 'var(--text-tertiary)' }}>
        <ArrowLeft className="w-4 h-4" /> К конструктору
      </Link>

      <h1 className="text-[24px] font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
        📚 Гайд по воронкам
      </h1>
      <p className="text-[14px] mb-6" style={{ color: 'var(--text-tertiary)' }}>
        Всё что нужно знать о том как работают автоматические цепочки сообщений
      </p>

      <Section title="🎯 Что такое воронка?">
        <p>
          Воронка — это цепочка автоматических действий, которая запускается когда с юзером
          что-то происходит (триггер), и ведёт его через серию шагов: сообщения, задержки,
          условия, действия. Цель — довести юзера от события А (например, регистрация) к
          результату Б (например, первой оплате).
        </p>
      </Section>

      <Section title="⚡ Быстрый старт">
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>
            Откройте <b>/admin/communications/funnel-builder</b>
          </li>
          <li>
            Нажмите <b>📚 Готовые шаблоны</b> — выберите Welcome Flow или другой готовый сценарий.
            Установится <b>выключенной</b>.
          </li>
          <li>
            Нажмите на воронку → проверьте ноды, отредактируйте тексты → включите тумблер
          </li>
          <li>
            Для кастома: <b>✨ Wizard</b> — пошаговый конструктор за 5 экранов
          </li>
          <li>
            Для сложных сценариев: создайте воронку с нуля и используйте <b>⚡ Умные пресеты</b>
          </li>
        </ol>
      </Section>

      <Section title="🧩 Типы нод (11 штук)">
        <Node icon="⚡" name="trigger" desc="Начало цепочки. Срабатывает на событие (регистрация, оплата, истечение подписки)" />
        <Node icon="💬" name="message" desc="Отправляет сообщение по TG/email/ЛК с переменными (имя, тариф, дата) и кнопками" />
        <Node icon="⏱️" name="delay" desc="Пауза перед следующим шагом. Минуты/часы/дни. Дольше 24ч — через очередь (переживает рестарт)" />
        <Node icon="🔀" name="condition" desc="Проверка правил (баланс, дни, подписка, теги). Ведёт в TRUE или FALSE ветку" />
        <Node icon="✨" name="action" desc="Выполняет действие: бонус-дни, промокод, тег, изменение баланса" />
        <Node icon="🎲" name="split" desc="A/B тест. N% юзеров идут в одну ветку, остальные в другую" />
        <Node icon="⏳" name="wait_event" desc="Ждёт реальное событие юзера (payment_success, first_connection) с таймаутом" />
        <Node icon="🔁" name="goto" desc="Переход на другую ноду или в другую воронку. Циклы поддерживаются (лимит 50 шагов)" />
        <Node icon="🌐" name="http" desc="HTTP-запрос на внешний URL. 3 ретрая, таймаут 5с. Для интеграций" />
        <Node icon="🔔" name="notify_admin" desc="Уведомляет админа: в TG-канал или создаёт тикет" />
        <Node icon="⏹️" name="stop" desc="Останавливает воронку для этого юзера" />
      </Section>

      <Section title="🧠 Условия — визуальный builder">
        <p className="mb-2">
          Вместо JSON — правила вида <code>поле + оператор + значение</code>:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>days_left ≤ 7</b> — дней до окончания подписки ≤ 7</li>
          <li><b>payments_count = 0</b> — ни разу не оплачивал</li>
          <li><b>is_connected = нет</b> — не подключён к VPN</li>
          <li><b>balance &gt; 100</b> — на балансе больше 100₽</li>
          <li><b>referrals_count ≥ 3</b> — привёл 3+ реферала</li>
        </ul>
        <p className="mt-2">
          Несколько правил объединяются через <b>И (AND)</b> или <b>ИЛИ (OR)</b>.
        </p>
      </Section>

      <Section title="📊 Переменные в сообщениях">
        <p className="mb-2">В текстах сообщений можно использовать плейсхолдеры:</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] font-mono">
          <div><code>{'{name}'}</code> — имя юзера</div>
          <div><code>{'{email}'}</code> — email</div>
          <div><code>{'{tariffName}'}</code> — название тарифа</div>
          <div><code>{'{daysLeft}'}</code> — дней до окончания</div>
          <div><code>{'{subExpireDate}'}</code> — дата окончания</div>
          <div><code>{'{balance}'}</code> — баланс</div>
          <div><code>{'{referralUrl}'}</code> — реф-ссылка</div>
          <div><code>{'{refBonusDays}'}</code> — бонус за реферала</div>
          <div><code>{'{appUrl}'}</code> — URL приложения</div>
          <div><code>{'{totalPaid}'}</code> — сумма всех оплат</div>
        </div>
      </Section>

      <Section title="🛡️ Защиты и гарантии">
        <ul className="list-disc pl-5 space-y-1">
          <li><b>Stop on payment/connect/active sub</b> — остановить воронку если юзер достиг цели (в настройках воронки)</li>
          <li><b>Anti-spam hours</b> — не повторять ноду чаще чем раз в N часов</li>
          <li><b>Work hours</b> — не слать ночью, ждёт до утра</li>
          <li><b>MAX_CHAIN_DEPTH = 50</b> — защита от бесконечных циклов</li>
          <li><b>PendingFunnelStep</b> — длинные задержки переживают рестарт (БД, не setTimeout)</li>
        </ul>
      </Section>

      <Section title="🧪 Тестирование">
        <ul className="list-disc pl-5 space-y-1">
          <li><b>✓ Валидация</b> — проверяет структуру воронки: сломанные связи, орфанные ноды, пустые тексты</li>
          <li><b>🧪 Симулятор</b> — сухой прогон на конкретном юзере без реальной отправки. Показывает что и когда бы отправилось</li>
          <li><b>Тест ноды</b> — кнопка "Тест" в правой панели. Отправляет эту ноду всем админам</li>
          <li><b>Sandbox mode</b> — в настройках воронки. Работает только для юзеров с определённым тегом (например <code>test_funnel</code>)</li>
        </ul>
      </Section>

      <Section title="📈 Аналитика">
        <p>
          Кнопка <b>📊 Аналитика</b> в тулбаре. Показывает:
        </p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>Сколько уникальных юзеров прошли через воронку за 7/30/90 дней</li>
          <li>Сколько достигли каждой ноды (drop-off)</li>
          <li>Процент конверсии относительно входа</li>
          <li>Сколько отправок failed (ошибки доставки)</li>
        </ul>
      </Section>

      <Section title="💡 Best practices">
        <ul className="list-disc pl-5 space-y-1">
          <li>Всегда включайте <b>stopOnPayment</b> для воронок восстановления платежа</li>
          <li>Используйте <b>wait_event</b> вместо <b>delay + condition</b> когда нужно ждать конкретное действие</li>
          <li>Задержки дольше суток — нормально, очередь обработает</li>
          <li>Тестируйте через симулятор перед включением</li>
          <li>Проверяйте аналитику раз в неделю — где юзеры отваливаются</li>
          <li>Не более 3-5 сообщений в одной цепочке, иначе получится спам</li>
          <li>Используйте workHours для VPN-бизнеса — не будите клиентов в 3 ночи</li>
        </ul>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 p-5 rounded-2xl"
         style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
      <h2 className="text-[16px] font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
        {title}
      </h2>
      <div className="text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        {children}
      </div>
    </div>
  )
}

function Node({ icon, name, desc }: { icon: string; name: string; desc: string }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <div className="text-[16px] leading-none mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <code className="text-[12px] font-bold" style={{ color: 'var(--accent-1)' }}>{name}</code>
        <span className="text-[12px] ml-2" style={{ color: 'var(--text-tertiary)' }}>— {desc}</span>
      </div>
    </div>
  )
}
