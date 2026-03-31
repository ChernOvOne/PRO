import type { FastifyInstance } from 'fastify'
import { z }                from 'zod'
import { prisma }           from '../db'
import { paymentService }   from '../services/payment'
import { config }           from '../config'

const CreateOrderSchema = z.object({
  tariffId:  z.string().uuid(),
  provider:  z.enum(['YUKASSA', 'CRYPTOPAY']),
  currency:  z.enum(['USDT', 'TON', 'BTC']).optional(),
  variantIndex: z.number().int().min(0).optional(),
  config: z.object({
    trafficGb: z.number().min(0).optional(),
    days: z.number().int().min(1).optional(),
    devices: z.number().int().min(1).optional(),
  }).optional(),
})

export async function paymentRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] }

  // ── Create payment order ───────────────────────────────────
  app.post('/create', auth, async (req, reply) => {
    const userId = (req.user as any).sub
    const body   = CreateOrderSchema.parse(req.body)

    if (body.provider === 'YUKASSA' && !config.yukassa.enabled) {
      return reply.status(400).send({ error: 'ЮKassa payments not configured' })
    }
    if (body.provider === 'CRYPTOPAY' && !config.cryptopay.enabled) {
      return reply.status(400).send({ error: 'CryptoPay payments not configured' })
    }

    const [user, tariff] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      prisma.tariff.findFirstOrThrow({ where: { id: body.tariffId, isActive: true } }),
    ])

    let actualPrice = tariff.priceRub
    let actualPriceUsdt = tariff.priceUsdt
    let actualDays = tariff.durationDays
    let actualTrafficGb = tariff.trafficGb
    let actualDeviceLimit = tariff.deviceLimit
    let paymentMeta: any = null

    if ((tariff as any).mode === 'variants' && body.variantIndex != null) {
      const variants = (tariff as any).variants as any[]
      const variant = variants?.[body.variantIndex]
      if (!variant) return reply.status(400).send({ error: 'Invalid variant' })
      actualPrice = variant.priceRub
      actualPriceUsdt = variant.priceUsdt || null
      actualDays = variant.days
      if (variant.trafficGb != null) actualTrafficGb = variant.trafficGb
      if (variant.deviceLimit != null) actualDeviceLimit = variant.deviceLimit
      paymentMeta = { _mode: 'variant', variantIndex: body.variantIndex, ...variant }
    }

    if ((tariff as any).mode === 'configurator' && body.config) {
      const cfg = (tariff as any).configurator as any
      const c = body.config
      let price = 0
      const trafficGb = c.trafficGb ?? cfg?.traffic?.default ?? 50
      const days = c.days ?? cfg?.days?.default ?? 30
      const devices = c.devices ?? cfg?.devices?.default ?? 3

      if (cfg?.traffic) price += trafficGb * (cfg.traffic.pricePerUnit || 0)
      if (cfg?.days) price += days * (cfg.days.pricePerUnit || 0)
      if (cfg?.devices) price += devices * (cfg.devices.pricePerUnit || 0)

      actualPrice = price
      actualPriceUsdt = price / 90
      actualDays = days
      actualTrafficGb = trafficGb
      actualDeviceLimit = devices
      paymentMeta = { _mode: 'configurator', trafficGb, days, devices, price }
    }

    // Check for active discount promo
    const activeDiscount = await prisma.promoUsage.findFirst({
      where: { userId, promo: { type: 'discount', isActive: true } },
      include: { promo: true },
    })
    if (activeDiscount?.promo?.discountPct) {
      const pct = activeDiscount.promo.discountPct
      const tariffMatch = activeDiscount.promo.tariffIds.length === 0 || activeDiscount.promo.tariffIds.includes(body.tariffId)
      if (tariffMatch) {
        const originalPrice = actualPrice
        actualPrice = Math.round(actualPrice * (1 - pct / 100))
        if (actualPriceUsdt) actualPriceUsdt = Math.round(actualPriceUsdt * (1 - pct / 100) * 100) / 100
        // Store promo info in payment metadata
        paymentMeta = {
          ...paymentMeta,
          promoCode: activeDiscount.promo.code,
          discountPct: pct,
          originalAmount: originalPrice,
        }
      }
    }

    const tariffOverride = { ...tariff, priceRub: actualPrice, priceUsdt: actualPriceUsdt, durationDays: actualDays, trafficGb: actualTrafficGb, deviceLimit: actualDeviceLimit }
    const result = await paymentService.createOrder({
      user,
      tariff: tariffOverride as any,
      provider: body.provider,
      currency: body.currency,
    })

    if (paymentMeta) {
      await prisma.payment.update({ where: { id: result.orderId }, data: { yukassaStatus: JSON.stringify(paymentMeta) } })
    }

    return result
  })

  // ── Payment status ─────────────────────────────────────────
  app.get('/status/:orderId', auth, async (req, reply) => {
    const userId  = (req.user as any).sub
    const { orderId } = req.params as { orderId: string }

    const payment = await prisma.payment.findFirst({
      where:   { id: orderId, userId },
      include: { tariff: { select: { name: true, durationDays: true } } },
    })
    if (!payment) return reply.status(404).send({ error: 'Payment not found' })

    return {
      id:          payment.id,
      status:      payment.status,
      provider:    payment.provider,
      amount:      payment.amount,
      currency:    payment.currency,
      tariff:      payment.tariff,
      confirmedAt: payment.confirmedAt,
      createdAt:   payment.createdAt,
    }
  })

  // ── Verify payment (polling fallback) ──────────────────────
  // For cases where webhook was missed or delayed
  app.post('/verify/:orderId', auth, async (req, reply) => {
    const userId  = (req.user as any).sub
    const { orderId } = req.params as { orderId: string }

    // First check if payment was already confirmed (webhook may have arrived)
    const payment = await prisma.payment.findFirst({
      where: { id: orderId, userId },
    })
    if (!payment) return reply.status(404).send({ error: 'Payment not found' })

    // Already confirmed
    if (payment.status === 'PAID') {
      return { confirmed: true, status: 'PAID' }
    }

    // Already failed/expired
    if (payment.status === 'FAILED' || payment.status === 'EXPIRED') {
      return { confirmed: false, status: payment.status }
    }

    // Still pending — check with payment provider
    if (payment.provider === 'YUKASSA' && payment.yukassaPaymentId) {
      try {
        const yp = await paymentService.yukassa.getPayment(payment.yukassaPaymentId)
        if (yp.paid || yp.status === 'succeeded') {
          await paymentService.confirmPayment(orderId)
          return { confirmed: true, status: 'PAID' }
        }
        if (yp.status === 'canceled') {
          await prisma.payment.update({ where: { id: orderId }, data: { status: 'FAILED' } })
          return { confirmed: false, status: 'FAILED' }
        }
        // waiting_for_capture, pending — still processing
        return { confirmed: false, status: 'PENDING', providerStatus: yp.status }
      } catch {
        // Provider unreachable, just return pending
        return { confirmed: false, status: 'PENDING' }
      }
    }

    if (payment.provider === 'CRYPTOPAY' && payment.cryptoInvoiceId) {
      try {
        const inv = await paymentService.cryptopay.getInvoice(payment.cryptoInvoiceId)
        if (inv?.status === 'paid') {
          await paymentService.confirmPayment(orderId)
          return { confirmed: true, status: 'PAID' }
        }
        if (inv?.status === 'expired') {
          await prisma.payment.update({ where: { id: orderId }, data: { status: 'EXPIRED' } })
          return { confirmed: false, status: 'EXPIRED' }
        }
        return { confirmed: false, status: 'PENDING' }
      } catch {
        return { confirmed: false, status: 'PENDING' }
      }
    }

    return { confirmed: false, status: payment.status }
  })
}
