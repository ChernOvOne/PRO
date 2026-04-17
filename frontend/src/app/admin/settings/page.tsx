'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Save, RefreshCw, Loader2, Eye, EyeOff,
  Settings, Globe, CreditCard, MessageCircle,
  Wifi, Mail, Users, Shield, UserCog,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { adminApi } from '@/lib/api'

// ── Types ────────────────────────────────────────────────────

type FieldType = 'text' | 'url' | 'number' | 'password' | 'toggle' | 'textarea' | 'color' | 'select'

interface FieldDef {
  key: string
  label: string
  type: FieldType
  placeholder?: string
  hint?: string
  envKey?: string
  options?: { value: string; label: string }[]
}

interface TabDef {
  id: string
  icon: any
  title: string
  fields: FieldDef[]
  actions?: { label: string; action: string; variant?: 'primary' | 'secondary' }[]
}

// ── Hints ────────────────────────────────────────────────────

const HINTS: Record<string, string> = {
  // General
  app_name: 'Название отображается в шапке ЛК, в письмах, в боте и PDF-отчётах. Меняется мгновенно.',
  app_description: 'Краткое описание для SEO и лендинга.',
  brand_color: 'Основной цвет интерфейса. Используется для кнопок, акцентов и подсветки.',
  brand_color_secondary: 'Дополнительный цвет для градиентов и фонов.',
  default_language: 'Язык по умолчанию для новых пользователей.',
  timezone: 'Часовой пояс для cron-задач, отчётов и рабочих часов воронок.',
  currency: 'Валюта для отображения цен и платежей.',
  currency_symbol: 'Символ валюты: \u20bd, $, \u20ac и т.д.',
  date_format: 'Формат дат в интерфейсе и отчётах.',
  maintenance_mode: 'Включает страницу «Технические работы» для всех кроме админов.',
  maintenance_text: 'Текст который увидят пользователи при включённом режиме обслуживания.',
  maptiler_key: 'API ключ для карты пользователей. Получите бесплатно на cloud.maptiler.com → Account → API keys (100k запросов в месяц бесплатно). После изменения нужен перезапуск сервисов.',

  // Domains
  domain: 'Основной домен проекта. Используется для генерации ссылок. Для изменения также обновите DNS и nginx.',
  api_domain: 'Домен API. По умолчанию совпадает с основным. Для CORS.',
  app_url: 'Полный URL личного кабинета (с https://). Используется в переменной {appUrl} в рассылках.',
  support_url: 'Ссылка на поддержку. Используется в {supportUrl} в письмах и боте.',
  channel_url: 'Ссылка на Telegram-канал. Подставляется в {channelUrl}.',
  bot_url: 'Ссылка на бота (t.me/your_bot). Отображается в ЛК.',
  payment_url: 'URL страницы оплаты. Используется в {paymentUrl}.',

  // Payments
  yukassa_enabled: 'Включить приём платежей через ЮKassa (банковские карты).',
  yukassa_shop_id: 'Shop ID из личного кабинета ЮKassa \u2192 Настройки \u2192 Shop ID. 6-значное число.',
  yukassa_secret: 'Секретный ключ из ЮKassa \u2192 Настройки \u2192 Секретные ключи. Не делитесь им.',
  yukassa_test_mode: 'Тестовый режим: платежи не списываются. Для проверки работоспособности.',
  crypto_enabled: 'Включить оплату криптовалютой через CryptoPay (Telegram).',
  crypto_token: 'API токен из @CryptoBot \u2192 Create App \u2192 API Token.',
  balance_payments_enabled: 'Разрешить оплату подписки с внутреннего баланса ЛК.',
  balance_min: 'Минимальная сумма пополнения баланса.',
  balance_max: 'Максимальная сумма пополнения баланса.',
  payment_min: 'Минимальная сумма платежа. Защита от микроплатежей.',
  payment_max: 'Максимальная сумма платежа. Защита от ошибок ввода.',
  auto_confirm_payments: 'Автоматически подтверждать платежи или ждать ручного подтверждения.',
  notify_admin_payments: 'Отправлять уведомление в Telegram при каждой оплате.',

  // Telegram
  bot_token: 'Токен бота. Получите у @BotFather \u2192 /newbot \u2192 скопируйте токен. Формат: 123456789:ABCdef...',
  bot_username: 'Username бота без @. Например: hideyou_bot',
  bot_welcome_text: 'Текст при первом /start. Поддерживает Markdown и переменные {name}.',
  bot_help_text: 'Текст при /help. Расскажите пользователям что умеет бот.',
  bot_notify_channel_enabled: 'Отправлять уведомления о событиях в Telegram-канал.',
  bot_notify_channel_id: 'Chat ID канала. Узнайте через @RawDataBot \u2014 перешлите сообщение из канала.',
  bot_rate_limit: 'Макс. сообщений в минуту от бота на пользователя. Защита от спама.',

  // REMNAWAVE
  remnawave_url: 'URL панели REMNAWAVE. Пример: https://panel.example.com. Без / в конце.',
  remnawave_token: 'Bearer токен для API. Получите в REMNAWAVE \u2192 Настройки \u2192 API.',
  remnawave_webhook_secret: 'HMAC секрет для верификации webhook\'ов. Сгенерируйте: openssl rand -hex 64',
  remnawave_auto_create: 'Автоматически создавать пользователя в REMNAWAVE при регистрации в ЛК.',
  remnawave_username_prefix: 'Префикс для username в REMNAWAVE. Например: hdy_ \u2192 hdy_user123',

  // Email
  email_enabled: 'Включить отправку email (регистрация, рассылки, воронки).',
  smtp_host: 'SMTP сервер. Gmail: smtp.gmail.com, Yandex: smtp.yandex.ru, Mail.ru: smtp.mail.ru',
  smtp_port: 'Порт SMTP. TLS: 587, SSL: 465. Для Gmail используйте 587.',
  smtp_encryption: 'TLS (рекомендуется) или SSL. Gmail и Яндекс \u2014 TLS.',
  smtp_login: 'Email или логин для SMTP авторизации.',
  smtp_password: 'Пароль или App Password. Для Gmail: myaccount.google.com \u2192 Пароли приложений.',
  smtp_from_email: 'Email отправителя. Должен совпадать с SMTP логином или быть в разрешённых.',
  smtp_from_name: 'Имя отправителя. Отображается получателю, например: HIDEYOU VPN',
  email_default_template: 'Шаблон по умолчанию для email-рассылок.',
  email_footer_html: 'HTML-подпись, добавляемая в конец каждого письма.',

  // Referrals
  referral_enabled: 'Включить реферальную программу. Пользователи получают уникальные ссылки.',
  referral_inviter_bonus_type: 'Тип бонуса пригласившему: бонусные дни, деньги на баланс или скидка.',
  referral_inviter_bonus_value: 'Количество: дней / рублей / процент скидки.',
  referral_inviter_trigger: 'Когда начислять бонус: при регистрации реферала, при первой или каждой оплате.',
  referral_max_monthly: 'Макс. бонусов в месяц на одного пользователя. 0 = без лимита.',
  referral_invitee_bonus_type: 'Бонус для приглашённого (нового пользователя).',
  referral_invitee_bonus_value: 'Количество бонуса для приглашённого.',
  referral_min_payment: 'Минимальная сумма оплаты реферала для начисления бонуса.',
  referral_levels: 'Глубина реферальных уровней. 1 = только прямые, 2 = друзья друзей.',
  referral_percent: '% от каждой оплаты реферала. Начисляется пригласившему на баланс.',
  referral_bind_duration: 'Срок привязки реферала. После истечения бонусы не начисляются.',
  referral_page_text: 'Текст на странице реферальной программы в ЛК.',

  // Security
  jwt_expires_in: 'Срок жизни JWT токена. Формат: 30d, 7d, 24h. После истечения \u2014 повторный логин.',
  max_sessions: 'Макс. одновременных сессий на пользователя. 0 = без лимита.',
  rate_limit_login: 'Попыток логина в минуту с одного IP. Защита от брутфорса.',
  rate_limit_api: 'API запросов в минуту. Защита от DDoS.',
  block_bruteforce: 'Блокировать IP после N неудачных попыток логина.',
  block_threshold: 'Количество неудачных попыток до блокировки.',
  block_duration_minutes: 'Длительность блокировки IP в минутах.',
  admin_2fa_enabled: 'Двухфакторная аутентификация для админов (TOTP).',
  require_email_verification: 'Требовать подтверждение email при регистрации.',
  min_password_length: 'Минимальная длина пароля для регистрации.',
  registration_enabled: 'Разрешить открытую регистрацию. Выключите для приглашений.',
  registration_telegram: 'Разрешить регистрацию через Telegram.',
  registration_email: 'Разрешить регистрацию через email + пароль.',
}

// ── DB key → .env key (for showing env badge) ────────────────
const DB_TO_ENV: Record<string, string> = {
  app_name: 'APP_NAME',
  app_url: 'APP_URL',
  domain: 'DOMAIN',
  api_domain: 'API_DOMAIN',
  bot_token: 'BOT_TOKEN',
  bot_username: 'BOT_USERNAME',
  yukassa_shop_id: 'YUKASSA_SHOP_ID',
  yukassa_secret: 'YUKASSA_SECRET_KEY',
  yukassa_test_mode: 'YUKASSA_TEST_MODE',
  crypto_token: 'CRYPTO_PAY_TOKEN',
  remnawave_url: 'REMNAWAVE_API_URL',
  remnawave_token: 'REMNAWAVE_API_TOKEN',
  remnawave_webhook_secret: 'REMNAWAVE_WEBHOOK_SECRET',
  smtp_host: 'SMTP_HOST',
  smtp_port: 'SMTP_PORT',
  smtp_login: 'SMTP_USER',
  smtp_password: 'SMTP_PASS',
  smtp_from_email: 'SMTP_FROM',
  smtp_from_name: 'SMTP_FROM_NAME',
  jwt_expires_in: 'JWT_EXPIRES_IN',
  support_url: 'SUPPORT_URL',
  channel_url: 'CHANNEL_URL',
  currency: 'CURRENCY',
  currency_symbol: 'CURRENCY_SYMBOL',
  timezone: 'TIMEZONE',
}

// ── Tab definitions (no "subscriptions" tab) ─────────────────

const TABS: TabDef[] = [
  {
    id: 'general', icon: Settings, title: 'Общие',
    fields: [
      { key: 'app_name', label: 'Название проекта', type: 'text', placeholder: 'HIDEYOU' },
      { key: 'app_description', label: 'Описание', type: 'text', placeholder: 'VPN-платформа' },
      { key: 'app_logo_url', label: 'URL логотипа (опц.)', type: 'url', placeholder: 'https://example.com/logo.svg' },
      { key: 'app_favicon_url', label: 'URL favicon (опц.)', type: 'url', placeholder: 'https://example.com/favicon.ico' },
      { key: 'footer_text', label: 'Текст футера', type: 'text', placeholder: 'HIDEYOU VPN' },
      { key: 'terms_url', label: 'URL условий', type: 'url', placeholder: '/terms' },
      { key: 'privacy_url', label: 'URL политики', type: 'url', placeholder: '/privacy' },
      { key: 'brand_color', label: 'Основной цвет бренда', type: 'color' },
      { key: 'brand_color_secondary', label: 'Дополнительный цвет', type: 'color' },
      { key: 'default_language', label: 'Язык', type: 'select', options: [
        { value: 'ru', label: 'Русский' }, { value: 'en', label: 'English' },
      ]},
      { key: 'timezone', label: 'Часовой пояс', type: 'select', options: [
        { value: 'Europe/Moscow', label: 'Москва (UTC+3)' },
        { value: 'Europe/Kiev', label: 'Киев (UTC+2)' },
        { value: 'Asia/Almaty', label: 'Алматы (UTC+6)' },
        { value: 'UTC', label: 'UTC' },
        { value: 'Europe/London', label: 'Лондон (UTC+0)' },
        { value: 'America/New_York', label: 'Нью-Йорк (UTC-5)' },
      ]},
      { key: 'currency', label: 'Валюта', type: 'select', options: [
        { value: 'RUB', label: 'RUB' }, { value: 'USD', label: 'USD' }, { value: 'EUR', label: 'EUR' },
      ]},
      { key: 'currency_symbol', label: 'Символ валюты', type: 'text', placeholder: '\u20bd' },
      { key: 'date_format', label: 'Формат даты', type: 'select', options: [
        { value: 'DD.MM.YYYY', label: 'DD.MM.YYYY' },
        { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
        { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
      ]},
      { key: 'maintenance_mode', label: 'Режим обслуживания', type: 'toggle' },
      { key: 'maintenance_text', label: 'Текст обслуживания', type: 'textarea', placeholder: 'Ведутся технические работы...' },
      { key: 'maptiler_key', label: 'MapTiler API Key', type: 'password', placeholder: 'ffGUM...', envKey: 'MAPTILER_KEY' },
    ],
  },
  {
    id: 'domains', icon: Globe, title: 'Домены',
    fields: [
      { key: 'domain', label: 'Основной домен', type: 'url', placeholder: 'hideyou.top' },
      { key: 'api_domain', label: 'API домен', type: 'url', placeholder: 'api.hideyou.top' },
      { key: 'app_url', label: 'URL ЛК', type: 'url', placeholder: 'https://lk.hideyou.top' },
      { key: 'support_url', label: 'URL поддержки', type: 'url', placeholder: 'https://t.me/hideyou_support' },
      { key: 'channel_url', label: 'Telegram-канал', type: 'url', placeholder: 'https://t.me/hideyouvpn' },
      { key: 'bot_url', label: 'Ссылка на бота', type: 'url', placeholder: 'https://t.me/hideyou_bot' },
      { key: 'payment_url', label: 'URL оплаты', type: 'url', placeholder: 'https://pay.hideyou.top' },
    ],
  },
  {
    id: 'payments', icon: CreditCard, title: 'Платежи',
    fields: [
      { key: 'yukassa_enabled', label: 'ЮKassa включена', type: 'toggle' },
      { key: 'yukassa_shop_id', label: 'ЮKassa Shop ID', type: 'text', placeholder: '123456' },
      { key: 'yukassa_secret', label: 'ЮKassa Secret Key', type: 'password', placeholder: 'live_...' },
      { key: 'yukassa_test_mode', label: 'ЮKassa тестовый режим', type: 'toggle' },
      { key: 'crypto_enabled', label: 'CryptoPay включён', type: 'toggle' },
      { key: 'crypto_token', label: 'CryptoPay токен', type: 'password', placeholder: 'Token...' },
      { key: 'balance_payments_enabled', label: 'Оплата с баланса', type: 'toggle' },
      { key: 'balance_min', label: 'Мин. сумма пополнения', type: 'number', placeholder: '100' },
      { key: 'balance_max', label: 'Макс. сумма пополнения', type: 'number', placeholder: '50000' },
      { key: 'payment_min', label: 'Мин. платёж', type: 'number', placeholder: '50' },
      { key: 'payment_max', label: 'Макс. платёж', type: 'number', placeholder: '100000' },
      { key: 'auto_confirm_payments', label: 'Автоподтверждение платежей', type: 'toggle' },
      { key: 'notify_admin_payments', label: 'Уведомлять админа о платежах', type: 'toggle' },
    ],
  },
  {
    id: 'telegram', icon: MessageCircle, title: 'Telegram',
    fields: [
      { key: 'bot_token', label: 'Токен бота', type: 'password', placeholder: '123456:ABC-...' },
      { key: 'bot_username', label: 'Username бота', type: 'text', placeholder: 'hideyou_bot' },
      { key: 'bot_welcome_text', label: 'Приветственное сообщение', type: 'textarea', placeholder: 'Добро пожаловать!' },
      { key: 'bot_help_text', label: 'Текст помощи', type: 'textarea', placeholder: 'Список команд...' },
      { key: 'bot_notify_channel_enabled', label: 'Уведомления в канал', type: 'toggle' },
      { key: 'bot_notify_channel_id', label: 'ID канала уведомлений', type: 'text', placeholder: '-1001234567890' },
      { key: 'bot_rate_limit', label: 'Лимит сообщений/мин', type: 'number', placeholder: '30' },
    ],
  },
  {
    id: 'remnawave', icon: Wifi, title: 'REMNAWAVE',
    fields: [
      { key: 'remnawave_url', label: 'URL панели', type: 'url', placeholder: 'https://remnawave.example.com' },
      { key: 'remnawave_token', label: 'API токен', type: 'password', placeholder: 'Token...' },
      { key: 'remnawave_webhook_secret', label: 'Webhook секрет', type: 'password', placeholder: 'secret...' },
      { key: 'remnawave_auto_create', label: 'Авто-создание пользователей', type: 'toggle' },
      { key: 'remnawave_username_prefix', label: 'Префикс username', type: 'text', placeholder: 'hy_' },
    ],
    actions: [
      { label: 'Проверить соединение', action: 'test-remnawave', variant: 'secondary' },
    ],
  },
  {
    id: 'email', icon: Mail, title: 'Email',
    fields: [
      { key: 'email_enabled', label: 'Email включён', type: 'toggle' },
      { key: 'smtp_host', label: 'SMTP хост', type: 'text', placeholder: 'smtp.yandex.ru' },
      { key: 'smtp_port', label: 'SMTP порт', type: 'number', placeholder: '587' },
      { key: 'smtp_encryption', label: 'Шифрование', type: 'select', options: [
        { value: 'tls', label: 'TLS' }, { value: 'ssl', label: 'SSL' }, { value: 'none', label: 'Нет' },
      ]},
      { key: 'smtp_login', label: 'SMTP логин', type: 'text', placeholder: 'noreply@example.com' },
      { key: 'smtp_password', label: 'SMTP пароль', type: 'password', placeholder: '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' },
      { key: 'smtp_from_email', label: 'Email отправителя', type: 'text', placeholder: 'noreply@example.com' },
      { key: 'smtp_from_name', label: 'Имя отправителя', type: 'text', placeholder: 'HIDEYOU PRO' },
      { key: 'email_default_template', label: 'Шаблон по умолчанию', type: 'textarea', placeholder: '<html>...</html>' },
      { key: 'email_footer_html', label: 'Подпись (HTML)', type: 'textarea', placeholder: '<p>С уважением, команда HIDEYOU</p>' },
    ],
    actions: [
      { label: 'Тестовое письмо', action: 'test-email', variant: 'secondary' },
    ],
  },
  {
    id: 'referrals', icon: Users, title: 'Рефералы',
    fields: [
      { key: 'referral_enabled', label: 'Реферальная программа', type: 'toggle' },
      { key: 'referral_inviter_bonus_type', label: 'Бонус пригласившему (тип)', type: 'select', options: [
        { value: 'days', label: 'Дни' }, { value: 'balance', label: 'Баланс' }, { value: 'discount', label: 'Скидка' },
      ]},
      { key: 'referral_inviter_bonus_value', label: 'Бонус пригласившему (кол-во)', type: 'number', placeholder: '30' },
      { key: 'referral_inviter_trigger', label: 'Когда начислять', type: 'select', options: [
        { value: 'registration', label: 'При регистрации' },
        { value: 'first_payment', label: 'При первой оплате' },
        { value: 'each_payment', label: 'При каждой оплате' },
      ]},
      { key: 'referral_max_monthly', label: 'Макс. бонусов/мес', type: 'number', placeholder: '10' },
      { key: 'referral_invitee_bonus_type', label: 'Бонус приглашённому (тип)', type: 'select', options: [
        { value: 'days', label: 'Дни' }, { value: 'balance', label: 'Баланс' }, { value: 'discount', label: 'Скидка' },
      ]},
      { key: 'referral_invitee_bonus_value', label: 'Бонус приглашённому (кол-во)', type: 'number', placeholder: '7' },
      { key: 'referral_min_payment', label: 'Мин. оплата для бонуса', type: 'number', placeholder: '100' },
      { key: 'referral_levels', label: 'Уровни рефералов', type: 'number', placeholder: '1' },
      { key: 'referral_percent', label: '% от оплат реферала', type: 'number', placeholder: '10' },
      { key: 'referral_bind_duration', label: 'Срок привязки (дней)', type: 'number', placeholder: '365' },
      { key: 'referral_page_text', label: 'Текст на странице рефералов', type: 'textarea', placeholder: 'Приглашайте друзей и получайте бонусы!' },
    ],
  },
  {
    id: 'security', icon: Shield, title: 'Безопасность',
    fields: [
      { key: 'jwt_expires_in', label: 'Срок JWT (напр. 7d)', type: 'text', placeholder: '7d' },
      { key: 'max_sessions', label: 'Макс. сессий', type: 'number', placeholder: '5' },
      { key: 'rate_limit_login', label: 'Rate-limit логин (запросов/мин)', type: 'number', placeholder: '5' },
      { key: 'rate_limit_api', label: 'Rate-limit API (запросов/мин)', type: 'number', placeholder: '60' },
      { key: 'block_bruteforce', label: 'Блокировка брутфорса', type: 'toggle' },
      { key: 'block_threshold', label: 'Порог блокировки (попыток)', type: 'number', placeholder: '10' },
      { key: 'block_duration_minutes', label: 'Время блокировки (мин)', type: 'number', placeholder: '30' },
      { key: 'admin_2fa_enabled', label: '2FA для админов', type: 'toggle' },
      { key: 'require_email_verification', label: 'Верификация email', type: 'toggle' },
      { key: 'min_password_length', label: 'Мин. длина пароля', type: 'number', placeholder: '8' },
      { key: 'registration_enabled', label: 'Регистрация открыта', type: 'toggle' },
      { key: 'registration_telegram', label: 'Регистрация через Telegram', type: 'toggle' },
      { key: 'registration_email', label: 'Регистрация через Email', type: 'toggle' },
    ],
  },
  {
    id: 'roles', icon: UserCog, title: 'Роли',
    fields: [], // handled by custom render
  },
]

// Inject hints and envKey into field definitions
for (const tab of TABS) {
  for (const field of tab.fields) {
    if (!field.hint && HINTS[field.key]) {
      field.hint = HINTS[field.key]
    }
    if (DB_TO_ENV[field.key]) {
      field.envKey = DB_TO_ENV[field.key]
    }
  }
}

// ── Roles config ─────────────────────────────────────────────

const ROLES = ['USER', 'ADMIN', 'EDITOR', 'INVESTOR', 'PARTNER'] as const
const ROLE_LABELS: Record<string, string> = {
  USER: 'Пользователь', ADMIN: 'Администратор', EDITOR: 'Редактор',
  INVESTOR: 'Инвестор', PARTNER: 'Партнёр',
}
const SECTIONS_ACCESS = [
  'dashboard', 'users', 'tariffs', 'payments', 'settings',
  'news', 'instructions', 'proxies', 'promos', 'bot',
  'funnels', 'broadcast', 'buhgalteria', 'reports',
]
const SECTION_LABELS: Record<string, string> = {
  dashboard: 'Дашборд', users: 'Пользователи', tariffs: 'Тарифы',
  payments: 'Платежи', settings: 'Настройки', news: 'Новости',
  instructions: 'Инструкции', proxies: 'Прокси', promos: 'Промокоды',
  bot: 'Бот', funnels: 'Воронки', broadcast: 'Рассылки',
  buhgalteria: 'Бухгалтерия', reports: 'Отчёты',
}

// ── Toggle component ─────────────────────────────────────────

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} type="button"
            className="relative w-11 h-6 rounded-full transition-all duration-300 flex-shrink-0"
            style={{
              background: checked ? 'var(--accent-1)' : 'rgba(255,255,255,0.08)',
            }}>
      <span className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-300"
            style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }} />
    </button>
  )
}

// ── Password field component ─────────────────────────────────

function PasswordField({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        className="glass-input text-sm w-full pr-10 font-mono"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      <button type="button" onClick={() => setShow(!show)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-white/5 transition-all"
              style={{ color: 'var(--text-tertiary)' }}>
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────

export default function AdminSettings() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [original, setOriginal] = useState<Record<string, string>>({})
  const [envStatus, setEnvStatus] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('general')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // For roles tab
  const [adminUsers, setAdminUsers] = useState<any[]>([])
  const [adminsLoading, setAdminsLoading] = useState(false)

  const isDirty = JSON.stringify(settings) !== JSON.stringify(original)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [data, env] = await Promise.all([
        adminApi.getSettings(),
        adminApi.envStatus().catch(() => ({})),
      ])
      setSettings(data)
      setOriginal(data)
      setEnvStatus(env)
    } catch {
      toast.error('Ошибка загрузки настроек')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Load admins when roles tab active
  useEffect(() => {
    if (activeTab === 'roles') {
      setAdminsLoading(true)
      adminApi.users({ limit: 100 })
        .then(res => {
          setAdminUsers(res.users.filter((u: any) => u.role && u.role !== 'USER'))
        })
        .catch(() => {})
        .finally(() => setAdminsLoading(false))
    }
  }, [activeTab])

  const update = (key: string, value: string) => {
    setSettings(s => ({ ...s, [key]: value }))
  }

  const save = async () => {
    setSaving(true)
    try {
      const changed: { key: string; value: string }[] = []
      for (const [key, value] of Object.entries(settings)) {
        if (value !== original[key]) {
          changed.push({ key, value })
        }
      }
      if (changed.length === 0) {
        toast.success('Нет изменений')
        setSaving(false)
        return
      }
      await adminApi.saveSettings(changed)
      setOriginal({ ...settings })
      toast.success('Настройки сохранены и записаны в .env')
      // Refresh env status
      adminApi.envStatus().then(setEnvStatus).catch(() => {})
    } catch {
      toast.error('Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setSettings({ ...original })
  }

  const handleAction = async (action: string) => {
    setActionLoading(action)
    try {
      let result: any
      if (action === 'test-email') {
        result = await adminApi.testEmail()
      } else if (action === 'test-remnawave') {
        result = await adminApi.testRemnawave()
      }
      if (result?.ok) {
        toast.success(result.message || 'Успешно!')
      } else {
        toast.error(result?.error || 'Ошибка')
      }
    } catch (err: any) {
      toast.error(err.message || 'Ошибка')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRestart = async () => {
    if (!confirm('Перезапустить backend? Сервис будет недоступен 5-10 секунд.')) return
    try {
      await adminApi.restartServices()
      toast.success('Перезапуск запланирован. Страница обновится через 10 секунд.')
      setTimeout(() => window.location.reload(), 10000)
    } catch {
      toast.error('Ошибка перезапуска')
    }
  }

  const changeUserRole = async (userId: string, newRole: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/profile`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      })
      if (!res.ok) throw new Error('Ошибка')
      toast.success('Роль изменена')
      // Reload admins
      const data = await adminApi.users({ limit: 100 })
      setAdminUsers(data.users.filter((u: any) => u.role && u.role !== 'USER'))
    } catch {
      toast.error('Ошибка изменения роли')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--text-tertiary)' }} />
      </div>
    )
  }

  const currentTab = TABS.find(t => t.id === activeTab) || TABS[0]

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Настройки</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Параметры платформы</p>
        </div>
      </div>

      {/* Layout: tabs + content */}
      <div className="settings-layout" style={{ display: 'flex', gap: '1rem', minHeight: 600 }}>
        {/* Vertical tabs — desktop, horizontal — mobile */}
        <nav className="settings-tabs" style={{
          width: 220,
          flexShrink: 0,
          borderRadius: 16,
          padding: '8px',
          background: 'var(--glass-bg)',
          border: '1px solid var(--glass-border)',
          backdropFilter: 'blur(20px)',
        }}>
          {TABS.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all text-left"
                style={{
                  background: isActive ? 'rgba(83,74,183,0.15)' : 'transparent',
                  color: isActive ? '#8B7BF7' : 'var(--text-secondary)',
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{tab.title}</span>
              </button>
            )
          })}
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="glass-card" style={{ minHeight: 500 }}>
            {/* Tab header */}
            <div className="flex items-center gap-3 pb-4 mb-4" style={{ borderBottom: '1px solid var(--glass-border)' }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                   style={{ background: 'rgba(83,74,183,0.1)' }}>
                {(() => { const I = currentTab.icon; return <I className="w-5 h-5" style={{ color: '#8B7BF7' }} /> })()}
              </div>
              <h2 className="text-lg font-semibold">{currentTab.title}</h2>
            </div>

            {/* Fields */}
            {currentTab.id === 'roles' ? (
              <RolesTab
                settings={settings}
                update={update}
                adminUsers={adminUsers}
                adminsLoading={adminsLoading}
                changeUserRole={changeUserRole}
              />
            ) : (
              <div className="space-y-4">
                {currentTab.fields.map(field => (
                  <SettingField
                    key={field.key}
                    field={field}
                    value={settings[field.key] || ''}
                    onChange={(v) => update(field.key, v)}
                    envValue={field.envKey ? envStatus[field.envKey] : undefined}
                  />
                ))}

                {/* Action buttons */}
                {currentTab.actions && currentTab.actions.length > 0 && (
                  <div className="flex gap-2 pt-4" style={{ borderTop: '1px solid var(--glass-border)' }}>
                    {currentTab.actions.map(action => (
                      <button
                        key={action.action}
                        onClick={() => handleAction(action.action)}
                        disabled={actionLoading === action.action}
                        className={action.variant === 'primary' ? 'btn-primary' : 'btn-secondary'}
                        style={{ fontSize: 13 }}
                      >
                        {actionLoading === action.action && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="sticky bottom-0 z-10 p-4 flex items-center justify-between gap-3 rounded-2xl"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', boxShadow: '0 -4px 20px rgba(0,0,0,0.2)' }}>

        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
          {isDirty ? (
            <span style={{ color: '#fbbf24' }}>● Есть несохранённые изменения</span>
          ) : (
            <span style={{ color: '#34d399' }}>● Всё сохранено</span>
          )}
        </div>

        <div className="flex gap-2">
          {isDirty && (
            <button onClick={reset} className="px-4 py-2 rounded-xl text-sm"
              style={{ background: 'var(--glass-bg)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)' }}>
              Отменить
            </button>
          )}
          <button onClick={save} disabled={!isDirty || saving}
            className="px-4 py-2 rounded-xl text-sm font-medium inline-flex items-center gap-2"
            style={{ background: isDirty ? 'var(--accent-1)' : 'var(--glass-bg)', color: isDirty ? '#fff' : 'var(--text-tertiary)' }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Сохранить
          </button>
          <button onClick={handleRestart}
            className="px-4 py-2 rounded-xl text-sm font-medium inline-flex items-center gap-2"
            style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
            <RefreshCw className="w-4 h-4" />
            Перезапустить
          </button>
        </div>
      </div>

      {/* Responsive styles */}
      <style>{`
        @media (max-width: 768px) {
          .settings-layout {
            flex-direction: column !important;
          }
          .settings-tabs {
            width: 100% !important;
            display: flex !important;
            overflow-x: auto !important;
            gap: 2px;
            padding: 4px !important;
          }
          .settings-tabs button {
            white-space: nowrap;
            flex-shrink: 0;
            padding: 8px 12px !important;
          }
        }
      `}</style>
    </div>
  )
}

// ── Setting field with hint + env badge ──────────────────────

function SettingField({ field, value, onChange, envValue }: {
  field: FieldDef; value: string; onChange: (v: string) => void; envValue?: string
}) {
  const [showHint, setShowHint] = useState(false)
  const hint = field.hint

  const labelRow = (
    <div className="flex items-center gap-2 flex-wrap">
      <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{field.label}</label>
      {hint && (
        <button onClick={() => setShowHint(!showHint)}
          className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] transition-colors flex-shrink-0"
          style={{
            background: showHint ? 'rgba(83,74,183,0.13)' : 'var(--glass-bg)',
            color: showHint ? 'var(--accent-1)' : 'var(--text-tertiary)',
            border: '1px solid var(--glass-border)',
          }}
          type="button">
          ?
        </button>
      )}
      {field.envKey && envValue && envValue !== '\u2014' && (
        <span className="text-[11px] font-mono px-1.5 py-0.5 rounded"
          style={{ background: 'var(--glass-bg)', color: 'var(--text-tertiary)' }}>
          .env: {envValue}
        </span>
      )}
    </div>
  )

  const hintBlock = showHint && hint ? (
    <div className="text-[12px] px-3 py-2 rounded-lg"
      style={{ background: 'rgba(83,74,183,0.08)', color: 'var(--text-secondary)', border: '1px solid rgba(83,74,183,0.15)' }}>
      {hint}
    </div>
  ) : null

  if (field.type === 'toggle') {
    return (
      <div className="space-y-1.5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            {labelRow}
            {hintBlock}
          </div>
          <ToggleSwitch
            checked={value === 'true'}
            onChange={v => onChange(String(v))}
          />
        </div>
      </div>
    )
  }

  if (field.type === 'textarea') {
    return (
      <div className="space-y-1.5">
        {labelRow}
        {hintBlock}
        <textarea
          className="glass-input min-h-[90px] text-sm w-full"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
        />
      </div>
    )
  }

  if (field.type === 'password') {
    return (
      <div className="space-y-1.5">
        {labelRow}
        {hintBlock}
        <PasswordField value={value} onChange={onChange} placeholder={field.placeholder} />
      </div>
    )
  }

  if (field.type === 'color') {
    return (
      <div className="space-y-1.5">
        {labelRow}
        {hintBlock}
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={value || 'var(--accent-1)'}
            onChange={e => onChange(e.target.value)}
            className="w-10 h-10 rounded-lg cursor-pointer border-0"
            style={{ background: 'transparent' }}
          />
          <input
            type="text"
            className="glass-input text-sm flex-1 font-mono"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="var(--accent-1)"
          />
        </div>
      </div>
    )
  }

  if (field.type === 'select' && field.options) {
    return (
      <div className="space-y-1.5">
        {labelRow}
        {hintBlock}
        <select
          className="glass-input text-sm w-full"
          value={value}
          onChange={e => onChange(e.target.value)}
        >
          <option value="">— Выберите —</option>
          {field.options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    )
  }

  // text, url, number
  return (
    <div className="space-y-1.5">
      {labelRow}
      {hintBlock}
      <input
        type={field.type}
        className="glass-input text-sm w-full"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={field.placeholder}
      />
    </div>
  )
}

// ── Roles tab ────────────────────────────────────────────────

function RolesTab({ settings, update, adminUsers, adminsLoading, changeUserRole }: {
  settings: Record<string, string>
  update: (key: string, value: string) => void
  adminUsers: any[]
  adminsLoading: boolean
  changeUserRole: (userId: string, role: string) => void
}) {
  const getPermissions = (role: string): string[] => {
    try {
      return JSON.parse(settings[`role_permissions_${role}`] || '[]')
    } catch { return [] }
  }

  const togglePermission = (role: string, section: string) => {
    const perms = getPermissions(role)
    const next = perms.includes(section)
      ? perms.filter(s => s !== section)
      : [...perms, section]
    update(`role_permissions_${role}`, JSON.stringify(next))
  }

  return (
    <div className="space-y-6">
      {/* Permissions table */}
      <div>
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Права доступа по ролям</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr>
                <th className="text-left p-2 font-medium" style={{ color: 'var(--text-tertiary)', minWidth: 120 }}>Раздел</th>
                {ROLES.map(r => (
                  <th key={r} className="p-2 font-medium text-center" style={{ color: 'var(--text-tertiary)', minWidth: 80 }}>
                    {ROLE_LABELS[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SECTIONS_ACCESS.map(section => (
                <tr key={section} className="border-t" style={{ borderColor: 'var(--glass-border)' }}>
                  <td className="p-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {SECTION_LABELS[section] || section}
                  </td>
                  {ROLES.map(role => {
                    const perms = getPermissions(role)
                    const checked = role === 'ADMIN' || perms.includes(section)
                    return (
                      <td key={role} className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={role === 'ADMIN'}
                          onChange={() => togglePermission(role, section)}
                          className="w-4 h-4 rounded accent-[var(--accent-1)]"
                          style={{ cursor: role === 'ADMIN' ? 'not-allowed' : 'pointer' }}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Admin users list */}
      <div>
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Администраторы и роли</h3>
        {adminsLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-tertiary)' }} />
          </div>
        ) : adminUsers.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Нет пользователей с ролями</p>
        ) : (
          <div className="space-y-2">
            {adminUsers.map(user => (
              <div key={user.id} className="flex items-center justify-between p-3 rounded-xl"
                   style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0"
                       style={{ background: 'rgba(83,74,183,0.1)', color: '#8B7BF7' }}>
                    {(user.telegramName || user.email || 'U')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {user.telegramName || user.email?.split('@')[0] || `ID: ${user.id.slice(0,8)}`}
                    </p>
                    <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                      {user.email && <span>{user.email}</span>}
                      {user.telegramId && <span>TG: {user.telegramId}</span>}
                    </div>
                  </div>
                </div>
                <select
                  className="glass-input text-xs py-1.5 px-2"
                  value={user.role || 'USER'}
                  onChange={e => changeUserRole(user.id, e.target.value)}
                  style={{ width: 130 }}
                >
                  {ROLES.map(r => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
