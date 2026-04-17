/**
 * HIDEYOU BOT — полная пересборка нод конструктора.
 *
 * Единый источник правды: все UX-потоки бота — здесь.
 * Hardcoded в bot/index.ts — только оплаты (engine:tariff:*, engine:pay:*),
 * admin-команды (/income, /expense) и служебные notification helpers.
 *
 * Структура покрывает все функции веб-ЛК:
 *   - Онбординг (5 сценариев)
 *   - Главное меню
 *   - Подписка (статус, URL, обновление, revoke)
 *   - Тарифы и оплаты
 *   - Инструкции по OS
 *   - Рефералы
 *   - Баланс + пополнение
 *   - Промокоды
 *   - Поддержка (создание тикета, FAQ)
 *   - Email и пароль от веб-ЛК
 *   - Профиль (email, TG, logout)
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ── Types ──────────────────────────────────────────────────────
type BlockRef = string

interface BlockDef {
  ref: BlockRef
  name: string
  group: string
  type: 'MESSAGE' | 'CONDITION' | 'ACTION' | 'INPUT' | 'DELAY' | 'SPLIT' |
        'REDIRECT' | 'PAYMENT' | 'HTTP' | 'EMAIL' | 'NOTIFY_ADMIN' |
        'FUNNEL' | 'TARIFF_LIST' | 'PAYMENT_SUCCESS' | 'PAYMENT_FAIL' | 'PROMO_ACTIVATE'
  posX: number
  posY: number
  text?: string
  parseMode?: string

  next?: BlockRef
  nextTrue?: BlockRef
  nextFalse?: BlockRef

  conditionType?: string
  conditionValue?: string
  conditions?: any

  actionType?: string
  actionValue?: string

  inputPrompt?: string
  inputVar?: string
  inputValidation?: string

  buttons?: ButtonDef[]
}

interface ButtonDef {
  label: string
  type: 'block' | 'url' | 'webapp' | 'copy_text'
  toRef?: BlockRef
  url?: string
  copyText?: string
  row?: number
  col?: number
  style?: 'primary' | 'success' | 'danger'
}

interface TriggerDef {
  type: 'command' | 'text' | 'callback' | 'event'
  value: string
  toRef: BlockRef
  priority?: number
}

// ─────────────────────────────────────────────────────────────
// GROUPS
// ─────────────────────────────────────────────────────────────
const GROUPS = [
  { name: '0. Точка входа',      icon: '🚀', sortOrder: 5 },
  { name: '1. Онбординг',        icon: '🚪', sortOrder: 10 },
  { name: '2. Главное меню',     icon: '🏠', sortOrder: 20 },
  { name: '3. Подписка',         icon: '🔑', sortOrder: 30 },
  { name: '4. Тарифы и оплата',  icon: '💳', sortOrder: 40 },
  { name: '5. Инструкции',       icon: '📱', sortOrder: 50 },
  { name: '6. Рефералы',         icon: '👥', sortOrder: 60 },
  { name: '7. Баланс',           icon: '💰', sortOrder: 70 },
  { name: '8. Промокод',         icon: '🎟', sortOrder: 80 },
  { name: '9. Поддержка',        icon: '🆘', sortOrder: 90 },
  { name: '10. Email и пароль',  icon: '📧', sortOrder: 100 },
  { name: '11. Профиль',         icon: '⚙️', sortOrder: 110 },
  { name: '12. Исходы оплаты',   icon: '✅', sortOrder: 120 },
]

// ─────────────────────────────────────────────────────────────
// BLOCKS
// ─────────────────────────────────────────────────────────────
const BLOCKS: BlockDef[] = [

  // ═══════════════════════════════════════════════════════════
  // 0. ENTRY POINT — splash для новых + /start для существующих
  // ═══════════════════════════════════════════════════════════

  {
    ref: 'splash_new_user',
    name: '🚀 Splash для новых юзеров',
    group: '0. Точка входа',
    type: 'MESSAGE',
    posX: 100, posY: 50,
    text: '🛡 *HIDEYOU VPN*\n\nБыстрый, стабильный и приватный VPN.\nБез автопродления, без скрытых платежей.\nРаботает в любой точке мира 🌍\n\n🎁 Попробуйте *{trialDays} дня бесплатно* — без привязки карты и обязательств.\n\nНажмите кнопку ниже и через 5 секунд у вас будет активный VPN:',
    buttons: [
      { label: '🎁 Попробовать бесплатно', type: 'block', toRef: 'trial_activate', row: 0, style: 'success' },
    ],
  },

  {
    ref: 'start_sync',
    name: '🔄 Sync подписки из RW',
    group: '0. Точка входа',
    type: 'ACTION',
    actionType: 'refresh_subscription',
    posX: 500, posY: 50,
    next: 'migration_check',
  },
  {
    ref: 'migration_check',
    name: 'Видел ли миграцию?',
    group: '0. Точка входа',
    type: 'CONDITION',
    conditionType: 'has_var',
    conditionValue: 'seen_migration',
    posX: 500, posY: 170,
    nextTrue: 'start_router',
    nextFalse: 'migration_banner',
  },
  {
    ref: 'migration_banner',
    name: '🔄 Миграционный баннер',
    group: '0. Точка входа',
    type: 'MESSAGE',
    posX: 800, posY: 170,
    text: '🔄 *Бот обновился!*\n\nВсе подписки, оплаты и история — на месте.\nНовое меню удобнее старого, попробуйте 👇',
    buttons: [
      { label: '🏠 Главное меню', type: 'block', toRef: 'migration_mark_seen', row: 0, style: 'success' },
    ],
  },
  {
    ref: 'migration_mark_seen',
    name: 'Отметить миграцию виденной',
    group: '0. Точка входа',
    type: 'ACTION',
    actionType: 'set_var',
    actionValue: 'seen_migration=1',
    posX: 800, posY: 290,
    next: 'start_router',
  },

  // ═══════════════════════════════════════════════════════════
  // 1. ONBOARDING — ветвление по состоянию юзера
  // ═══════════════════════════════════════════════════════════

  {
    ref: 'start_router',
    name: '/start роутер',
    group: '1. Онбординг',
    type: 'CONDITION',
    conditionType: 'has_sub',
    posX: 500, posY: 410,
    nextTrue: 'onb_has_sub_router',
    nextFalse: 'onb_no_sub_router',
  },

  // ── Ветка A: есть подписка ──
  {
    ref: 'onb_has_sub_router',
    name: 'Есть подписка: email?',
    group: '1. Онбординг',
    type: 'CONDITION',
    conditionType: 'has_email',
    posX: 250, posY: 200,
    nextTrue: 'onb_active_with_email',
    nextFalse: 'onb_active_no_email',
  },
  {
    ref: 'onb_active_with_email',
    name: 'Приветствие (есть email)',
    group: '1. Онбординг',
    type: 'MESSAGE',
    posX: 100, posY: 350,
    text: '✅ *С возвращением, {name}!*\n\nПодписка активна до *{subExpireDate}* (осталось {daysLeft} дн.)\n\n📧 Email `{email}` привязан — вы можете войти в веб-ЛК через браузер, если Telegram заблокируют.\n\nЧто дальше?',
    buttons: [
      { label: '🔑 Моя подписка',  type: 'block', toRef: 'sub_info',     row: 0 },
      { label: '🔑 Пароль от ЛК',  type: 'block', toRef: 'pw_reset_confirm', row: 1 },
      { label: '🏠 Главное меню',   type: 'block', toRef: 'menu_main',     row: 2 },
    ],
  },
  {
    ref: 'onb_active_no_email',
    name: 'Нет email — предупреждение',
    group: '1. Онбординг',
    type: 'MESSAGE',
    posX: 400, posY: 350,
    text: '⚠️ *{name}, ваша подписка активна, но email НЕ привязан*\n\nЕсли Telegram заблокируют — вы потеряете возможность оплачивать и продлевать подписку.\n\n💡 Привяжите email сейчас — это займёт 1 минуту, а вы получите резервный доступ к ЛК через браузер.',
    buttons: [
      { label: '📧 Привязать email (рекомендуется)', type: 'block', toRef: 'email_start', row: 0, style: 'success' },
      { label: '🏠 Пропустить',  type: 'block', toRef: 'menu_main', row: 1 },
    ],
  },

  // ── Ветка B: нет подписки — проверяем платил ли раньше ──
  {
    ref: 'onb_no_sub_router',
    name: 'Нет подписки: раньше платил?',
    group: '1. Онбординг',
    type: 'CONDITION',
    conditionType: 'payments_gt_0',
    posX: 750, posY: 560,
    nextTrue: 'onb_returning_buyer',
    nextFalse: 'onb_new_router_email',
  },
  {
    ref: 'onb_new_router_email',
    name: 'Новый без оплат: email?',
    group: '1. Онбординг',
    type: 'CONDITION',
    conditionType: 'has_email',
    posX: 750, posY: 700,
    nextTrue: 'onb_new_with_email',
    nextFalse: 'onb_new_no_email',
  },
  {
    ref: 'onb_returning_buyer',
    name: 'Возврат: был плательщиком',
    group: '1. Онбординг',
    type: 'MESSAGE',
    posX: 1050, posY: 560,
    text: '👋 *С возвращением, {name}!*\n\nУ вас уже была история оплат на сумму *{totalPaid} ₽*. Активной подписки сейчас нет — выберите тариф чтобы продолжить:',
    buttons: [
      { label: '💳 Выбрать тариф',  type: 'block', toRef: 'tariffs_list', row: 0, style: 'success' },
      { label: '🎟 Есть промокод?', type: 'block', toRef: 'promo_input',  row: 1 },
      { label: '🏠 Главное меню',   type: 'block', toRef: 'menu_main',    row: 2 },
    ],
  },
  {
    ref: 'onb_new_no_email',
    name: 'Новый: предложить email + триал',
    group: '1. Онбординг',
    type: 'MESSAGE',
    posX: 900, posY: 350,
    text: '👋 *Добро пожаловать, {name}!*\n\nHIDEYOU VPN — быстрый, стабильный и без обрывов.\n\n🎁 Попробуйте *{trialDays} дня бесплатно* — без привязки карты.\n\n💡 *Совет:* заодно привяжите email — это ваш резервный доступ к ЛК через браузер.',
    buttons: [
      { label: '📧 Привязать email + триал', type: 'block', toRef: 'email_start', row: 0, style: 'success' },
      { label: '🎁 Только триал',            type: 'block', toRef: 'trial_activate', row: 1 },
      { label: '💳 Выбрать платный тариф',   type: 'block', toRef: 'tariffs_list', row: 2 },
    ],
  },
  {
    ref: 'onb_new_with_email',
    name: 'Новый с email — сразу триал',
    group: '1. Онбординг',
    type: 'MESSAGE',
    posX: 650, posY: 350,
    text: '👋 *Привет, {name}!*\n\nHIDEYOU VPN — готовы начать?\n\n🎁 У вас есть бесплатный пробный период на *{trialDays} дня*.',
    buttons: [
      { label: '🎁 Активировать триал', type: 'block', toRef: 'trial_activate', row: 0, style: 'success' },
      { label: '💳 Выбрать тариф',       type: 'block', toRef: 'tariffs_list',   row: 1 },
    ],
  },

  // ── Trial activation (общий блок) ──
  {
    ref: 'trial_activate',
    name: 'Активация триала',
    group: '1. Онбординг',
    type: 'ACTION',
    actionType: 'trial',
    posX: 750, posY: 550,
    next: 'trial_success',
  },
  {
    ref: 'trial_success',
    name: 'Триал активирован',
    group: '1. Онбординг',
    type: 'ACTION',
    actionType: 'refresh_subscription',
    posX: 750, posY: 700,
    next: 'trial_success_msg',
  },
  {
    ref: 'trial_success_msg',
    name: 'Триал: поздравление',
    group: '1. Онбординг',
    type: 'MESSAGE',
    posX: 750, posY: 850,
    text: '🎉 *Триал активирован!*\n\nВам доступен VPN на *{trialDays} дня*.\n\n📲 Ваша подписка-ссылка:\n`{subLink}`\n\nНастройте подключение по инструкциям:',
    buttons: [
      { label: '📱 Инструкции',        type: 'block', toRef: 'instructions', row: 0, style: 'success' },
      { label: '📋 Копировать URL',     type: 'copy_text', copyText: '{subLink}', row: 1 },
      { label: '🏠 Главное меню',       type: 'block', toRef: 'menu_main', row: 2 },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 2. MAIN MENU
  // ═══════════════════════════════════════════════════════════

  {
    ref: 'menu_main',
    name: '🏠 Главное меню',
    group: '2. Главное меню',
    type: 'MESSAGE',
    posX: 500, posY: 1050,
    text: '🏠 *{name}, главное меню*\n\n📊 Подписка: *{subStatus}*\n📅 До: {subExpireDate} (_{daysLeft} дн_)\n💰 Баланс: *{balance} ₽*\n🎁 Бонус-дней: *{bonusDays}*',
    buttons: [
      { label: '🔑 Моя подписка',   type: 'block', toRef: 'sub_info',       row: 0, col: 0 },
      { label: '💳 Тарифы',          type: 'block', toRef: 'tariffs_list',   row: 0, col: 1 },
      { label: '📱 Инструкции',     type: 'block', toRef: 'instructions',   row: 1, col: 0 },
      { label: '👥 Рефералы',        type: 'block', toRef: 'ref_info',       row: 1, col: 1 },
      { label: '💰 Баланс',          type: 'block', toRef: 'balance_info',   row: 2, col: 0 },
      { label: '🎟 Промокод',        type: 'block', toRef: 'promo_input',    row: 2, col: 1 },
      { label: '🆘 Поддержка',      type: 'block', toRef: 'support_menu',    row: 3, col: 0 },
      { label: '⚙️ Профиль',         type: 'block', toRef: 'profile_info',   row: 3, col: 1 },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 3. SUBSCRIPTION
  // ═══════════════════════════════════════════════════════════

  {
    ref: 'sub_info_refresh',
    name: 'Обновить данные из RW',
    group: '3. Подписка',
    type: 'ACTION',
    actionType: 'refresh_subscription',
    posX: 150, posY: 1250,
    next: 'sub_info',
  },
  {
    ref: 'sub_info',
    name: '🔑 Моя подписка',
    group: '3. Подписка',
    type: 'CONDITION',
    conditionType: 'has_sub',
    posX: 150, posY: 1400,
    nextTrue: 'sub_info_active',
    nextFalse: 'sub_info_empty',
  },
  {
    ref: 'sub_info_active',
    name: 'Подписка активна',
    group: '3. Подписка',
    type: 'MESSAGE',
    posX: 50, posY: 1550,
    text: '🔑 *Ваша подписка*\n\n📊 Статус: *{subStatus}*\n📅 До: *{subExpireDate}* ({daysLeft} дн)\n📦 Трафик: {trafficUsed} / {trafficLimit}\n📱 Устройств: {deviceCount} / {deviceLimit}\n\n🔗 Подписка-ссылка:\n`{subLink}`',
    buttons: [
      { label: '📋 Копировать URL',   type: 'copy_text', copyText: '{subLink}', row: 0 },
      { label: '📱 Инструкции',       type: 'block', toRef: 'instructions', row: 1 },
      { label: '🔄 Продлить',          type: 'block', toRef: 'tariffs_list', row: 2 },
      { label: '🔁 Пересоздать URL',  type: 'block', toRef: 'sub_revoke_confirm', row: 3 },
      { label: '⬅️ Меню',              type: 'block', toRef: 'menu_main', row: 4 },
    ],
  },
  {
    ref: 'sub_info_empty',
    name: 'Нет подписки',
    group: '3. Подписка',
    type: 'MESSAGE',
    posX: 250, posY: 1550,
    text: '🔒 *Нет активной подписки*\n\nВыберите тариф чтобы начать пользоваться VPN:',
    buttons: [
      { label: '💳 Выбрать тариф', type: 'block', toRef: 'tariffs_list', row: 0, style: 'success' },
      { label: '⬅️ Меню',           type: 'block', toRef: 'menu_main',    row: 1 },
    ],
  },
  {
    ref: 'sub_revoke_confirm',
    name: 'Подтверждение revoke',
    group: '3. Подписка',
    type: 'MESSAGE',
    posX: 50, posY: 1750,
    text: '⚠️ *Пересоздать подписку-ссылку?*\n\nВсе ваши устройства перестанут работать, пока вы не переподключите их по новой ссылке.\n\nПродолжить?',
    buttons: [
      { label: '✅ Да, пересоздать', type: 'block', toRef: 'sub_revoke_action', row: 0, style: 'danger' },
      { label: '❌ Отмена',           type: 'block', toRef: 'sub_info',         row: 1 },
    ],
  },
  {
    ref: 'sub_revoke_action',
    name: 'Revoke действие',
    group: '3. Подписка',
    type: 'ACTION',
    actionType: 'revoke_sub',
    posX: 50, posY: 1900,
    next: 'sub_revoke_done',
  },
  {
    ref: 'sub_revoke_done',
    name: 'Revoke готово',
    group: '3. Подписка',
    type: 'MESSAGE',
    posX: 50, posY: 2050,
    text: '✅ *Ссылка обновлена!*\n\nНовая ссылка:\n`{subLink}`\n\nПереподключите устройства.',
    buttons: [
      { label: '📋 Копировать новую', type: 'copy_text', copyText: '{subLink}', row: 0 },
      { label: '📱 Инструкции',       type: 'block', toRef: 'instructions', row: 1 },
      { label: '🏠 Меню',              type: 'block', toRef: 'menu_main', row: 2 },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 4. TARIFFS
  // ═══════════════════════════════════════════════════════════

  {
    ref: 'tariffs_list',
    name: '💳 Список тарифов',
    group: '4. Тарифы и оплата',
    type: 'TARIFF_LIST',
    posX: 500, posY: 1400,
    text: '💳 *Выберите тариф:*\n\nВсе тарифы без автопродления и скрытых платежей. После оплаты подписка активируется сразу.',
  },

  // ═══════════════════════════════════════════════════════════
  // 5. INSTRUCTIONS
  // ═══════════════════════════════════════════════════════════

  {
    ref: 'instructions',
    name: '📱 Инструкции по OS',
    group: '5. Инструкции',
    type: 'MESSAGE',
    posX: 850, posY: 1400,
    text: '📱 *Как подключить HIDEYOU VPN*\n\nВыберите вашу платформу — покажем пошаговую инструкцию:',
    buttons: [
      { label: '🍎 iPhone/iPad', type: 'webapp', url: '{appUrl}/dashboard/instructions?os=ios',       row: 0, col: 0 },
      { label: '🤖 Android',      type: 'webapp', url: '{appUrl}/dashboard/instructions?os=android',   row: 0, col: 1 },
      { label: '💻 macOS',        type: 'webapp', url: '{appUrl}/dashboard/instructions?os=macos',     row: 1, col: 0 },
      { label: '🖥 Windows',      type: 'webapp', url: '{appUrl}/dashboard/instructions?os=windows',   row: 1, col: 1 },
      { label: '📺 Android TV',   type: 'webapp', url: '{appUrl}/dashboard/instructions?os=androidtv', row: 2 },
      { label: '⬅️ Меню',          type: 'block',  toRef: 'menu_main',                                  row: 3 },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 6. REFERRALS
  // ═══════════════════════════════════════════════════════════

  {
    ref: 'ref_info',
    name: '👥 Рефералы',
    group: '6. Рефералы',
    type: 'MESSAGE',
    posX: 1150, posY: 1400,
    text: '👥 *Реферальная программа*\n\nПриглашайте друзей — получайте *+{trialDays} дня* подписки за каждого оплатившего.\n\n📊 Приглашено: *{referralCount}*\n💰 Оплатили: *{referralPaidCount}*\n\n🔗 Ваша реферальная ссылка:\n`{referralUrl}`',
    buttons: [
      { label: '📋 Скопировать ссылку', type: 'copy_text', copyText: '{referralUrl}', row: 0 },
      { label: '📤 Поделиться',          type: 'url',
        url: 'https://t.me/share/url?url={referralUrl}&text=Попробуй HIDEYOU VPN — быстрый и стабильный', row: 1 },
      { label: '⬅️ Меню',                type: 'block', toRef: 'menu_main', row: 2 },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 7. BALANCE
  // ═══════════════════════════════════════════════════════════

  {
    ref: 'balance_info',
    name: '💰 Баланс',
    group: '7. Баланс',
    type: 'MESSAGE',
    posX: 1450, posY: 1400,
    text: '💰 *Ваш баланс*\n\n₽ Деньги: *{balance} ₽*\n🎁 Бонус-дней: *{bonusDays}*\n\nС баланса можно оплачивать тарифы. Пополнение — через веб-ЛК.',
    buttons: [
      { label: '➕ Пополнить',  type: 'webapp', url: '{appUrl}/dashboard',          row: 0, style: 'success' },
      { label: '💳 К тарифам',  type: 'block',  toRef: 'tariffs_list',              row: 1 },
      { label: '⬅️ Меню',       type: 'block',  toRef: 'menu_main',                 row: 2 },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 8. PROMO CODE
  // ═══════════════════════════════════════════════════════════

  {
    ref: 'promo_input',
    name: '🎟 Ввод промокода',
    group: '8. Промокод',
    type: 'INPUT',
    posX: 1750, posY: 1400,
    text: '🎟 *Введите промокод*',
    inputPrompt: 'Отправьте промокод сообщением',
    inputVar: 'promo_code',
    next: 'promo_activate',
  },
  {
    ref: 'promo_activate',
    name: 'Активация промокода',
    group: '8. Промокод',
    type: 'PROMO_ACTIVATE',
    posX: 1750, posY: 1550,
    text: '✅ *Промокод {promo_code} активирован!*\n\nБонус начислен.',
    buttons: [
      { label: '🏠 В меню', type: 'block', toRef: 'menu_main' },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 9. SUPPORT
  // ═══════════════════════════════════════════════════════════

  {
    ref: 'support_menu',
    name: '🆘 Поддержка',
    group: '9. Поддержка',
    type: 'MESSAGE',
    posX: 500, posY: 2200,
    text: '🆘 *Поддержка HIDEYOU VPN*\n\nС чем помочь?',
    buttons: [
      { label: '💬 Создать обращение', type: 'block', toRef: 'ticket_subject_input', row: 0, style: 'success' },
      { label: '📱 Как подключить',    type: 'block', toRef: 'instructions',          row: 1 },
      { label: '❓ Частые вопросы',    type: 'webapp', url: '{appUrl}/faq',            row: 2 },
      { label: '🌐 Веб-ЛК поддержка',   type: 'webapp', url: '{appUrl}/dashboard/support', row: 3 },
      { label: '⬅️ Меню',               type: 'block', toRef: 'menu_main',             row: 4 },
    ],
  },
  {
    ref: 'ticket_subject_input',
    name: 'Ввод темы тикета',
    group: '9. Поддержка',
    type: 'INPUT',
    posX: 500, posY: 2400,
    text: '📝 *Создание обращения*\n\nКратко опишите тему (до 200 символов):',
    inputPrompt: 'Введите тему',
    inputVar: 'ticket_subject',
    next: 'ticket_body_input',
  },
  {
    ref: 'ticket_body_input',
    name: 'Ввод текста тикета',
    group: '9. Поддержка',
    type: 'INPUT',
    posX: 500, posY: 2550,
    text: '📝 *Опишите проблему*\n\nЧем подробнее — тем быстрее поможем:',
    inputPrompt: 'Опишите проблему',
    inputVar: 'ticket_body',
    next: 'ticket_create',
  },
  {
    ref: 'ticket_create',
    name: 'Создание тикета',
    group: '9. Поддержка',
    type: 'ACTION',
    actionType: 'create_ticket',
    posX: 500, posY: 2700,
    next: 'ticket_done',
  },
  {
    ref: 'ticket_done',
    name: 'Тикет создан',
    group: '9. Поддержка',
    type: 'MESSAGE',
    posX: 500, posY: 2850,
    text: '✅ *Обращение создано!*\n\nМы свяжемся с вами в ближайшее время. Ответ придёт в этот чат или в веб-ЛК.',
    buttons: [
      { label: '🌐 Веб-ЛК', type: 'webapp', url: '{appUrl}/dashboard/support', row: 0 },
      { label: '🏠 Меню',    type: 'block', toRef: 'menu_main', row: 1 },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 10. EMAIL & PASSWORD
  // ═══════════════════════════════════════════════════════════

  {
    ref: 'email_start',
    name: '📧 Ввод email',
    group: '10. Email и пароль',
    type: 'INPUT',
    posX: 100, posY: 2200,
    text: '📧 *Привязка email*\n\nЗачем нужно:\n• 🔐 Резервный вход в ЛК через браузер, если Telegram заблокируют\n• 💳 Чеки на оплату\n• 🔄 Восстановление через поддержку\n\nВведите ваш email:',
    inputPrompt: 'Введите email',
    inputVar: 'pending_email',
    inputValidation: 'email',
    next: 'email_send_code_action',
  },
  {
    ref: 'email_send_code_action',
    name: 'Отправить код',
    group: '10. Email и пароль',
    type: 'ACTION',
    actionType: 'send_email_code',
    actionValue: '{pending_email}',
    posX: 100, posY: 2350,
    next: 'email_code_input',
  },
  {
    ref: 'email_code_input',
    name: 'Ввод кода',
    group: '10. Email и пароль',
    type: 'INPUT',
    posX: 100, posY: 2500,
    text: '📬 *Код отправлен на `{pending_email}`*\n\n⚠️ Проверьте папку *«Спам»* — иногда письма попадают туда.\n\nВведите 6-значный код из письма:',
    inputPrompt: 'Введите 6 цифр',
    inputVar: 'email_code',
    inputValidation: 'number',
    next: 'email_verify_action',
  },
  {
    ref: 'email_verify_action',
    name: 'Проверка кода',
    group: '10. Email и пароль',
    type: 'ACTION',
    actionType: 'verify_email_code',
    actionValue: '{email_code}',
    posX: 100, posY: 2650,
    next: 'email_success',
  },
  {
    ref: 'email_success',
    name: 'Email привязан',
    group: '10. Email и пароль',
    type: 'MESSAGE',
    posX: 100, posY: 2800,
    text: '✅ *Email привязан!*\n\n📧 На `{pending_email}` отправлено письмо с:\n• Логин = ваш email\n• Пароль от веб-ЛК (сгенерирован автоматически)\n\n🌐 Зайти в ЛК: {appUrl}/login\n\n⚠️ *Проверьте спам!*',
    buttons: [
      { label: '🌐 Открыть веб-ЛК', type: 'url', url: '{appUrl}/login', row: 0 },
      { label: '🏠 Главное меню',    type: 'block', toRef: 'menu_main', row: 1 },
    ],
  },
  {
    ref: 'pw_reset_confirm',
    name: 'Подтверждение пароля',
    group: '10. Email и пароль',
    type: 'MESSAGE',
    posX: 300, posY: 2200,
    text: '🔑 *Сгенерировать пароль от веб-ЛК?*\n\nНовый пароль будет отправлен на `{email}`. Если старый пароль был — он перестанет работать.\n\n⚠️ Письмо может попасть в «Спам».',
    buttons: [
      { label: '✅ Сгенерировать', type: 'block', toRef: 'pw_reset_action', row: 0, style: 'success' },
      { label: '❌ Отмена',         type: 'block', toRef: 'menu_main',        row: 1 },
    ],
  },
  {
    ref: 'pw_reset_action',
    name: 'Reset password action',
    group: '10. Email и пароль',
    type: 'ACTION',
    actionType: 'reset_password',
    posX: 300, posY: 2400,
    next: 'pw_reset_done',
  },
  {
    ref: 'pw_reset_done',
    name: 'Пароль отправлен',
    group: '10. Email и пароль',
    type: 'MESSAGE',
    posX: 300, posY: 2550,
    text: '✅ *Пароль отправлен!*\n\n📧 Проверьте `{email}` (и папку «Спам»).\n\n🌐 Войти в ЛК: {appUrl}/login',
    buttons: [
      { label: '🌐 Перейти в ЛК', type: 'url', url: '{appUrl}/login', row: 0 },
      { label: '🏠 Меню',          type: 'block', toRef: 'menu_main', row: 1 },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 11. PROFILE
  // ═══════════════════════════════════════════════════════════

  {
    ref: 'profile_info',
    name: '⚙️ Профиль',
    group: '11. Профиль',
    type: 'MESSAGE',
    posX: 800, posY: 2200,
    text: '⚙️ *Ваш профиль*\n\n👤 Имя: {name}\n📧 Email: {email}\n💬 Telegram: @{telegramName}\n💰 Баланс: {balance} ₽\n🎁 Бонус-дней: {bonusDays}\n💳 Всего оплат: {paymentsCount} на {totalPaid} ₽',
    buttons: [
      { label: '📧 Изменить/привязать email', type: 'block', toRef: 'email_start', row: 0 },
      { label: '🔑 Пароль веб-ЛК',             type: 'block', toRef: 'pw_reset_confirm', row: 1 },
      { label: '⬅️ Меню',                       type: 'block', toRef: 'menu_main',    row: 2 },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 12. PAYMENT OUTCOMES
  // ═══════════════════════════════════════════════════════════

  {
    ref: 'pay_success',
    name: '✅ Оплата прошла',
    group: '12. Исходы оплаты',
    type: 'PAYMENT_SUCCESS',
    posX: 400, posY: 1700,
    text: '✅ *Оплата подтверждена!*\n\n{name}, подписка активна до *{subExpireDate}* ({daysLeft} дн).\n\nТеперь подключите VPN:',
    buttons: [
      { label: '📱 Инструкции',      type: 'block', toRef: 'instructions', row: 0 },
      { label: '📋 Копировать URL',  type: 'copy_text', copyText: '{subLink}', row: 1 },
      { label: '🏠 Главное меню',    type: 'block', toRef: 'menu_main', row: 2 },
    ],
  },
  {
    ref: 'pay_fail',
    name: '❌ Оплата не прошла',
    group: '12. Исходы оплаты',
    type: 'PAYMENT_FAIL',
    posX: 650, posY: 1700,
    text: '❌ *Оплата не прошла*\n\nЕсли деньги списались, но доступ не активировался — напишите в поддержку, мы разберёмся.',
    buttons: [
      { label: '🔄 Попробовать снова', type: 'block', toRef: 'tariffs_list',  row: 0 },
      { label: '🆘 Поддержка',          type: 'block', toRef: 'support_menu', row: 1 },
    ],
  },
]

// ─────────────────────────────────────────────────────────────
// TRIGGERS — все команды бота со слэшем
// ─────────────────────────────────────────────────────────────
const TRIGGERS: TriggerDef[] = [
  // /start проходит через sync + migration check перед роутингом
  { type: 'command', value: '/start',    toRef: 'start_sync',    priority: 100 },
  // Отдельный entry для совсем новых юзеров (бот вызовет по событию из index.ts)
  { type: 'event',   value: 'new_user',  toRef: 'splash_new_user', priority: 100 },
  { type: 'command', value: '/menu',     toRef: 'menu_main',     priority: 90 },
  { type: 'command', value: '/support',  toRef: 'support_menu',  priority: 80 },
  { type: 'command', value: '/help',     toRef: 'support_menu',  priority: 80 },
  { type: 'command', value: '/tariffs',  toRef: 'tariffs_list',  priority: 80 },
  { type: 'command', value: '/email',    toRef: 'email_start',   priority: 80 },
  { type: 'command', value: '/promo',    toRef: 'promo_input',   priority: 80 },
  { type: 'command', value: '/referral', toRef: 'ref_info',      priority: 80 },
  { type: 'command', value: '/balance',  toRef: 'balance_info',  priority: 80 },
  { type: 'command', value: '/profile',  toRef: 'profile_info',  priority: 80 },
  { type: 'command', value: '/sub',      toRef: 'sub_info',      priority: 80 },

  // Payment events — fired from webhook handlers via triggerEvent
  { type: 'event', value: 'payment.success', toRef: 'pay_success', priority: 100 },
  { type: 'event', value: 'payment.fail',    toRef: 'pay_fail',    priority: 100 },
]

// ─────────────────────────────────────────────────────────────
// SEED
// ─────────────────────────────────────────────────────────────
async function main() {
  console.log('🗑  Очистка старых нод бота...')
  await prisma.botBlockStat.deleteMany()
  await prisma.botTrigger.deleteMany()
  await prisma.botButton.deleteMany()
  await prisma.botBlock.deleteMany()
  await prisma.botBlockGroup.deleteMany()
  console.log('✅ Очищено')

  console.log('📁 Создание групп...')
  const groupIds: Record<string, string> = {}
  for (const g of GROUPS) {
    const created = await prisma.botBlockGroup.create({ data: g })
    groupIds[g.name] = created.id
  }
  console.log(`✅ ${GROUPS.length} групп`)

  // First pass — create blocks without connections
  console.log('🧱 Создание блоков...')
  const refToId: Record<string, string> = {}
  const published = { isDraft: false, version: 1, publishedAt: new Date() }

  for (const b of BLOCKS) {
    const groupId = groupIds[b.group]
    if (!groupId) { console.warn(`  ⚠️  group not found: ${b.group}`); continue }

    const created = await prisma.botBlock.create({
      data: {
        groupId,
        name:        b.name,
        type:        b.type as any,
        text:        b.text ?? null,
        parseMode:   b.parseMode ?? 'Markdown',
        posX:        b.posX,
        posY:        b.posY,
        conditionType:  b.conditionType ?? null,
        conditionValue: b.conditionValue ?? null,
        conditions:     b.conditions ?? undefined,
        actionType:  b.actionType ?? null,
        actionValue: b.actionValue ?? null,
        inputPrompt: b.inputPrompt ?? null,
        inputVar:    b.inputVar ?? null,
        inputValidation: b.inputValidation ?? null,
        ...published,
      },
    })
    refToId[b.ref] = created.id
  }
  console.log(`✅ ${BLOCKS.length} блоков`)

  // Second pass — wire up nextBlockId / trueNodeId / falseNodeId
  console.log('🔗 Связи блоков...')
  for (const b of BLOCKS) {
    const id = refToId[b.ref]
    if (!id) continue
    const update: any = {}
    if (b.next      && refToId[b.next])      update.nextBlockId    = refToId[b.next]
    if (b.nextTrue  && refToId[b.nextTrue])  update.nextBlockTrue  = refToId[b.nextTrue]
    if (b.nextFalse && refToId[b.nextFalse]) update.nextBlockFalse = refToId[b.nextFalse]
    if (Object.keys(update).length > 0) {
      await prisma.botBlock.update({ where: { id }, data: update })
    }
  }
  console.log('✅ Связи проставлены')

  // Buttons
  console.log('🔘 Кнопки...')
  let buttonCount = 0
  for (const b of BLOCKS) {
    if (!b.buttons?.length) continue
    const blockId = refToId[b.ref]
    if (!blockId) continue
    for (let i = 0; i < b.buttons.length; i++) {
      const btn = b.buttons[i]
      await prisma.botButton.create({
        data: {
          blockId,
          label:       btn.label,
          type:        btn.type,
          nextBlockId: btn.toRef ? refToId[btn.toRef] ?? null : null,
          url:         btn.url ?? null,
          copyText:    btn.copyText ?? null,
          style:       btn.style ?? null,
          row:         btn.row ?? i,
          col:         btn.col ?? 0,
          sortOrder:   i,
        },
      })
      buttonCount++
    }
  }
  console.log(`✅ ${buttonCount} кнопок`)

  // Triggers
  console.log('🎯 Триггеры...')
  for (const t of TRIGGERS) {
    const blockId = refToId[t.toRef]
    if (!blockId) { console.warn(`  ⚠️  trigger target missing: ${t.toRef}`); continue }
    await prisma.botTrigger.upsert({
      where: { type_value: { type: t.type, value: t.value } },
      create: { type: t.type, value: t.value, blockId, priority: t.priority ?? 100 },
      update: { blockId, priority: t.priority ?? 100 },
    })
  }
  console.log(`✅ ${TRIGGERS.length} триггеров`)

  console.log('')
  console.log('🎉 Бот полностью пересобран.')
  console.log('   Проверь в /admin/bot/constructor.')
}

main()
  .catch(e => { console.error('❌', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
