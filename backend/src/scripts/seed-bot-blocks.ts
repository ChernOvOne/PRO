import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🗑  Удаление старых данных...')

  await prisma.botBlockStat.deleteMany()
  await prisma.botTrigger.deleteMany()
  await prisma.botButton.deleteMany()
  await prisma.botBlock.deleteMany()
  await prisma.botBlockGroup.deleteMany()

  console.log('✅ Старые данные удалены')

  // ─── Groups ──────────────────────────────────────────────
  console.log('📁 Создание групп...')

  const groupDefs = [
    { name: 'Главное меню', icon: '🏠', sortOrder: 0 },
    { name: 'Подписка', icon: '🔑', sortOrder: 1 },
    { name: 'Тарифы и оплата', icon: '💳', sortOrder: 2 },
    { name: 'Активация', icon: '🎁', sortOrder: 3 },
    { name: 'Привязка email', icon: '📧', sortOrder: 4 },
    { name: 'Рефералы', icon: '👥', sortOrder: 5 },
    { name: 'Баланс', icon: '💰', sortOrder: 6 },
    { name: 'Промокод', icon: '🎟', sortOrder: 7 },
    { name: 'Устройства и инструкции', icon: '📱', sortOrder: 8 },
  ]

  const groups: Record<string, string> = {}
  for (const g of groupDefs) {
    const created = await prisma.botBlockGroup.create({ data: g })
    groups[g.name] = created.id
    console.log(`  📁 ${g.icon} ${g.name}`)
  }

  // ─── Block definitions (without connections) ─────────────
  console.log('🧱 Создание блоков...')

  const published = { isDraft: false, version: 1, publishedAt: new Date() }

  interface BlockDef {
    name: string
    groupName: string
    type: 'MESSAGE' | 'CONDITION' | 'ACTION' | 'INPUT'
    posX: number
    posY: number
    text?: string
    conditionType?: string
    conditionValue?: string
    actionType?: string
    actionValue?: string
    inputPrompt?: string
    inputVar?: string
    inputValidation?: string
    messageEffectId?: string
  }

  const blockDefs: BlockDef[] = [
    // Group 1: Главное меню
    {
      name: 'Стартовое условие',
      groupName: 'Главное меню',
      type: 'CONDITION',
      conditionType: 'has_sub',
      posX: 400,
      posY: 50,
    },
    {
      name: 'Главное меню (подписчик)',
      groupName: 'Главное меню',
      type: 'MESSAGE',
      text: '✅ *Подписка активна!*\n\nДобро пожаловать, {name}! Выберите нужный раздел:',
      posX: 200,
      posY: 200,
    },
    {
      name: 'Главное меню (новый)',
      groupName: 'Главное меню',
      type: 'MESSAGE',
      text: '👋 *Добро пожаловать в HIDEYOU VPN!*\n\nДля начала выберите один из вариантов:',
      posX: 600,
      posY: 200,
    },

    // Group 2: Подписка
    {
      name: 'Подписка',
      groupName: 'Подписка',
      type: 'CONDITION',
      conditionType: 'has_remnawave',
      posX: 200,
      posY: 450,
    },
    {
      name: 'Инфо подписки',
      groupName: 'Подписка',
      type: 'MESSAGE',
      text: '🔑 *Ваша подписка*\n\n📊 Статус: {subStatus}\n📅 До: {subExpireDate}\n⏳ Осталось: {daysLeft} дн.\n\n📶 Трафик: {trafficUsed} / {trafficLimit}\n📱 Устройства: {deviceCount} / {deviceLimit}',
      posX: 100,
      posY: 600,
    },
    {
      name: 'Нет подписки',
      groupName: 'Подписка',
      type: 'MESSAGE',
      text: '❌ *У вас нет активной подписки.*\n\nВыберите тариф или активируйте пробный период.',
      posX: 400,
      posY: 600,
    },

    // Group 3: Тарифы и оплата
    {
      name: 'Тарифы',
      groupName: 'Тарифы и оплата',
      type: 'MESSAGE',
      text: '💳 *Тарифы HIDEYOU VPN*\n\nВыберите подходящий тариф:',
      posX: 500,
      posY: 450,
    },

    // Group 4: Активация
    {
      name: 'Активация триала',
      groupName: 'Активация',
      type: 'ACTION',
      actionType: 'trial',
      actionValue: '3',
      posX: 600,
      posY: 400,
    },
    {
      name: 'Триал успех',
      groupName: 'Активация',
      type: 'MESSAGE',
      text: '🎉 *Пробный период активирован!*\n\nВам доступно 3 дня бесплатного VPN. Настройте подключение по инструкции ниже.',
      messageEffectId: '5368324170671202286',
      posX: 800,
      posY: 400,
    },

    // Group 5: Привязка email
    {
      name: 'Привязка email',
      groupName: 'Привязка email',
      type: 'INPUT',
      inputPrompt: '📧 Введите ваш email, который вы использовали при регистрации на сайте:',
      inputVar: 'link_email',
      inputValidation: 'email',
      posX: 800,
      posY: 200,
    },
    {
      name: 'Поиск по email',
      groupName: 'Привязка email',
      type: 'CONDITION',
      conditionType: 'has_var',
      conditionValue: 'link_email',
      posX: 1000,
      posY: 200,
    },
    {
      name: 'Email найден',
      groupName: 'Привязка email',
      type: 'MESSAGE',
      text: '✅ Аккаунт найден! Ваш email привязан к боту.',
      posX: 900,
      posY: 350,
    },
    {
      name: 'Email не найден',
      groupName: 'Привязка email',
      type: 'MESSAGE',
      text: '❌ Аккаунт с таким email не найден. Проверьте правильность ввода или зарегистрируйтесь.',
      posX: 1100,
      posY: 350,
    },

    // Group 6: Рефералы
    {
      name: 'Рефералы',
      groupName: 'Рефералы',
      type: 'MESSAGE',
      text: '👥 *Реферальная программа*\n\nПриглашай друзей и получай бонусные дни!\n\n🔗 Твоя ссылка: `{referralUrl}`\n👥 Приглашено: {referralCount}\n💰 Оплатили: {referralPaidCount}',
      posX: 200,
      posY: 800,
    },

    // Group 7: Баланс
    {
      name: 'Баланс',
      groupName: 'Баланс',
      type: 'MESSAGE',
      text: '💰 *Ваш баланс*\n\n💳 Баланс: {balance} ₽\n🎁 Бонусные дни: {bonusDays}',
      posX: 400,
      posY: 800,
    },

    // Group 8: Промокод
    {
      name: 'Промокод',
      groupName: 'Промокод',
      type: 'INPUT',
      inputPrompt: '🎟 Введите промокод:',
      inputVar: 'promo_code',
      inputValidation: 'text',
      posX: 600,
      posY: 800,
    },
    {
      name: 'Промокод результат',
      groupName: 'Промокод',
      type: 'MESSAGE',
      text: '✅ Промокод принят! Проверьте ваш баланс и бонусные дни.',
      posX: 800,
      posY: 800,
    },

    // Group 9: Устройства и инструкции
    {
      name: 'Устройства',
      groupName: 'Устройства и инструкции',
      type: 'MESSAGE',
      text: '📱 *Ваши устройства*\n\nУправляйте подключенными устройствами в личном кабинете.',
      posX: 800,
      posY: 1000,
    },
    {
      name: 'Инструкции',
      groupName: 'Устройства и инструкции',
      type: 'MESSAGE',
      text: '📖 *Инструкции по настройке*\n\nВыберите вашу платформу для получения пошаговой инструкции:',
      posX: 1000,
      posY: 1000,
    },
  ]

  const blockMap: Record<string, string> = {}

  for (const b of blockDefs) {
    const created = await prisma.botBlock.create({
      data: {
        name: b.name,
        groupId: groups[b.groupName],
        type: b.type,
        text: b.text ?? null,
        conditionType: b.conditionType ?? null,
        conditionValue: b.conditionValue ?? null,
        actionType: b.actionType ?? null,
        actionValue: b.actionValue ?? null,
        inputPrompt: b.inputPrompt ?? null,
        inputVar: b.inputVar ?? null,
        inputValidation: b.inputValidation ?? null,
        messageEffectId: b.messageEffectId ?? null,
        posX: b.posX,
        posY: b.posY,
        ...published,
      },
    })
    blockMap[b.name] = created.id
    console.log(`  🧱 ${b.name} (${b.type})`)
  }

  // ─── Update connections ──────────────────────────────────
  console.log('🔗 Установка связей между блоками...')

  // Condition blocks: nextBlockTrue / nextBlockFalse
  await prisma.botBlock.update({
    where: { id: blockMap['Стартовое условие'] },
    data: {
      nextBlockTrue: blockMap['Главное меню (подписчик)'],
      nextBlockFalse: blockMap['Главное меню (новый)'],
    },
  })

  await prisma.botBlock.update({
    where: { id: blockMap['Подписка'] },
    data: {
      nextBlockTrue: blockMap['Инфо подписки'],
      nextBlockFalse: blockMap['Нет подписки'],
    },
  })

  await prisma.botBlock.update({
    where: { id: blockMap['Поиск по email'] },
    data: {
      nextBlockTrue: blockMap['Email найден'],
      nextBlockFalse: blockMap['Email не найден'],
    },
  })

  // Action blocks: nextBlockId
  await prisma.botBlock.update({
    where: { id: blockMap['Активация триала'] },
    data: { nextBlockId: blockMap['Триал успех'] },
  })

  // Input blocks: nextBlockId
  await prisma.botBlock.update({
    where: { id: blockMap['Привязка email'] },
    data: { nextBlockId: blockMap['Поиск по email'] },
  })

  await prisma.botBlock.update({
    where: { id: blockMap['Промокод'] },
    data: { nextBlockId: blockMap['Промокод результат'] },
  })

  console.log('✅ Связи установлены')

  // ─── Buttons ─────────────────────────────────────────────
  console.log('🔘 Создание кнопок...')

  interface ButtonDef {
    blockName: string
    label: string
    type: string
    row: number
    col: number
    nextBlockName?: string
    url?: string
    copyText?: string
    style?: string
  }

  const buttonDefs: ButtonDef[] = [
    // Главное меню (подписчик)
    { blockName: 'Главное меню (подписчик)', label: '🔑 Подписка', type: 'block', nextBlockName: 'Подписка', row: 0, col: 0 },
    { blockName: 'Главное меню (подписчик)', label: '💳 Тарифы', type: 'block', nextBlockName: 'Тарифы', row: 0, col: 1 },
    { blockName: 'Главное меню (подписчик)', label: '👥 Рефералы', type: 'block', nextBlockName: 'Рефералы', row: 1, col: 0 },
    { blockName: 'Главное меню (подписчик)', label: '💰 Баланс', type: 'block', nextBlockName: 'Баланс', row: 1, col: 1 },
    { blockName: 'Главное меню (подписчик)', label: '🎟 Промокод', type: 'block', nextBlockName: 'Промокод', row: 2, col: 0 },
    { blockName: 'Главное меню (подписчик)', label: '📱 Устройства', type: 'block', nextBlockName: 'Устройства', row: 2, col: 1 },
    { blockName: 'Главное меню (подписчик)', label: '📖 Инструкции', type: 'block', nextBlockName: 'Инструкции', row: 3, col: 0 },
    { blockName: 'Главное меню (подписчик)', label: '🌐 Открыть ЛК', type: 'webapp', url: '{appUrl}/dashboard', row: 4, col: 0 },

    // Главное меню (новый)
    { blockName: 'Главное меню (новый)', label: '🎁 Пробный период', type: 'block', nextBlockName: 'Активация триала', row: 0, col: 0, style: 'success' },
    { blockName: 'Главное меню (новый)', label: '💳 Выбрать тариф', type: 'block', nextBlockName: 'Тарифы', row: 1, col: 0 },
    { blockName: 'Главное меню (новый)', label: '📧 Привязать email', type: 'block', nextBlockName: 'Привязка email', row: 2, col: 0 },
    { blockName: 'Главное меню (новый)', label: '🎟 Ввести промокод', type: 'block', nextBlockName: 'Промокод', row: 3, col: 0 },
    { blockName: 'Главное меню (новый)', label: '🌐 Открыть ЛК', type: 'webapp', url: '{appUrl}/dashboard', row: 4, col: 0 },

    // Инфо подписки
    { blockName: 'Инфо подписки', label: '📋 Скопировать ключ', type: 'copy_text', copyText: '{subLink}', row: 0, col: 0, style: 'primary' },
    { blockName: 'Инфо подписки', label: '💳 Продлить', type: 'block', nextBlockName: 'Тарифы', row: 1, col: 0, style: 'success' },
    { blockName: 'Инфо подписки', label: '🔙 Назад', type: 'block', nextBlockName: 'Стартовое условие', row: 2, col: 0 },

    // Нет подписки
    { blockName: 'Нет подписки', label: '🎁 Пробный период', type: 'block', nextBlockName: 'Активация триала', row: 0, col: 0, style: 'success' },
    { blockName: 'Нет подписки', label: '💳 Тарифы', type: 'block', nextBlockName: 'Тарифы', row: 1, col: 0 },
    { blockName: 'Нет подписки', label: '🔙 Назад', type: 'block', nextBlockName: 'Стартовое условие', row: 2, col: 0 },

    // Тарифы
    { blockName: 'Тарифы', label: '🌐 Выбрать тариф', type: 'webapp', url: '{appUrl}/dashboard/plans', row: 0, col: 0, style: 'success' },
    { blockName: 'Тарифы', label: '🔙 Назад', type: 'block', nextBlockName: 'Стартовое условие', row: 1, col: 0 },

    // Триал успех
    { blockName: 'Триал успех', label: '📖 Инструкции', type: 'block', nextBlockName: 'Инструкции', row: 0, col: 0, style: 'success' },
    { blockName: 'Триал успех', label: '🔑 Моя подписка', type: 'block', nextBlockName: 'Подписка', row: 1, col: 0 },
    { blockName: 'Триал успех', label: '🏠 Главное меню', type: 'block', nextBlockName: 'Стартовое условие', row: 2, col: 0 },

    // Email найден
    { blockName: 'Email найден', label: '🏠 Главное меню', type: 'block', nextBlockName: 'Стартовое условие', row: 0, col: 0 },

    // Email не найден
    { blockName: 'Email не найден', label: '🔄 Попробовать снова', type: 'block', nextBlockName: 'Привязка email', row: 0, col: 0 },
    { blockName: 'Email не найден', label: '🏠 Главное меню', type: 'block', nextBlockName: 'Стартовое условие', row: 1, col: 0 },

    // Рефералы
    { blockName: 'Рефералы', label: '📋 Скопировать ссылку', type: 'copy_text', copyText: '{referralUrl}', row: 0, col: 0, style: 'primary' },
    { blockName: 'Рефералы', label: '🔙 Назад', type: 'block', nextBlockName: 'Стартовое условие', row: 1, col: 0 },

    // Баланс
    { blockName: 'Баланс', label: '💳 Пополнить', type: 'webapp', url: '{appUrl}/dashboard', row: 0, col: 0, style: 'success' },
    { blockName: 'Баланс', label: '🔙 Назад', type: 'block', nextBlockName: 'Стартовое условие', row: 1, col: 0 },

    // Промокод результат
    { blockName: 'Промокод результат', label: '🏠 Главное меню', type: 'block', nextBlockName: 'Стартовое условие', row: 0, col: 0 },

    // Устройства
    { blockName: 'Устройства', label: '📱 Управление', type: 'webapp', url: '{appUrl}/dashboard', row: 0, col: 0 },
    { blockName: 'Устройства', label: '🔙 Назад', type: 'block', nextBlockName: 'Стартовое условие', row: 1, col: 0 },

    // Инструкции
    { blockName: 'Инструкции', label: '📱 Инструкции', type: 'webapp', url: '{appUrl}/dashboard/instructions', row: 0, col: 0, style: 'primary' },
    { blockName: 'Инструкции', label: '🔙 Назад', type: 'block', nextBlockName: 'Стартовое условие', row: 1, col: 0 },
  ]

  let buttonCount = 0
  for (const btn of buttonDefs) {
    await prisma.botButton.create({
      data: {
        blockId: blockMap[btn.blockName],
        label: btn.label,
        type: btn.type,
        nextBlockId: btn.nextBlockName ? blockMap[btn.nextBlockName] : null,
        url: btn.url ?? null,
        copyText: btn.copyText ?? null,
        style: btn.style ?? null,
        row: btn.row,
        col: btn.col,
        sortOrder: btn.row * 10 + btn.col,
      },
    })
    buttonCount++
  }
  console.log(`✅ Создано ${buttonCount} кнопок`)

  // ─── Triggers ────────────────────────────────────────────
  console.log('⚡ Создание триггеров...')

  await prisma.botTrigger.create({
    data: {
      type: 'command',
      value: '/start',
      blockId: blockMap['Стартовое условие'],
      priority: 10,
    },
  })

  const triggerCount = 1
  console.log(`✅ Создан ${triggerCount} триггер`)

  // ─── Summary ─────────────────────────────────────────────
  const groupCount = groupDefs.length
  const blockCount = blockDefs.length

  console.log('')
  console.log(
    `✅ VPN бот создан: ${groupCount} групп, ${blockCount} блоков, ${buttonCount} кнопок, ${triggerCount} триггеров`,
  )
}

main()
  .catch((e) => {
    console.error('❌ Ошибка:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
