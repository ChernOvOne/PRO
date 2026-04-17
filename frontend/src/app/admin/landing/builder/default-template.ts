/**
 * Default premium landing template — recreates the original hardcoded
 * landing as editable blocks. Used by the "Загрузить шаблон" button.
 */

interface TemplateBlock {
  type: string
  data: Record<string, any>
}

export const DEFAULT_TEMPLATE: TemplateBlock[] = [
  // ── HERO ──────────────────────────────────────────
  {
    type: 'hero',
    data: {
      badge: '🚀 Быстрый VPN нового поколения',
      title: 'Интернет без границ',
      subtitle: 'VPN на базе протокола VLESS. Обход блокировок, защита данных, максимальная скорость в любой точке мира.',
      ctaText: 'Попробовать бесплатно',
      align: 'center',
      variant: 'center',
      showDecoration: true,
      style: {
        animation: 'fade-up',
        titleGradient: true,
        titleSize: '2xl',
        buttonSize: 'lg',
        buttonHover: 'lift',
      },
    },
  },

  // ── Stats (trust signals) ─────────────────────────
  {
    type: 'stats',
    data: {
      items: [
        { number: '10000+', label: 'Активных клиентов' },
        { number: '30+', label: 'Стран покрытия' },
        { number: '99.9%', label: 'Uptime' },
        { number: '24/7', label: 'Поддержка' },
      ],
      animated: true,
      style: { animation: 'fade-up', animationDelay: 100 },
    },
  },

  // ── Section header: Features ──────────────────────
  {
    type: 'heading',
    data: {
      kicker: 'ВОЗМОЖНОСТИ',
      text: 'Почему выбирают нас',
      subtitle: 'Всё что нужно для быстрого и безопасного интернета — без компромиссов',
      level: 'h2', size: 'xl', align: 'center',
      style: { animation: 'fade-up' },
    },
  },

  // ── Features ──────────────────────────────────────
  {
    type: 'features',
    data: {
      columns: 3,
      variant: 'cards',
      items: [
        { icon: 'shield', title: 'Шифрование', text: 'Военный стандарт AES-256 защищает каждый байт' },
        { icon: 'zap', title: 'Скорость', text: 'Серверы рядом с тобой, плавная работа без обрывов' },
        { icon: 'globe', title: 'Без границ', text: 'Более 30 стран — открывай любые сайты' },
        { icon: 'lock', title: 'Без логов', text: 'Мы не собираем и не продаём твои данные' },
        { icon: 'phone', title: 'Все устройства', text: 'iOS, Android, Windows, macOS, Linux — везде' },
        { icon: 'heart', title: 'Легко настроить', text: 'Подключение за 5 секунд, без привязки карты' },
      ],
      style: {
        animation: 'fade-up',
        staggerChildren: true,
        cardHover: 'lift',
      },
    },
  },

  // ── Divider ───────────────────────────────────────
  { type: 'divider', data: { variant: 'gradient', width: 'normal' } },

  // ── Section header: Tariffs ───────────────────────
  {
    type: 'heading',
    data: {
      kicker: 'ТАРИФЫ',
      text: 'Выберите подходящий план',
      subtitle: 'Оплачивайте только то, что нужно. Без скрытых списаний.',
      level: 'h2', size: 'xl', align: 'center',
      style: { animation: 'fade-up' },
    },
  },

  // ── Tariffs ───────────────────────────────────────
  {
    type: 'tariffs',
    data: {
      tariffIds: [],
      highlightId: '',
      style: {
        animation: 'fade-up',
        staggerChildren: true,
        cardHover: 'lift',
      },
    },
  },

  // ── How it works (steps) ──────────────────────────
  {
    type: 'heading',
    data: {
      kicker: 'КАК НАЧАТЬ',
      text: 'Три простых шага',
      level: 'h2', size: 'xl', align: 'center',
      style: { animation: 'fade-up' },
    },
  },
  {
    type: 'steps',
    data: {
      items: [
        { number: '01', title: 'Регистрация', text: 'Нажмите «Попробовать» и войдите через Telegram или email' },
        { number: '02', title: 'Выбор тарифа', text: 'Или активируйте бесплатный пробный период на 3 дня' },
        { number: '03', title: 'Подключение', text: 'Скопируйте ссылку и добавьте в приложение — за 5 секунд' },
      ],
      style: { animation: 'fade-up', staggerChildren: true },
    },
  },

  // ── Reviews ───────────────────────────────────────
  {
    type: 'heading',
    data: {
      kicker: 'ОТЗЫВЫ',
      text: 'Нам доверяют',
      level: 'h2', size: 'xl', align: 'center',
      style: { animation: 'fade-up' },
    },
  },
  {
    type: 'reviews',
    data: {
      items: [
        { name: 'Алексей', text: 'Отличная скорость! Подключился за минуту, работает стабильно на всех устройствах.', rating: 5 },
        { name: 'Марина', text: 'Служба поддержки помогла с настройкой iPhone. Быстро и понятно — рекомендую.', rating: 5 },
        { name: 'Дмитрий', text: 'Пользуюсь полгода — ни одного обрыва. Приятные цены, нет рекламы.', rating: 5 },
      ],
      style: { animation: 'fade-up', staggerChildren: true, cardHover: 'lift' },
    },
  },

  // ── FAQ ───────────────────────────────────────────
  {
    type: 'heading',
    data: {
      kicker: 'ВОПРОСЫ',
      text: 'Частые вопросы',
      level: 'h2', size: 'xl', align: 'center',
      style: { animation: 'fade-up' },
    },
  },
  {
    type: 'faq',
    data: {
      items: [
        { q: 'Есть ли бесплатный период?', a: 'Да, 3 дня бесплатно без привязки карты. Активируйте в личном кабинете после регистрации.' },
        { q: 'На сколько устройств можно подключить?', a: 'Зависит от тарифа — от 3 до 10 устройств одновременно. Можно переключаться между ними когда удобно.' },
        { q: 'Как оплатить?', a: 'Принимаем карты (Мир, Visa, MasterCard), криптовалюты (BTC, USDT, TON) и электронные кошельки.' },
        { q: 'Работает ли в России?', a: 'Да. Протокол VLESS обходит блокировки и DPI-системы. Специально тестируем каждый сервер под российские условия.' },
        { q: 'Можно ли вернуть деньги?', a: 'Да, в течение 7 дней если сервис вам не подошёл. Без вопросов и формальностей.' },
      ],
      variant: 'boxes',
      style: { animation: 'fade-up' },
    },
  },

  // ── CTA (final) ───────────────────────────────────
  {
    type: 'cta',
    data: {
      title: 'Готовы попробовать?',
      subtitle: 'Первые 3 дня бесплатно — без риска и без привязки карты',
      buttonText: 'Начать сейчас',
      style: { animation: 'fade-up' },
    },
  },
]
