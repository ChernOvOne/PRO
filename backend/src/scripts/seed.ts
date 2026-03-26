import { PrismaClient, DeviceType } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function seed() {
  console.log('🌱 Seeding database...')

  // ── Default tariffs ─────────────────────────────────────────
  const tariffs = [
    {
      name:          'Стартер',
      description:   'Идеально для начала',
      durationDays:  30,
      priceRub:      299,
      priceUsdt:     3.5,
      deviceLimit:   3,
      isFeatured:    false,
      sortOrder:     0,
    },
    {
      name:          'Популярный',
      description:   'Лучшее соотношение цены и качества',
      durationDays:  90,
      priceRub:      699,
      priceUsdt:     8.0,
      deviceLimit:   3,
      isFeatured:    true,
      sortOrder:     1,
    },
    {
      name:          'Годовой',
      description:   'Максимальная экономия',
      durationDays:  365,
      priceRub:      1990,
      priceUsdt:     22.0,
      deviceLimit:   5,
      isFeatured:    false,
      sortOrder:     2,
    },
  ]

  for (const t of tariffs) {
    await prisma.tariff.upsert({
      where:  { id: `seed-${t.sortOrder}` },
      update: t,
      create: { id: `seed-${t.sortOrder}`, ...t, remnawaveTagIds: [] },
    })
  }
  console.log('✓ Tariffs created')

  // ── Default instructions ────────────────────────────────────
  const instructions = [
    {
      id:          'ins-ios',
      deviceType:  'IOS' as DeviceType,
      title:       'Подключение на iPhone / iPad',
      sortOrder:   0,
      content: `## Шаг 1 — Установи приложение
Скачай [Streisand](https://apps.apple.com/app/streisand/id6450534064) из App Store (бесплатно).

## Шаг 2 — Добавь подписку
1. Открой Streisand
2. Нажми **+** в правом верхнем углу
3. Выбери **Добавить по ссылке**
4. Вставь ссылку-подписку из личного кабинета

## Шаг 3 — Подключись
Нажми на переключатель рядом с любым сервером.

> **Совет:** Выбирай серверы с наименьшей задержкой (ping).`,
    },
    {
      id:          'ins-android',
      deviceType:  'ANDROID' as DeviceType,
      title:       'Подключение на Android',
      sortOrder:   1,
      content: `## Шаг 1 — Установи приложение
Скачай [v2rayNG](https://play.google.com/store/apps/details?id=com.v2ray.ang) из Google Play.

## Шаг 2 — Добавь подписку
1. Открой v2rayNG
2. Нажми **☰** (меню) → **Subscription settings**
3. Нажми **+** и вставь ссылку-подписку
4. Нажми **Update subscription**

## Шаг 3 — Подключись
Выбери сервер и нажми кнопку соединения внизу.`,
    },
    {
      id:          'ins-windows',
      deviceType:  'WINDOWS' as DeviceType,
      title:       'Подключение на Windows',
      sortOrder:   2,
      content: `## Шаг 1 — Установи приложение
Скачай [Hiddify](https://github.com/hiddify/hiddify-next/releases/latest) для Windows.

## Шаг 2 — Добавь профиль
1. Открой Hiddify
2. Нажми **Add Profile** (+ в верхнем углу)
3. Вставь ссылку-подписку из кабинета
4. Нажми **Add**

## Шаг 3 — Подключись
Нажми большую кнопку **Connect**.`,
    },
    {
      id:          'ins-macos',
      deviceType:  'MACOS' as DeviceType,
      title:       'Подключение на macOS',
      sortOrder:   3,
      content: `## Шаг 1 — Установи приложение
Скачай [Hiddify](https://github.com/hiddify/hiddify-next/releases/latest) для macOS.

## Шаг 2 — Добавь профиль
1. Открой Hiddify
2. Нажми **+** и вставь ссылку-подписку
3. Подтверди добавление

## Шаг 3 — Подключись
Нажми **Connect** в главном окне.`,
    },
  ]

  for (const ins of instructions) {
    await prisma.instruction.upsert({
      where:  { id: ins.id },
      update: ins,
      create: { ...ins, isActive: true },
    })
  }
  console.log('✓ Instructions created')

  // ── Default settings ────────────────────────────────────────
  const settings = [
    { key: 'support_url',    value: 'https://t.me/hideyou_support' },
    { key: 'channel_url',    value: 'https://t.me/hideyouvpn' },
    { key: 'trial_enabled',  value: 'false' },
    { key: 'trial_days',     value: '3' },
  ]

  for (const s of settings) {
    await prisma.setting.upsert({
      where:  { key: s.key },
      update: { value: s.value },
      create: s,
    })
  }
  console.log('✓ Settings initialized')

  console.log('✅ Seed complete!')
  await prisma.$disconnect()
}

seed().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
