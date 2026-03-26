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

      // ЮKassa sends event type in top-level field
      if (body.event !== 'payment.succeeded') {
        return reply.status(200).send({ ok: true })
      }

      const yukassaPaymentId = body.object?.id
      const metadata = body.object?.metadata || {}
      const orderId  = metadata.orderId

      if (!orderId) {
        logger.warn('ЮKassa webhook: no orderId in metadata', body.object?.id)
        return reply.status(200).send({ ok: true })
      }

      // Find payment by our orderId or by yukassa payment id
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

      if (payment.status !== 'PAID') {
        await paymentService.confirmPayment(payment.id)
        logger.info(`ЮKassa payment confirmed: ${payment.id}`)
      }

      return reply.status(200).send({ ok: true })
    } catch (err) {
      logger.error('ЮKassa webhook error:', err)
      // Always return 200 to ЮKassa to prevent retries on our errors
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
