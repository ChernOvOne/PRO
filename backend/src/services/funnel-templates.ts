/**
 * Готовые шаблоны воронок — каталог сценариев для VPN-бизнеса.
 * Использует новую схему триггеров: events (webhook/internal) + state_* (cron-scan).
 * Каждый шаблон при загрузке создаёт Funnel + FunnelNode'ы в БД.
 */

export interface FunnelTemplateNode {
  refId: string
  nodeType: string
  name?: string
  posX?: number
  posY?: number

  next?: string
  trueNext?: string
  falseNext?: string

  triggerType?: string
  triggerParam?: number
  delayType?: string
  delayValue?: number

  conditionType?: string
  conditions?: any

  channelTg?: boolean
  channelEmail?: boolean
  channelLk?: boolean

  tgText?: string
  tgButtons?: any[]
  tgParseMode?: string

  emailSubject?: string
  emailHtml?: string
  emailBtnText?: string
  emailBtnUrl?: string

  lkTitle?: string
  lkMessage?: string
  lkType?: string

  actionType?: string
  actionValue?: string
  actionPromoExpiry?: number

  waitEvent?: string
  waitTimeout?: number

  notifyChannel?: string
  notifyText?: string

  repeatEnabled?: boolean
  repeatInterval?: number
  repeatMax?: number

  httpUrl?: string
  httpMethod?: string
  httpBody?: string
}

export interface FunnelTemplate {
  id: string
  name: string
  description: string
  category: string
  icon: string
  priority?: number
  stopOnPayment?: boolean
  stopOnActiveSub?: boolean
  stopOnConnect?: boolean
  nodes: FunnelTemplateNode[]
}

// Helper for simple 1-node trigger → message
const simple = (opts: {
  id: string
  name: string
  description: string
  category: string
  icon: string
  trigger: string
  triggerParam?: number
  delayType?: string   // единица для state_* триггеров (minutes/hours/days)
  text: string
  buttons?: any[]
  action?: { type: string; value: string; expiry?: number }
  stopOnPayment?: boolean
  stopOnActiveSub?: boolean
  stopOnConnect?: boolean
}): FunnelTemplate => ({
  id: opts.id,
  name: opts.name,
  description: opts.description,
  category: opts.category,
  icon: opts.icon,
  stopOnPayment: opts.stopOnPayment,
  stopOnActiveSub: opts.stopOnActiveSub,
  stopOnConnect: opts.stopOnConnect,
  nodes: [
    {
      refId: 't',
      nodeType: 'trigger',
      name: opts.name,
      triggerType: opts.trigger,
      triggerParam: opts.triggerParam,
      delayType: opts.delayType,
      channelTg: true,
      tgText: opts.text,
      tgButtons: opts.buttons || [],
      tgParseMode: 'Markdown',
      ...(opts.action && {
        actionType: opts.action.type,
        actionValue: opts.action.value,
        actionPromoExpiry: opts.action.expiry,
      }),
    },
  ],
})

export const FUNNEL_TEMPLATES: FunnelTemplate[] = [

  // ═══ Регистрация / подключение ═══

  simple({
    id: 'welcome_flow',
    name: '👋 Welcome Flow',
    description: 'Приветствие при регистрации',
    category: 'onboarding', icon: '👋',
    stopOnActiveSub: true,
    trigger: 'registration',
    text: '👋 Привет, {name}!\n\nДобро пожаловать в *HIDEYOU VPN*.\n\n🎁 У вас есть *{trialDays} дня* бесплатного триала.',
    buttons: [
      { label: '🚀 Начать бесплатно', type: 'webapp', url: '{appUrl}/dashboard/plans' },
      { label: '📱 Инструкции',        type: 'webapp', url: '{appUrl}/dashboard/instructions' },
    ],
  }),

  simple({
    id: 'first_connection_congrats',
    name: '🎉 Первое подключение',
    description: 'Поздравление при первом коннекте',
    category: 'onboarding', icon: '🎉',
    trigger: 'first_connection',
    text: '🎉 *{name}, вы подключились!*\n\nТрафик защищён. Пользуйтесь без ограничений 🚀\n\nПригласите друга — получите +{trialDays} дня: {referralUrl}',
    buttons: [{ label: '📋 Скопировать ссылку', type: 'copy_text', copyText: '{referralUrl}' }],
  }),

  // ═══ State-check ═══

  simple({
    id: 'state_trial_not_activated_1h',
    name: '⏰ Не активировал триал 1 час',
    description: 'Через час после регистрации, если не взял триал',
    category: 'state', icon: '🎁',
    stopOnActiveSub: true,
    trigger: 'state_trial_not_activated',
    triggerParam: 1, delayType: 'hours',
    text: '🎁 {name}, вы ещё не попробовали VPN!\n\n*{trialDays} дня* бесплатно — без карты:',
    buttons: [{ label: '🎁 Активировать триал', type: 'webapp', url: '{appUrl}/dashboard/plans?trial=1' }],
  }),

  simple({
    id: 'state_not_connected_24h',
    name: '🔌 Не подключился 24 часа',
    description: 'Сутки назад оплатил — не подключился',
    category: 'state', icon: '🔌',
    stopOnConnect: true,
    trigger: 'state_not_connected',
    triggerParam: 24, delayType: 'hours',
    text: '🔌 {name}, не получается подключиться?\n\nПошаговые инструкции для вашего устройства:',
    buttons: [
      { label: '📱 Инструкции', type: 'webapp', url: '{appUrl}/dashboard/instructions' },
      { label: '🆘 Поддержка',  type: 'webapp', url: '{appUrl}/dashboard/support' },
    ],
  }),

  simple({
    id: 'state_not_connected_help',
    name: '🆘 Так и не подключились',
    description: 'Подписка есть, но не было первого подключения — пишем поддержку',
    category: 'state', icon: '🆘',
    stopOnConnect: true,
    trigger: 'state_not_connected',
    triggerParam: 1, delayType: 'hours',
    text: '🆘 {name}, вы так и не подключились!\n\nВидимо что-то пошло не так. Мы готовы помочь — напишите в поддержку, оператор разберётся за 5 минут.',
    buttons: [
      { label: '🆘 Связаться с поддержкой', type: 'webapp', url: '{appUrl}/dashboard/support' },
      { label: '📱 Инструкции',              type: 'webapp', url: '{appUrl}/dashboard/instructions' },
    ],
  }),

  simple({
    id: 'state_inactive_14d',
    name: '🌟 Неактивен 14 дней',
    description: 'Не заходил в ЛК 2 недели — вернуть',
    category: 'state', icon: '🌟',
    trigger: 'state_inactive',
    triggerParam: 14, delayType: 'days',
    text: '🌟 {name}, давно не виделись!\n\nНапомним — ваша подписка до {subExpireDate}.',
    buttons: [{ label: '🌐 Открыть ЛК', type: 'webapp', url: '{appUrl}/dashboard' }],
  }),

  simple({
    id: 'state_inactive_30d',
    name: '🔕 Неактивен 30 дней',
    description: 'Месяц без активности — реактивация с промо',
    category: 'state', icon: '🔕',
    trigger: 'state_inactive',
    triggerParam: 30, delayType: 'days',
    text: '🔕 {name}, вернитесь со *скидкой 20%* промокод `RETURN20`.',
    buttons: [{ label: 'Вернуться', type: 'webapp', url: '{appUrl}/dashboard?promo=RETURN20' }],
    action: { type: 'promo_discount', value: '20', expiry: 14 },
  }),

  simple({
    id: 'state_no_referrals_7d',
    name: '👥 Нет рефералов 7 дней',
    description: 'Неделю после регистрации — напомнить про бонусы',
    category: 'state', icon: '👥',
    trigger: 'state_no_referrals',
    triggerParam: 7, delayType: 'days',
    text: '👥 {name}, поделитесь HIDEYOU!\n\n+{trialDays} дня за каждого оплатившего реферала:\n{referralUrl}',
    buttons: [{ label: '📋 Моя ссылка', type: 'copy_text', copyText: '{referralUrl}' }],
  }),

  simple({
    id: 'state_winback_7d',
    name: '💔 Winback 7 дней',
    description: 'Истекла неделю назад — скидка 30%',
    category: 'state', icon: '💔',
    trigger: 'state_winback',
    triggerParam: 7, delayType: 'days',
    text: '💔 {name}, мы скучаем!\n\nВернитесь со *скидкой 30%* — `MISS30`.',
    buttons: [{ label: 'Вернуться', type: 'webapp', url: '{appUrl}/dashboard/plans?promo=MISS30' }],
    action: { type: 'promo_discount', value: '30', expiry: 7 },
  }),

  simple({
    id: 'state_anniversary_1year',
    name: '🎂 Годовщина 1 год',
    description: 'Ровно год с регистрации — поздравить + 14 дней бонус',
    category: 'state', icon: '🎂',
    trigger: 'state_anniversary',
    triggerParam: 365, delayType: 'days',
    text: '🎂 *{name}, поздравляем!*\n\nГод с нами. В подарок — *+14 дней* подписки 🎁',
    action: { type: 'bonus_days', value: '14' },
  }),

  simple({
    id: 'state_feedback_7d',
    name: '⭐ Отзыв после 7 дней',
    description: 'Через неделю после регистрации — попросить отзыв',
    category: 'state', icon: '⭐',
    trigger: 'state_feedback_request',
    triggerParam: 7, delayType: 'days',
    text: '⭐ {name}, вы с нами неделю! Поделитесь впечатлениями:',
    buttons: [{ label: '⭐ Оставить отзыв', type: 'url', url: 'https://t.me/hideyou_feedback' }],
  }),

  simple({
    id: 'state_low_balance_3d',
    name: '💸 Баланс 0 больше 3 дней',
    description: 'Юзер без средств — напомнить пополнить',
    category: 'state', icon: '💸',
    trigger: 'state_low_balance',
    triggerParam: 3, delayType: 'days',
    text: '💸 {name}, на балансе 0. Пополните чтобы было чем оплачивать подписку:',
    buttons: [{ label: '➕ Пополнить', type: 'webapp', url: '{appUrl}/dashboard/balance' }],
  }),

  simple({
    id: 'state_payment_pending_30min',
    name: '⏳ Оплата зависла 30 минут',
    description: 'Не завершил оплату 30 минут — помочь',
    category: 'state', icon: '⏳',
    stopOnPayment: true,
    trigger: 'state_payment_pending_stuck',
    triggerParam: 30, delayType: 'minutes',
    text: '⏰ {name}, вы начали оплату но не завершили. Помочь?',
    buttons: [
      { label: '✅ Завершить', type: 'webapp', url: '{appUrl}/dashboard/plans' },
      { label: '🆘 Поддержка',  type: 'webapp', url: '{appUrl}/dashboard/support' },
    ],
  }),

  simple({
    id: 'state_trial_expiring_1d',
    name: '⏰ Триал заканчивается через 1 день',
    description: 'У юзера триал — напомнить купить за день до конца',
    category: 'state', icon: '⏰',
    trigger: 'state_on_trial_about_to_expire',
    triggerParam: 1, delayType: 'days',
    text: '⏰ {name}, ваш триал заканчивается завтра!\n\nВыберите тариф чтобы не потерять доступ:',
    buttons: [{ label: '💳 Тарифы', type: 'webapp', url: '{appUrl}/dashboard/plans' }],
  }),

  // ═══ Webhook events (от REMNAWAVE) ═══

  simple({
    id: 'expiring_3d_reminder',
    name: '⚠️ Истекает через 3 дня',
    description: 'За 3 дня до окончания (webhook)',
    category: 'subscription', icon: '⚠️',
    trigger: 'expiring_3d',
    text: '⚠️ {name}, подписка заканчивается через *3 дня*!\n\nПродлите сейчас чтобы не потерять доступ.',
    buttons: [{ label: '🔄 Продлить', type: 'webapp', url: '{appUrl}/dashboard/plans' }],
  }),

  simple({
    id: 'expiring_1d_reminder',
    name: '🔴 Истекает завтра',
    description: 'За день до окончания + промо (webhook)',
    category: 'subscription', icon: '🔴',
    trigger: 'expiring_1d',
    text: '🔴 {name}, подписка заканчивается *завтра*!\n\n🎁 Промо `TOMORROW` — +3 дня в подарок.',
    buttons: [{ label: '🔄 Продлить с бонусом', type: 'webapp', url: '{appUrl}/dashboard/plans?promo=TOMORROW' }],
    action: { type: 'promo_discount', value: '10', expiry: 1 },
  }),

  simple({
    id: 'expired_today_promo',
    name: '❌ Истекла сегодня',
    description: 'Подписка истекла — промо 15% (webhook)',
    category: 'subscription', icon: '❌',
    trigger: 'expired',
    text: '❌ {name}, подписка *истекла*.\n\nВернитесь со *скидкой 15%* `COMEBACK15`.',
    buttons: [{ label: 'Вернуться', type: 'webapp', url: '{appUrl}/dashboard/plans?promo=COMEBACK15' }],
    action: { type: 'promo_discount', value: '15', expiry: 3 },
  }),

  simple({
    id: 'traffic_80_warning',
    name: '📊 Трафик 80%',
    description: 'Предупреждение + апсейл (webhook)',
    category: 'subscription', icon: '📊',
    trigger: 'traffic_80',
    text: '📊 {name}, использовано *80%* трафика.\n\nХотите безлимитный тариф?',
    buttons: [{ label: '⬆️ Апгрейд', type: 'webapp', url: '{appUrl}/dashboard/plans' }],
  }),

  simple({
    id: 'traffic_100_exhausted',
    name: '🚫 Трафик исчерпан',
    description: 'Весь трафик использован (webhook)',
    category: 'subscription', icon: '🚫',
    trigger: 'traffic_100',
    text: '🚫 {name}, трафик исчерпан.\n\nАпгрейд на безлимит:',
    buttons: [{ label: '➕ Апгрейд', type: 'webapp', url: '{appUrl}/dashboard/plans' }],
  }),

  // ═══ Payment events ═══

  simple({
    id: 'payment_success_thanks',
    name: '✅ Спасибо за оплату',
    description: 'После успешной оплаты — инструкция',
    category: 'payment', icon: '✅',
    trigger: 'payment_success',
    text: '✅ *{name}, оплата подтверждена!*\n\nПодписка активна до *{subExpireDate}* ({daysLeft} дней).',
    buttons: [
      { label: '📱 Инструкции',      type: 'webapp', url: '{appUrl}/dashboard/instructions' },
      { label: '📋 Копировать URL',  type: 'copy_text', copyText: '{subLink}' },
    ],
  }),

  simple({
    id: 'payment_renewal_thanks',
    name: '🔄 Повторная оплата',
    description: 'Продлил — спасибо лояльному клиенту',
    category: 'payment', icon: '🔄',
    trigger: 'payment_renewal',
    text: '💎 *{name}, спасибо за продление!*\n\nПодписка активна до *{subExpireDate}*.',
    buttons: [{ label: '🌐 ЛК', type: 'webapp', url: '{appUrl}/dashboard' }],
  }),

  // ═══ Referrals ═══

  simple({
    id: 'referral_paid_bonus',
    name: '💰 Реферал оплатил',
    description: 'Друг оплатил — бонус',
    category: 'referral', icon: '💰',
    trigger: 'referral_paid',
    text: '🎉 {name}, ваш друг оплатил!\n\n+{refBonusDays} дней на ваш аккаунт.',
    buttons: [{ label: '📊 Мои рефералы', type: 'webapp', url: '{appUrl}/dashboard/referrals' }],
  }),

  simple({
    id: 'five_referrals_reached',
    name: '🏆 5 рефералов',
    description: 'Достиг 5 платящих рефералов — бонус 15 дней',
    category: 'referral', icon: '🏆',
    trigger: 'five_referrals',
    text: '🏆 *{name}, поздравляем с 5 рефералами!*\n\nВ подарок — *+15 дней* подписки.',
    action: { type: 'bonus_days', value: '15' },
  }),

  // ═══ Security ═══

  simple({
    id: 'new_device_alert',
    name: '📱 Новое устройство',
    description: 'Security alert (webhook)',
    category: 'security', icon: '📱',
    trigger: 'new_device',
    text: '📱 {name}, подключено *новое устройство*.\n\nЕсли это не вы — пересоздайте ссылку в ЛК:',
    buttons: [{ label: '🔒 Безопасность', type: 'webapp', url: '{appUrl}/dashboard/security' }],
  }),

  simple({
    id: 'device_limit_upsell',
    name: '🔒 Лимит устройств',
    description: 'Достиг лимита — апгрейд (webhook)',
    category: 'security', icon: '🔒',
    trigger: 'device_limit',
    text: '🔒 {name}, лимит устройств достигнут.\n\nАпгрейд на Premium даст больше устройств.',
    buttons: [{ label: '⬆️ Апгрейд', type: 'webapp', url: '{appUrl}/dashboard/plans' }],
  }),
]

/**
 * Получить шаблон по id.
 */
export function getTemplate(id: string): FunnelTemplate | null {
  return FUNNEL_TEMPLATES.find(t => t.id === id) || null
}
