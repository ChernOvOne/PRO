import type { FastifyInstance } from 'fastify'
import { paymentService } from '../services/payment'
import { logger }         from '../utils/logger'
import { prisma }         from '../db'

export async function webhookRoutes(app: FastifyInstance) {
  // ── ЮKassa webhook ─────────────────────────────────────────
  app.post('/yukassa', {
    config: { rawBody: true }, // needed for signature check
  }, async (req, reply) => {
    try {
      const body = req.body as any
      const event = body.event as string
      const obj = body.object || {}

      // ── payment.succeeded ──────────────────────────────
      if (event === 'payment.succeeded') {
        const yukassaPaymentId = obj.id
        const metadata = obj.metadata || {}
        const orderId  = metadata.orderId

        if (!orderId) {
          logger.warn('ЮKassa webhook: no orderId in metadata', obj.id)
          return reply.status(200).send({ ok: true })
        }

        const payment = await prisma.payment.findFirst({
          where: {
            OR: [
              { id: orderId },
              { yukassaPaymentId },
            ],
            provider: 'YUKASSA',
          },
        })

        if (!payment) {
          logger.warn(`ЮKassa webhook: payment not found orderId=${orderId}`)
          return reply.status(200).send({ ok: true })
        }

        // Save commission from income_amount
        if (obj.income_amount && obj.amount) {
          const gross = parseFloat(obj.amount.value)
          const net = parseFloat(obj.income_amount.value)
          const commission = Math.max(0, +(gross - net).toFixed(2))
          if (commission > 0) {
            await prisma.payment.update({
              where: { id: payment.id },
              data: { commission },
            })
          }
        }

        if (payment.status !== 'PAID') {
          await paymentService.confirmPayment(payment.id)
          logger.info(`ЮKassa payment confirmed: ${payment.id}`)
        }

        return reply.status(200).send({ ok: true })
      }

      // ── refund.succeeded ───────────────────────────────
      if (event === 'refund.succeeded') {
        const paymentYukassaId = obj.payment_id
        const refundAmount = parseFloat(obj.amount?.value || '0')

        if (!paymentYukassaId || refundAmount <= 0) {
          return reply.status(200).send({ ok: true })
        }

        const payment = await prisma.payment.findFirst({
          where: { yukassaPaymentId: paymentYukassaId, provider: 'YUKASSA' },
        })

        if (!payment) {
          logger.warn(`ЮKassa refund webhook: payment not found yukassaId=${paymentYukassaId}`)
          return reply.status(200).send({ ok: true })
        }

        const gross = payment.amount + Number(payment.commission || 0)
        const isFullRefund = refundAmount >= gross - 0.01

        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: isFullRefund ? 'REFUNDED' : 'PARTIAL_REFUND',
            refundAmount,
            refundedAt: new Date(),
          },
        })

        logger.info(`ЮKassa refund processed: ${payment.id}, amount=${refundAmount}, full=${isFullRefund}`)
        return reply.status(200).send({ ok: true })
      }

      // Other events — ignore
      return reply.status(200).send({ ok: true })
    } catch (err) {
      logger.error('ЮKassa webhook error:', err)
      return reply.status(200).send({ ok: true })
    }
  })

  // ── CryptoPay webhook ──────────────────────────────────────
  app.post('/cryptopay', async (req, reply) => {
    try {
      // Verify signature
      const signature = req.headers['crypto-pay-api-token'] as string
      const body      = req.body as any

      if (
        signature &&
        !paymentService.cryptopay.verifyWebhookSignature(
          signature,
          JSON.stringify(body),
        )
      ) {
        logger.warn('CryptoPay webhook: invalid signature')
        return reply.status(401).send({ error: 'Invalid signature' })
      }

      if (body.update_type !== 'invoice_paid') {
        return reply.status(200).send({ ok: true })
      }

      const invoiceId = body.payload?.invoice_id
      const orderId   = body.payload?.payload // our orderId stored as payload

      if (!orderId) {
        logger.warn('CryptoPay webhook: no payload/orderId', invoiceId)
        return reply.status(200).send({ ok: true })
      }

      const payment = await prisma.payment.findFirst({
        where: {
          OR: [
            { id: orderId },
            { cryptoInvoiceId: invoiceId },
          ],
          provider: 'CRYPTOPAY',
        },
      })

      if (!payment) {
        logger.warn(`CryptoPay webhook: payment not found orderId=${orderId}`)
        return reply.status(200).send({ ok: true })
      }

      if (payment.status !== 'PAID') {
        await paymentService.confirmPayment(payment.id)
        logger.info(`CryptoPay payment confirmed: ${payment.id}`)
      }

      return reply.status(200).send({ ok: true })
    } catch (err) {
      logger.error('CryptoPay webhook error:', err)
      return reply.status(200).send({ ok: true })
    }
  })
}
