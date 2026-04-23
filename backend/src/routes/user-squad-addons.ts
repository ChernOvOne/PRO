import type { FastifyInstance } from 'fastify'
import { z }        from 'zod'
import { prisma }   from '../db'
import { balanceService } from '../services/balance'
import { paymentService } from '../services/payment'
import { logger }   from '../utils/logger'
import {
  computeEffectiveSquads, syncUserSquadsToRemnawave,
  prorateAddonPrice, daysLeftUntil,
  getUserCurrentTariff, parsePaidSquads,
} from '../services/squad-addons'

export async function userSquadAddonRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] }

  /* ── Available + active addons for the dashboard inline block ── */
  app.get('/', auth, async (req) => {
    const userId = (req.user as any).sub
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return { active: [], available: [], daysLeft: 0, autoRenew: false }

    const now = new Date()
    const daysLeft = daysLeftUntil(user.subExpireAt)

    const active = await prisma.userSquadAddon.findMany({
      where: { userId, cancelledAt: null, expireAt: { gt: now } },
      orderBy: { expireAt: 'desc' },
    })
    const activeUuids = new Set(active.map(a => a.squadUuid))

    const tariff = await getUserCurrentTariff(userId)
    const paidSquads = tariff ? parsePaidSquads((tariff as any).paidSquads) : []
    const available = paidSquads
      .filter(p => !activeUuids.has(p.squadUuid))
      .map(p => ({
        ...p,
        prorated: prorateAddonPrice(p.pricePerMonth, daysLeft),
      }))

    return {
      daysLeft,
      autoRenew: user.autoRenew,
      active: active.map(a => ({
        id:             a.id,
        squadUuid:      a.squadUuid,
        title:          a.title,
        expireAt:       a.expireAt,
        pricePerMonthLocked: Number(a.pricePerMonthLocked),
        source:         a.source,
        autoRenew:      a.autoRenew,
      })),
      available,
    }
  })

  // Admin-level kill switch: auto_renew_enabled in settings. If disabled,
  // users can only turn it OFF, not ON — prevents re-enabling after admin cut.
  async function assertAutoRenewAllowed(enabled: boolean): Promise<string | null> {
    if (!enabled) return null // turning OFF is always allowed
    const row = await prisma.setting.findUnique({ where: { key: 'auto_renew_enabled' } }).catch(() => null)
    const on = row?.value == null ? true : (row.value === '1' || row.value === 'true')
    return on ? null : 'Автопродление сейчас отключено администратором'
  }

  /* ── Global auto-renew toggle (subscription + addons) ──── */
  app.post('/auto-renew', auth, async (req, reply) => {
    const userId = (req.user as any).sub
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body)
    const err = await assertAutoRenewAllowed(enabled)
    if (err) return reply.status(403).send({ error: err })
    await prisma.user.update({ where: { id: userId }, data: { autoRenew: enabled } })
    return { autoRenew: enabled }
  })

  /* ── Per-addon auto-renew override ───────────────────── */
  app.post('/:id/auto-renew', auth, async (req, reply) => {
    const userId = (req.user as any).sub
    const { id } = req.params as { id: string }
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body)
    const err = await assertAutoRenewAllowed(enabled)
    if (err) return reply.status(403).send({ error: err })

    const row = await prisma.userSquadAddon.findUnique({ where: { id } })
    if (!row || row.userId !== userId) return reply.status(404).send({ error: 'Not found' })

    await prisma.userSquadAddon.update({ where: { id }, data: { autoRenew: enabled } })
    return { ok: true }
  })

  /* ── Purchase an addon to an existing active subscription ── */
  app.post('/purchase', auth, async (req, reply) => {
    const userId = (req.user as any).sub
    const schema = z.object({
      squadUuid:     z.string(),
      method:        z.enum(['BALANCE', 'YUKASSA', 'CRYPTOPAY', 'PLATEGA']),
      currency:      z.string().optional(),
      paymentMethod: z.number().int().optional(),
    })
    const { squadUuid, method, currency, paymentMethod } = schema.parse(req.body)

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return reply.status(404).send({ error: 'User not found' })

    const daysLeft = daysLeftUntil(user.subExpireAt)
    if (daysLeft <= 0) {
      return reply.status(400).send({
        error: 'Нет активной подписки. Сначала оформите тариф.',
      })
    }

    const tariff = await getUserCurrentTariff(userId)
    if (!tariff) return reply.status(400).send({ error: 'Активный тариф не найден' })

    const paidSquads = parsePaidSquads((tariff as any).paidSquads)
    const addon = paidSquads.find(p => p.squadUuid === squadUuid)
    if (!addon) return reply.status(404).send({ error: 'Этот сервер не продаётся в текущем тарифе' })

    const existing = await prisma.userSquadAddon.findUnique({
      where: { userId_squadUuid: { userId, squadUuid } },
    })
    if (existing && !existing.cancelledAt && existing.expireAt > new Date()) {
      return reply.status(409).send({ error: 'Этот сервер уже подключён' })
    }

    const priceRub = prorateAddonPrice(addon.pricePerMonth, daysLeft)
    const pricePerDayLocked = addon.pricePerMonth / 30
    const expireAt = user.subExpireAt!

    if (method === 'BALANCE') {
      const balance = await balanceService.getBalance(userId)
      if (Number(balance.balance) < priceRub) {
        return reply.status(400).send({ error: 'Недостаточно средств на балансе' })
      }
      await balanceService.debit({
        userId,
        amount: priceRub,
        type: 'PURCHASE',
        description: `Доп. сервер «${addon.title}» (${daysLeft} дн.)`,
      })

      await prisma.userSquadAddon.upsert({
        where: { userId_squadUuid: { userId, squadUuid } },
        create: {
          userId, squadUuid,
          title:               addon.title,
          expireAt,
          pricePerMonthLocked: addon.pricePerMonth,
          pricePerDayLocked,
          source:              'PURCHASE',
          paymentId:           null,
          cancelledAt:         null,
        },
        update: {
          title:               addon.title,
          expireAt,
          pricePerMonthLocked: addon.pricePerMonth,
          pricePerDayLocked,
          cancelledAt:         null,
          source:              'PURCHASE',
        },
      })
      await syncUserSquadsToRemnawave(userId)
      return { ok: true, paid: priceRub, method: 'BALANCE' }
    }

    // External provider: create PENDING payment; webhook will activate
    const virtualTariff = {
      id: 'squad_addon_virtual',
      name: `Доп. сервер «${addon.title}»`,
      durationDays: daysLeft,
      priceRub,
      priceUsdt: priceRub / 90,
      remnawaveSquads: [],
      remnawaveTag: null,
      remnawaveTagIds: [],
    } as any

    const result = await paymentService.createOrder({
      user, provider: method, currency, paymentMethod,
      tariff: virtualTariff,
      purpose: 'SQUAD_ADDON',
      metadata: {
        _type: 'squad_addon',
        squadUuid:           addon.squadUuid,
        title:               addon.title,
        daysLeft,
        expireAt:            expireAt.toISOString(),
        pricePerMonthLocked: addon.pricePerMonth,
        pricePerDayLocked,
      },
    })

    return result
  })

  /* ── Cancel an addon + refund unused days ─────────────── */
  app.post('/:id/cancel', auth, async (req, reply) => {
    const userId = (req.user as any).sub
    const { id } = req.params as { id: string }
    const schema = z.object({
      refundTo: z.enum(['BALANCE', 'CARD']).default('BALANCE'),
    })
    const { refundTo } = schema.parse(req.body)

    const row = await prisma.userSquadAddon.findUnique({ where: { id } })
    if (!row || row.userId !== userId) return reply.status(404).send({ error: 'Not found' })
    if (row.cancelledAt) return reply.status(400).send({ error: 'Уже отключён' })

    const remainingDays = daysLeftUntil(row.expireAt)
    const refundAmount = Math.floor(Number(row.pricePerDayLocked) * remainingDays * 100) / 100

    let refundedToCard = false
    if (refundTo === 'CARD' && row.paymentId) {
      const payment = await prisma.payment.findUnique({ where: { id: row.paymentId } })
      if (payment && payment.provider === 'YUKASSA' && payment.yukassaPaymentId) {
        try {
          await paymentService.yukassa.createRefund(payment.yukassaPaymentId, refundAmount)
          refundedToCard = true
        } catch (err: any) {
          logger.warn(`YuKassa refund failed for addon ${id}, falling back to balance: ${err?.message}`)
        }
      }
    }

    if (!refundedToCard && refundAmount > 0) {
      await balanceService.credit({
        userId,
        amount: refundAmount,
        type: 'REFUND',
        description: `Возврат за доп. сервер «${row.title}» (${remainingDays} дн.)`,
      })
    }

    await prisma.userSquadAddon.update({
      where: { id },
      data:  { cancelledAt: new Date() },
    })

    await syncUserSquadsToRemnawave(userId)
    return { ok: true, refunded: refundAmount, to: refundedToCard ? 'CARD' : 'BALANCE' }
  })
}
