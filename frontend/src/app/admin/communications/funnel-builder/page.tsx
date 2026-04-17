'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { adminApi } from '@/lib/api'
import toast from 'react-hot-toast'
import {
  Search, Plus, Trash2, Copy, X,
  ZoomIn, ZoomOut, Maximize2, LayoutGrid, Workflow, Minus,
  Zap, MessageCircle, Clock, Square,
  Eye, EyeOff, Play,
  Bold, Italic, Code, Link2, Variable, Settings, FileText,
  Check, AlertTriangle, Quote, Smile, ArrowUp,
  StopCircle, Gift, Timer, Send, Tag, Percent,
} from 'lucide-react'

/* ================================================================
   Types
   ================================================================ */

interface FunnelGroup {
  id: string
  name: string
  description?: string | null
  enabled: boolean
  category?: string | null
  sortOrder: number
  nodes: FunnelNode[]
  _count?: { logs: number; nodes: number }
  // settings
  stopOnPayment?: boolean
  stopOnConnect?: boolean
  stopOnActiveSub?: boolean
  stopOnBotMessage?: boolean
  stopOnUnsubscribe?: boolean
  stopOnTag?: string | null
  sandboxMode?: boolean
  sandboxTag?: string | null
  maxMessages?: number | null
  timeoutDays?: number | null
  antiSpamHours?: number | null
  workHoursStart?: string | null
  workHoursEnd?: string | null
  timezone?: string | null
  priority?: number
}

interface FunnelNode {
  id: string
  funnelId: string
  nodeType: string
  name: string
  posX: number
  posY: number
  nextNodeId?: string | null
  trueNodeId?: string | null
  falseNodeId?: string | null
  triggerType?: string | null
  triggerParam?: number | null
  delayType: string
  delayValue: number
  delayTime?: string | null
  delayWeekdays?: number[] | null
  conditionType?: string | null
  conditionValue?: string | null
  conditionLogic?: string | null
  conditions?: any[] | null
  channelTg: boolean
  channelEmail: boolean
  channelLk: boolean
  channelPush: boolean
  tgText?: string | null
  tgButtons?: any[] | null
  tgParseMode: string
  tgMediaUrl?: string | null
  tgMediaType?: string | null
  tgPin: boolean
  tgDeletePrev: boolean
  emailSubject?: string | null
  emailHtml?: string | null
  emailBtnText?: string | null
  emailBtnUrl?: string | null
  emailTemplate: string
  lkTitle?: string | null
  lkMessage?: string | null
  lkType: string
  actionType: string
  actionValue?: string | null
  actionPromoExpiry: number
  splitPercent?: number | null
  waitEvent?: string | null
  waitTimeout?: number | null
  gotoTargetType?: string | null
  gotoTargetId?: string | null
  httpUrl?: string | null
  httpMethod?: string | null
  httpHeaders?: any | null
  httpBody?: string | null
  notifyChannel?: string | null
  notifyText?: string | null
  tgEffect?: string | null
}

interface BotBlockGroup {
  id: string
  name: string
  blocks: { id: string; name: string; type: string }[]
}

interface DraggingConnection {
  sourceId: string
  sourcePort: 'next' | 'true' | 'false'
  mouseX: number
  mouseY: number
}

interface NodeTypeConfig {
  type: string
  label: string
  color: string
  icon: string
  triggers?: { id: string; label: string; category: string; hasParam: boolean; paramLabel?: string }[]
}

/* ================================================================
   Constants
   ================================================================ */

// ── Palette: Triggers ────────────────────────────────
interface PaletteItem {
  id: string
  label: string
  nodeType: string
  defaults: Record<string, any>
}

interface PaletteCategory {
  title: string
  icon: string
  items: PaletteItem[]
}

// ── Palette of triggers (matches TRIGGER_OPTIONS from engine / NODE_TYPE_CONFIG) ──
const TRIGGER_PALETTE: PaletteCategory[] = [
  {
    title: 'Регистрация',
    icon: '👋',
    items: [
      { id: 'registration',     label: '👋 Регистрация',          nodeType: 'trigger', defaults: { triggerType: 'registration', channelTg: true } },
      { id: 'first_connection', label: '🎉 Первое подключение',   nodeType: 'trigger', defaults: { triggerType: 'first_connection', channelTg: true } },
    ],
  },
  {
    title: 'Подписка (webhook)',
    icon: '🔔',
    items: [
      { id: 'expiring_3d',   label: '⚠️ Истекает через 3 дня',  nodeType: 'trigger', defaults: { triggerType: 'expiring_3d', channelTg: true } },
      { id: 'expiring_1d',   label: '🔴 Истекает через 1 день',  nodeType: 'trigger', defaults: { triggerType: 'expiring_1d', channelTg: true } },
      { id: 'expired',       label: '❌ Подписка истекла',       nodeType: 'trigger', defaults: { triggerType: 'expired', channelTg: true } },
      { id: 'traffic_80',    label: '📊 Трафик 80%',             nodeType: 'trigger', defaults: { triggerType: 'traffic_80', channelTg: true } },
      { id: 'traffic_100',   label: '🚫 Трафик исчерпан',        nodeType: 'trigger', defaults: { triggerType: 'traffic_100', channelTg: true } },
    ],
  },
  {
    title: 'Оплата',
    icon: '💳',
    items: [
      { id: 'payment_success', label: '✅ Оплата прошла',         nodeType: 'trigger', defaults: { triggerType: 'payment_success', channelTg: true } },
      { id: 'payment_pending', label: '⏳ Оплата не завершена',   nodeType: 'trigger', defaults: { triggerType: 'payment_pending', channelTg: true } },
      { id: 'referral_paid',   label: '💰 Реферал оплатил',       nodeType: 'trigger', defaults: { triggerType: 'referral_paid', channelTg: true } },
    ],
  },
  {
    title: 'Безопасность',
    icon: '🔒',
    items: [
      { id: 'new_device',       label: '📱 Новое устройство',     nodeType: 'trigger', defaults: { triggerType: 'new_device', channelTg: true } },
      { id: 'sub_link_revoked', label: '🔄 Ссылка обновлена',     nodeType: 'trigger', defaults: { triggerType: 'sub_link_revoked', channelTg: true } },
    ],
  },
  {
    title: '⏰ Проверка состояния',
    icon: '⏰',
    items: [
      { id: 'state_trial',       label: '⏰ Не активировал триал', nodeType: 'trigger', defaults: { triggerType: 'state_trial_not_activated', triggerParam: 1, delayType: 'hours', channelTg: true } },
      { id: 'state_not_conn',    label: '⏰ Не подключился',       nodeType: 'trigger', defaults: { triggerType: 'state_not_connected', triggerParam: 24, delayType: 'hours', channelTg: true } },
      { id: 'state_inactive',    label: '⏰ Неактивен N дней',     nodeType: 'trigger', defaults: { triggerType: 'state_inactive', triggerParam: 14, delayType: 'days', channelTg: true } },
      { id: 'state_winback',     label: '⏰ Winback',              nodeType: 'trigger', defaults: { triggerType: 'state_winback', triggerParam: 7, delayType: 'days', channelTg: true } },
      { id: 'state_no_refs',     label: '⏰ 0 рефералов',         nodeType: 'trigger', defaults: { triggerType: 'state_no_referrals', triggerParam: 7, delayType: 'days', channelTg: true } },
      { id: 'state_feedback',    label: '⏰ Запрос отзыва',        nodeType: 'trigger', defaults: { triggerType: 'state_feedback_request', triggerParam: 7, delayType: 'days', channelTg: true } },
      { id: 'manual',            label: '🖐 Ручной запуск',        nodeType: 'trigger', defaults: { triggerType: 'manual', channelTg: true } },
    ],
  },
]

// ── Palette of step nodes (all non-trigger node types) ──
const STEP_PALETTE: PaletteCategory[] = [
  {
    title: 'Сообщения',
    icon: '💬',
    items: [
      { id: 'message',     label: '💬 Сообщение',         nodeType: 'message',      defaults: { channelTg: true, tgText: '{name}, ...', tgParseMode: 'Markdown' } },
      { id: 'notify_admin',label: '🔔 Уведомить админа',  nodeType: 'notify_admin', defaults: { notifyChannel: 'tg' } },
    ],
  },
  {
    title: 'Логика',
    icon: '🔀',
    items: [
      { id: 'condition', label: '🔀 Условие (TRUE/FALSE)', nodeType: 'condition', defaults: { conditions: { logic: 'AND', rules: [] } } },
      { id: 'delay',     label: '⏱ Задержка',              nodeType: 'delay',     defaults: { delayType: 'hours', delayValue: 1 } },
      { id: 'split',     label: '🎲 A/B тест',             nodeType: 'split',     defaults: { splitPercent: 50 } },
      { id: 'wait_event',label: '⏳ Ждать событие',         nodeType: 'wait_event',defaults: { waitEvent: 'payment_success', waitTimeout: 86400 } },
    ],
  },
  {
    title: 'Действия',
    icon: '⚡',
    items: [
      { id: 'action_bonus', label: '🎁 Бонус-дни',         nodeType: 'action', defaults: { actionType: 'bonus_days', actionValue: '7' } },
      { id: 'action_promo', label: '🎫 Промокод-скидка',   nodeType: 'action', defaults: { actionType: 'promo_discount', actionValue: '20' } },
      { id: 'action_tag',   label: '🏷 Добавить тег',      nodeType: 'action', defaults: { actionType: 'add_tag', actionValue: '' } },
      { id: 'action_trial', label: '🎁 Активировать триал', nodeType: 'action', defaults: { actionType: 'trial' } },
    ],
  },
  {
    title: 'Навигация',
    icon: '🔗',
    items: [
      { id: 'goto', label: '🔁 Переход (goto)',  nodeType: 'goto', defaults: { gotoTargetType: 'node' } },
      { id: 'http', label: '🌐 HTTP запрос',      nodeType: 'http', defaults: { httpMethod: 'POST', httpUrl: '' } },
      { id: 'stop', label: '⏹ Стоп',              nodeType: 'stop', defaults: {} },
    ],
  },
]

const CONDITION_TYPES = [
  { value: 'not_paid', label: 'Не оплатил' },
  { value: 'no_subscription', label: 'Нет подписки' },
  { value: 'not_connected', label: 'Не подключён' },
  { value: 'balance_lt', label: 'Баланс < N' },
  { value: 'traffic_percent_gt', label: 'Трафик > N%' },
  { value: 'has_tag', label: 'Есть тег' },
  { value: 'no_tag', label: 'Нет тега' },
  { value: 'payments_count_lt', label: 'Оплат < N' },
  { value: 'has_subscription', label: 'Есть подписка' },
  { value: 'is_paid', label: 'Оплачивал' },
  { value: 'is_connected', label: 'Подключён' },
  { value: 'has_email', label: 'Есть email' },
  { value: 'has_telegram', label: 'Есть Telegram' },
  { value: 'balance_gt', label: 'Баланс > N' },
  { value: 'days_left_lt', label: 'Дней осталось < N' },
  { value: 'payments_count_gt', label: 'Оплат > N' },
  { value: 'total_paid_gt', label: 'Сумма оплат > N' },
  { value: 'referral_count_gt', label: 'Рефералов > N' },
  { value: 'registered_days_ago_gt', label: 'Зарег. дней назад > N' },
  { value: 'tariff_is', label: 'Тариф равен' },
  { value: 'language_is', label: 'Язык равен' },
]

// Smart node presets — one-click chains of connected nodes
type PresetNode = {
  refId: string
  nodeType: string
  name?: string
  offsetX?: number
  offsetY?: number
  next?: string
  trueNext?: string
  falseNext?: string
  data?: Record<string, any>
}
type NodePreset = {
  id: string
  name: string
  description: string
  icon: string
  nodes: PresetNode[]
}

const NODE_PRESETS: NodePreset[] = [
  {
    id: 'delay_message',
    name: 'Задержка + Сообщение',
    description: 'Через N времени отправить TG-сообщение',
    icon: '⏱️',
    nodes: [
      {
        refId: 'd', nodeType: 'delay', name: 'Задержка 1 час', offsetX: 0, offsetY: 0,
        data: { delayType: 'hours', delayValue: 1 },
        next: 'm',
      },
      {
        refId: 'm', nodeType: 'message', name: 'Сообщение', offsetX: 320, offsetY: 0,
        data: { channelTg: true, tgText: '👋 {name}, ...', tgParseMode: 'Markdown' },
      },
    ],
  },
  {
    id: 'check_paid',
    name: 'Проверить оплату → 2 ветки',
    description: 'Условие (оплачивал?) с двумя ветками для TRUE/FALSE',
    icon: '💳',
    nodes: [
      {
        refId: 'c', nodeType: 'condition', name: 'Оплачивал?', offsetX: 0, offsetY: 0,
        data: { conditions: { logic: 'AND', rules: [{ field: 'payments_count', op: 'gt', value: 0 }] } },
        trueNext: 'y', falseNext: 'n',
      },
      {
        refId: 'y', nodeType: 'message', name: 'Спасибо клиент', offsetX: 320, offsetY: -100,
        data: { channelTg: true, tgText: '💎 Спасибо за оплаты, {name}!' },
      },
      {
        refId: 'n', nodeType: 'message', name: 'Первое предложение', offsetX: 320, offsetY: 100,
        data: { channelTg: true, tgText: '🎁 {name}, попробуйте — первая неделя бесплатно' },
      },
    ],
  },
  {
    id: 'retention_3step',
    name: 'Ретеншен 3 шага',
    description: 'Напоминание + задержка 1д + скидка 10% + задержка 3д + скидка 20%',
    icon: '🎯',
    nodes: [
      {
        refId: 'm1', nodeType: 'message', name: 'Напоминание', offsetX: 0, offsetY: 0,
        data: { channelTg: true, tgText: '⏰ {name}, не забывайте продлить подписку' },
        next: 'd1',
      },
      {
        refId: 'd1', nodeType: 'delay', name: '1 день', offsetX: 320, offsetY: 0,
        data: { delayType: 'days', delayValue: 1 },
        next: 'm2',
      },
      {
        refId: 'm2', nodeType: 'message', name: 'Скидка 10%', offsetX: 640, offsetY: 0,
        data: { channelTg: true, tgText: '🎁 Скидка **10%** промокод SAVE10', actionType: 'promo_discount', actionValue: '10', actionPromoExpiry: 3 },
        next: 'd2',
      },
      {
        refId: 'd2', nodeType: 'delay', name: '3 дня', offsetX: 960, offsetY: 0,
        data: { delayType: 'days', delayValue: 3 },
        next: 'm3',
      },
      {
        refId: 'm3', nodeType: 'message', name: 'Скидка 20%', offsetX: 1280, offsetY: 0,
        data: { channelTg: true, tgText: '🔥 Финал: скидка **20%** промокод LAST20', actionType: 'promo_discount', actionValue: '20', actionPromoExpiry: 1 },
      },
    ],
  },
  {
    id: 'wait_pay_recover',
    name: 'Ждём оплату → возврат',
    description: 'Ждать событие payment_success 24ч, если не дождались — напомнить',
    icon: '⏳',
    nodes: [
      {
        refId: 'w', nodeType: 'wait_event', name: 'Ждём оплату 24ч', offsetX: 0, offsetY: 0,
        data: { waitEvent: 'payment_success', waitTimeout: 86400 },
        next: 'ok', falseNext: 'no',
      },
      {
        refId: 'ok', nodeType: 'message', name: 'Спасибо за оплату', offsetX: 320, offsetY: -100,
        data: { channelTg: true, tgText: '✅ {name}, оплата получена! Подписка активна.' },
      },
      {
        refId: 'no', nodeType: 'message', name: 'Напоминание', offsetX: 320, offsetY: 100,
        data: { channelTg: true, tgText: '⏰ {name}, вы не завершили оплату — нужна помощь?' },
      },
    ],
  },
  {
    id: 'ab_test',
    name: 'A/B тест 50/50',
    description: 'Split 50% на 2 разных сообщения',
    icon: '🔬',
    nodes: [
      {
        refId: 's', nodeType: 'split', name: 'A/B 50/50', offsetX: 0, offsetY: 0,
        data: { splitPercent: 50 },
        trueNext: 'a', falseNext: 'b',
      },
      {
        refId: 'a', nodeType: 'message', name: 'Вариант А', offsetX: 320, offsetY: -100,
        data: { channelTg: true, tgText: '🅰️ Вариант А, {name}' },
      },
      {
        refId: 'b', nodeType: 'message', name: 'Вариант B', offsetX: 320, offsetY: 100,
        data: { channelTg: true, tgText: '🅱️ Вариант B, {name}' },
      },
    ],
  },
  // ── State-check пресеты (готовые цепочки для типовых сценариев) ──
  {
    id: 'state_not_connected_24h',
    name: 'Не подключился 24ч — напомнить',
    description: 'Триггер state_not_connected 24ч + сообщение с инструкцией',
    icon: '🔌',
    nodes: [
      {
        refId: 't', nodeType: 'trigger', name: 'Не подключился 24ч', offsetX: 0, offsetY: 0,
        data: { triggerType: 'state_not_connected', triggerParam: 24, delayType: 'hours', channelTg: true,
          tgText: '🔌 {name}, вижу вы не подключились.\n\nВот инструкции по вашему устройству:',
          tgButtons: [{ label: '📱 Инструкции', type: 'webapp', url: '{appUrl}/dashboard/instructions' }] },
      },
    ],
  },
  {
    id: 'state_inactive_14d',
    name: 'Неактивен 14 дней — вернуть',
    description: 'Триггер state_inactive 14 дней + промо-напоминание',
    icon: '🌟',
    nodes: [
      {
        refId: 't', nodeType: 'trigger', name: 'Неактивен 14 дней', offsetX: 0, offsetY: 0,
        data: { triggerType: 'state_inactive', triggerParam: 14, delayType: 'days', channelTg: true,
          tgText: '🌟 {name}, мы скучаем!\n\nПродлите подписку и получите бонус:',
          actionType: 'promo_discount', actionValue: '20', actionPromoExpiry: 7 },
      },
    ],
  },
  {
    id: 'state_winback_7d',
    name: 'Winback 7 дней',
    description: 'Истекла 7 дней назад → промо 30%',
    icon: '💔',
    nodes: [
      {
        refId: 't', nodeType: 'trigger', name: 'Winback 7 дней', offsetX: 0, offsetY: 0,
        data: { triggerType: 'state_winback', triggerParam: 7, delayType: 'days', channelTg: true,
          tgText: '💔 {name}, вернитесь со скидкой 30%!',
          actionType: 'promo_discount', actionValue: '30', actionPromoExpiry: 7 },
      },
    ],
  },
  {
    id: 'state_anniversary_365d',
    name: 'Годовщина 1 год',
    description: 'Ровно 365 дней после регистрации + бонус +14 дней',
    icon: '🎂',
    nodes: [
      {
        refId: 't', nodeType: 'trigger', name: 'Годовщина 1 год', offsetX: 0, offsetY: 0,
        data: { triggerType: 'state_anniversary', triggerParam: 365, delayType: 'days', channelTg: true,
          tgText: '🎂 {name}, год с нами!\n\n+14 дней в подарок 🎁',
          actionType: 'bonus_days', actionValue: '14' },
      },
    ],
  },
]

// Visual condition builder — fields, operators, rules
const CONDITION_FIELDS: Array<{ value: string; label: string; type: 'number' | 'string' | 'boolean' | 'array' }> = [
  { value: 'sub_status',            label: 'Статус подписки',       type: 'string' },
  { value: 'days_left',             label: 'Дней до окончания',    type: 'number' },
  { value: 'has_subscription',      label: 'Есть подписка',         type: 'boolean' },
  { value: 'is_connected',          label: 'Подключён к VPN',       type: 'boolean' },
  { value: 'devices_count',         label: 'Устройств',             type: 'number' },
  { value: 'traffic_used_gb',       label: 'Использовано GB',       type: 'number' },
  { value: 'payments_count',        label: 'Кол-во оплат',          type: 'number' },
  { value: 'payments_sum',          label: 'Сумма оплат ₽',         type: 'number' },
  { value: 'last_payment_days',     label: 'Дней с последней оплаты', type: 'number' },
  { value: 'referrals_count',       label: 'Рефералов',             type: 'number' },
  { value: 'balance',               label: 'Баланс ₽',              type: 'number' },
  { value: 'bonus_days',            label: 'Бонус-дней',            type: 'number' },
  { value: 'days_since_registration', label: 'Дней с регистрации', type: 'number' },
  { value: 'has_email',             label: 'Есть email',            type: 'boolean' },
  { value: 'has_telegram',          label: 'Есть Telegram',         type: 'boolean' },
  { value: 'tags',                  label: 'Теги',                  type: 'array' },
]

const CONDITION_OPS: Record<string, Array<{ value: string; label: string }>> = {
  number: [
    { value: 'eq', label: '=' }, { value: 'ne', label: '≠' },
    { value: 'gt', label: '>' }, { value: 'lt', label: '<' },
    { value: 'gte', label: '≥' }, { value: 'lte', label: '≤' },
    { value: 'is_empty', label: 'не задано' }, { value: 'is_not_empty', label: 'задано' },
  ],
  string: [
    { value: 'eq', label: '=' }, { value: 'ne', label: '≠' },
    { value: 'contains', label: 'содержит' }, { value: 'not_contains', label: 'не содержит' },
    { value: 'is_empty', label: 'пусто' }, { value: 'is_not_empty', label: 'не пусто' },
  ],
  boolean: [
    { value: 'is_true', label: 'да' },
    { value: 'is_false', label: 'нет' },
  ],
  array: [
    { value: 'contains', label: 'содержит' }, { value: 'not_contains', label: 'не содержит' },
    { value: 'is_empty', label: 'пусто' }, { value: 'is_not_empty', label: 'не пусто' },
  ],
}

const ACTION_TYPES = [
  { value: 'none', label: 'Нет' },
  { value: 'bonus_days', label: 'Бонус дней' },
  { value: 'balance_add', label: 'Баланс+' },
  { value: 'balance_subtract', label: 'Баланс-' },
  { value: 'promo_discount', label: 'Промокод скидка' },
  { value: 'promo_balance', label: 'Промокод баланс' },
  { value: 'trial', label: 'Триал' },
  { value: 'add_tag', label: 'Тег+' },
  { value: 'remove_tag', label: 'Тег-' },
  { value: 'set_variable', label: 'Переменная' },
  { value: 'extend_subscription', label: 'Продлить подписку' },
]

const EMOJI_CATEGORIES: Record<string, string[]> = {
  'Смайлики': ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','🥰','😍','😘','😗','😋','😛','😜','🤪','😝','🤗','🤭','🤔','🤐','😐','😑','😶','😏','😒','🙄','😬','😮','😯','😲','😳','🥺','😢','😭','😤','😠','😡','🤯','😱','😨','😰','😥','😓','🤗','🤠','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','😴','💤','😈','👿','👹','👺','💀','👻','👽','🤖','💩','😺','😸','😹','😻','😼','😽','🙀','😿','😾'],
  'Люди': ['👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🧠','🦷','🦴','👀','👁','👅','👄'],
  'Символы': ['❤','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣','💕','💞','💓','💗','💖','💘','💝','💟','✅','❌','⭕','❗','❓','💯','🔥','⭐','🌟','✨','💫','💥','💢','💤'],
}

const MESSAGE_EFFECTS = [
  { id: '', emoji: '—', label: 'Нет' },
  { id: '5104841245755180586', emoji: '🔥', label: 'Огонь' },
  { id: '5046509860389126442', emoji: '🎉', label: 'Конфетти' },
  { id: '5159385139981059251', emoji: '❤️', label: 'Сердце' },
  { id: '5107584321108051014', emoji: '👍', label: 'Лайк' },
  { id: '5104858069142078462', emoji: '👎', label: 'Дизлайк' },
  { id: '5046589136895476101', emoji: '💩', label: 'Какашка' },
]

const NODE_W = 260
const NODE_H = 110

const TRIGGER_LABELS: Record<string, string> = {
  expiring_72h: 'Истекает через 3 дня',
  expiring_48h: 'Истекает через 2 дня',
  expiring_24h: 'Истекает завтра',
  expiring: 'Подписка истекает',
  expired: 'Подписка истекла',
  traffic_limit: 'Трафик исчерпан',
  traffic_warning: 'Трафик на N%',
  inactive: 'Неактивный',
  first_connection: 'Первое подключение',
  registration: 'Регистрация',
  payment: 'Оплата',
  payment_failed: 'Оплата не прошла',
  referral_registered: 'Реферал зарегался',
  referral_paid: 'Реферал оплатил',
  device_added: 'Новое устройство',
  node_down: 'Сервер упал',
  manual: 'Ручной запуск',
}

/* ================================================================
   Component
   ================================================================ */

export default function FunnelBuilderPage() {
  /* ── Data state ────────────────────────────────────────── */
  const [groups, setGroups] = useState<FunnelGroup[]>([])
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [nodeTypeConfig, setNodeTypeConfig] = useState<NodeTypeConfig[]>([])
  const [variables, setVariables] = useState<any[]>([])
  const [botBlocks, setBotBlocks] = useState<BotBlockGroup[]>([])
  const [loading, setLoading] = useState(true)

  /* ── UI state ──────────────────────────────────────────── */
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [rightPanelOpen, setRightPanelOpen] = useState(false)
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [showTemplates, setShowTemplates] = useState(false)
  const [templates, setTemplates] = useState<any[]>([])
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [analytics, setAnalytics] = useState<any>(null)
  const [analyticsDays, setAnalyticsDays] = useState(30)
  const [showSimulator, setShowSimulator] = useState(false)
  const [simulation, setSimulation] = useState<any>(null)
  const [simUserId, setSimUserId] = useState('')
  const [validation, setValidation] = useState<any>(null)
  const [showValidation, setShowValidation] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  const [wizStep, setWizStep] = useState(0)
  const [wizData, setWizData] = useState<{
    name: string
    triggerType: string
    messageText: string
    delayValue: number
    delayType: 'minutes' | 'hours' | 'days'
    addCondition: boolean
    conditionField: string
    conditionOp: string
    conditionValue: string
  }>({
    name: '',
    triggerType: 'registration',
    messageText: '👋 Привет, {name}!',
    delayValue: 0,
    delayType: 'minutes',
    addCondition: false,
    conditionField: 'has_subscription',
    conditionOp: 'is_false',
    conditionValue: '',
  })
  const [showAddNodeMenu, setShowAddNodeMenu] = useState(false)
  const [variablePopupOpen, setVariablePopupOpen] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const [logs, setLogs] = useState<any[]>([])
  const [logsTotal, setLogsTotal] = useState(0)
  const [activeTab, setActiveTab] = useState<'event' | 'when' | 'message' | 'action' | 'condition'>('message')
  const [msgSubTab, setMsgSubTab] = useState<'tg' | 'email' | 'lk'>('tg')

  /* ── Canvas state ──────────────────────────────────────── */
  const [zoom, setZoom] = useState(1)
  const [panX, setPanX] = useState(50)
  const [panY, setPanY] = useState(50)
  const [dragging, setDragging] = useState<{ nodeId: string; startX: number; startY: number; origPosX: number; origPosY: number } | null>(null)
  const [panning, setPanning] = useState<{ startX: number; startY: number; origPanX: number; origPanY: number } | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const positionSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* ── Connection dragging ───────────────────────────────── */
  const [draggingConnection, setDraggingConnection] = useState<DraggingConnection | null>(null)
  const [hoveredInputPort, setHoveredInputPort] = useState<string | null>(null)

  /* ── Editor form state ─────────────────────────────────── */
  const [editForm, setEditForm] = useState<Partial<FunnelNode>>({})
  const [editDirty, setEditDirty] = useState(false)

  /* ── Button form ──────────────────────────────────────── */
  const [showButtonForm, setShowButtonForm] = useState(false)
  const [buttonForm, setButtonForm] = useState({ label: '', type: 'url' as string, url: '', copyText: '', callbackData: '', botBlockId: '', style: 'default', iconEmojiId: '', row: 0, col: 0 })
  const [editingBtnIdx, setEditingBtnIdx] = useState<number | null>(null)

  /* ── Condition check state ────────────────────────────── */
  const [conditionEnabled, setConditionEnabled] = useState(false)
  const [conditionFailAction, setConditionFailAction] = useState<'skip' | 'goto'>('skip')
  const [conditionFailNodeId, setConditionFailNodeId] = useState<string>('')

  /* ── Emoji state ──────────────────────────────────────── */
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [emojiCategory, setEmojiCategory] = useState('Смайлики')
  const [premiumEmojiOpen, setPremiumEmojiOpen] = useState(false)

  const [savedEmojis, setSavedEmojis] = useState<Array<{ id: string; fallback: string; name: string }>>(() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem('bot_premium_emojis') || '[]') } catch { return [] }
  })
  const savePremiumEmoji = (id: string, fallback: string, name: string) => {
    const updated = [{ id, fallback, name }, ...savedEmojis.filter(e => e.id !== id)].slice(0, 30)
    setSavedEmojis(updated)
    localStorage.setItem('bot_premium_emojis', JSON.stringify(updated))
  }
  const removeSavedEmoji = (id: string) => {
    const updated = savedEmojis.filter(e => e.id !== id)
    setSavedEmojis(updated)
    localStorage.setItem('bot_premium_emojis', JSON.stringify(updated))
  }

  /* ================================================================
     Data fetching
     ================================================================ */

  const fetchData = useCallback(async () => {
    try {
      const [grps, types, vars, blocks] = await Promise.all([
        adminApi.funnelGroups(),
        adminApi.funnelNodeTypes(),
        adminApi.funnelVariables(),
        adminApi.funnelBotBlocks(),
      ])
      setGroups(grps || [])
      setNodeTypeConfig(types || [])
      setVariables(vars || [])
      setBotBlocks(blocks || [])
      if (!activeGroupId && grps?.length > 0) {
        setActiveGroupId(grps[0].id)
      }
    } catch (e: any) {
      toast.error('Ошибка загрузки: ' + (e.message || ''))
    } finally {
      setLoading(false)
    }
  }, [activeGroupId])

  useEffect(() => { fetchData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Derived data ──────────────────────────────────────── */
  const activeGroup = useMemo(() => groups.find(g => g.id === activeGroupId) || null, [groups, activeGroupId])
  const nodes = useMemo(() => activeGroup?.nodes || [], [activeGroup])
  const nodeMap = useMemo(() => { const m = new Map<string, FunnelNode>(); nodes.forEach(n => m.set(n.id, n)); return m }, [nodes])
  const selectedNode = useMemo(() => nodes.find(n => n.id === selectedNodeId) || null, [nodes, selectedNodeId])

  const triggerConfig = useMemo(() => nodeTypeConfig.find(t => t.type === 'trigger'), [nodeTypeConfig])
  const triggersByCategory = useMemo(() => {
    const triggers = triggerConfig?.triggers || []
    const cats: Record<string, typeof triggers> = {}
    triggers.forEach(t => { if (!cats[t.category]) cats[t.category] = []; cats[t.category].push(t) })
    return cats
  }, [triggerConfig])

  const categoryLabels: Record<string, string> = {
    onboarding: 'Онбординг', subscription: 'Подписка', payment: 'Оплата',
    engagement: 'Вовлечение', security: 'Безопасность', referral: 'Рефералы',
    system: 'Система', custom: 'Кастомные',
  }

  const filteredGroups = useMemo(() => {
    if (!searchQuery) return groups
    const q = searchQuery.toLowerCase()
    return groups.filter(g =>
      g.name.toLowerCase().includes(q) ||
      (g.description || '').toLowerCase().includes(q) ||
      (g.category || '').toLowerCase().includes(q)
    )
  }, [groups, searchQuery])

  /* ── Select node ───────────────────────────────────────── */
  const selectNode = useCallback((node: FunnelNode | null) => {
    if (node) {
      setSelectedNodeId(node.id)
      setEditForm({ ...node })
      setEditDirty(false)
      setRightPanelOpen(true)
      // Set initial tab
      if (node.nodeType === 'trigger') setActiveTab('event')
      else if (node.nodeType === 'stop') setActiveTab('when')
      else setActiveTab('message')
      // Condition state
      setConditionEnabled(!!(node.conditionType))
      setConditionFailAction('skip')
      setConditionFailNodeId('')
    } else {
      setSelectedNodeId(null)
      setEditForm({})
      setEditDirty(false)
      setRightPanelOpen(false)
    }
  }, [])

  /* ── Edit helpers ──────────────────────────────────────── */
  const updateField = (field: string, value: any) => {
    setEditForm(prev => ({ ...prev, [field]: value }))
    setEditDirty(true)
  }

  // Auto-save with debounce
  const autoSaveTimer = useRef<any>(null)
  const [autoSaving, setAutoSaving] = useState(false)

  useEffect(() => {
    if (!editDirty || !selectedNodeId) return
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => { autoSave() }, 1200)
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current) }
  }, [editForm, editDirty, selectedNodeId]) // eslint-disable-line react-hooks/exhaustive-deps

  const autoSave = async () => {
    if (!selectedNodeId || !editDirty) return
    setAutoSaving(true)
    try {
      const payload: any = { ...editForm }
      delete payload.id; delete payload.funnelId; delete payload.createdAt; delete payload.updatedAt
      await adminApi.updateFunnelNode(selectedNodeId, payload)
      setEditDirty(false)
      setGroups(prev => prev.map(g => ({
        ...g,
        nodes: g.nodes.map(n => n.id === selectedNodeId ? { ...n, ...payload } : n),
      })))
    } catch { /* silent */ }
    setAutoSaving(false)
  }

  const saveNode = async () => {
    if (!selectedNodeId) return
    try {
      const payload: any = { ...editForm }
      delete payload.id; delete payload.funnelId; delete payload.createdAt; delete payload.updatedAt
      await adminApi.updateFunnelNode(selectedNodeId, payload)
      toast.success('Сохранено')
      setEditDirty(false)
      fetchData()
    } catch (e: any) {
      toast.error('Ошибка: ' + (e.message || ''))
    }
  }

  /* ── Group CRUD ────────────────────────────────────────── */
  const createGroup = async () => {
    if (!newGroupName.trim()) return
    try {
      const created = await adminApi.createFunnelGroup({ name: newGroupName.trim() })
      toast.success('Группа создана')
      setNewGroupName(''); setShowNewGroup(false)
      setActiveGroupId(created.id)
      fetchData()
    } catch (e: any) { toast.error('Ошибка: ' + (e.message || '')) }
  }

  /* ── Templates ─────────────────────────────────────────── */
  const openTemplates = async () => {
    setShowTemplates(true)
    try {
      const list = await adminApi.funnelTemplates()
      setTemplates(list || [])
    } catch (e: any) { toast.error('Ошибка загрузки шаблонов: ' + (e.message || '')) }
  }

  const openAnalytics = async () => {
    if (!activeGroupId) return
    setShowAnalytics(true)
    setAnalytics(null)
    try {
      const data = await adminApi.funnelAnalytics(activeGroupId, analyticsDays)
      setAnalytics(data)
    } catch (e: any) { toast.error('Ошибка аналитики: ' + (e.message || '')) }
  }

  const reloadAnalytics = async (days: number) => {
    if (!activeGroupId) return
    setAnalyticsDays(days)
    setAnalytics(null)
    try {
      const data = await adminApi.funnelAnalytics(activeGroupId, days)
      setAnalytics(data)
    } catch {}
  }

  const wizardFinish = async () => {
    try {
      const group = await adminApi.createFunnelGroup({
        name: wizData.name || 'Новая воронка',
        description: 'Создано через Wizard',
      })
      const baseX = 200
      const baseY = 200
      // Step 1: create trigger
      const trigger = await adminApi.createFunnelNode(group.id, {
        nodeType: 'trigger',
        name: 'Триггер',
        posX: baseX,
        posY: baseY,
        triggerType: wizData.triggerType,
        channelTg: wizData.delayValue === 0 && !wizData.addCondition,
        tgText: wizData.delayValue === 0 && !wizData.addCondition ? wizData.messageText : null,
        tgParseMode: 'Markdown',
      })
      let prevId = trigger.id
      let currentX = baseX + 320

      // Optional delay
      if (wizData.delayValue > 0) {
        const delay = await adminApi.createFunnelNode(group.id, {
          nodeType: 'delay',
          name: `Задержка ${wizData.delayValue} ${wizData.delayType}`,
          posX: currentX,
          posY: baseY,
          delayType: wizData.delayType,
          delayValue: wizData.delayValue,
        })
        await adminApi.updateFunnelNode(prevId, { nextNodeId: delay.id })
        prevId = delay.id
        currentX += 320
      }

      // Optional condition
      if (wizData.addCondition) {
        const rules = [{
          field: wizData.conditionField,
          op: wizData.conditionOp,
          value: ['is_true', 'is_false', 'is_empty', 'is_not_empty'].includes(wizData.conditionOp)
            ? undefined
            : wizData.conditionValue,
        }]
        const cond = await adminApi.createFunnelNode(group.id, {
          nodeType: 'condition',
          name: 'Условие',
          posX: currentX,
          posY: baseY,
          conditions: { logic: 'AND', rules },
        })
        await adminApi.updateFunnelNode(prevId, { nextNodeId: cond.id })
        // Message on TRUE branch
        const msg = await adminApi.createFunnelNode(group.id, {
          nodeType: 'message',
          name: 'Сообщение',
          posX: currentX + 320,
          posY: baseY - 100,
          channelTg: true,
          tgText: wizData.messageText,
          tgParseMode: 'Markdown',
        })
        await adminApi.updateFunnelNode(cond.id, { trueNodeId: msg.id })
        prevId = msg.id
      } else if (wizData.delayValue > 0) {
        // Message after delay
        const msg = await adminApi.createFunnelNode(group.id, {
          nodeType: 'message',
          name: 'Сообщение',
          posX: currentX,
          posY: baseY,
          channelTg: true,
          tgText: wizData.messageText,
          tgParseMode: 'Markdown',
        })
        await adminApi.updateFunnelNode(prevId, { nextNodeId: msg.id })
      }

      toast.success('✨ Воронка создана через Wizard')
      setShowWizard(false)
      setWizStep(0)
      setActiveGroupId(group.id)
      fetchData()
    } catch (e: any) { toast.error('Ошибка: ' + (e.message || '')) }
  }

  const runValidation = async () => {
    if (!activeGroupId) return
    setShowValidation(true)
    try {
      const result = await adminApi.validateFunnel(activeGroupId)
      setValidation(result)
    } catch (e: any) { toast.error('Ошибка валидации: ' + (e.message || '')) }
  }

  const runSimulation = async () => {
    if (!activeGroupId || !simUserId.trim()) {
      toast.error('Укажите ID юзера')
      return
    }
    setSimulation(null)
    try {
      const result = await adminApi.simulateFunnel(activeGroupId, simUserId.trim())
      setSimulation(result)
    } catch (e: any) { toast.error('Ошибка симуляции: ' + (e.message || '')) }
  }

  const installTemplate = async (id: string) => {
    setInstallingId(id)
    try {
      const funnel = await adminApi.installFunnelTemplate(id)
      toast.success('Шаблон установлен — проверьте и включите воронку')
      setShowTemplates(false)
      setActiveGroupId(funnel.id)
      await fetchData()
    } catch (e: any) {
      toast.error('Ошибка установки: ' + (e.message || ''))
    } finally {
      setInstallingId(null)
    }
  }

  const installAllTemplates = async () => {
    if (!confirm('Установить ВСЕ шаблоны? Уже существующие с таким же триггером будут пропущены. Воронки создадутся выключенными — включите нужные вручную.')) return
    setInstallingId('__all__')
    try {
      const result = await adminApi.installAllFunnelTemplates()
      toast.success(`✨ Установлено: ${result.installed}, пропущено: ${result.skipped}`)
      setShowTemplates(false)
      await fetchData()
    } catch (e: any) {
      toast.error('Ошибка: ' + (e.message || ''))
    } finally {
      setInstallingId(null)
    }
  }

  const deleteGroup = async (id: string) => {
    if (!confirm('Удалить воронку и все её ноды?')) return
    try {
      await adminApi.deleteFunnelGroup(id)
      toast.success('Воронка удалена')
      if (activeGroupId === id) setActiveGroupId(null)
      fetchData()
    } catch (e: any) { toast.error('Ошибка: ' + (e.message || '')) }
  }

  const toggleGroup = async (id: string) => {
    try {
      const res = await adminApi.toggleFunnelGroup(id)
      toast.success(res.enabled ? 'Включена' : 'Выключена')
      fetchData()
    } catch (e: any) { toast.error('Ошибка: ' + (e.message || '')) }
  }

  const duplicateGroup = async (id: string) => {
    try {
      const copy = await adminApi.duplicateFunnelGroup(id)
      toast.success('Воронка дублирована')
      setActiveGroupId(copy.id)
      fetchData()
    } catch (e: any) { toast.error('Ошибка: ' + (e.message || '')) }
  }

  /* ── Node CRUD ─────────────────────────────────────────── */
  const createNode = async (nodeType: string, label?: string, defaults?: Record<string, any>) => {
    if (!activeGroupId) return
    try {
      const maxY = nodes.length > 0 ? Math.max(...nodes.map(n => n.posY)) : 0
      await adminApi.createFunnelNode(activeGroupId, {
        nodeType,
        name: label || (nodeType === 'trigger' ? 'Триггер' : nodeType === 'stop' ? 'Стоп' : 'Сообщение'),
        posX: 300,
        posY: Math.round(maxY + 140),
        ...defaults,
      })
      toast.success('Нода создана')
      setShowAddNodeMenu(false)
      fetchData()
    } catch (e: any) { toast.error('Ошибка: ' + (e.message || '')) }
  }

  /* ── Smart presets (combiners) ─────────────────────────── */
  const createPreset = async (presetId: string) => {
    if (!activeGroupId) return
    const preset = NODE_PRESETS.find(p => p.id === presetId)
    if (!preset) return

    const baseX = 300
    const baseY = nodes.length > 0 ? Math.max(...nodes.map(n => n.posY)) + 140 : 100
    try {
      // Step 1: create all nodes
      const refToId = new Map<string, string>()
      for (const tn of preset.nodes) {
        const created = await adminApi.createFunnelNode(activeGroupId, {
          nodeType: tn.nodeType,
          name: tn.name || tn.nodeType,
          posX: baseX + (tn.offsetX ?? 0),
          posY: baseY + (tn.offsetY ?? 0),
          ...tn.data,
        })
        refToId.set(tn.refId, created.id)
      }
      // Step 2: wire up connections
      for (const tn of preset.nodes) {
        const realId = refToId.get(tn.refId)
        if (!realId) continue
        const update: any = {}
        if (tn.next && refToId.has(tn.next)) update.nextNodeId = refToId.get(tn.next)
        if (tn.trueNext && refToId.has(tn.trueNext)) update.trueNodeId = refToId.get(tn.trueNext)
        if (tn.falseNext && refToId.has(tn.falseNext)) update.falseNodeId = refToId.get(tn.falseNext)
        if (Object.keys(update).length > 0) {
          await adminApi.updateFunnelNode(realId, update)
        }
      }
      toast.success(`${preset.icon} ${preset.name} — создано ${preset.nodes.length} нод`)
      setShowAddNodeMenu(false)
      fetchData()
    } catch (e: any) { toast.error('Ошибка пресета: ' + (e.message || '')) }
  }

  const duplicateNode = async (id: string) => {
    if (!activeGroupId) return
    const source = nodes.find(n => n.id === id)
    if (!source) return
    try {
      const { id: _id, funnelId: _fid, nextNodeId, trueNodeId, falseNodeId, ...fields } = source
      await adminApi.createFunnelNode(activeGroupId, {
        ...fields,
        name: source.name + ' (копия)',
        posX: source.posX + 40,
        posY: source.posY + 40,
        nextNodeId: null, trueNodeId: null, falseNodeId: null,
      })
      toast.success('Нода скопирована')
      fetchData()
    } catch (e: any) { toast.error('Ошибка: ' + (e.message || '')) }
  }

  const deleteNode = async (id: string) => {
    try {
      await adminApi.deleteFunnelNode(id)
      toast.success('Нода удалена')
      if (selectedNodeId === id) selectNode(null)
      setDeleteConfirmId(null)
      fetchData()
    } catch (e: any) { toast.error('Ошибка: ' + (e.message || '')) }
  }

  /* ── Debounced position save ───────────────────────────── */
  const debouncedSavePosition = useCallback((nodeId: string, posX: number, posY: number) => {
    if (positionSaveTimerRef.current) clearTimeout(positionSaveTimerRef.current)
    positionSaveTimerRef.current = setTimeout(async () => {
      try { await adminApi.updateNodePosition(nodeId, posX, posY) } catch {}
    }, 500)
  }, [])

  /* ── Canvas interactions ────────────────────────────────── */
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-node]')) return
    if ((e.target as HTMLElement).closest('[data-port]')) return
    setPanning({ startX: e.clientX, startY: e.clientY, origPanX: panX, origPanY: panY })
  }

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (panning) {
      setPanX(panning.origPanX + (e.clientX - panning.startX))
      setPanY(panning.origPanY + (e.clientY - panning.startY))
    }
    if (dragging) {
      const dx = (e.clientX - dragging.startX) / zoom
      const dy = (e.clientY - dragging.startY) / zoom
      setGroups(prev => prev.map(g => ({
        ...g,
        nodes: g.nodes.map(n =>
          n.id === dragging.nodeId
            ? { ...n, posX: Math.round(dragging.origPosX + dx), posY: Math.round(dragging.origPosY + dy) }
            : n
        ),
      })))
    }
    if (draggingConnection) {
      const canvas = canvasRef.current
      if (canvas) {
        const rect = canvas.getBoundingClientRect()
        setDraggingConnection(prev => prev ? { ...prev, mouseX: e.clientX - rect.left, mouseY: e.clientY - rect.top } : null)
      }
    }
  }, [panning, dragging, draggingConnection, zoom])

  const handleCanvasMouseUp = useCallback(async () => {
    if (dragging) {
      const node = nodes.find(n => n.id === dragging.nodeId)
      if (node) debouncedSavePosition(node.id, node.posX, node.posY)
    }
    if (draggingConnection && hoveredInputPort) {
      const { sourceId, sourcePort } = draggingConnection
      const targetId = hoveredInputPort
      if (sourceId !== targetId) {
        try {
          const data: any = {}
          if (sourcePort === 'next') data.nextNodeId = targetId
          else if (sourcePort === 'true') data.trueNodeId = targetId
          else if (sourcePort === 'false') data.falseNodeId = targetId
          await adminApi.connectNodes(sourceId, data)
          toast.success('Связь создана')
          fetchData()
        } catch (e: any) { toast.error('Ошибка: ' + (e.message || '')) }
      }
    }
    setPanning(null); setDragging(null); setDraggingConnection(null); setHoveredInputPort(null)
  }, [dragging, nodes, draggingConnection, hoveredInputPort, debouncedSavePosition, fetchData])

  const handleNodeMouseDown = (e: React.MouseEvent, node: FunnelNode) => {
    e.stopPropagation()
    if ((e.target as HTMLElement).closest('[data-port]')) return
    setDragging({ nodeId: node.id, startX: e.clientX, startY: e.clientY, origPosX: node.posX, origPosY: node.posY })
  }

  const handleOutputPortMouseDown = (e: React.MouseEvent, nodeId: string, port: 'next' | 'true' | 'false') => {
    e.stopPropagation(); e.preventDefault()
    const canvas = canvasRef.current
    if (canvas) {
      const rect = canvas.getBoundingClientRect()
      setDraggingConnection({ sourceId: nodeId, sourcePort: port, mouseX: e.clientX - rect.left, mouseY: e.clientY - rect.top })
    }
  }

  const handleInputPortMouseEnter = (nodeId: string) => { if (draggingConnection) setHoveredInputPort(nodeId) }
  const handleInputPortMouseLeave = () => setHoveredInputPort(null)

  const deleteConnection = async (sourceId: string, type: 'next' | 'true' | 'false') => {
    try {
      const data: any = {}
      if (type === 'next') data.nextNodeId = null
      else if (type === 'true') data.trueNodeId = null
      else if (type === 'false') data.falseNodeId = null
      await adminApi.connectNodes(sourceId, data)
      toast.success('Связь удалена')
      fetchData()
    } catch (e: any) { toast.error('Ошибка: ' + (e.message || '')) }
  }

  /* ── Wheel zoom ────────────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const handler = (e: WheelEvent) => { e.preventDefault(); setZoom(z => Math.max(0.3, Math.min(1.5, z - e.deltaY * 0.001))) }
    canvas.addEventListener('wheel', handler, { passive: false })
    return () => canvas.removeEventListener('wheel', handler)
  }, [])

  /* ── Auto-layout ────────────────────────────────────────── */
  const autoLayout = async () => {
    const H_GAP = 300; const V_GAP = 150
    const positions: Record<string, { x: number; y: number }> = {}
    const visited = new Set<string>()
    const childrenOf: Record<string, string[]> = {}
    const getChildren = (id: string): string[] => {
      const node = nodeMap.get(id); if (!node) return []
      const kids: string[] = []
      if (node.nextNodeId && !visited.has(node.nextNodeId) && nodeMap.has(node.nextNodeId)) kids.push(node.nextNodeId)
      if (node.trueNodeId && !visited.has(node.trueNodeId) && nodeMap.has(node.trueNodeId)) kids.push(node.trueNodeId)
      if (node.falseNodeId && !visited.has(node.falseNodeId) && nodeMap.has(node.falseNodeId)) kids.push(node.falseNodeId)
      return [...new Set(kids)]
    }
    const referenced = new Set<string>()
    nodes.forEach(n => {
      if (n.nextNodeId) referenced.add(n.nextNodeId)
      if (n.trueNodeId) referenced.add(n.trueNodeId)
      if (n.falseNodeId) referenced.add(n.falseNodeId)
    })
    const roots = nodes.filter(n => !referenced.has(n.id) || n.nodeType === 'trigger')
    if (roots.length === 0 && nodes.length > 0) roots.push(nodes[0])
    const queue: string[] = []
    roots.forEach(r => { visited.add(r.id); queue.push(r.id) })
    while (queue.length > 0) {
      const id = queue.shift()!
      const kids = getChildren(id).filter(k => !visited.has(k))
      kids.forEach(k => visited.add(k))
      childrenOf[id] = kids
      queue.push(...kids)
    }
    nodes.forEach(n => { if (!visited.has(n.id)) visited.add(n.id) })
    const subtreeWidth: Record<string, number> = {}
    const calcWidth = (id: string): number => {
      if (subtreeWidth[id] !== undefined) return subtreeWidth[id]
      const kids = childrenOf[id] || []
      if (kids.length === 0) { subtreeWidth[id] = 1; return 1 }
      const w = kids.reduce((sum, k) => sum + calcWidth(k), 0)
      subtreeWidth[id] = w; return w
    }
    let globalOffset = 0
    const layoutTree = (rootId: string) => {
      calcWidth(rootId)
      const place = (id: string, depth: number, leftX: number) => {
        const kids = childrenOf[id] || []
        const myWidth = subtreeWidth[id] || 1
        const myX = leftX + (myWidth * H_GAP) / 2 - H_GAP / 2
        positions[id] = { x: myX, y: depth * V_GAP }
        let childLeft = leftX
        kids.forEach(kid => { const kidW = subtreeWidth[kid] || 1; place(kid, depth + 1, childLeft); childLeft += kidW * H_GAP })
      }
      place(rootId, 0, globalOffset)
      globalOffset += (subtreeWidth[rootId] || 1) * H_GAP + H_GAP
    }
    roots.forEach(r => layoutTree(r.id))
    const orphans = nodes.filter(n => !positions[n.id])
    if (orphans.length > 0) {
      const maxY = Math.max(...Object.values(positions).map(p => p.y), 0)
      orphans.forEach((n, i) => { positions[n.id] = { x: i * H_GAP, y: maxY + V_GAP * 2 } })
    }
    const updates: Promise<any>[] = []
    setGroups(prev => prev.map(g => ({
      ...g,
      nodes: g.nodes.map(n => {
        const pos = positions[n.id]
        if (pos) {
          updates.push(adminApi.updateNodePosition(n.id, pos.x, pos.y).catch(() => {}))
          return { ...n, posX: pos.x, posY: pos.y }
        }
        return n
      }),
    })))
    await Promise.all(updates)
    toast.success('Расположение обновлено')
  }

  const fitAll = () => {
    if (nodes.length === 0) return
    const minX = Math.min(...nodes.map(n => n.posX))
    const minY = Math.min(...nodes.map(n => n.posY))
    const maxX = Math.max(...nodes.map(n => n.posX + NODE_W))
    const maxY = Math.max(...nodes.map(n => n.posY + NODE_H))
    const canvas = canvasRef.current; if (!canvas) return
    const cw = canvas.clientWidth; const ch = canvas.clientHeight
    const newZoom = Math.min(cw / (maxX - minX + 100), ch / (maxY - minY + 100), 1.5)
    setZoom(Math.max(0.3, Math.min(newZoom, 1.5)))
    setPanX(-minX * newZoom + 50)
    setPanY(-minY * newZoom + 50)
  }

  /* ── Logs ───────────────────────────────────────────────── */
  const loadLogs = async () => {
    if (!activeGroupId) return
    try {
      const res = await adminApi.funnelLogs(activeGroupId)
      setLogs(res.logs); setLogsTotal(res.total); setShowLogs(true)
    } catch (e: any) { toast.error('Ошибка: ' + (e.message || '')) }
  }

  /* ── Text helpers ──────────────────────────────────────── */
  const insertAtCursor = (before: string, after: string = '') => {
    const ta = document.getElementById('funnel-tg-text') as HTMLTextAreaElement | null
    if (!ta) { updateField('tgText', (editForm.tgText || '') + before + after); return }
    const start = ta.selectionStart; const end = ta.selectionEnd
    const txt = editForm.tgText || ''
    const selected = txt.slice(start, end)
    const newText = txt.slice(0, start) + before + selected + after + txt.slice(end)
    updateField('tgText', newText)
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + before.length, start + before.length + selected.length) }, 0)
  }

  /* ── Connections (memoized) ────────────────────────────── */
  const getConnections = useMemo(() => {
    const conns: { from: string; to: string; type: 'next' | 'true' | 'false' }[] = []
    nodes.forEach(n => {
      if (n.nextNodeId && nodeMap.has(n.nextNodeId)) conns.push({ from: n.id, to: n.nextNodeId, type: 'next' })
      if (n.trueNodeId && nodeMap.has(n.trueNodeId)) conns.push({ from: n.id, to: n.trueNodeId, type: 'true' })
      if (n.falseNodeId && nodeMap.has(n.falseNodeId)) conns.push({ from: n.id, to: n.falseNodeId, type: 'false' })
    })
    return conns
  }, [nodes, nodeMap])

  /* ── Port positions ────────────────────────────────────── */
  const getInputPortPos = (node: FunnelNode) => ({
    x: node.posX * zoom + panX + (NODE_W * zoom) / 2,
    y: node.posY * zoom + panY,
  })

  const getOutputPortPos = (node: FunnelNode, _port: 'next' | 'true' | 'false') => {
    const baseX = node.posX * zoom + panX
    const baseY = node.posY * zoom + panY + NODE_H * zoom
    return { x: baseX + (NODE_W * zoom) / 2, y: baseY }
  }

  /* ── Node display helpers ─────────────────────────────── */
  const getNodeColor = (node: FunnelNode): string => {
    if (node.nodeType === 'trigger') return '#ef4444'
    if (node.nodeType === 'stop') return '#6b7280'
    return '#06b6d4'
  }

  const getNodeTitle = (node: FunnelNode): string => {
    if (node.nodeType === 'trigger') {
      return TRIGGER_LABELS[node.triggerType || ''] || node.name || 'Триггер'
    }
    if (node.nodeType === 'stop') return 'Стоп'
    return node.name || 'Сообщение'
  }

  const getNodeLine1 = (node: FunnelNode): string => {
    const parts: string[] = []
    if (node.channelTg) parts.push('📱TG')
    if (node.channelEmail) parts.push('📧Email')
    if (node.channelLk) parts.push('🔔ЛК')
    if (node.channelPush) parts.push('📣Push')
    // delay
    if (node.delayType === 'immediate' || !node.delayType) parts.push('⏰ Сразу')
    else if (node.delayType === 'minutes') parts.push(`⏰ ${node.delayValue} мин`)
    else if (node.delayType === 'hours') parts.push(`⏰ ${node.delayValue} ч`)
    else if (node.delayType === 'days') parts.push(`⏰ ${node.delayValue} дн`)
    else if (node.delayType === 'exact_time') parts.push(`⏰ ${node.delayTime || '?'}`)
    else if (node.delayType === 'weekdays') parts.push('⏰ по дням')
    return parts.join(' · ')
  }

  const getNodeLine2 = (node: FunnelNode): string => {
    if (node.nodeType === 'stop') return 'Остановить цепочку'
    const text = node.tgText || node.emailSubject || node.lkTitle || ''
    if (!text) return 'Пустое сообщение'
    return text.length > 40 ? text.slice(0, 40) + '...' : text
  }

  const getNodeLine3 = (node: FunnelNode): string => {
    const parts: string[] = []
    if (node.actionType && node.actionType !== 'none') {
      const at = ACTION_TYPES.find(a => a.value === node.actionType)
      parts.push(`🎁 ${at?.label || node.actionType}${node.actionValue ? ' ' + node.actionValue : ''}`)
    }
    if (node.conditionType) {
      const ct = CONDITION_TYPES.find(c => c.value === node.conditionType)
      parts.push(`✓ если ${ct?.label || node.conditionType}`)
    }
    return parts.join(' · ')
  }

  /* ── Tabs for right panel ─────────────────────────────── */
  const getAvailableTabs = (node: Partial<FunnelNode>) => {
    const tabs: { key: typeof activeTab; label: string }[] = []
    if (node.nodeType === 'trigger') tabs.push({ key: 'event', label: 'Событие' })
    tabs.push({ key: 'when', label: 'Когда' })
    if (node.nodeType !== 'stop') tabs.push({ key: 'message', label: 'Сообщение' })
    tabs.push({ key: 'action', label: 'Действие' })
    tabs.push({ key: 'condition', label: 'Условие' })
    return tabs
  }

  /* ================================================================
     Render
     ================================================================ */

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-2 border-transparent"
               style={{ borderTopColor: 'var(--accent-1)', borderRightColor: '#06b6d4', animation: 'spin 0.8s linear infinite' }} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-80px)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, #ef4444, #f59e0b)' }}>
            <Workflow className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Конструктор воронок</h1>
            <p className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
              {groups.length} воронок, {nodes.length} нод{activeGroup ? ` в "${activeGroup.name}"` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeGroup && (
            <>
              <button onClick={() => toggleGroup(activeGroup.id)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors"
                      style={{ background: activeGroup.enabled ? '#22c55e22' : 'var(--surface-2)', border: '1px solid var(--glass-border)', color: activeGroup.enabled ? '#22c55e' : 'var(--text-secondary)' }}>
                {activeGroup.enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                {activeGroup.enabled ? 'Включена' : 'Выключена'}
              </button>
              <button onClick={() => setShowSettings(true)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors"
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
                <Settings className="w-4 h-4" />
              </button>
              <button onClick={loadLogs}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors"
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
                <FileText className="w-4 h-4" /> Логи
              </button>
            </>
          )}
        </div>
      </div>

      {/* 3-panel layout */}
      <div className="flex flex-1 gap-0 min-h-0 rounded-2xl overflow-hidden" style={{ border: '1px solid var(--glass-border)' }}>

        {/* ═══════ LEFT PANEL — Groups (260px) ═══════ */}
        <div className="w-[260px] flex-shrink-0 flex flex-col overflow-hidden"
             style={{ background: 'var(--glass-bg)', borderRight: '1px solid var(--glass-border)' }}>
          <div className="p-3" style={{ borderBottom: '1px solid var(--glass-border)' }}>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
              <input type="text" placeholder="Поиск воронок..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                     className="w-full pl-8 pr-3 py-2 rounded-lg text-[12px]"
                     style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredGroups.map(group => (
              <div key={group.id}
                   className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors group"
                   style={{
                     background: activeGroupId === group.id ? 'rgba(6,182,212,0.12)' : 'transparent',
                     color: activeGroupId === group.id ? '#a78bfa' : 'var(--text-secondary)',
                   }}
                   onClick={() => { setActiveGroupId(group.id); selectNode(null) }}>
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: group.enabled ? '#22c55e' : '#6b7280' }} />
                <span className="text-[12px] font-medium truncate flex-1">{group.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                      style={{ background: 'var(--surface-2)', color: 'var(--text-tertiary)' }}>
                  {group.nodes?.length || 0}
                </span>
                <button onClick={e => { e.stopPropagation(); duplicateGroup(group.id) }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-white/10" title="Дублировать">
                  <Copy className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />
                </button>
                <button onClick={e => { e.stopPropagation(); deleteGroup(group.id) }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-red-500/20" title="Удалить">
                  <Trash2 className="w-3 h-3 text-red-400" />
                </button>
              </div>
            ))}
            {showNewGroup ? (
              <div className="p-2 rounded-lg" style={{ background: 'var(--surface-2)' }}>
                <input type="text" placeholder="Имя воронки" value={newGroupName}
                       onChange={e => setNewGroupName(e.target.value)}
                       onKeyDown={e => e.key === 'Enter' && createGroup()}
                       className="w-full px-2 py-1.5 rounded text-[12px] mb-2"
                       style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                       autoFocus />
                <div className="flex gap-1">
                  <button onClick={createGroup} className="flex-1 px-2 py-1 rounded text-[11px] font-medium text-white" style={{ background: 'var(--accent-1)' }}>Создать</button>
                  <button onClick={() => { setShowNewGroup(false); setNewGroupName('') }} className="px-2 py-1 rounded text-[11px]" style={{ color: 'var(--text-tertiary)' }}>Отмена</button>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <button onClick={() => setShowNewGroup(true)}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-[12px] transition-colors hover:bg-white/5"
                        style={{ color: 'var(--text-tertiary)' }}>
                  <Plus className="w-3.5 h-3.5" /> Создать воронку
                </button>
                <button onClick={openTemplates}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-[12px] font-medium transition-colors hover:bg-white/10"
                        style={{ color: 'var(--accent-1)', background: 'var(--surface-2)' }}>
                  📚 Готовые шаблоны
                </button>
                <button onClick={() => { setShowWizard(true); setWizStep(0) }}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-[12px] font-medium transition-colors hover:bg-white/10"
                        style={{ color: '#a855f7', background: 'var(--surface-2)' }}>
                  ✨ Wizard (пошаговый)
                </button>
                <a href="/admin/communications/funnel-builder/guide"
                   className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-[12px] transition-colors hover:bg-white/10"
                   style={{ color: 'var(--text-tertiary)' }}>
                  📖 Гайд по воронкам
                </a>
              </div>
            )}
          </div>
        </div>

        {/* ═══════ CENTER — Canvas ═══════ */}
        <div className="flex-1 relative overflow-hidden" style={{ background: 'var(--surface-1)' }}>
          {/* Canvas Toolbar */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 px-2 py-1 rounded-xl"
               style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
            {/* Add node menu */}
            <div className="relative">
              <button onClick={() => setShowAddNodeMenu(v => !v)}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-white/10 text-[11px] font-medium"
                      style={{ color: 'var(--text-primary)' }}>
                <Plus className="w-3.5 h-3.5" /> Нода
              </button>
              {showAddNodeMenu && (
                <div className="absolute top-full left-0 mt-1 w-80 rounded-xl shadow-xl z-50 p-2 max-h-[70vh] overflow-y-auto"
                     style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', boxShadow: '0 12px 40px rgba(0,0,0,0.4)' }}>
                  {/* Smart Presets */}
                  <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: '#a855f7' }}>
                    ⚡ Умные пресеты (готовые цепочки)
                  </div>
                  {NODE_PRESETS.map(p => (
                    <button key={p.id}
                            onClick={() => createPreset(p.id)}
                            className="flex items-start gap-2.5 w-full px-2 py-2 rounded-lg text-left hover:bg-white/[0.06] transition-colors"
                            style={{ color: 'var(--text-primary)' }}>
                      <div className="text-[18px] leading-none shrink-0 mt-0.5">{p.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium truncate">{p.name}</div>
                        <div className="text-[10px] truncate" style={{ color: 'var(--text-tertiary)' }}>
                          {p.description}
                        </div>
                      </div>
                      <span className="text-[9px] shrink-0 px-1.5 py-0.5 rounded-full mt-0.5"
                            style={{ background: '#a855f722', color: '#a855f7' }}>
                        {p.nodes.length}
                      </span>
                    </button>
                  ))}
                  <div className="my-2 border-t" style={{ borderColor: 'var(--glass-border)' }} />
                  {/* Triggers */}
                  <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: '#ef4444' }}>
                    <Zap className="w-3 h-3" /> Триггеры (начало цепочки)
                  </div>
                  {TRIGGER_PALETTE.map(cat => (
                    <div key={cat.title} className="mb-1">
                      <div className="px-2 py-0.5 text-[10px] font-medium" style={{ color: 'var(--text-tertiary)' }}>
                        {cat.icon} {cat.title}
                      </div>
                      {cat.items.map(item => (
                        <button key={item.id}
                                onClick={() => createNode(item.nodeType, item.label, item.defaults)}
                                className="flex items-center gap-2.5 w-full px-2 py-1.5 rounded-lg text-[12px] hover:bg-white/[0.06] transition-colors"
                                style={{ color: 'var(--text-primary)' }}>
                          <div className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                               style={{ background: '#ef444422' }}>
                            <Zap className="w-3 h-3" style={{ color: '#ef4444' }} />
                          </div>
                          <span className="truncate">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                  <div className="my-2 border-t" style={{ borderColor: 'var(--glass-border)' }} />
                  {/* Steps */}
                  <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: '#06b6d4' }}>
                    <MessageCircle className="w-3 h-3" /> Шаги цепочки
                  </div>
                  {STEP_PALETTE.map(cat => (
                    <div key={cat.title} className="mb-1">
                      {cat.items.map(item => {
                        const isStop = item.nodeType === 'stop'
                        return (
                          <button key={item.id}
                                  onClick={() => createNode(item.nodeType, item.label, item.defaults)}
                                  className="flex items-center gap-2.5 w-full px-2 py-1.5 rounded-lg text-[12px] hover:bg-white/[0.06] transition-colors"
                                  style={{ color: 'var(--text-primary)' }}>
                            <div className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                                 style={{ background: isStop ? '#6b728022' : '#06b6d422' }}>
                              {isStop
                                ? <StopCircle className="w-3 h-3" style={{ color: '#6b7280' }} />
                                : <MessageCircle className="w-3 h-3" style={{ color: '#06b6d4' }} />
                              }
                            </div>
                            <span className="truncate">{item.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="w-px h-5 mx-1" style={{ background: 'var(--glass-border)' }} />
            <button onClick={() => setZoom(z => Math.max(z - 0.15, 0.3))} className="p-1.5 rounded-lg hover:bg-white/10">
              <Minus className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
            </button>
            <span className="text-[10px] w-10 text-center" style={{ color: 'var(--text-tertiary)' }}>{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(z + 0.15, 1.5))} className="p-1.5 rounded-lg hover:bg-white/10">
              <Plus className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
            </button>
            <div className="w-px h-5 mx-1" style={{ background: 'var(--glass-border)' }} />
            <button onClick={fitAll} className="p-1.5 rounded-lg hover:bg-white/10" title="Показать все">
              <Maximize2 className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
            </button>
            <button onClick={autoLayout} className="p-1.5 rounded-lg hover:bg-white/10" title="Авто-раскладка">
              <LayoutGrid className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
            </button>
            <button onClick={openAnalytics} className="p-1.5 rounded-lg hover:bg-white/10" title="Аналитика">
              📊
            </button>
            <button onClick={runValidation} className="p-1.5 rounded-lg hover:bg-white/10" title="Валидация">
              ✓
            </button>
            <button onClick={() => { setShowSimulator(true); setSimulation(null) }} className="p-1.5 rounded-lg hover:bg-white/10" title="Симулятор">
              🧪
            </button>
            <div className="w-px h-5 mx-1" style={{ background: 'var(--glass-border)' }} />
            <span className="text-[10px] px-1.5" style={{ color: 'var(--text-tertiary)' }}>{nodes.length} нод</span>
          </div>

          {draggingConnection && (
            <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 text-[11px] px-3 py-1.5 rounded-lg"
                 style={{ background: 'rgba(139,92,246,0.9)', color: '#fff' }}>
              Отпустите на входном порте ноды для создания связи
            </div>
          )}

          {/* Canvas area */}
          <div ref={canvasRef} className="w-full h-full cursor-grab active:cursor-grabbing"
               onMouseDown={handleCanvasMouseDown} onMouseMove={handleCanvasMouseMove}
               onMouseUp={handleCanvasMouseUp} onMouseLeave={handleCanvasMouseUp}
               style={{ position: 'relative' }}>
            {/* Grid */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: 0.06 }}>
              <defs>
                <pattern id="funnel-grid" width={20 * zoom} height={20 * zoom} patternUnits="userSpaceOnUse"
                         x={panX % (20 * zoom)} y={panY % (20 * zoom)}>
                  <circle cx={1} cy={1} r={1} fill="currentColor" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#funnel-grid)" />
            </svg>

            {/* Empty state */}
            {nodes.length === 0 && !loading && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center space-y-2" style={{ color: 'var(--text-tertiary)' }}>
                  <Workflow className="w-12 h-12 mx-auto" style={{ opacity: 0.3 }} />
                  <p className="text-sm font-medium">{activeGroup ? 'Воронка пуста' : 'Выберите воронку'}</p>
                  <p className="text-xs">{activeGroup ? 'Добавьте ноды через кнопку "+ Нода" вверху' : 'Выберите или создайте воронку в панели слева'}</p>
                </div>
              </div>
            )}

            {nodes.length > 0 && !draggingConnection && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 text-[10px] px-3 py-1 rounded-full"
                   style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-tertiary)' }}>
                Тяните от порта к другой ноде для создания связи
              </div>
            )}

            {/* SVG Connections */}
            <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 1, pointerEvents: 'none' }}>
              {getConnections.map((conn, i) => {
                const fromNode = nodeMap.get(conn.from); const toNode = nodeMap.get(conn.to)
                if (!fromNode || !toNode) return null
                const from = getOutputPortPos(fromNode, conn.type); const to = getInputPortPos(toNode)
                const x1 = from.x, y1 = from.y, x2 = to.x, y2 = to.y
                const isHighlighted = selectedNodeId === conn.from || selectedNodeId === conn.to
                let strokeColor = '#6b7280'; let dashArray = ''
                const lineOpacity = isHighlighted ? 0.9 : 0.35; const lineWidth = isHighlighted ? 2.5 : 1.5
                if (conn.type === 'true') { strokeColor = '#22c55e'; dashArray = '6,3' }
                else if (conn.type === 'false') { strokeColor = '#ef4444'; dashArray = '6,3' }
                const midY = (y1 + y2) / 2
                const pathD = `M ${x1} ${y1} C ${x1} ${midY} ${x2} ${midY} ${x2} ${y2}`
                return (
                  <g key={`${conn.from}-${conn.to}-${conn.type}-${i}`}>
                    <path d={pathD} fill="none" stroke={strokeColor} strokeWidth={lineWidth} strokeDasharray={dashArray} opacity={lineOpacity} />
                    {(conn.type === 'true' || conn.type === 'false') && (
                      <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 8} textAnchor="middle" fill={strokeColor} fontSize={10 * zoom} opacity={0.8}>
                        {conn.type === 'true' ? 'Да' : 'Нет'}
                      </text>
                    )}
                    <circle cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} r={8} fill="transparent"
                            style={{ pointerEvents: 'all', cursor: 'pointer' }}
                            onClick={() => deleteConnection(conn.from, conn.type)} />
                    {isHighlighted && (
                      <circle cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} r={5} fill="#ef4444" opacity={0.6} style={{ pointerEvents: 'none' }} />
                    )}
                  </g>
                )
              })}
              {draggingConnection && (() => {
                const fromNode = nodeMap.get(draggingConnection.sourceId); if (!fromNode) return null
                const from = getOutputPortPos(fromNode, draggingConnection.sourcePort)
                const x1 = from.x, y1 = from.y, x2 = draggingConnection.mouseX, y2 = draggingConnection.mouseY
                const midY = (y1 + y2) / 2
                return <path d={`M ${x1} ${y1} C ${x1} ${midY} ${x2} ${midY} ${x2} ${y2}`}
                             fill="none" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="6,3" opacity={0.7} />
              })()}
            </svg>

            {/* NODES */}
            {nodes.map(node => {
              const color = getNodeColor(node)
              const isSelected = selectedNodeId === node.id
              const title = getNodeTitle(node)
              const line1 = getNodeLine1(node)
              const line2 = getNodeLine2(node)
              const line3 = getNodeLine3(node)

              return (
                <div key={node.id} data-node
                     className="absolute rounded-xl shadow-lg transition-shadow"
                     style={{
                       left: node.posX * zoom + panX,
                       top: node.posY * zoom + panY,
                       width: NODE_W * zoom,
                       height: NODE_H * zoom,
                       zIndex: isSelected ? 10 : 2,
                       background: 'var(--glass-bg)',
                       border: `2px solid ${isSelected ? color : 'var(--glass-border)'}`,
                       // blur removed,
                       cursor: dragging?.nodeId === node.id ? 'grabbing' : 'grab',
                       overflow: 'hidden',
                     }}
                     onMouseDown={e => handleNodeMouseDown(e, node)}
                     onClick={e => { e.stopPropagation(); selectNode(node) }}>
                  {/* Color top bar */}
                  <div style={{ height: 3 * zoom, background: color, width: '100%' }} />

                  {/* Input port (top) */}
                  {node.nodeType !== 'trigger' && (
                    <div data-port
                         className="absolute -top-[6px] left-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 transition-all"
                         style={{
                           background: hoveredInputPort === node.id ? 'var(--accent-1)' : 'var(--surface-1)',
                           borderColor: hoveredInputPort === node.id ? 'var(--accent-1)' : 'var(--glass-border)',
                           transform: `translate(-50%, 0) scale(${hoveredInputPort === node.id ? 1.3 : 1})`,
                           zIndex: 20, cursor: 'crosshair',
                         }}
                         onMouseEnter={() => handleInputPortMouseEnter(node.id)}
                         onMouseLeave={handleInputPortMouseLeave} />
                  )}

                  {/* Header row */}
                  <div className="flex items-center gap-1 px-2 py-1" style={{ minHeight: 0 }}>
                    <span style={{ fontSize: `${12 * zoom}px`, lineHeight: 1.2 }}>
                      {node.nodeType === 'trigger' ? '⚡' : node.nodeType === 'stop' ? '⏹' : '📨'}
                    </span>
                    <span className="font-semibold truncate flex-1"
                          style={{ color: 'var(--text-primary)', fontSize: `${12 * zoom}px`, lineHeight: 1.2 }}>
                      {title}
                    </span>
                    {isSelected && (
                      <>
                        <button data-port onClick={e => { e.stopPropagation(); duplicateNode(node.id) }}
                                className="p-0.5 rounded hover:bg-white/10" title="Копировать">
                          <Copy className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />
                        </button>
                        <button data-port onClick={e => { e.stopPropagation(); setDeleteConfirmId(node.id) }}
                                className="p-0.5 rounded hover:bg-red-500/20" title="Удалить">
                          <Trash2 className="w-3 h-3 text-red-400" />
                        </button>
                      </>
                    )}
                  </div>

                  {/* Preview lines */}
                  <div className="px-2 space-y-0.5" style={{ overflow: 'hidden' }}>
                    {line1 && (
                      <p className="truncate" style={{ color: 'var(--text-secondary)', fontSize: `${11 * zoom}px`, lineHeight: 1.3 }}>
                        {line1}
                      </p>
                    )}
                    <p className="truncate" style={{ color: 'var(--text-tertiary)', fontSize: `${11 * zoom}px`, lineHeight: 1.3, fontStyle: 'italic' }}>
                      {line2}
                    </p>
                    {line3 && (
                      <p className="truncate" style={{ color: 'var(--text-secondary)', fontSize: `${10 * zoom}px`, lineHeight: 1.3 }}>
                        {line3}
                      </p>
                    )}
                  </div>

                  {/* Output port (bottom) */}
                  {node.nodeType !== 'stop' && (
                    <div data-port
                         className="absolute -bottom-[6px] left-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 cursor-crosshair"
                         style={{ background: color, borderColor: color, zIndex: 20 }}
                         onMouseDown={e => handleOutputPortMouseDown(e, node.id, 'next')} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ═══════ RIGHT PANEL — Editor (420px) ═══════ */}
        {rightPanelOpen && selectedNode && (
          <div className="w-[420px] flex-shrink-0 flex flex-col overflow-hidden"
               style={{ background: 'var(--glass-bg)', borderLeft: '1px solid var(--glass-border)' }}>
            {/* Panel header */}
            <div className="flex items-center justify-between p-3" style={{ borderBottom: '1px solid var(--glass-border)' }}>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span style={{ fontSize: 16 }}>
                  {editForm.nodeType === 'trigger' ? '⚡' : editForm.nodeType === 'stop' ? '⏹' : '📨'}
                </span>
                <input value={editForm.name || ''} onChange={e => updateField('name', e.target.value)}
                       className="text-[14px] font-semibold bg-transparent border-none outline-none flex-1 min-w-0"
                       style={{ color: 'var(--text-primary)' }} />
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {autoSaving && <span className="text-[10px]" style={{ color: '#22c55e' }}>Сохранение...</span>}
                {editDirty && !autoSaving && <span className="text-[10px]" style={{ color: '#f59e0b' }}>Изменено</span>}
                <button onClick={() => selectNode(null)} className="p-1 rounded hover:bg-white/10">
                  <X className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                </button>
              </div>
            </div>

            {/* TABS */}
            <div className="flex gap-0 px-2 pt-2" style={{ borderBottom: '1px solid var(--glass-border)' }}>
              {getAvailableTabs(editForm).map(tab => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                        className="px-3 py-2 text-[13px] font-medium transition-colors relative"
                        style={{
                          color: activeTab === tab.key ? 'var(--text-primary)' : 'var(--text-tertiary)',
                        }}>
                  {tab.label}
                  {activeTab === tab.key && (
                    <div className="absolute bottom-0 left-1 right-1 h-[2px] rounded-full" style={{ background: 'var(--accent-1)' }} />
                  )}
                </button>
              ))}
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto p-3 space-y-4" style={{ fontSize: 14 }}>

              {/* ═══ TAB: EVENT (trigger only) ═══ */}
              {activeTab === 'event' && editForm.nodeType === 'trigger' && (
                <div className="space-y-3">
                  <label className="text-[13px] font-medium block" style={{ color: 'var(--text-tertiary)' }}>Тип триггера</label>
                  <select className="w-full px-3 py-2 rounded-lg text-[14px]"
                          style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                          value={editForm.triggerType || ''}
                          onChange={e => updateField('triggerType', e.target.value)}>
                    <option value="">-- Выберите триггер --</option>
                    {Object.entries(triggersByCategory).map(([cat, triggers]) => (
                      <optgroup key={cat} label={categoryLabels[cat] || cat}>
                        {triggers.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  {(() => {
                    const t: any = triggerConfig?.triggers?.find((tr: any) => tr.id === editForm.triggerType)
                    if (!t?.hasParam) return null
                    const defaultUnit = t.defaultUnit || 'hours'
                    return (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[13px] font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>{t.paramLabel || 'N'}</label>
                          <input type="number" value={editForm.triggerParam ?? ''}
                                 onChange={e => updateField('triggerParam', e.target.value ? Number(e.target.value) : null)}
                                 placeholder={String(t.defaultParam ?? '')}
                                 className="w-full px-3 py-2 rounded-lg text-[14px]"
                                 style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                        </div>
                        <div>
                          <label className="text-[13px] font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>Единица</label>
                          <select value={editForm.delayType || defaultUnit}
                                  onChange={e => updateField('delayType', e.target.value)}
                                  className="w-full px-3 py-2 rounded-lg text-[14px]"
                                  style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
                            <option value="minutes">минут</option>
                            <option value="hours">часов</option>
                            <option value="days">дней</option>
                            <option value="weeks">недель</option>
                          </select>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* ═══ TAB: WHEN ═══ */}
              {activeTab === 'when' && (
                <div className="space-y-3">
                  <label className="text-[13px] font-medium block" style={{ color: 'var(--text-tertiary)' }}>Когда отправить</label>
                  <select value={editForm.delayType || 'immediate'}
                          onChange={e => updateField('delayType', e.target.value)}
                          className="w-full px-3 py-2 rounded-lg text-[14px]"
                          style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
                    <option value="immediate">Сразу</option>
                    <option value="seconds">Через N секунд</option>
                    <option value="minutes">Через N минут</option>
                    <option value="hours">Через N часов</option>
                    <option value="days">Через N дней</option>
                    <option value="weeks">Через N недель</option>
                    <option value="exact_time">В точное время</option>
                    <option value="weekdays">По дням недели</option>
                  </select>
                  {['seconds', 'minutes', 'hours', 'days', 'weeks'].includes(editForm.delayType || '') && (
                    <div>
                      <label className="text-[13px] font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>Значение</label>
                      <input type="number" value={editForm.delayValue ?? 0}
                             onChange={e => updateField('delayValue', Number(e.target.value))}
                             className="w-full px-3 py-2 rounded-lg text-[14px]"
                             style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                    </div>
                  )}
                  {editForm.delayType === 'exact_time' && (
                    <div>
                      <label className="text-[13px] font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>Время (HH:MM)</label>
                      <input type="time" value={editForm.delayTime || ''}
                             onChange={e => updateField('delayTime', e.target.value)}
                             className="w-full px-3 py-2 rounded-lg text-[14px]"
                             style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                    </div>
                  )}
                  {editForm.delayType === 'weekdays' && (
                    <div>
                      <label className="text-[13px] font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>Дни недели</label>
                      <div className="flex gap-1">
                        {['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map((d, i) => {
                          const days = (editForm.delayWeekdays as number[]) || []
                          const active = days.includes(i + 1)
                          return (
                            <button key={i} onClick={() => {
                              const newDays = active ? days.filter(x => x !== i + 1) : [...days, i + 1]
                              updateField('delayWeekdays', newDays.sort())
                            }}
                                    className="w-9 h-9 rounded-lg text-[13px] font-medium transition-colors"
                                    style={{
                                      background: active ? 'var(--accent-1)' : 'var(--surface-2)',
                                      color: active ? '#fff' : 'var(--text-secondary)',
                                      border: `1px solid ${active ? 'var(--accent-1)' : 'var(--glass-border)'}`,
                                    }}>
                              {d}
                            </button>
                          )
                        })}
                      </div>
                      <div className="mt-2">
                        <label className="text-[13px] font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>Время (HH:MM)</label>
                        <input type="time" value={editForm.delayTime || ''}
                               onChange={e => updateField('delayTime', e.target.value)}
                               className="w-full px-3 py-2 rounded-lg text-[14px]"
                               style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ═══ TAB: MESSAGE ═══ */}
              {activeTab === 'message' && editForm.nodeType !== 'stop' && (
                <div className="space-y-3">
                  {/* Channel checkboxes */}
                  <div className="flex items-center gap-3">
                    {[
                      { key: 'channelTg', label: '📱 TG' },
                      { key: 'channelEmail', label: '📧 Email' },
                      { key: 'channelLk', label: '🔔 ЛК' },
                      { key: 'channelPush', label: '📣 Push' },
                    ].map(ch => (
                      <label key={ch.key} className="flex items-center gap-1 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                        <input type="checkbox" checked={!!(editForm as any)[ch.key]}
                               onChange={e => updateField(ch.key, e.target.checked)} className="rounded" />
                        {ch.label}
                      </label>
                    ))}
                  </div>

                  {/* Sub-tabs: TG / Email / LK */}
                  <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: 'var(--surface-2)' }}>
                    {(['tg', 'email', 'lk'] as const).map(tab => (
                      <button key={tab} onClick={() => setMsgSubTab(tab)}
                              className="flex-1 px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors"
                              style={{
                                background: msgSubTab === tab ? 'var(--glass-bg)' : 'transparent',
                                color: msgSubTab === tab ? 'var(--text-primary)' : 'var(--text-tertiary)',
                              }}>
                        {tab === 'tg' ? 'Telegram' : tab === 'email' ? 'Email' : 'ЛК'}
                      </button>
                    ))}
                  </div>

                  {/* ── TG sub-tab ── */}
                  {msgSubTab === 'tg' && (
                    <div className="space-y-3">
                      {/* Toolbar */}
                      <div className="flex items-center gap-0.5 p-1 rounded-lg flex-wrap" style={{ background: 'var(--surface-2)' }}>
                        <button onClick={() => insertAtCursor('**', '**')} className="p-1.5 rounded hover:bg-white/10" title="Жирный" style={{ color: 'var(--text-tertiary)' }}>
                          <Bold className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => insertAtCursor('_', '_')} className="p-1.5 rounded hover:bg-white/10" title="Курсив" style={{ color: 'var(--text-tertiary)' }}>
                          <Italic className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => insertAtCursor('`', '`')} className="p-1.5 rounded hover:bg-white/10" title="Код" style={{ color: 'var(--text-tertiary)' }}>
                          <Code className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => insertAtCursor('[текст](', ')')} className="p-1.5 rounded hover:bg-white/10" title="Ссылка" style={{ color: 'var(--text-tertiary)' }}>
                          <Link2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => insertAtCursor('> ', '')} className="p-1.5 rounded hover:bg-white/10" title="Цитата" style={{ color: 'var(--text-tertiary)' }}>
                          <Quote className="w-3.5 h-3.5" />
                        </button>
                        <div className="w-px h-4 mx-1" style={{ background: 'var(--glass-border)' }} />
                        {/* Emoji picker */}
                        <div className="relative">
                          <button onClick={() => setEmojiPickerOpen(!emojiPickerOpen)} className="p-1.5 rounded hover:bg-white/10" title="Эмодзи" style={{ color: 'var(--text-tertiary)' }}>
                            <Smile className="w-3.5 h-3.5" />
                          </button>
                          {emojiPickerOpen && (
                            <div className="fixed z-[100] w-[300px] rounded-xl shadow-2xl p-3"
                                 style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', bottom: '60px', right: '20px', maxHeight: '350px' }}>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[14px] font-medium" style={{ color: 'var(--text-primary)' }}>Эмодзи</span>
                                <button onClick={() => setEmojiPickerOpen(false)} className="p-0.5 rounded hover:bg-white/10">
                                  <X className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
                                </button>
                              </div>
                              <div className="flex gap-1 mb-2 flex-wrap">
                                {Object.keys(EMOJI_CATEGORIES).map(cat => (
                                  <button key={cat} onClick={() => setEmojiCategory(cat)}
                                          className="px-2 py-1 rounded text-[13px] transition-colors"
                                          style={{ background: emojiCategory === cat ? 'rgba(6,182,212,0.13)' : 'transparent', color: emojiCategory === cat ? '#a78bfa' : 'var(--text-tertiary)' }}>
                                    {cat}
                                  </button>
                                ))}
                              </div>
                              <div className="grid grid-cols-8 gap-0.5 max-h-[200px] overflow-y-auto">
                                {EMOJI_CATEGORIES[emojiCategory]?.map((emoji, i) => (
                                  <button key={i} onClick={() => { insertAtCursor(emoji, ''); setEmojiPickerOpen(false) }}
                                          className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 text-[18px]">
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        {/* Premium emoji */}
                        <div className="relative">
                          <button onClick={() => setPremiumEmojiOpen(!premiumEmojiOpen)}
                                  className="p-1.5 rounded hover:bg-white/10" style={{ color: premiumEmojiOpen ? '#a78bfa' : 'var(--text-tertiary)' }} title="Premium Emoji">
                            <span className="text-[14px]">{String.fromCodePoint(0x1F48E)}</span>
                          </button>
                          {premiumEmojiOpen && (
                            <div className="fixed z-[100] w-[320px] rounded-xl shadow-2xl p-3"
                                 style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', bottom: '60px', right: '20px', maxHeight: '400px', overflowY: 'auto' }}>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[14px] font-medium" style={{ color: 'var(--text-primary)' }}>{String.fromCodePoint(0x1F48E)} Premium Emoji</span>
                                <button onClick={() => setPremiumEmojiOpen(false)} className="p-0.5 rounded hover:bg-white/10">
                                  <X className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
                                </button>
                              </div>
                              <div className="space-y-1.5 mb-3 p-2 rounded-lg" style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
                                <div className="text-[13px] font-medium" style={{ color: 'var(--text-secondary)' }}>Добавить новый emoji</div>
                                <input id="funnel-new-emoji-id" type="text" placeholder="Emoji ID (число)"
                                       className="w-full px-2 py-1.5 rounded text-[14px]"
                                       style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                                <div className="flex gap-1.5">
                                  <input id="funnel-new-emoji-fallback" type="text" placeholder="Иконка" maxLength={4}
                                         className="w-24 px-2 py-1.5 rounded text-[14px]"
                                         style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                                  <input id="funnel-new-emoji-name" type="text" placeholder="Название"
                                         className="flex-1 px-2 py-1.5 rounded text-[14px]"
                                         style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                                </div>
                                <button onClick={() => {
                                  const idEl = document.getElementById('funnel-new-emoji-id') as HTMLInputElement
                                  const fbEl = document.getElementById('funnel-new-emoji-fallback') as HTMLInputElement
                                  const nmEl = document.getElementById('funnel-new-emoji-name') as HTMLInputElement
                                  if (idEl?.value.trim()) {
                                    savePremiumEmoji(idEl.value.trim(), fbEl?.value || '?', nmEl?.value || 'Emoji')
                                    idEl.value = ''; if (fbEl) fbEl.value = ''; if (nmEl) nmEl.value = ''
                                    toast.success('Emoji сохранён')
                                  } else { toast.error('Введите Emoji ID') }
                                }} className="w-full py-1.5 rounded text-[13px] font-medium" style={{ background: 'var(--accent-1)', color: '#fff' }}>
                                  Сохранить emoji
                                </button>
                              </div>
                              <div className="text-[11px] mb-3 p-2 rounded-lg" style={{ background: 'var(--surface-1)', color: 'var(--text-tertiary)' }}>
                                Как узнать ID: перешлите сообщение с emoji в @JsonDumpBot, скопируйте custom_emoji_id
                              </div>
                              {savedEmojis.length > 0 ? (
                                <div className="space-y-1">
                                  <div className="text-[13px] font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Сохранённые ({savedEmojis.length})</div>
                                  {savedEmojis.map(em => (
                                    <div key={em.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:brightness-110 transition-all"
                                         style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
                                      <span className="text-[16px] flex-shrink-0">{em.fallback}</span>
                                      <div className="flex-1 min-w-0">
                                        <div className="text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{em.name}</div>
                                        <div className="text-[9px] font-mono truncate" style={{ color: 'var(--text-tertiary)' }}>{em.id}</div>
                                      </div>
                                      <button onClick={() => {
                                        const tag = `<tg-emoji emoji-id="${em.id}">${em.fallback}</tg-emoji>`
                                        insertAtCursor(tag, '')
                                        if (editForm.tgParseMode !== 'HTML') { updateField('tgParseMode', 'HTML'); toast.success('Режим -> HTML') }
                                        setPremiumEmojiOpen(false)
                                      }} className="px-2 py-1 rounded text-[12px] font-medium flex-shrink-0"
                                             style={{ background: 'rgba(6,182,212,0.13)', color: '#a78bfa' }}>В текст</button>
                                      <button onClick={() => removeSavedEmoji(em.id)} className="p-0.5 rounded hover:bg-red-500/20 flex-shrink-0">
                                        <Trash2 className="w-3 h-3 text-red-400" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-[13px] text-center py-4" style={{ color: 'var(--text-tertiary)' }}>Нет сохранённых emoji</div>
                              )}
                            </div>
                          )}
                        </div>
                        {/* Variables */}
                        <div className="relative">
                          <button onClick={() => setVariablePopupOpen(v => !v)} className="p-1.5 rounded hover:bg-white/10" title="Переменные" style={{ color: 'var(--accent-1)' }}>
                            <Variable className="w-3.5 h-3.5" />
                          </button>
                          {variablePopupOpen && (
                            <div className="fixed z-[100] w-[350px] rounded-lg shadow-2xl py-1 max-h-[300px] overflow-y-auto"
                                 style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', bottom: '60px', right: '20px' }}>
                              <div className="px-3 py-2 text-[13px] font-medium" style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--glass-border)' }}>
                                Переменные
                              </div>
                              {variables.map((v: any, i: number) => (
                                <button key={i} onClick={() => { insertAtCursor(v.var); setVariablePopupOpen(false) }}
                                        className="w-full text-left px-3 py-1.5 hover:bg-white/5 flex items-center gap-2"
                                        style={{ color: 'var(--text-secondary)' }}>
                                  <span className="text-[12px] font-mono flex-shrink-0" style={{ color: '#a78bfa' }}>{v.var}</span>
                                  <span className="text-[12px] truncate" style={{ color: 'var(--text-tertiary)' }}>{v.desc}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Textarea */}
                      <div>
                        <label className="text-[13px] font-medium mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Текст сообщения</label>
                        <textarea id="funnel-tg-text" value={editForm.tgText || ''}
                                  onChange={e => updateField('tgText', e.target.value)}
                                  rows={7} className="w-full px-3 py-2 rounded-lg text-[14px] font-mono resize-y"
                                  style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                                  placeholder="Текст с Markdown/HTML разметкой..." />
                      </div>

                      {/* Parse mode */}
                      <div className="flex items-center gap-2">
                        <label className="text-[13px] font-medium" style={{ color: 'var(--text-tertiary)' }}>Режим:</label>
                        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--glass-border)' }}>
                          {['Markdown', 'HTML'].map(m => (
                            <button key={m} onClick={() => updateField('tgParseMode', m)}
                                    className="px-3 py-1 text-[13px]"
                                    style={{
                                      background: editForm.tgParseMode === m ? 'rgba(6,182,212,0.13)' : 'transparent',
                                      color: editForm.tgParseMode === m ? '#a78bfa' : 'var(--text-tertiary)',
                                    }}>{m}</button>
                          ))}
                        </div>
                      </div>

                      {/* Media */}
                      <div className="space-y-2">
                        <label className="text-[13px] font-medium block" style={{ color: 'var(--text-tertiary)' }}>Медиа</label>
                        <div className="flex gap-1">
                          <input type="text" value={editForm.tgMediaUrl || ''} onChange={e => updateField('tgMediaUrl', e.target.value)}
                                 className="flex-1 px-2 py-1.5 rounded-lg text-[14px]"
                                 style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                                 placeholder="URL или загрузите" />
                          <label className="px-2 py-1.5 rounded-lg text-[13px] font-medium cursor-pointer flex items-center gap-1 flex-shrink-0"
                                 style={{ background: 'rgba(6,182,212,0.13)', color: '#a78bfa', border: '1px solid rgba(6,182,212,0.2)' }}>
                            <ArrowUp className="w-3 h-3" />
                            <input type="file" className="hidden" accept="image/*,video/*,.gif,.mp4,.webm"
                                   onChange={async (e) => {
                                     const file = e.target.files?.[0]; if (!file) return
                                     if (file.size > 20 * 1024 * 1024) { toast.error('Макс 20 МБ'); return }
                                     const formData = new FormData(); formData.append('file', file)
                                     try {
                                       const res = await adminApi.uploadFile(formData)
                                       if (res.url) {
                                         updateField('tgMediaUrl', res.url)
                                         const ext = file.name.split('.').pop()?.toLowerCase() || ''
                                         if (['jpg','jpeg','png','webp','svg'].includes(ext)) updateField('tgMediaType', 'photo')
                                         else if (['mp4','webm'].includes(ext)) updateField('tgMediaType', 'video')
                                         else if (['gif'].includes(ext)) updateField('tgMediaType', 'animation')
                                         else updateField('tgMediaType', 'document')
                                         toast.success('Файл загружен')
                                       }
                                     } catch { toast.error('Ошибка загрузки') }
                                     e.target.value = ''
                                   }} />
                          </label>
                        </div>
                        {editForm.tgMediaUrl && (
                          <div className="flex items-center gap-1">
                            <span className="text-[12px] truncate flex-1" style={{ color: 'var(--text-tertiary)' }}>{editForm.tgMediaUrl}</span>
                            <button onClick={() => { updateField('tgMediaUrl', null); updateField('tgMediaType', null) }}
                                    className="text-[13px] px-1 rounded" style={{ color: '#f87171' }}>x</button>
                          </div>
                        )}
                        <select value={editForm.tgMediaType || ''} onChange={e => updateField('tgMediaType', e.target.value)}
                                className="w-full px-2 py-1.5 rounded-lg text-[14px]"
                                style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
                          <option value="">нет</option>
                          <option value="photo">Фото</option>
                          <option value="video">Видео</option>
                          <option value="animation">Анимация</option>
                          <option value="document">Документ</option>
                        </select>
                      </div>

                      {/* Buttons section */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-[13px] font-semibold" style={{ color: 'var(--text-tertiary)' }}>Кнопки</label>
                          <button onClick={() => { setEditingBtnIdx(null); setButtonForm({ label: '', type: 'url', url: '', copyText: '', callbackData: '', botBlockId: '', style: 'default', iconEmojiId: '', row: 0, col: 0 }); setShowButtonForm(true) }}
                                  className="flex items-center gap-1 px-2 py-1 rounded text-[13px] font-medium"
                                  style={{ background: 'rgba(6,182,212,0.13)', color: '#a78bfa' }}>
                            <Plus className="w-3 h-3" /> Добавить
                          </button>
                        </div>

                        {/* Button preview grid */}
                        {(() => {
                          const allBtns = (editForm.tgButtons as any[] || []).filter((b: any) => b._type !== 'effect')
                          if (allBtns.length === 0) return null
                          const styleColors: Record<string, string> = { default: '#6b7280', success: '#22c55e', danger: '#ef4444', primary: '#3b82f6' }
                          const rows: Record<number, { btn: any; idx: number }[]> = {}
                          allBtns.forEach((btn: any, idx: number) => {
                            const r = btn.row ?? 0; if (!rows[r]) rows[r] = []; rows[r].push({ btn, idx })
                          })
                          Object.values(rows).forEach(r => r.sort((a, b) => (a.btn.col ?? 0) - (b.btn.col ?? 0)))
                          const rowNums = Object.keys(rows).map(Number).sort((a, b) => a - b)
                          return (
                            <div className="space-y-1 mb-2">
                              <div className="p-2 rounded-lg space-y-1" style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)' }}>
                                {rowNums.map(rowNum => (
                                  <div key={rowNum} className="flex gap-1">
                                    {rows[rowNum]?.map(({ btn, idx }: any) => (
                                      <div key={idx} onClick={() => {
                                        if (editingBtnIdx === idx) { setEditingBtnIdx(null) }
                                        else {
                                          setEditingBtnIdx(idx)
                                          setButtonForm({ label: btn.label, type: btn.type, url: btn.url || '', copyText: btn.copyText || '', callbackData: btn.callbackData || btn.callback_data || '', botBlockId: btn.botBlockId || '', style: btn.style || 'default', iconEmojiId: btn.iconEmojiId || '', row: btn.row ?? 0, col: btn.col ?? 0 })
                                        }
                                      }}
                                           className="flex-1 py-1.5 px-2 rounded-lg text-center text-[13px] font-medium cursor-pointer transition-all hover:brightness-110 truncate"
                                           style={{
                                             background: styleColors[btn.style] ? styleColors[btn.style] + '22' : 'var(--surface-2)',
                                             border: `1.5px solid ${editingBtnIdx === idx ? 'var(--accent-1)' : (styleColors[btn.style] || 'var(--glass-border)')}`,
                                             color: styleColors[btn.style] || 'var(--text-primary)',
                                           }}>
                                        {btn.label}
                                      </div>
                                    ))}
                                  </div>
                                ))}
                              </div>
                              {/* Inline edit */}
                              {editingBtnIdx !== null && (() => {
                                const realBtns = (editForm.tgButtons as any[] || []).filter((b: any) => b._type !== 'effect')
                                const btn = realBtns[editingBtnIdx]; if (!btn) return null
                                return (
                                  <div className="p-2 mt-1 rounded-lg space-y-2" style={{ background: 'var(--surface-2)', border: '1px solid #8b5cf644' }}>
                                    <div className="flex items-center gap-2">
                                      <span className="text-[13px] flex-1 truncate font-medium" style={{ color: 'var(--text-primary)' }}>Редактирование: {btn.label}</span>
                                      <button onClick={() => setEditingBtnIdx(null)} className="p-0.5 rounded hover:bg-white/10">
                                        <X className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />
                                      </button>
                                      <button onClick={() => {
                                        const btns = [...(editForm.tgButtons as any[] || [])]
                                        const real = btns.filter((b: any) => b._type !== 'effect')
                                        const eff = btns.filter((b: any) => b._type === 'effect')
                                        real.splice(editingBtnIdx, 1)
                                        updateField('tgButtons', [...real, ...eff]); setEditingBtnIdx(null)
                                      }} className="p-0.5 rounded hover:bg-red-500/20">
                                        <Trash2 className="w-3 h-3 text-red-400" />
                                      </button>
                                    </div>
                                    <input type="text" value={buttonForm.label} onChange={e => setButtonForm(p => ({ ...p, label: e.target.value }))}
                                           placeholder="Текст кнопки" className="w-full px-2 py-1 rounded text-[14px]"
                                           style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                                    <div className="grid grid-cols-2 gap-1.5">
                                      <select value={buttonForm.type} onChange={e => setButtonForm(p => ({ ...p, type: e.target.value }))}
                                              className="px-2 py-1 rounded text-[14px]"
                                              style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
                                        <option value="url">🔗 Ссылка</option>
                                        <option value="webapp">🪟 Mini App</option>
                                        <option value="copy_text">📋 Копировать текст</option>
                                        <option value="callback">⚙️ Callback</option>
                                        <option value="bot_block">🧩 Блок бота</option>
                                      </select>
                                      <select value={buttonForm.style} onChange={e => setButtonForm(p => ({ ...p, style: e.target.value }))}
                                              className="px-2 py-1 rounded text-[14px]"
                                              style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
                                        <option value="default">Обычный</option>
                                        <option value="success">Зелёный</option>
                                        <option value="danger">Красный</option>
                                        <option value="primary">Синий</option>
                                      </select>
                                    </div>
                                    {(buttonForm.type === 'url' || buttonForm.type === 'webapp') && (
                                      <input type="text" value={buttonForm.url} onChange={e => setButtonForm(p => ({ ...p, url: e.target.value }))}
                                             placeholder={buttonForm.type === 'webapp' ? 'https://lkpro.hideyou.top/dashboard' : 'https://...'}
                                             className="w-full px-2 py-1 rounded text-[14px]"
                                             style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                                    )}
                                    {buttonForm.type === 'copy_text' && (
                                      <input type="text" value={buttonForm.copyText} onChange={e => setButtonForm(p => ({ ...p, copyText: e.target.value }))}
                                             placeholder="Что скопировать ({subLink}, {referralUrl}, {email}...)"
                                             className="w-full px-2 py-1 rounded text-[14px]"
                                             style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                                    )}
                                    {buttonForm.type === 'callback' && (
                                      <input type="text" value={buttonForm.callbackData} onChange={e => setButtonForm(p => ({ ...p, callbackData: e.target.value }))}
                                             placeholder="callback_data (напр. blk:xxx или menu:tariffs)"
                                             className="w-full px-2 py-1 rounded text-[14px]"
                                             style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                                    )}
                                    {buttonForm.type === 'bot_block' && (
                                      <select value={buttonForm.botBlockId} onChange={e => setButtonForm(p => ({ ...p, botBlockId: e.target.value }))}
                                              className="w-full px-2 py-1 rounded text-[14px]"
                                              style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
                                        <option value="">-- Выберите блок --</option>
                                        {botBlocks.map((g: any) => (
                                          <optgroup key={g.id} label={g.name}>
                                            {g.blocks.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                                          </optgroup>
                                        ))}
                                      </select>
                                    )}
                                    <button onClick={() => {
                                      const btns = [...(editForm.tgButtons as any[] || [])]
                                      const real = btns.filter((b: any) => b._type !== 'effect')
                                      const eff = btns.filter((b: any) => b._type === 'effect')
                                      real[editingBtnIdx] = { ...buttonForm }
                                      updateField('tgButtons', [...real, ...eff])
                                      toast.success('Кнопка обновлена'); setEditingBtnIdx(null)
                                    }} className="w-full py-1.5 rounded text-[13px] font-medium" style={{ background: 'var(--accent-1)', color: '#fff' }}>
                                      Сохранить кнопку
                                    </button>
                                  </div>
                                )
                              })()}
                            </div>
                          )
                        })()}

                        {/* New button form */}
                        {showButtonForm && (
                          <div className="p-3 rounded-lg space-y-2 mt-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
                            <input type="text" value={buttonForm.label} onChange={e => setButtonForm(p => ({ ...p, label: e.target.value }))}
                                   placeholder="Текст кнопки" className="w-full px-2 py-1.5 rounded text-[14px]"
                                   style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                            <div className="grid grid-cols-2 gap-2">
                              <select value={buttonForm.type} onChange={e => setButtonForm(p => ({ ...p, type: e.target.value }))}
                                      className="px-2 py-1.5 rounded text-[14px]"
                                      style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
                                <option value="url">Ссылка</option>
                                <option value="bot_block">Блок бота</option>
                              </select>
                              <select value={buttonForm.style} onChange={e => setButtonForm(p => ({ ...p, style: e.target.value }))}
                                      className="px-2 py-1.5 rounded text-[14px]"
                                      style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
                                <option value="default">Обычный</option>
                                <option value="success">Зелёный</option>
                                <option value="danger">Красный</option>
                                <option value="primary">Синий</option>
                              </select>
                            </div>
                            {(buttonForm.type === 'url' || buttonForm.type === 'webapp') && (
                              <input type="text" value={buttonForm.url} onChange={e => setButtonForm(p => ({ ...p, url: e.target.value }))}
                                     placeholder={buttonForm.type === 'webapp' ? 'https://lkpro.hideyou.top/dashboard' : 'https://...'}
                                     className="w-full px-2 py-1.5 rounded text-[14px]"
                                     style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                            )}
                            {buttonForm.type === 'copy_text' && (
                              <input type="text" value={buttonForm.copyText} onChange={e => setButtonForm(p => ({ ...p, copyText: e.target.value }))}
                                     placeholder="Что скопировать ({subLink}, {referralUrl}...)"
                                     className="w-full px-2 py-1.5 rounded text-[14px]"
                                     style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                            )}
                            {buttonForm.type === 'callback' && (
                              <input type="text" value={buttonForm.callbackData} onChange={e => setButtonForm(p => ({ ...p, callbackData: e.target.value }))}
                                     placeholder="callback_data"
                                     className="w-full px-2 py-1.5 rounded text-[14px]"
                                     style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                            )}
                            {buttonForm.type === 'bot_block' && (
                              <select value={buttonForm.botBlockId} onChange={e => setButtonForm(p => ({ ...p, botBlockId: e.target.value }))}
                                      className="w-full px-2 py-1.5 rounded text-[14px]"
                                      style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
                                <option value="">-- Выберите блок --</option>
                                {botBlocks.map((g: any) => (
                                  <optgroup key={g.id} label={g.name}>
                                    {g.blocks.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                                  </optgroup>
                                ))}
                              </select>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>Ряд</label>
                                <input type="number" value={buttonForm.row} onChange={e => setButtonForm(p => ({ ...p, row: +e.target.value }))}
                                       className="w-full px-2 py-1 rounded text-[14px]"
                                       style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                              </div>
                              <div>
                                <label className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>Колонка</label>
                                <input type="number" value={buttonForm.col} onChange={e => setButtonForm(p => ({ ...p, col: +e.target.value }))}
                                       className="w-full px-2 py-1 rounded text-[14px]"
                                       style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => {
                                if (!buttonForm.label.trim()) { toast.error('Введите текст кнопки'); return }
                                const btns = [...(editForm.tgButtons as any[] || []), { ...buttonForm }]
                                updateField('tgButtons', btns)
                                setButtonForm({ label: '', type: 'url', url: '', copyText: '', callbackData: '', botBlockId: '', style: 'default', iconEmojiId: '', row: 0, col: 0 })
                                setShowButtonForm(false)
                              }} className="flex-1 px-2 py-1.5 rounded text-[13px] font-medium text-white" style={{ background: 'var(--accent-1)' }}>
                                Создать кнопку
                              </button>
                              <button onClick={() => setShowButtonForm(false)} className="px-3 py-1.5 rounded text-[13px]" style={{ color: 'var(--text-tertiary)' }}>Отмена</button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Pin / Delete prev */}
                      <div className="flex flex-wrap gap-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={!!editForm.tgPin} onChange={e => updateField('tgPin', e.target.checked)} className="w-3.5 h-3.5 rounded" />
                          <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>Закрепить</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={!!editForm.tgDeletePrev} onChange={e => updateField('tgDeletePrev', e.target.checked)} className="w-3.5 h-3.5 rounded" />
                          <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>Удалить предыдущее</span>
                        </label>
                      </div>

                      {/* Message effect */}
                      <div>
                        <label className="text-[13px] font-medium mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Эффект при отправке</label>
                        <div className="grid grid-cols-4 gap-1.5">
                          {MESSAGE_EFFECTS.map(eff => {
                            const currentEffect = (editForm.tgButtons as any[] || []).find((b: any) => b._type === 'effect')?.effectId || ''
                            return (
                              <button key={eff.id || '_none'} onClick={() => {
                                const btns = (editForm.tgButtons as any[] || []).filter((b: any) => b._type !== 'effect')
                                if (eff.id) btns.push({ _type: 'effect', effectId: eff.id })
                                updateField('tgButtons', btns)
                              }}
                                      className="flex flex-col items-center gap-0.5 py-1.5 px-1 rounded-lg text-center transition-all"
                                      style={{
                                        background: currentEffect === eff.id || (!currentEffect && !eff.id) ? 'rgba(6,182,212,0.13)' : 'var(--surface-2)',
                                        border: `1.5px solid ${currentEffect === eff.id || (!currentEffect && !eff.id) ? 'var(--accent-1)' : 'var(--glass-border)'}`,
                                        color: 'var(--text-primary)',
                                      }}>
                                <span className="text-[16px]">{eff.emoji}</span>
                                <span className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>{eff.label}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Email sub-tab ── */}
                  {msgSubTab === 'email' && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-[13px] font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>Тема</label>
                        <input value={editForm.emailSubject || ''} onChange={e => updateField('emailSubject', e.target.value)}
                               className="w-full px-3 py-2 rounded-lg text-[14px]"
                               style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                               placeholder="Тема письма" />
                      </div>
                      <div>
                        <label className="text-[13px] font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>HTML</label>
                        <textarea value={editForm.emailHtml || ''} onChange={e => updateField('emailHtml', e.target.value)}
                                  rows={6} className="w-full px-3 py-2 rounded-lg text-[14px] resize-none font-mono"
                                  style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                                  placeholder="<p>HTML...</p>" />
                      </div>
                      <div>
                        <label className="text-[13px] font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>Шаблон</label>
                        <select value={editForm.emailTemplate || 'dark'} onChange={e => updateField('emailTemplate', e.target.value)}
                                className="w-full px-3 py-2 rounded-lg text-[14px]"
                                style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
                          <option value="dark">Тёмный</option>
                          <option value="gradient">Градиент</option>
                          <option value="minimal">Минимальный</option>
                          <option value="neon">Неон</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[13px] font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>CTA текст</label>
                          <input value={editForm.emailBtnText || ''} onChange={e => updateField('emailBtnText', e.target.value)}
                                 className="w-full px-3 py-2 rounded-lg text-[14px]"
                                 style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                                 placeholder="Перейти" />
                        </div>
                        <div>
                          <label className="text-[13px] font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>CTA URL</label>
                          <input value={editForm.emailBtnUrl || ''} onChange={e => updateField('emailBtnUrl', e.target.value)}
                                 className="w-full px-3 py-2 rounded-lg text-[14px]"
                                 style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                                 placeholder="https://..." />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── LK sub-tab ── */}
                  {msgSubTab === 'lk' && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-[13px] font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>Заголовок</label>
                        <input value={editForm.lkTitle || ''} onChange={e => updateField('lkTitle', e.target.value)}
                               className="w-full px-3 py-2 rounded-lg text-[14px]"
                               style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                               placeholder="Заголовок уведомления" />
                      </div>
                      <div>
                        <label className="text-[13px] font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>Сообщение</label>
                        <textarea value={editForm.lkMessage || ''} onChange={e => updateField('lkMessage', e.target.value)}
                                  rows={4} className="w-full px-3 py-2 rounded-lg text-[14px] resize-none"
                                  style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                      </div>
                      <div>
                        <label className="text-[13px] font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>Тип</label>
                        <select value={editForm.lkType || 'INFO'} onChange={e => updateField('lkType', e.target.value)}
                                className="w-full px-3 py-2 rounded-lg text-[14px]"
                                style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
                          <option value="INFO">Информация</option>
                          <option value="WARNING">Предупреждение</option>
                          <option value="SUCCESS">Успех</option>
                          <option value="PROMO">Промо</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ═══ TAB: ACTION ═══ */}
              {activeTab === 'action' && (
                <div className="space-y-3">
                  <label className="text-[13px] font-medium block" style={{ color: 'var(--text-tertiary)' }}>Действие</label>
                  <select value={editForm.actionType || 'none'} onChange={e => updateField('actionType', e.target.value)}
                          className="w-full px-3 py-2 rounded-lg text-[14px]"
                          style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
                    {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                  {editForm.actionType && editForm.actionType !== 'none' && (
                    <div>
                      <label className="text-[13px] font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>Значение</label>
                      <input value={editForm.actionValue || ''} onChange={e => updateField('actionValue', e.target.value)}
                             className="w-full px-3 py-2 rounded-lg text-[14px]"
                             style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                             placeholder={
                               ['bonus_days','balance_add','balance_subtract','trial','extend_subscription'].includes(editForm.actionType || '') ? 'Количество'
                               : ['add_tag','remove_tag'].includes(editForm.actionType || '') ? 'Имя тега'
                               : 'Значение'
                             } />
                    </div>
                  )}
                  {['promo_discount', 'promo_balance'].includes(editForm.actionType || '') && (
                    <div>
                      <label className="text-[13px] font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>Срок промокода (дней)</label>
                      <input type="number" value={editForm.actionPromoExpiry ?? 7}
                             onChange={e => updateField('actionPromoExpiry', Number(e.target.value))}
                             className="w-full px-3 py-2 rounded-lg text-[14px]"
                             style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                    </div>
                  )}
                </div>
              )}

              {/* ═══ TAB: CONDITION ═══ */}
              {activeTab === 'condition' && (
                <div className="space-y-3">
                  {/* Info hint — condition tab for message/trigger is for advanced rules only */}
                  <div className="p-2.5 rounded-lg text-[11px]" style={{ background: 'rgba(6,182,212,0.08)', color: 'var(--text-tertiary)' }}>
                    <b style={{ color: 'var(--accent-1)' }}>Как использовать условия:</b><br/>
                    Для проверки перед отправкой — добавьте ноду «Условие» (жёлтая) перед этим сообщением в цепочке.
                    Она разветвляет поток на TRUE/FALSE ветки с любой сложной логикой.<br/><br/>
                    Расширенные правила ниже — для нод типа <b>«Условие»</b>:
                  </div>
                  {editForm.nodeType === 'condition' && (
                    <>
                      <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>
                        Правила (AND / OR)
                      </div>
                      <ConditionsBuilder
                        value={(editForm.conditions && !Array.isArray(editForm.conditions)
                          ? editForm.conditions
                          : { logic: 'AND', rules: [] }) as any}
                        onChange={v => updateField('conditions', v)}
                      />
                      <div className="text-[10px] mt-2" style={{ color: 'var(--text-tertiary)' }}>
                        Если все правила пройдены → TRUE ветка, иначе → FALSE ветка. Соедините выходы к следующим нодам.
                      </div>
                    </>
                  )}
                </div>
              )}

            </div>

            {/* Bottom buttons */}
            <div className="p-3 space-y-2" style={{ borderTop: '1px solid var(--glass-border)' }}>
              <button onClick={saveNode}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[14px] font-medium text-white transition-colors"
                      style={{ background: editDirty ? 'var(--accent-1)' : '#6b7280' }}>
                <Check className="w-4 h-4" /> Сохранить
              </button>
              <button onClick={async () => {
                if (!selectedNode) return
                try {
                  const res = await fetch(`/api/admin/funnel-builder/nodes/${selectedNode.id}/test`, {
                    method: 'POST', credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                  })
                  const data = await res.json()
                  if (data.ok) toast.success(`Тест отправлен ${data.sentTo || ''} админам`)
                  else toast.error(data.error || 'Ошибка теста')
                } catch (e: any) { toast.error(e.message || 'Ошибка') }
              }}
                      className="w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                      style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}>
                <Play className="w-4 h-4" /> Тест
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ═══════ SETTINGS MODAL ═══════ */}
      {showSettings && activeGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="w-[520px] max-h-[80vh] overflow-y-auto rounded-2xl p-6 space-y-4"
               style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', backdropFilter: 'blur(20px)' }}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Настройки воронки</h2>
              <button onClick={() => setShowSettings(false)} className="p-1 rounded hover:bg-white/10">
                <X className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
              </button>
            </div>
            <SettingsForm group={activeGroup} onSave={async (data: any) => {
              try {
                await adminApi.updateFunnelGroup(activeGroup.id, data)
                toast.success('Настройки сохранены')
                setShowSettings(false); fetchData()
              } catch (e: any) { toast.error('Ошибка: ' + (e.message || '')) }
            }} />
          </div>
        </div>
      )}

      {/* ═══════ LOGS MODAL ═══════ */}
      {showLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="w-[700px] max-h-[80vh] overflow-y-auto rounded-2xl p-6"
               style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', backdropFilter: 'blur(20px)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Логи ({logsTotal})</h2>
              <button onClick={() => setShowLogs(false)} className="p-1 rounded hover:bg-white/10">
                <X className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
              </button>
            </div>
            <div className="space-y-1">
              {logs.map((log: any, i: number) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg text-[12px]" style={{ background: 'var(--surface-2)' }}>
                  <span className={`w-2 h-2 rounded-full ${log.status === 'sent' ? 'bg-green-400' : log.status === 'failed' ? 'bg-red-400' : 'bg-yellow-400'}`} />
                  <span style={{ color: 'var(--text-tertiary)' }}>{new Date(log.createdAt).toLocaleString('ru')}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>Шаг {log.stepOrder}</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'rgba(6,182,212,0.13)', color: '#a78bfa' }}>{log.channel}</span>
                  <span className="flex-1 truncate" style={{ color: log.status === 'failed' ? '#ef4444' : 'var(--text-primary)' }}>{log.error || log.status}</span>
                </div>
              ))}
              {logs.length === 0 && <p className="text-center text-[13px] py-8" style={{ color: 'var(--text-tertiary)' }}>Логов пока нет</p>}
            </div>
          </div>
        </div>
      )}

      {/* ═══════ TEMPLATES CATALOG ═══════ */}
      {showTemplates && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }}>
          <div className="w-[960px] max-w-full max-h-[90vh] rounded-2xl flex flex-col"
               style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', backdropFilter: 'blur(20px)' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--glass-border)' }}>
              <div>
                <h3 className="text-[16px] font-bold" style={{ color: 'var(--text-primary)' }}>📚 Готовые шаблоны воронок</h3>
                <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                  Выберите шаблон — установится выключенной, вы сможете отредактировать и включить
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={installAllTemplates}
                        disabled={installingId === '__all__'}
                        className="px-4 py-2 rounded-lg text-[12px] font-bold text-white disabled:opacity-50"
                        style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)' }}>
                  {installingId === '__all__' ? '⏳ Установка...' : '✨ Установить ВСЕ'}
                </button>
                <button onClick={() => setShowTemplates(false)} className="p-1.5 rounded-lg hover:bg-white/10">
                  <X className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {templates.length === 0 ? (
                <div className="text-center py-12 text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
                  Загрузка шаблонов...
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {templates.map(t => (
                    <div key={t.id} className="rounded-xl p-4 flex gap-3"
                         style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
                      <div className="text-[32px] leading-none shrink-0">{t.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-[13px] mb-1" style={{ color: 'var(--text-primary)' }}>
                          {t.name}
                        </div>
                        <p className="text-[11px] mb-2 line-clamp-2" style={{ color: 'var(--text-tertiary)' }}>
                          {t.description}
                        </p>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-[10px] px-2 py-0.5 rounded-full"
                                style={{ background: 'var(--surface-1)', color: 'var(--text-secondary)' }}>
                            {t.nodesCount} нод
                          </span>
                          {t.triggerType && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full"
                                  style={{ background: '#ef444422', color: '#ef4444' }}>
                              {t.triggerType}
                            </span>
                          )}
                        </div>
                        <button onClick={() => installTemplate(t.id)}
                                disabled={installingId === t.id}
                                className="w-full px-3 py-1.5 rounded-lg text-[12px] font-medium text-white disabled:opacity-50"
                                style={{ background: 'var(--accent-1)' }}>
                          {installingId === t.id ? 'Установка...' : 'Установить'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════ ANALYTICS ═══════ */}
      {showAnalytics && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }}>
          <div className="w-[800px] max-w-full max-h-[85vh] rounded-2xl flex flex-col"
               style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', backdropFilter: 'blur(20px)' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--glass-border)' }}>
              <div>
                <h3 className="text-[16px] font-bold" style={{ color: 'var(--text-primary)' }}>📊 Аналитика воронки</h3>
                <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                  {activeGroup?.name} — drop-off и конверсия по нодам
                </p>
              </div>
              <div className="flex items-center gap-2">
                {[7, 30, 90].map(d => (
                  <button key={d} onClick={() => reloadAnalytics(d)}
                          className="px-3 py-1 rounded-lg text-[11px] font-medium"
                          style={{
                            background: analyticsDays === d ? 'var(--accent-1)' : 'var(--surface-2)',
                            color: analyticsDays === d ? '#fff' : 'var(--text-tertiary)',
                          }}>
                    {d}д
                  </button>
                ))}
                <button onClick={() => setShowAnalytics(false)} className="p-1.5 rounded-lg hover:bg-white/10 ml-2">
                  <X className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {!analytics ? (
                <div className="text-center py-12 text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
                  Загрузка...
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="rounded-xl p-3" style={{ background: 'var(--surface-2)' }}>
                      <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>Всего юзеров</div>
                      <div className="text-[20px] font-bold" style={{ color: 'var(--text-primary)' }}>{analytics.totalUsers}</div>
                    </div>
                    <div className="rounded-xl p-3" style={{ background: 'var(--surface-2)' }}>
                      <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>Событий</div>
                      <div className="text-[20px] font-bold" style={{ color: 'var(--text-primary)' }}>{analytics.totalLogs}</div>
                    </div>
                    <div className="rounded-xl p-3" style={{ background: 'var(--surface-2)' }}>
                      <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>Нод в воронке</div>
                      <div className="text-[20px] font-bold" style={{ color: 'var(--text-primary)' }}>{analytics.nodes.length}</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>
                      По нодам (конверсия относительно входа)
                    </div>
                    {analytics.nodes.map((n: any) => {
                      const pct = n.conversionPct
                      const barColor = pct > 70 ? '#10b981' : pct > 30 ? '#f59e0b' : '#ef4444'
                      return (
                        <div key={n.id} className="p-3 rounded-lg" style={{ background: 'var(--surface-2)' }}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
                                    style={{ background: 'var(--surface-1)', color: 'var(--text-tertiary)' }}>
                                {n.nodeType}
                              </span>
                              <span className="text-[12px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                                {n.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 shrink-0 text-[11px]">
                              <span style={{ color: 'var(--text-secondary)' }}>
                                {n.usersReached} юзеров
                              </span>
                              {n.failed > 0 && <span style={{ color: '#ef4444' }}>❌{n.failed}</span>}
                              <span className="font-bold" style={{ color: barColor }}>{pct}%</span>
                            </div>
                          </div>
                          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-1)' }}>
                            <div className="h-full transition-all"
                                 style={{ width: `${pct}%`, background: barColor }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {analytics.nodes.length === 0 && (
                    <div className="text-center py-8 text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
                      Пока нет данных — воронка не запускалась за выбранный период
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════ WIZARD ═══════ */}
      {showWizard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }}>
          <div className="w-[640px] max-w-full rounded-2xl"
               style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', backdropFilter: 'blur(20px)' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--glass-border)' }}>
              <div>
                <h3 className="text-[16px] font-bold" style={{ color: 'var(--text-primary)' }}>✨ Wizard — создать сценарий</h3>
                <div className="flex items-center gap-1 mt-2">
                  {[0, 1, 2, 3, 4].map(i => (
                    <div key={i} className="h-1 flex-1 rounded-full transition-all"
                         style={{ background: i <= wizStep ? '#a855f7' : 'var(--surface-2)' }} />
                  ))}
                </div>
                <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>Шаг {wizStep + 1} из 5</p>
              </div>
              <button onClick={() => { setShowWizard(false); setWizStep(0) }} className="p-1.5 rounded-lg hover:bg-white/10">
                <X className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
              </button>
            </div>

            <div className="p-6 min-h-[280px]">
              {wizStep === 0 && (
                <div className="space-y-3">
                  <div>
                    <label className="text-[12px] font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
                      1. Название воронки
                    </label>
                    <input value={wizData.name} onChange={e => setWizData(d => ({ ...d, name: e.target.value }))}
                           placeholder="Напр.: Приветствие новичков"
                           className="w-full px-3 py-2.5 rounded-lg text-[13px]"
                           style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                    Как назовёте — такой и увидите в списке воронок
                  </p>
                </div>
              )}

              {wizStep === 1 && (
                <div className="space-y-3">
                  <label className="text-[12px] font-medium block" style={{ color: 'var(--text-secondary)' }}>
                    2. Когда запускается? (триггер)
                  </label>
                  <select value={wizData.triggerType}
                          onChange={e => setWizData(d => ({ ...d, triggerType: e.target.value }))}
                          className="w-full px-3 py-2.5 rounded-lg text-[13px]"
                          style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
                    <optgroup label="Регистрация и подключение">
                      <option value="registration">👋 Регистрация</option>
                      <option value="first_connection">🎉 Первое подключение</option>
                    </optgroup>
                    <optgroup label="Подписка (от REMNAWAVE)">
                      <option value="expiring_3d">⚠️ Истекает через 3 дня</option>
                      <option value="expiring_1d">🔴 Истекает через 1 день</option>
                      <option value="expired">❌ Подписка истекла</option>
                      <option value="traffic_80">📊 Трафик 80%</option>
                      <option value="traffic_100">🚫 Трафик исчерпан</option>
                    </optgroup>
                    <optgroup label="Оплата">
                      <option value="payment_success">✅ Оплата прошла</option>
                      <option value="payment_pending">⏳ Оплата не завершена</option>
                      <option value="payment_renewal">🔄 Повторная оплата</option>
                    </optgroup>
                    <optgroup label="Рефералы / Бонусы">
                      <option value="referral_paid">💰 Реферал оплатил</option>
                      <option value="bonus_days_granted">🎁 Бонус-дни начислены</option>
                      <option value="promo_activated">🎫 Промокод применён</option>
                    </optgroup>
                    <optgroup label="⏰ Проверка состояния (с интервалом)">
                      <option value="state_trial_not_activated">⏰ Не активировал триал N времени</option>
                      <option value="state_not_connected">⏰ Не подключился N времени</option>
                      <option value="state_inactive">⏰ Не заходил N времени</option>
                      <option value="state_no_referrals">⏰ 0 рефералов N времени</option>
                      <option value="state_winback">⏰ Winback — истекла N назад</option>
                      <option value="state_anniversary">⏰ Годовщина через N времени</option>
                      <option value="state_feedback_request">⏰ Попросить отзыв через N</option>
                    </optgroup>
                  </select>
                </div>
              )}

              {wizStep === 2 && (
                <div className="space-y-3">
                  <label className="text-[12px] font-medium block" style={{ color: 'var(--text-secondary)' }}>
                    3. Задержка перед сообщением
                  </label>
                  <div className="flex gap-2">
                    <input type="number" value={wizData.delayValue}
                           onChange={e => setWizData(d => ({ ...d, delayValue: Number(e.target.value) }))}
                           className="w-24 px-3 py-2.5 rounded-lg text-[13px]"
                           style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                    <select value={wizData.delayType}
                            onChange={e => setWizData(d => ({ ...d, delayType: e.target.value as any }))}
                            className="flex-1 px-3 py-2.5 rounded-lg text-[13px]"
                            style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
                      <option value="minutes">минут</option>
                      <option value="hours">часов</option>
                      <option value="days">дней</option>
                    </select>
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                    0 = отправить сразу при срабатывании триггера
                  </p>
                </div>
              )}

              {wizStep === 3 && (
                <div className="space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={wizData.addCondition}
                           onChange={e => setWizData(d => ({ ...d, addCondition: e.target.checked }))}
                           className="w-4 h-4 rounded" />
                    <span className="text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                      4. Добавить условие (опционально)
                    </span>
                  </label>
                  {wizData.addCondition && (
                    <div className="space-y-2 pl-6">
                      <select value={wizData.conditionField}
                              onChange={e => setWizData(d => ({ ...d, conditionField: e.target.value }))}
                              className="w-full px-3 py-2 rounded-lg text-[12px]"
                              style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
                        {CONDITION_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select>
                      <select value={wizData.conditionOp}
                              onChange={e => setWizData(d => ({ ...d, conditionOp: e.target.value }))}
                              className="w-full px-3 py-2 rounded-lg text-[12px]"
                              style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
                        {(CONDITION_OPS[CONDITION_FIELDS.find(f => f.value === wizData.conditionField)?.type || 'string'] || [])
                          .map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      {!['is_true', 'is_false', 'is_empty', 'is_not_empty'].includes(wizData.conditionOp) && (
                        <input value={wizData.conditionValue}
                               onChange={e => setWizData(d => ({ ...d, conditionValue: e.target.value }))}
                               placeholder="Значение"
                               className="w-full px-3 py-2 rounded-lg text-[12px]"
                               style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                      )}
                    </div>
                  )}
                </div>
              )}

              {wizStep === 4 && (
                <div className="space-y-3">
                  <label className="text-[12px] font-medium block" style={{ color: 'var(--text-secondary)' }}>
                    5. Текст сообщения (Telegram)
                  </label>
                  <textarea value={wizData.messageText}
                            onChange={e => setWizData(d => ({ ...d, messageText: e.target.value }))}
                            rows={6}
                            className="w-full px-3 py-2 rounded-lg text-[13px] font-mono"
                            style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                  <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                    Доступны переменные: {'{name}, {tariffName}, {daysLeft}, {referralUrl}, {subExpireDate}'}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t" style={{ borderColor: 'var(--glass-border)' }}>
              <button onClick={() => setWizStep(s => Math.max(0, s - 1))}
                      disabled={wizStep === 0}
                      className="px-4 py-2 rounded-lg text-[12px] font-medium disabled:opacity-40"
                      style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}>
                ← Назад
              </button>
              {wizStep < 4 ? (
                <button onClick={() => setWizStep(s => Math.min(4, s + 1))}
                        disabled={wizStep === 0 && !wizData.name.trim()}
                        className="px-4 py-2 rounded-lg text-[12px] font-medium text-white disabled:opacity-40"
                        style={{ background: '#a855f7' }}>
                  Далее →
                </button>
              ) : (
                <button onClick={wizardFinish}
                        className="px-4 py-2 rounded-lg text-[12px] font-medium text-white"
                        style={{ background: '#a855f7' }}>
                  ✨ Создать воронку
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════ VALIDATION ═══════ */}
      {showValidation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }}>
          <div className="w-[640px] max-w-full max-h-[80vh] rounded-2xl flex flex-col"
               style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', backdropFilter: 'blur(20px)' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--glass-border)' }}>
              <h3 className="text-[16px] font-bold" style={{ color: 'var(--text-primary)' }}>
                {validation?.ok ? '✅ Валидация пройдена' : '⚠️ Найдены проблемы'}
              </h3>
              <button onClick={() => setShowValidation(false)} className="p-1.5 rounded-lg hover:bg-white/10">
                <X className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {!validation ? (
                <div className="text-center py-8" style={{ color: 'var(--text-tertiary)' }}>Загрузка...</div>
              ) : (
                <>
                  <div className="flex gap-3 mb-4">
                    <div className="flex-1 rounded-xl p-3" style={{ background: 'var(--surface-2)' }}>
                      <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>Ошибки</div>
                      <div className="text-[20px] font-bold" style={{ color: validation.errors > 0 ? '#ef4444' : '#10b981' }}>
                        {validation.errors}
                      </div>
                    </div>
                    <div className="flex-1 rounded-xl p-3" style={{ background: 'var(--surface-2)' }}>
                      <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>Предупреждения</div>
                      <div className="text-[20px] font-bold" style={{ color: validation.warns > 0 ? '#f59e0b' : 'var(--text-primary)' }}>
                        {validation.warns}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {validation.issues.length === 0 ? (
                      <div className="text-center py-6 text-[13px]" style={{ color: '#10b981' }}>
                        ✨ Всё в порядке!
                      </div>
                    ) : validation.issues.map((iss: any, i: number) => {
                      const color = iss.severity === 'error' ? '#ef4444' : iss.severity === 'warn' ? '#f59e0b' : '#06b6d4'
                      const icon = iss.severity === 'error' ? '❌' : iss.severity === 'warn' ? '⚠️' : 'ℹ️'
                      return (
                        <div key={i} className="p-3 rounded-lg flex gap-2 items-start"
                             style={{ background: 'var(--surface-2)', borderLeft: `3px solid ${color}` }}>
                          <span className="text-[14px]">{icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px]" style={{ color: 'var(--text-primary)' }}>{iss.message}</div>
                            {iss.nodeId && (
                              <button onClick={() => {
                                const n = nodes.find(x => x.id === iss.nodeId)
                                if (n) { selectNode(n); setShowValidation(false) }
                              }} className="text-[10px] mt-1" style={{ color: 'var(--accent-1)' }}>
                                Перейти к ноде →
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════ SIMULATOR ═══════ */}
      {showSimulator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }}>
          <div className="w-[720px] max-w-full max-h-[85vh] rounded-2xl flex flex-col"
               style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', backdropFilter: 'blur(20px)' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--glass-border)' }}>
              <h3 className="text-[16px] font-bold" style={{ color: 'var(--text-primary)' }}>🧪 Симулятор воронки</h3>
              <button onClick={() => setShowSimulator(false)} className="p-1.5 rounded-lg hover:bg-white/10">
                <X className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
              </button>
            </div>
            <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--glass-border)' }}>
              <label className="text-[11px] block mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
                ID юзера (сухой запуск — без реальной отправки)
              </label>
              <div className="flex gap-2">
                <input value={simUserId} onChange={e => setSimUserId(e.target.value)}
                       placeholder="user_id или скопируйте из /admin/users"
                       className="flex-1 px-3 py-2 rounded-lg text-[13px]"
                       style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                <button onClick={runSimulation}
                        className="px-4 py-2 rounded-lg text-[12px] font-medium text-white"
                        style={{ background: 'var(--accent-1)' }}>
                  Запустить
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {!simulation ? (
                <div className="text-center py-8 text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
                  Укажите юзера и нажмите "Запустить" — будет построена цепочка без реальной отправки
                </div>
              ) : (
                <>
                  <div className="mb-3 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                    Юзер <b>{simulation.userName}</b> — {simulation.totalSteps} шагов
                  </div>
                  <div className="space-y-2">
                    {simulation.steps.map((s: any, i: number) => (
                      <div key={i} className="p-3 rounded-lg"
                           style={{ background: 'var(--surface-2)', borderLeft: '3px solid var(--accent-1)' }}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] px-1.5 py-0.5 rounded"
                                style={{ background: 'var(--surface-1)', color: 'var(--text-tertiary)' }}>
                            #{s.order} {s.nodeType}
                          </span>
                          <span className="text-[12px] font-medium" style={{ color: 'var(--text-primary)' }}>
                            {s.name || s.nodeType}
                          </span>
                          {s.branch && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                                  style={{ background: s.branch === 'TRUE' ? '#10b98122' : '#ef444422',
                                           color: s.branch === 'TRUE' ? '#10b981' : '#ef4444' }}>
                              {s.branch}
                            </span>
                          )}
                        </div>
                        {s.channels?.tg && (
                          <div className="text-[11px] mt-1 px-2 py-1 rounded"
                               style={{ background: 'var(--surface-1)', color: 'var(--text-secondary)' }}>
                            📱 {s.channels.tg.slice(0, 140)}{s.channels.tg.length > 140 ? '...' : ''}
                          </div>
                        )}
                        {s.delay && <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>⏱ {s.delay}</div>}
                        {s.action && <div className="text-[11px]" style={{ color: '#a855f7' }}>✨ {s.action}</div>}
                        {s.note && <div className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>{s.note}</div>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════ DELETE CONFIRM ═══════ */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="w-[360px] rounded-2xl p-6 text-center"
               style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', backdropFilter: 'blur(20px)' }}>
            <AlertTriangle className="w-10 h-10 mx-auto mb-3" style={{ color: '#f59e0b' }} />
            <h3 className="text-[15px] font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Удалить ноду?</h3>
            <p className="text-[13px] mb-4" style={{ color: 'var(--text-tertiary)' }}>Все связи будут разорваны</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirmId(null)} className="flex-1 px-4 py-2 rounded-xl text-[13px]"
                      style={{ background: 'var(--surface-2)', color: 'var(--text-primary)' }}>Отмена</button>
              <button onClick={() => deleteNode(deleteConfirmId)} className="flex-1 px-4 py-2 rounded-xl text-[13px] font-medium text-white bg-red-500">Удалить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ================================================================
   Visual Conditions Builder (sub-component)
   Edits { logic: 'AND'|'OR', rules: [{field, op, value}] }
   ================================================================ */

type CondValue = { logic: 'AND' | 'OR'; rules: Array<{ field: string; op: string; value?: any }> }

function ConditionsBuilder({ value, onChange }: { value: CondValue; onChange: (v: CondValue) => void }) {
  const safe: CondValue = value && Array.isArray(value.rules) ? value : { logic: 'AND', rules: [] }

  const addRule = () => {
    onChange({ ...safe, rules: [...safe.rules, { field: 'days_left', op: 'lte', value: 7 }] })
  }
  const removeRule = (idx: number) => {
    onChange({ ...safe, rules: safe.rules.filter((_, i) => i !== idx) })
  }
  const updateRule = (idx: number, patch: Partial<{ field: string; op: string; value: any }>) => {
    onChange({
      ...safe,
      rules: safe.rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    })
  }
  const fieldType = (fieldId: string): 'number' | 'string' | 'boolean' | 'array' =>
    CONDITION_FIELDS.find(f => f.value === fieldId)?.type || 'string'

  const needsValue = (op: string) => !['is_true', 'is_false', 'is_empty', 'is_not_empty'].includes(op)

  return (
    <div className="space-y-2">
      {/* Logic toggle */}
      {safe.rules.length > 1 && (
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>Логика:</span>
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--glass-border)' }}>
            {(['AND', 'OR'] as const).map(l => (
              <button key={l} onClick={() => onChange({ ...safe, logic: l })}
                      className="px-3 py-1 text-[11px] font-medium"
                      style={{
                        background: safe.logic === l ? 'var(--accent-1)' : 'var(--surface-2)',
                        color: safe.logic === l ? '#fff' : 'var(--text-tertiary)',
                      }}>
                {l === 'AND' ? 'ВСЕ (И)' : 'ЛЮБОЕ (ИЛИ)'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Rules */}
      {safe.rules.map((rule, idx) => {
        const ft = fieldType(rule.field)
        const ops = CONDITION_OPS[ft] || []
        return (
          <div key={idx} className="p-2 rounded-lg space-y-1.5"
               style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
            <div className="flex gap-1.5">
              <select value={rule.field}
                      onChange={e => {
                        const newType = fieldType(e.target.value)
                        const firstOp = CONDITION_OPS[newType]?.[0]?.value || 'eq'
                        updateRule(idx, { field: e.target.value, op: firstOp })
                      }}
                      className="flex-1 min-w-0 px-2 py-1 rounded text-[11px]"
                      style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
                {CONDITION_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
              <select value={rule.op} onChange={e => updateRule(idx, { op: e.target.value })}
                      className="w-24 shrink-0 px-2 py-1 rounded text-[11px]"
                      style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
                {ops.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <button onClick={() => removeRule(idx)}
                      className="shrink-0 w-7 h-7 rounded flex items-center justify-center hover:bg-red-500/20">
                <Trash2 className="w-3 h-3 text-red-400" />
              </button>
            </div>
            {needsValue(rule.op) && (
              <input
                type={ft === 'number' ? 'number' : 'text'}
                value={rule.value ?? ''}
                onChange={e => updateRule(idx, { value: ft === 'number' ? Number(e.target.value) : e.target.value })}
                placeholder="Значение"
                className="w-full px-2 py-1 rounded text-[11px]"
                style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
              />
            )}
          </div>
        )
      })}

      <button onClick={addRule}
              className="w-full px-2 py-1.5 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1"
              style={{ background: 'var(--surface-2)', border: '1px dashed var(--glass-border)', color: 'var(--accent-1)' }}>
        <Plus className="w-3 h-3" /> Добавить правило
      </button>

      {safe.rules.length === 0 && (
        <div className="text-[10px] text-center py-1" style={{ color: 'var(--text-tertiary)' }}>
          Без правил условие всегда истинно
        </div>
      )}
    </div>
  )
}

/* ================================================================
   Settings Form (sub-component)
   ================================================================ */

function SettingsForm({ group, onSave }: { group: FunnelGroup; onSave: (data: any) => void }) {
  const [form, setForm] = useState<any>({
    name: group.name,
    description: group.description || '',
    category: group.category || '',
    stopOnPayment: (group as any).stopOnPayment || false,
    stopOnConnect: (group as any).stopOnConnect || false,
    stopOnActiveSub: (group as any).stopOnActiveSub || false,
    sandboxMode: (group as any).sandboxMode || false,
    sandboxTag: (group as any).sandboxTag || 'test_funnel',
    maxMessages: (group as any).maxMessages || '',
    workHoursStart: (group as any).workHoursStart || '',
    workHoursEnd: (group as any).workHoursEnd || '',
    antiSpamHours: (group as any).antiSpamHours || '',
  })

  const update = (key: string, value: any) => setForm((p: any) => ({ ...p, [key]: value }))

  const Hint = ({ text }: { text: string }) => (
    <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{text}</p>
  )

  return (
    <div className="space-y-4">
      {/* ── Основное ── */}
      <div>
        <label className="text-[13px] font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>Название</label>
        <input value={form.name} onChange={e => update('name', e.target.value)}
               className="w-full px-3 py-2 rounded-lg text-[14px]"
               style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
      </div>
      <div>
        <label className="text-[13px] font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>Описание</label>
        <textarea value={form.description} onChange={e => update('description', e.target.value)} rows={2}
                  className="w-full px-3 py-2 rounded-lg text-[14px] resize-none"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
      </div>
      <div>
        <label className="text-[13px] font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>Категория</label>
        <select value={form.category} onChange={e => update('category', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-[14px]"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
          <option value="">Без категории</option>
          <option value="onboarding">Онбординг</option>
          <option value="subscription">Подписка</option>
          <option value="payment">Оплата</option>
          <option value="referral">Рефералы</option>
          <option value="engagement">Вовлечение</option>
          <option value="state">Проверка состояния</option>
          <option value="security">Безопасность</option>
          <option value="custom">Кастомные</option>
        </select>
      </div>

      {/* ── Стоп-условия ── */}
      <div className="p-3 rounded-xl space-y-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
        <div className="text-[12px] font-bold uppercase tracking-wider" style={{ color: 'var(--accent-1)' }}>
          Стоп-условия
        </div>
        <Hint text="Если юзер уже достиг цели — воронка не запустится. Проверяется при каждом срабатывании триггера." />
        <div className="space-y-1.5">
          {[
            { key: 'stopOnPayment',   label: 'Оплатил подписку',         hint: 'paymentsCount > 0 — юзер хотя бы раз оплатил' },
            { key: 'stopOnActiveSub', label: 'Подписка активна',         hint: 'subStatus = ACTIVE — прямо сейчас подписка работает' },
            { key: 'stopOnConnect',   label: 'Подключился к VPN',        hint: 'firstConnectedAt не null — было хотя бы одно подключение' },
          ].map(item => (
            <div key={item.key}>
              <label className="flex items-center gap-2 text-[13px] cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={form[item.key]} onChange={e => update(item.key, e.target.checked)} className="rounded" />
                {item.label}
              </label>
              <Hint text={item.hint} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Лимиты ── */}
      <div className="p-3 rounded-xl space-y-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
        <div className="text-[12px] font-bold uppercase tracking-wider" style={{ color: 'var(--accent-1)' }}>
          Лимиты
        </div>
        <div>
          <label className="text-[13px] font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>
            Макс. сообщений на юзера
          </label>
          <input type="number" value={form.maxMessages} onChange={e => update('maxMessages', e.target.value ? Number(e.target.value) : null)}
                 placeholder="0 = без лимита"
                 className="w-full px-3 py-2 rounded-lg text-[14px]"
                 style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
          <Hint text="Максимум сообщений которые один юзер может получить из этой воронки за всё время. 0 = без ограничений." />
        </div>
        <div>
          <label className="text-[13px] font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>
            Антиспам (часов)
          </label>
          <input type="number" value={form.antiSpamHours} onChange={e => update('antiSpamHours', e.target.value ? Number(e.target.value) : null)}
                 placeholder="0 = без ограничений"
                 className="w-full px-3 py-2 rounded-lg text-[14px]"
                 style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
          <Hint text="Не отправлять, если этот юзер уже получал сообщение из этой воронки менее N часов назад." />
        </div>
      </div>

      {/* ── Рабочие часы ── */}
      <div className="p-3 rounded-xl space-y-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
        <div className="text-[12px] font-bold uppercase tracking-wider" style={{ color: 'var(--accent-1)' }}>
          Рабочие часы
        </div>
        <Hint text="Если сообщение попадает за пределы рабочих часов — оно откладывается до начала следующего окна (по МСК)." />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[12px] block mb-1" style={{ color: 'var(--text-tertiary)' }}>С</label>
            <input type="time" value={form.workHoursStart} onChange={e => update('workHoursStart', e.target.value)}
                   className="w-full px-3 py-2 rounded-lg text-[14px]"
                   style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
          </div>
          <div>
            <label className="text-[12px] block mb-1" style={{ color: 'var(--text-tertiary)' }}>До</label>
            <input type="time" value={form.workHoursEnd} onChange={e => update('workHoursEnd', e.target.value)}
                   className="w-full px-3 py-2 rounded-lg text-[14px]"
                   style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
          </div>
        </div>
        <Hint text="Оставьте пустыми — сообщения будут отправляться в любое время." />
      </div>

      {/* ── Тестирование ── */}
      <div className="p-3 rounded-xl space-y-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
        <div className="text-[12px] font-bold uppercase tracking-wider" style={{ color: 'var(--accent-1)' }}>
          Тестирование
        </div>
        <label className="flex items-center gap-2 text-[13px] cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={form.sandboxMode} onChange={e => update('sandboxMode', e.target.checked)} className="rounded" />
          Песочница — только юзерам с тегом
        </label>
        <Hint text="Если включено — воронка сработает ТОЛЬКО для юзеров у которых есть указанный тег. Используйте для тестирования перед запуском." />
        {form.sandboxMode && (
          <div>
            <input value={form.sandboxTag} onChange={e => update('sandboxTag', e.target.value)}
                   placeholder="test_funnel" className="w-full px-3 py-2 rounded-lg text-[14px]"
                   style={{ background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
          </div>
        )}
      </div>

      <button onClick={() => onSave(form)}
              className="w-full px-4 py-2.5 rounded-xl text-[14px] font-medium text-white"
              style={{ background: 'var(--accent-1)' }}>
        Сохранить настройки
      </button>
    </div>
  )
}
