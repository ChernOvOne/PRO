import type { FastifyInstance } from 'fastify'
import { z }                from 'zod'
import { prisma }           from '../db'
import { paymentService }   from '../services/payment'
import { config }           from '../config'

const CreateOrderSchema = z.object({
  tariffId:  z.string().uuid(),
  provider:  z.enum(['YUKASSA', 'CRYPTOPAY']),
  currency:  z.enum(['USDT', 'TON', 'BTC']).optional(),
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

    const result = await paymentService.createOrder({
      user,
      tariff,
      provider: body.provider,
      currency: body.currency,
    })

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
  // For cases where webhook was missed
  app.post('/verify/:orderId', auth, async (req, reply) => {
    const userId  = (req.user as any).sub
    const { orderId } = req.params as { orderId: string }

    const payment = await prisma.payment.findFirst({
      where: { id: orderId, userId, status: 'PENDING' },
    })
    if (!payment) return reply.status(404).send({ error: 'Pending payment not found' })

    // Check with provider
    if (payment.provider === 'YUKASSA' && payment.yukassaPaymentId) {
      const yp = await paymentService.yukassa.getPayment(payment.yukassaPaymentId)
      if (yp.paid || yp.status === 'succeeded') {
        await paymentService.confirmPayment(orderId)
        return { confirmed: true }
      }
    }

    if (payment.provider === 'CRYPTOPAY' && payment.cryptoInvoiceId) {
      const inv = await paymentService.cryptopay.getInvoice(payment.cryptoInvoiceId)
      if (inv?.status === 'paid') {
        await paymentService.confirmPayment(orderId)
        return { confirmed: true }
      }
    }

    return { confirmed: false, status: payment.status }
  })
}
