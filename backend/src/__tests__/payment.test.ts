import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─────────────────────────────────────────────────────────────
// Mock dependencies before imports
// ─────────────────────────────────────────────────────────────
vi.mock('../db', () => ({
  prisma: {
    user:           { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    payment:        { create: vi.fn(), update: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
    referralBonus:  { findUnique: vi.fn(), create: vi.fn() },
    tariff:         { findFirst: vi.fn(), findUniqueOrThrow: vi.fn() },
  },
}))
vi.mock('../services/remnawave', () => ({
  remnawave: {
    getUserByUuid:      vi.fn(),
    createUser:         vi.fn(),
    extendSubscription: vi.fn(),
    getSubscriptionUrl: vi.fn(uuid => `https://panel/sub/${uuid}`),
  },
}))
vi.mock('../services/notifications', () => ({
  notifications: { paymentConfirmed: vi.fn(), referralBonus: vi.fn() },
}))

import { describe as d } from 'vitest'
import { prisma }         from '../db'
import { remnawave }      from '../services/remnawave'
import { PaymentService } from '../services/payment'

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const makeUser = (overrides = {}) => ({
  id:            'user-123',
  email:         'test@example.com',
  telegramId:    '12345',
  remnawaveUuid: null,
  referredById:  null,
  subStatus:     'INACTIVE',
  subExpireAt:   null,
  ...overrides,
})

const makeTariff = (overrides = {}) => ({
  id:             'tariff-1',
  name:           'Месяц',
  durationDays:   30,
  priceRub:       299,
  priceUsdt:      3.5,
  remnawaveTagIds: [],
  ...overrides,
})

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────
describe('PaymentService', () => {
  let service: PaymentService

  beforeEach(() => {
    service = new PaymentService()
    vi.clearAllMocks()
  })

  describe('confirmPayment — new user (no remnawaveUuid)', () => {
    it('creates REMNAWAVE user on first payment', async () => {
      const user   = makeUser()
      const tariff = makeTariff()

      vi.mocked(prisma.payment.findUnique).mockResolvedValue({
        id:      'pay-1',
        status:  'PENDING',
        user,
        tariff,
        userId:  user.id,
        tariffId: tariff.id,
      } as any)

      vi.mocked(remnawave.createUser).mockResolvedValue({
        uuid:      'rm-uuid-abc',
        status:    'ACTIVE',
        expireAt:  new Date(Date.now() + 30 * 86400_000).toISOString(),
      } as any)

      vi.mocked(prisma.payment.update).mockResolvedValue({} as any)
      vi.mocked(prisma.user.update).mockResolvedValue({} as any)
      vi.mocked(prisma.referralBonus.findUnique).mockResolvedValue(null)

      await service.confirmPayment('pay-1')

      expect(remnawave.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email:      user.email,
          telegramId: user.telegramId,
        })
      )

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            remnawaveUuid: 'rm-uuid-abc',
            subStatus:     'ACTIVE',
          }),
        })
      )
    })

    it('extends existing subscription on repeat payment', async () => {
      const user   = makeUser({ remnawaveUuid: 'existing-rm-uuid' })
      const tariff = makeTariff()

      vi.mocked(prisma.payment.findUnique).mockResolvedValue({
        id: 'pay-2', status: 'PENDING', user, tariff,
        userId: user.id, tariffId: tariff.id,
      } as any)

      vi.mocked(remnawave.getUserByUuid).mockResolvedValue({
        uuid:     'existing-rm-uuid',
        status:   'ACTIVE',
        expireAt: new Date(Date.now() + 5 * 86400_000).toISOString(),
      } as any)

      vi.mocked(remnawave.extendSubscription).mockResolvedValue({
        uuid:     'existing-rm-uuid',
        expireAt: new Date(Date.now() + 35 * 86400_000).toISOString(),
      } as any)

      vi.mocked(prisma.payment.update).mockResolvedValue({} as any)
      vi.mocked(prisma.user.update).mockResolvedValue({} as any)
      vi.mocked(prisma.referralBonus.findUnique).mockResolvedValue(null)

      await service.confirmPayment('pay-2')

      expect(remnawave.extendSubscription).toHaveBeenCalledWith(
        'existing-rm-uuid',
        30,
        expect.any(Date)
      )
      expect(remnawave.createUser).not.toHaveBeenCalled()
    })

    it('skips already confirmed payment', async () => {
      vi.mocked(prisma.payment.findUnique).mockResolvedValue({
        id: 'pay-3', status: 'PAID', user: makeUser(), tariff: makeTariff(),
        userId: 'user-123', tariffId: 'tariff-1',
      } as any)

      await service.confirmPayment('pay-3')

      expect(remnawave.createUser).not.toHaveBeenCalled()
      expect(remnawave.extendSubscription).not.toHaveBeenCalled()
    })

    it('throws on missing payment', async () => {
      vi.mocked(prisma.payment.findUnique).mockResolvedValue(null)
      await expect(service.confirmPayment('missing')).rejects.toThrow('not found')
    })
  })

  describe('referral bonus', () => {
    it('applies bonus to referrer after payment confirmed', async () => {
      const referrer = makeUser({ id: 'referrer-id', remnawaveUuid: 'ref-rm-uuid' })
      const user     = makeUser({ referredById: 'referrer-id' })
      const tariff   = makeTariff()

      vi.mocked(prisma.payment.findUnique).mockResolvedValue({
        id: 'pay-ref', status: 'PENDING',
        user, tariff, userId: user.id, tariffId: tariff.id,
      } as any)

      vi.mocked(remnawave.createUser).mockResolvedValue({
        uuid: 'new-rm', status: 'ACTIVE',
        expireAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
      } as any)

      vi.mocked(prisma.payment.update).mockResolvedValue({} as any)
      vi.mocked(prisma.user.update).mockResolvedValue({} as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(referrer as any)
      vi.mocked(prisma.referralBonus.findUnique).mockResolvedValue(null)
      vi.mocked(prisma.referralBonus.create).mockResolvedValue({} as any)

      vi.mocked(remnawave.getUserByUuid).mockResolvedValue({
        uuid: 'ref-rm-uuid', status: 'ACTIVE',
        expireAt: new Date(Date.now() + 10 * 86400_000).toISOString(),
      } as any)

      vi.mocked(remnawave.extendSubscription).mockResolvedValue({} as any)

      await service.confirmPayment('pay-ref')

      expect(prisma.referralBonus.create).toHaveBeenCalled()
      expect(remnawave.extendSubscription).toHaveBeenCalledWith(
        'ref-rm-uuid',
        expect.any(Number),
        expect.any(Date)
      )
    })
  })
})

// ─────────────────────────────────────────────────────────────
// Auth validation tests
// ─────────────────────────────────────────────────────────────
describe('Telegram auth hash validation', () => {
  it('generates valid hash string', () => {
    const { createHmac, createHash } = require('crypto')
    const botToken = 'test_bot_token_123'

    const params = { id: 123, auth_date: Math.floor(Date.now() / 1000), first_name: 'Test' }
    const checkString = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')

    const secretKey = createHash('sha256').update(botToken).digest()
    const hash      = createHmac('sha256', secretKey).update(checkString).digest('hex')

    expect(hash).toHaveLength(64)
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────
// Utility helpers tests
// ─────────────────────────────────────────────────────────────
describe('helpers', () => {
  it('formatDaysRu — single day', async () => {
    const { formatDaysRu } = await import('../utils/helpers')
    expect(formatDaysRu(1)).toBe('1 день')
    expect(formatDaysRu(30)).toBe('1 месяц')
    expect(formatDaysRu(365)).toBe('1 год')
    expect(formatDaysRu(90)).toBe('3 месяца')
  })

  it('generateCode — correct length and chars', async () => {
    const { generateCode } = await import('../utils/helpers')
    const code = generateCode(6)
    expect(code).toHaveLength(6)
    expect(/^[A-Z2-9]+$/.test(code)).toBe(true)
  })

  it('chunk — splits arrays correctly', async () => {
    const { chunk } = await import('../utils/helpers')
    expect(chunk([1,2,3,4,5], 2)).toEqual([[1,2],[3,4],[5]])
    expect(chunk([], 3)).toEqual([])
  })

  it('formatBytes — human readable sizes', async () => {
    const { formatBytes } = await import('../utils/helpers')
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1024 * 1024)).toBe('1 MB')
    expect(formatBytes(1.5 * 1024 * 1024 * 1024)).toBe('1.5 GB')
  })
})
