import type { FastifyInstance } from 'fastify'
import { z }            from 'zod'
import { giftService }  from '../services/gift'

export async function giftRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] }

  // Create gift (initiates payment)
  app.post('/create', auth, async (req, reply) => {
    const userId = (req.user as any).sub
    const schema = z.object({
      tariffId:       z.string(),
      provider:       z.enum(['YUKASSA', 'CRYPTOPAY', 'BALANCE']),
      currency:       z.string().optional(),
      recipientEmail: z.string().email().optional(),
      message:        z.string().max(500).optional(),
    })
    const data = schema.parse(req.body)

    // Payment for gift is created through the payment route with purpose=GIFT
    // After payment confirmation, gift is created via giftService.createGift
    // For now, we handle the BALANCE payment case directly
    if (data.provider === 'BALANCE') {
      const { prisma } = await import('../db')
      const { balanceService } = await import('../services/balance')

      const tariff = await prisma.tariff.findUnique({ where: { id: data.tariffId } })
      if (!tariff) return reply.status(404).send({ error: 'Тариф не найден' })

      // Debit balance
      await balanceService.debit({
        userId,
        amount:      tariff.priceRub,
        type:        'GIFT',
        description: `Подарок: ${tariff.name}`,
      })

      // Create manual payment record
      const payment = await prisma.payment.create({
        data: {
          userId,
          tariffId:    tariff.id,
          provider:    'BALANCE',
          amount:      tariff.priceRub,
          currency:    'RUB',
          status:      'PAID',
          purpose:     'GIFT',
          confirmedAt: new Date(),
        },
      })

      // Create gift
      const gift = await giftService.createGift({
        fromUserId:     userId,
        tariffId:       tariff.id,
        paymentId:      payment.id,
        recipientEmail: data.recipientEmail,
        message:        data.message,
      })

      return { ok: true, giftCode: gift.giftCode, giftUrl: `${process.env.APP_URL || ''}/present/${gift.giftCode}` }
    }

    // For YUKASSA/CRYPTOPAY, create payment with purpose=GIFT
    const { prisma } = await import('../db')
    const { paymentService } = await import('../services/payment')

    const tariff = await prisma.tariff.findUnique({ where: { id: data.tariffId } })
    if (!tariff) return reply.status(404).send({ error: 'Тариф не найден' })

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return reply.status(404).send({ error: 'Пользователь не найден' })

    const result = await paymentService.createOrder({
      user,
      tariff,
      provider: data.provider,
      currency: data.currency,
      purpose:  'GIFT',
    })

    // Store gift metadata in description for use after payment confirmation
    await prisma.payment.update({
      where: { id: result.orderId },
      data:  {
        // JSON with gift details — parsed in confirmPayment
        yukassaStatus: JSON.stringify({
          _giftMeta: true,
          recipientEmail: data.recipientEmail || null,
          message: data.message || null,
        }),
      },
    })

    return {
      orderId:    result.orderId,
      paymentUrl: result.paymentUrl,
      provider:   result.provider,
    }
  })

  // Get my gifts
  app.get('/my', auth, async (req) => {
    const userId = (req.user as any).sub
    return giftService.getUserGifts(userId)
  })

  // Get gift status by code (public-ish, no auth required to check)
  app.get('/status/:code', async (req, reply) => {
    const { code } = req.params as { code: string }
    const gift = await giftService.getGiftStatus(code)
    if (!gift) return reply.status(404).send({ error: 'Подарок не найден' })

    return {
      status:     gift.status,
      tariffName: gift.tariff.name,
      message:    gift.message,
      expiresAt:  gift.expiresAt,
      senderName: gift.fromUser?.telegramName || gift.fromUser?.email || null,
    }
  })

  // Claim a gift
  app.post('/claim/:code', auth, async (req, reply) => {
    const userId = (req.user as any).sub
    const { code } = req.params as { code: string }

    try {
      const result = await giftService.claimGift(code, userId)
      return { ok: true, ...result }
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })
}
