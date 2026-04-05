'use client'

import { useState, useMemo } from 'react'
import {
  Search, LayoutDashboard, Users, CreditCard, Package, Server,
  Megaphone, ArrowLeftRight, Handshake, Wallet, FileText, BarChart2,
  Newspaper, MessageCircle, Tag, Bot, Workflow, Wifi, Globe, Upload,
  Settings, BookOpen, TrendingUp, Shield, HelpCircle, Zap, DollarSign,
} from 'lucide-react'

interface Section {
  id: string
  title: string
  icon: any
  category: string
  summary: string
  content: { heading?: string; text?: string; list?: string[] }[]
}

const SECTIONS: Section[] = [
  // ───────── Общее ─────────
  {
    id: 'overview',
    title: 'Обзор платформы',
    icon: Shield,
    category: 'Общее',
    summary: 'HIDEYOU PRO — платформа для управления VPN-бизнесом: личный кабинет клиента + админка с финучётом, маркетингом, ботом и CRM.',
    content: [
      {
        text: 'Платформа объединяет две части: клиентский ЛК (подписки, оплаты, профиль) и административную панель для владельца бизнеса (финансы, реклама, клиенты, серверы, бот).',
      },
      {
        heading: 'Технологический стек',
        list: [
          'Backend: Fastify + Prisma + PostgreSQL + Redis',
          'Frontend: Next.js 14 + React + Tailwind',
          'Bot: grammY (Telegram Bot API)',
          'VPN: REMNAWAVE API (управление подписками)',
          'Docker Compose для всех сервисов',
        ],
      },
      {
        heading: 'Роли пользователей',
        list: [
          'USER — обычный клиент, доступ только к ЛК',
          'ADMIN — полный доступ ко всем разделам админки',
          'EDITOR — CRUD транзакций/кампаний/серверов, read-only настройки',
          'INVESTOR — read-only доступ к своей партнёрской карточке',
          'PARTNER — read-only доступ к своей партнёрской карточке',
        ],
      },
    ],
  },

  // ───────── Финансы ─────────
  {
    id: 'dashboard',
    title: 'Дашборд',
    icon: LayoutDashboard,
    category: 'Финансы',
    summary: 'Главная страница админки: KPI, графики, статус VPN-инфраструктуры, последние операции.',
    content: [
      {
        heading: 'Что показывается',
        list: [
          'KPI-карточки: выручка, расходы, прибыль, баланс',
          'График доходов за 30 дней (Area chart)',
          'Тепловая карта ежедневных доходов',
          'Активные подписки, конверсия в оплату',
          'Сводка по партнёрам и их задолженности',
          'Предупреждения по серверам (оплата в ближайшие 7 дней)',
          'Последние 10 транзакций',
          'Прогресс по бизнес-целям (Milestones)',
        ],
      },
      {
        heading: 'Селектор периода',
        text: 'В правом верхнем углу можно выбрать: сегодня / неделя / месяц / год / кастомный диапазон. Все KPI пересчитываются автоматически.',
      },
    ],
  },
  {
    id: 'transactions',
    title: 'Транзакции',
    icon: ArrowLeftRight,
    category: 'Финансы',
    summary: 'Учёт доходов и расходов. Авто-категоризация по ключевым словам, загрузка чеков, привязка к партнёрам.',
    content: [
      {
        heading: 'Создание транзакции',
        list: [
          'Тип: Доход (INCOME) или Расход (EXPENSE)',
          'Дата, сумма, категория, описание',
          'Источник бюджета: компания / инвестиции',
          'Привязка к партнёру (если инвестиционная транзакция)',
          'Возможность прикрепить чек (фото/PDF)',
        ],
      },
      {
        heading: 'Авто-категоризация',
        text: 'Система автоматически подбирает категорию по ключевым словам в описании. Правила настраиваются в разделе «Категории» (AutoTagRule).',
      },
    ],
  },
  {
    id: 'partners',
    title: 'Партнёры и инвесторы',
    icon: Handshake,
    category: 'Финансы',
    summary: 'Управление инвесторами, долями, дивидендами и возвратами инвестиций.',
    content: [
      {
        heading: 'Поля партнёра',
        list: [
          'Имя, контакты, цвет аватара',
          'Сумма инвестиций, доля (%)',
          'История дивидендов и возвратов',
          'Связанные клиенты (VPN-подписки)',
        ],
      },
      {
        heading: 'Доступ INVESTOR / PARTNER',
        text: 'Пользователь с ролью INVESTOR или PARTNER видит в админке только свою карточку: свои инвестиции, дивиденды, подключённых клиентов.',
      },
    ],
  },
  {
    id: 'inkas',
    title: 'Инкассация',
    icon: Wallet,
    category: 'Финансы',
    summary: 'Движение денег между владельцем и партнёрами: дивиденды, возвраты инвестиций, новые вливания.',
    content: [
      {
        heading: 'Типы операций',
        list: [
          'DIVIDEND — выплата дивидендов партнёру',
          'RETURN — возврат части инвестиций',
          'INVESTMENT — новое вливание от партнёра',
        ],
      },
      {
        text: 'Все операции отражаются в финансовом отчёте и влияют на общий баланс компании.',
      },
    ],
  },
  {
    id: 'reports',
    title: 'Отчёты (PDF/Excel)',
    icon: FileText,
    category: 'Финансы',
    summary: 'Экспорт финансовой отчётности в PDF и Excel за любой период.',
    content: [
      {
        heading: 'Форматы',
        list: [
          'PDF — гостиный отчёт с графиками и таблицами',
          'Excel (XLSX) — 3 листа: транзакции, категории, партнёры',
          'Быстрый экспорт: неделя / месяц / год',
        ],
      },
    ],
  },
  {
    id: 'compare',
    title: 'Сравнение периодов',
    icon: BarChart2,
    category: 'Финансы',
    summary: 'Сравнительный анализ двух периодов: KPI, дельты, графики.',
    content: [
      {
        text: 'Выбираешь два диапазона дат — получаешь KPI для каждого, разницу в абсолюте и процентах, графики. Можно экспортировать сравнение в PDF.',
      },
    ],
  },

  // ───────── Маркетинг ─────────
  {
    id: 'marketing',
    title: 'Реклама и UTM',
    icon: Megaphone,
    category: 'Маркетинг',
    summary: 'Рекламные кампании с UTM-трекингом. Измеряем клики, лиды, конверсии, доход, ROI и LTV/CAC.',
    content: [
      {
        heading: 'Создание кампании',
        list: [
          'Канал (Telegram-канал, Youtube, таргет и т.д.)',
          'Формат (пост, интеграция, реклама)',
          'Сумма бюджета, источник (компания/инвестиции)',
          'UTM-метка генерируется автоматически или задаётся вручную',
          'Целевой URL — куда ведёт короткая ссылка',
        ],
      },
      {
        heading: 'Как работает трекинг',
        list: [
          'Система генерирует короткую ссылку вида /go/{код}',
          'При клике — запись в BuhUtmClick и редирект на целевой URL с ?utm={код}',
          'При регистрации/логине из этой ссылки — создаётся BuhUtmLead',
          'При оплате клиентом — лид помечается converted=true и подсчитывается доход',
        ],
      },
      {
        heading: 'Метрики в таблице',
        list: [
          'Клики — сколько раз переходили по короткой ссылке',
          'Лиды — сколько зарегистрировалось',
          'Оплаты — сколько лидов конвертировалось в платящих',
          'Доход — сумма всех оплат этих клиентов (life-time)',
          'ROI — (Доход − Затраты) / Затраты × 100%',
          'LTV/CAC — во сколько раз доход с клиента покрывает стоимость привлечения (≥3 — здорово)',
        ],
      },
      {
        heading: 'Сравнение кампаний',
        text: 'Ставишь чекбоксы на 2+ кампании → нажимаешь «Сравнить» → модалка с бар-чартами по всем метрикам. Лучший показатель зелёный, худший красный.',
      },
      {
        heading: 'Экспорт отчёта',
        text: 'На карточке кампании — кнопки «Скачать Excel» (3 листа: сводка, пользователи, динамика) и «Открыть PDF» (печатная версия с графиками).',
      },
    ],
  },
  {
    id: 'webhook-payments',
    title: 'Webhook-платежи',
    icon: CreditCard,
    category: 'Маркетинг',
    summary: 'Приём платежей от внешних систем через HTTP webhook с API-ключами.',
    content: [
      {
        heading: 'Как работает',
        list: [
          'Создаёшь API-ключ в /admin/webhook-payments',
          'Внешняя система шлёт POST на /api/webhooks/payment-ingest с ключом в payload',
          'Платформа создаёт Transaction (доход), обновляет User (total_paid, payments_count)',
          'Помечает UtmLead как converted=true',
          'Отправляет уведомление в настроенный TG-канал',
        ],
      },
      {
        text: 'Защита от дубликатов через external_id — один и тот же платёж не будет зачислен дважды.',
      },
    ],
  },

  // ───────── VPN ─────────
  {
    id: 'users',
    title: 'Пользователи',
    icon: Users,
    category: 'VPN',
    summary: 'CRM клиентов: контакты, подписки, история оплат, UTM-источник, настройки REMNAWAVE.',
    content: [
      {
        heading: 'Профиль клиента',
        list: [
          'Email, telegram_id, имя/фамилия',
          'Текущий тариф, дата окончания подписки',
          'История всех оплат (total_paid, payments_count)',
          'UTM-источник (откуда пришёл)',
          'Привязанный партнёр (если реф)',
          'Заметки администратора',
        ],
      },
      {
        heading: 'Редактирование',
        text: 'Админ может изменить email/telegram_id прямо из карточки — изменения синхронизируются с REMNAWAVE автоматически.',
      },
    ],
  },
  {
    id: 'tariffs',
    title: 'Тарифы',
    icon: Package,
    category: 'VPN',
    summary: 'Настройка тарифных планов: цена, срок действия, лимиты устройств, trial.',
    content: [
      {
        heading: 'Параметры тарифа',
        list: [
          'Название, описание, цена',
          'Срок действия (дни/месяцы)',
          'Триальный период (для новых пользователей)',
          'Лимит устройств (traffic limit, device limit)',
          'Флаг видимости (скрытые тарифы не показываются)',
        ],
      },
    ],
  },
  {
    id: 'payments',
    title: 'Платежи',
    icon: CreditCard,
    category: 'VPN',
    summary: 'История всех платежей клиентов: статус, сумма, способ, привязка к тарифу.',
    content: [
      {
        heading: 'Статусы',
        list: [
          'PENDING — платёж ожидает подтверждения',
          'PAID — оплачен успешно',
          'FAILED — оплата не прошла',
          'REFUNDED — возврат',
        ],
      },
      {
        heading: 'Провайдеры',
        list: [
          'ЮКасса (YooKassa)',
          'CryptoPay (криптоплатежи)',
          'Webhook (внешние системы через API)',
        ],
      },
    ],
  },
  {
    id: 'infrastructure',
    title: 'Инфраструктура',
    icon: Server,
    category: 'VPN',
    summary: 'VPN-серверы, статус, оплата хостинга, уведомления о продлении.',
    content: [
      {
        heading: 'Учёт серверов',
        list: [
          'Название, IP-адрес, провайдер',
          'Стоимость хостинга в месяц',
          'Дата следующей оплаты',
          'Статус (активен/отключён)',
          'Заметки (логины, конфиги)',
        ],
      },
      {
        text: 'За 7 дней до даты оплаты появляется предупреждение на дашборде и в Telegram-канале.',
      },
    ],
  },
  {
    id: 'instructions',
    title: 'Инструкции',
    icon: BookOpen,
    category: 'VPN',
    summary: 'База знаний для клиентов: инструкции по подключению VPN для разных платформ.',
    content: [
      {
        text: 'Инструкции создаются в админке, показываются в ЛК клиента. Поддержка Markdown, изображений, видео.',
      },
    ],
  },

  // ───────── Коммуникации ─────────
  {
    id: 'news',
    title: 'Новости',
    icon: Newspaper,
    category: 'Коммуникации',
    summary: 'Новости в ЛК клиента: анонсы, обновления, акции.',
    content: [
      { text: 'Публикуются в ЛК клиента и опционально рассылаются через бот.' },
    ],
  },
  {
    id: 'broadcast',
    title: 'Рассылки',
    icon: MessageCircle,
    category: 'Коммуникации',
    summary: 'Массовые рассылки в Telegram: текст, медиа, опросы, кнопки.',
    content: [
      {
        heading: 'Типы рассылок',
        list: [
          'Текст (с Markdown/HTML форматированием)',
          'Медиа (фото, видео, файл)',
          'Опросы (polls)',
          'Inline-кнопки',
        ],
      },
      {
        heading: 'Сегментация',
        text: 'Можно отправлять всем, активным подписчикам, пробникам, неоплатившим — любому сегменту пользователей.',
      },
    ],
  },
  {
    id: 'communications',
    title: 'Воронки',
    icon: MessageCircle,
    category: 'Коммуникации',
    summary: 'Автоматические цепочки сообщений: приветствие, реактивация, допродажи.',
    content: [
      {
        heading: 'Триггеры',
        list: [
          'Регистрация — welcome-серия',
          'Окончание триала — предложение купить',
          'За N дней до окончания подписки — напоминание о продлении',
          'После оплаты — благодарность + апсейл',
          'Неактивность N дней — реактивация',
        ],
      },
    ],
  },
  {
    id: 'promos',
    title: 'Промокоды',
    icon: Tag,
    category: 'Коммуникации',
    summary: 'Скидочные коды: фиксированная скидка / процент / бонусные дни.',
    content: [
      {
        heading: 'Типы',
        list: [
          'FIXED — фикс. скидка (например, 100 ₽)',
          'PERCENT — процент (например, 20%)',
          'BONUS_DAYS — добавить N дней к подписке',
        ],
      },
      {
        heading: 'Ограничения',
        list: [
          'Срок действия (дата начала/окончания)',
          'Макс. использований всего',
          'Макс. использований на 1 пользователя',
          'Только для новых / только для существующих',
        ],
      },
    ],
  },

  // ───────── Система ─────────
  {
    id: 'analytics',
    title: 'Аналитика',
    icon: TrendingUp,
    category: 'Система',
    summary: 'Глубокая аналитика: когортный анализ, retention, LTV, источники трафика.',
    content: [
      {
        heading: 'Метрики',
        list: [
          'MRR / ARR (месячная/годовая выручка)',
          'Churn rate (отток клиентов)',
          'Cohort retention (удержание по когортам)',
          'LTV по каналам привлечения',
          'Конверсия trial → paid',
        ],
      },
    ],
  },
  {
    id: 'bot',
    title: 'Telegram-бот',
    icon: Bot,
    category: 'Система',
    summary: 'Управление ботом: меню, сообщения, команды, админ-функции.',
    content: [
      {
        heading: 'Функции бота для клиентов',
        list: [
          'Регистрация и авторизация через Telegram',
          'Покупка/продление подписки прямо в боте',
          'Получение VPN-конфига и инструкций',
          'Поддержка (чат с админом)',
        ],
      },
      {
        heading: 'Админ-команды (для не-USER ролей)',
        list: [
          '/income {сумма} {описание} — быстрое добавление дохода',
          '/expense {сумма} {описание} — быстрое добавление расхода',
          '/stats — краткая статистика за день',
          '/report — PDF-отчёт за период',
        ],
      },
    ],
  },
  {
    id: 'bot-constructor',
    title: 'Конструктор бота',
    icon: Workflow,
    category: 'Система',
    summary: 'Визуальный редактор флоу бота: блоки, кнопки, переменные, условия.',
    content: [
      {
        heading: 'Возможности',
        list: [
          'Drag-and-drop блоки на холсте',
          'Соединение блоков связями',
          'Кнопки (обычные, inline, цветные)',
          'Переменные и условия ветвления',
          'Интеграция с платежами и CRM',
        ],
      },
    ],
  },
  {
    id: 'proxies',
    title: 'Прокси',
    icon: Wifi,
    category: 'Система',
    summary: 'Управление пулом прокси для обхода блокировок.',
    content: [{ text: 'Ротация, проверка живости, привязка к серверам.' }],
  },
  {
    id: 'landing',
    title: 'Лендинг',
    icon: Globe,
    category: 'Система',
    summary: 'Настройка публичного лендинга (главная страница сайта).',
    content: [
      { text: 'Редактирование hero-блока, преимуществ, тарифов, FAQ, отзывов — всё без деплоя.' },
    ],
  },
  {
    id: 'import',
    title: 'Импорт',
    icon: Upload,
    category: 'Система',
    summary: 'Массовый импорт пользователей, платежей, партнёров из CSV/JSON.',
    content: [
      {
        heading: 'Поддерживаемые форматы',
        list: [
          'CSV (с заголовками колонок)',
          'JSON (массив объектов)',
          'Экспорт из REMNAWAVE',
        ],
      },
    ],
  },
  {
    id: 'settings',
    title: 'Настройки',
    icon: Settings,
    category: 'Система',
    summary: 'Глобальные настройки платформы: компания, валюта, интеграции, уведомления.',
    content: [
      {
        heading: 'Разделы',
        list: [
          'Компания (название, валюта, часовой пояс, начальный баланс)',
          'Telegram (токен бота, каналы уведомлений)',
          'Платежи (ЮКасса, CryptoPay, Webhook)',
          'REMNAWAVE (URL, токен API)',
          'Email/SMTP для уведомлений',
          'Фичефлаги (включение/отключение функций)',
        ],
      },
    ],
  },
]

const CATEGORIES = ['Общее', 'Финансы', 'Маркетинг', 'VPN', 'Коммуникации', 'Система']

export default function WikiPage() {
  const [activeId, setActiveId] = useState<string>('overview')
  const [search, setSearch] = useState('')

  const filteredSections = useMemo(() => {
    if (!search.trim()) return SECTIONS
    const q = search.toLowerCase()
    return SECTIONS.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.summary.toLowerCase().includes(q) ||
      s.content.some(c =>
        c.heading?.toLowerCase().includes(q) ||
        c.text?.toLowerCase().includes(q) ||
        c.list?.some(i => i.toLowerCase().includes(q))
      )
    )
  }, [search])

  const grouped = useMemo(() => {
    const map: Record<string, Section[]> = {}
    filteredSections.forEach(s => {
      if (!map[s.category]) map[s.category] = []
      map[s.category].push(s)
    })
    return map
  }, [filteredSections])

  const active = SECTIONS.find(s => s.id === activeId)

  return (
    <div className="flex gap-6 h-[calc(100vh-140px)]">
      {/* Sidebar */}
      <aside
        className="w-80 shrink-0 rounded-2xl p-4 overflow-y-auto"
        style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
      >
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="w-5 h-5" style={{ color: '#60a5fa' }} />
          <h2 className="font-bold" style={{ color: 'var(--text-primary)' }}>Wiki / Справка</h2>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по разделам..."
            className="glass-input pl-10 pr-3 py-2 text-sm w-full"
          />
        </div>

        {CATEGORIES.map(cat => {
          const items = grouped[cat]
          if (!items || items.length === 0) return null
          return (
            <div key={cat} className="mb-4">
              <div className="text-xs font-semibold uppercase tracking-wider mb-2 px-2" style={{ color: 'var(--text-tertiary)' }}>
                {cat}
              </div>
              <div className="space-y-0.5">
                {items.map(s => {
                  const Icon = s.icon
                  const isActive = s.id === activeId
                  return (
                    <button
                      key={s.id}
                      onClick={() => setActiveId(s.id)}
                      className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-left transition-colors"
                      style={{
                        background: isActive ? 'rgba(96,165,250,0.12)' : 'transparent',
                        color: isActive ? '#60a5fa' : 'var(--text-secondary)',
                      }}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{s.title}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </aside>

      {/* Content */}
      <main
        className="flex-1 rounded-2xl p-8 overflow-y-auto"
        style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
      >
        {active ? (
          <article className="max-w-3xl">
            <div className="flex items-center gap-3 mb-3">
              <active.icon className="w-7 h-7" style={{ color: '#60a5fa' }} />
              <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{active.title}</h1>
            </div>
            <p className="text-base mb-6" style={{ color: 'var(--text-secondary)' }}>
              {active.summary}
            </p>
            <div className="space-y-6">
              {active.content.map((block, i) => (
                <div key={i}>
                  {block.heading && (
                    <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                      {block.heading}
                    </h2>
                  )}
                  {block.text && (
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      {block.text}
                    </p>
                  )}
                  {block.list && (
                    <ul className="space-y-1.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {block.list.map((item, j) => (
                        <li key={j} className="flex gap-2">
                          <span style={{ color: '#60a5fa' }}>•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </article>
        ) : (
          <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-tertiary)' }}>
            <div className="text-center">
              <HelpCircle className="w-12 h-12 mx-auto mb-2 opacity-40" />
              <p>Ничего не найдено</p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
