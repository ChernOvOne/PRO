import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Seed default support wizards from the hardcoded WIZARD_FLOWS.
 * Safe to run multiple times — skips categories that already have a wizard.
 */

type NodeType = 'choice' | 'text' | 'textarea' | 'terminal'
type SeedOption = { value: string; label: string; icon?: string; nextRef?: string }
type SeedNode = {
  ref: string
  nodeType: NodeType
  question?: string
  hint?: string
  placeholder?: string
  optional?: boolean
  options?: SeedOption[]
  nextRef?: string
  subjectTemplate?: string
  bodyTemplate?: string
}
type SeedWizard = {
  category: 'BILLING' | 'TECH' | 'REFUND' | 'SUBSCRIPTION' | 'OTHER'
  title: string
  icon: string
  description?: string
  sortOrder: number
  entryRef: string
  nodes: SeedNode[]
}

const WIZARDS: SeedWizard[] = [
  {
    category: 'TECH',
    title: 'Технический вопрос',
    icon: '🔧',
    description: 'Проблемы с подключением, скоростью, приложением',
    sortOrder: 10,
    entryRef: 'device',
    nodes: [
      {
        ref: 'device',
        nodeType: 'choice',
        question: 'На каком устройстве проблема?',
        options: [
          { value: 'iphone',  label: 'iPhone / iPad',    icon: '📱', nextRef: 'issue' },
          { value: 'android', label: 'Android',          icon: '🤖', nextRef: 'issue' },
          { value: 'windows', label: 'Windows',          icon: '🪟', nextRef: 'issue' },
          { value: 'mac',     label: 'macOS',            icon: '💻', nextRef: 'issue' },
          { value: 'linux',   label: 'Linux',            icon: '🐧', nextRef: 'issue' },
          { value: 'other',   label: 'Другое',           icon: '❓', nextRef: 'issue' },
        ],
      },
      {
        ref: 'issue',
        nodeType: 'choice',
        question: 'Что именно не работает?',
        options: [
          { value: 'connect',     label: 'Не подключается',       icon: '🚫', nextRef: 'app' },
          { value: 'slow',        label: 'Медленная скорость',    icon: '🐢', nextRef: 'app' },
          { value: 'disconnects', label: 'Отключается сам',       icon: '⚡', nextRef: 'app' },
          { value: 'sites',       label: 'Не открываются сайты',  icon: '🌐', nextRef: 'app' },
          { value: 'app',         label: 'Проблема с приложением', icon: '📲', nextRef: 'app' },
          { value: 'other',       label: 'Другое',                icon: '❓', nextRef: 'app' },
        ],
      },
      {
        ref: 'app',
        nodeType: 'choice',
        question: 'Каким приложением пользуетесь?',
        options: [
          { value: 'happ',      label: 'Happ',      icon: '😊', nextRef: 'details' },
          { value: 'v2raytun',  label: 'V2rayTun',  icon: '🔷', nextRef: 'details' },
          { value: 'hiddify',   label: 'Hiddify',   icon: '🔒', nextRef: 'details' },
          { value: 'other',     label: 'Другое',    icon: '❓', nextRef: 'details' },
        ],
      },
      {
        ref: 'details',
        nodeType: 'textarea',
        question: 'Опишите проблему подробнее',
        hint: 'Что именно происходит, когда началось, какие ошибки видите',
        placeholder: 'Например: при подключении выдаёт ошибку "connection timeout"...',
        nextRef: 'end',
      },
      {
        ref: 'end',
        nodeType: 'terminal',
        subjectTemplate: 'Проблема: {{issue:label}}',
        bodyTemplate: '📱 Устройство: {{device:label}}\n🔧 Приложение: {{app:label}}\n📝 Описание: {{details}}',
      },
    ],
  },
  {
    category: 'BILLING',
    title: 'Платёж',
    icon: '💳',
    description: 'Вопросы по оплате и списаниям',
    sortOrder: 20,
    entryRef: 'issue',
    nodes: [
      {
        ref: 'issue',
        nodeType: 'choice',
        question: 'С чем связан вопрос?',
        options: [
          { value: 'not-paid',      label: 'Оплатил, но подписка не активирована', icon: '💳', nextRef: 'amount' },
          { value: 'double-charge', label: 'Списали дважды',                       icon: '⚠️', nextRef: 'amount' },
          { value: 'wrong-amount',  label: 'Списана неправильная сумма',           icon: '💸', nextRef: 'amount' },
          { value: 'no-receipt',    label: 'Не пришёл чек',                        icon: '🧾', nextRef: 'amount' },
          { value: 'other',         label: 'Другое',                               icon: '❓', nextRef: 'amount' },
        ],
      },
      {
        ref: 'amount',
        nodeType: 'text',
        question: 'Сумма платежа (если помните)?',
        placeholder: 'Например: 179 ₽',
        optional: true,
        nextRef: 'details',
      },
      {
        ref: 'details',
        nodeType: 'textarea',
        question: 'Дополнительные детали',
        hint: 'Дата платежа, номер заказа если есть',
        placeholder: 'Платил 12.04, картой...',
        nextRef: 'end',
      },
      {
        ref: 'end',
        nodeType: 'terminal',
        subjectTemplate: '{{issue:label}}',
        bodyTemplate: '💰 Проблема: {{issue:label}}\n💵 Сумма: {{amount}}\n📝 Детали: {{details}}',
      },
    ],
  },
  {
    category: 'REFUND',
    title: 'Возврат',
    icon: '↩️',
    description: 'Возврат средств за подписку',
    sortOrder: 30,
    entryRef: 'reason',
    nodes: [
      {
        ref: 'reason',
        nodeType: 'choice',
        question: 'Почему хотите вернуть оплату?',
        options: [
          { value: 'not-working',  label: 'Сервис не работает',    icon: '🚫', nextRef: 'type' },
          { value: 'slow',         label: 'Медленная скорость',    icon: '🐢', nextRef: 'type' },
          { value: 'found-better', label: 'Нашёл другой сервис',   icon: '🔄', nextRef: 'type' },
          { value: 'changed-mind', label: 'Передумал',             icon: '🤔', nextRef: 'type' },
          { value: 'other',        label: 'Другое',                icon: '❓', nextRef: 'type' },
        ],
      },
      {
        ref: 'type',
        nodeType: 'choice',
        question: 'Полный или частичный возврат?',
        options: [
          { value: 'full',    label: 'Полный',                     icon: '💯', nextRef: 'details' },
          { value: 'partial', label: 'За неиспользованный период', icon: '📅', nextRef: 'details' },
        ],
      },
      {
        ref: 'details',
        nodeType: 'textarea',
        question: 'Комментарий',
        hint: 'Любая дополнительная информация',
        placeholder: 'Необязательно...',
        optional: true,
        nextRef: 'end',
      },
      {
        ref: 'end',
        nodeType: 'terminal',
        subjectTemplate: '{{type:label}} возврат',
        bodyTemplate: '↩️ Тип: {{type:label}}\n📋 Причина: {{reason:label}}\n📝 Комментарий: {{details}}',
      },
    ],
  },
  {
    category: 'SUBSCRIPTION',
    title: 'Подписка',
    icon: '📱',
    description: 'Вопросы по тарифу и подписке',
    sortOrder: 40,
    entryRef: 'issue',
    nodes: [
      {
        ref: 'issue',
        nodeType: 'choice',
        question: 'Какой вопрос?',
        options: [
          { value: 'extend',        label: 'Продлить подписку',   icon: '🔄', nextRef: 'details' },
          { value: 'change-tariff', label: 'Изменить тариф',      icon: '📊', nextRef: 'details' },
          { value: 'extra-device',  label: 'Добавить устройство', icon: '📱', nextRef: 'details' },
          { value: 'reset-traffic', label: 'Сбросить трафик',     icon: '♻️', nextRef: 'details' },
          { value: 'locations',     label: 'Сменить локацию',     icon: '🌍', nextRef: 'details' },
          { value: 'other',         label: 'Другое',              icon: '❓', nextRef: 'details' },
        ],
      },
      {
        ref: 'details',
        nodeType: 'textarea',
        question: 'Детали',
        hint: 'Опишите что нужно сделать',
        placeholder: 'Например: хочу продлить на месяц',
        nextRef: 'end',
      },
      {
        ref: 'end',
        nodeType: 'terminal',
        subjectTemplate: '{{issue:label}}',
        bodyTemplate: '📱 Запрос: {{issue:label}}\n📝 Детали: {{details}}',
      },
    ],
  },
  {
    category: 'OTHER',
    title: 'Другое',
    icon: '💬',
    description: 'Общие вопросы',
    sortOrder: 50,
    entryRef: 'subject',
    nodes: [
      {
        ref: 'subject',
        nodeType: 'text',
        question: 'Кратко опишите тему',
        placeholder: 'Например: Вопрос по работе сервиса',
        nextRef: 'details',
      },
      {
        ref: 'details',
        nodeType: 'textarea',
        question: 'Опишите подробнее',
        placeholder: 'Расскажите что случилось...',
        nextRef: 'end',
      },
      {
        ref: 'end',
        nodeType: 'terminal',
        subjectTemplate: '{{subject}}',
        bodyTemplate: '{{details}}',
      },
    ],
  },
]

async function run() {
  console.log('🌱 Seeding support wizards…')

  for (const w of WIZARDS) {
    const existing = await prisma.supportWizard.findFirst({ where: { category: w.category } })
    if (existing) {
      console.log(`  — ${w.category} уже существует, пропускаю`)
      continue
    }

    const wizard = await prisma.supportWizard.create({
      data: {
        category: w.category,
        title: w.title,
        icon: w.icon,
        description: w.description,
        enabled: true,
        sortOrder: w.sortOrder,
      },
    })

    // Create nodes, layout left→right top→bottom
    const refToId: Record<string, string> = {}
    let y = 40
    for (let i = 0; i < w.nodes.length; i++) {
      const n = w.nodes[i]
      const created = await prisma.supportWizardNode.create({
        data: {
          wizardId: wizard.id,
          nodeType: n.nodeType,
          answerId: n.ref,
          question: n.question ?? null,
          hint: n.hint ?? null,
          placeholder: n.placeholder ?? null,
          optional: n.optional ?? false,
          posX: 60 + i * 340,
          posY: y,
          subjectTemplate: n.subjectTemplate ?? null,
          bodyTemplate: n.bodyTemplate ?? null,
        },
      })
      refToId[n.ref] = created.id
    }

    // Second pass: wire edges now that all IDs exist
    for (const n of w.nodes) {
      const updates: any = {}
      if (n.nextRef) updates.nextNodeId = refToId[n.nextRef] ?? null
      if (n.options) {
        updates.options = n.options.map(o => ({
          value: o.value,
          label: o.label,
          icon: o.icon ?? null,
          nextNodeId: o.nextRef ? (refToId[o.nextRef] ?? null) : null,
        }))
      }
      if (Object.keys(updates).length) {
        await prisma.supportWizardNode.update({
          where: { id: refToId[n.ref] },
          data: updates,
        })
      }
    }

    await prisma.supportWizard.update({
      where: { id: wizard.id },
      data: { entryNodeId: refToId[w.entryRef] },
    })

    console.log(`  ✓ ${w.category}: ${w.nodes.length} узлов`)
  }

  console.log('✅ Done')
}

run()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
