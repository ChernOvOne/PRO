import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function seed() {
  console.log('🌱 Seeding database...')

  // ── Default tariffs ─────────────────────────────────────────
  const tariffs = [
    {
      name:            'Базовый · 1 месяц',
      description:     '500 ГБ трафика · 3 устройства',
      type:            'SUBSCRIPTION' as const,
      durationDays:    30,
      priceRub:        299,
      priceUsdt:       3.5,
      deviceLimit:     3,
      trafficGb:       500,
      trafficStrategy: 'MONTH',
      isActive:        true,
      isFeatured:      false,
      sortOrder:       1,
      remnawaveSquads: [] as string[],
    },
    {
      name:            'Стандарт · 1 месяц',
      description:     'Безлимитный трафик · 5 устройств',
      type:            'SUBSCRIPTION' as const,
      durationDays:    30,
      priceRub:        499,
      priceUsdt:       5.5,
      deviceLimit:     5,
      trafficGb:       null,
      trafficStrategy: 'MONTH',
      isActive:        true,
      isFeatured:      true,
      sortOrder:       2,
      remnawaveSquads: [] as string[],
    },
    {
      name:            'Годовой',
      description:     'Безлимитный трафик · 10 устройств · Выгода 30%',
      type:            'SUBSCRIPTION' as const,
      durationDays:    365,
      priceRub:        3990,
      priceUsdt:       44,
      deviceLimit:     10,
      trafficGb:       null,
      trafficStrategy: 'MONTH',
      isActive:        true,
      isFeatured:      false,
      sortOrder:       3,
      remnawaveSquads: [] as string[],
    },
    {
      name:            '+100 ГБ трафика',
      description:     'Дополнительный трафик к текущей подписке',
      type:            'TRAFFIC_ADDON' as const,
      durationDays:    0,
      priceRub:        99,
      priceUsdt:       1.1,
      deviceLimit:     0,
      trafficGb:       null,
      trafficAddonGb:  100,
      trafficStrategy: 'MONTH',
      isActive:        true,
      isFeatured:      false,
      sortOrder:       10,
      remnawaveSquads: [] as string[],
    },
    {
      name:            '+500 ГБ трафика',
      description:     'Дополнительный трафик к текущей подписке',
      type:            'TRAFFIC_ADDON' as const,
      durationDays:    0,
      priceRub:        399,
      priceUsdt:       4.5,
      deviceLimit:     0,
      trafficGb:       null,
      trafficAddonGb:  500,
      trafficStrategy: 'MONTH',
      isActive:        true,
      isFeatured:      false,
      sortOrder:       11,
      remnawaveSquads: [] as string[],
    },
  ]

  for (const t of tariffs) {
    const existing = await prisma.tariff.findFirst({ where: { name: t.name } })
    if (!existing) {
      await prisma.tariff.create({ data: t as any })
      console.log(`  ✓ Tariff: ${t.name}`)
    }
  }

  // ── Default instruction platforms ───────────────────────────
  const platforms = [
    { slug: 'ios',     name: 'iOS',        icon: '🍎', sortOrder: 1 },
    { slug: 'android', name: 'Android',    icon: '🤖', sortOrder: 2 },
    { slug: 'windows', name: 'Windows',    icon: '🪟', sortOrder: 3 },
    { slug: 'macos',   name: 'macOS',      icon: '💻', sortOrder: 4 },
    { slug: 'linux',   name: 'Linux',      icon: '🐧', sortOrder: 5 },
    { slug: 'tv',      name: 'Android TV', icon: '📺', sortOrder: 6 },
  ]

  for (const p of platforms) {
    const existing = await prisma.instructionPlatform.findUnique({ where: { slug: p.slug } })
    if (!existing) {
      await prisma.instructionPlatform.create({ data: p })
      console.log(`  ✓ Platform: ${p.name}`)
    }
  }

  // ── Default settings ────────────────────────────────────────
  const settings = [
    { key: 'site_name',        value: 'HIDEYOU VPN' },
    { key: 'site_description', value: 'Быстрый и безопасный VPN' },
    { key: 'support_link',     value: '' },
    { key: 'trial_enabled',    value: 'false' },
  ]

  for (const s of settings) {
    await prisma.setting.upsert({
      where:  { key: s.key },
      update: {},
      create: s,
    })
  }

  console.log('✅ Seed complete!')
}

seed()
  .catch(err => { console.error('Seed failed:', err); process.exit(1) })
  .finally(() => prisma.$disconnect())
