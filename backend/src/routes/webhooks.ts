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

        // Roll back subscription days and reset currentPlan (full refund only)
        try {
          const { handleSubscriptionRefund } = await import('../services/payment')
          await handleSubscriptionRefund(payment.id, isFullRefund)
        } catch (err: any) {
          logger.error(`Refund rollback failed for ${payment.id}: ${err?.message}`)
        }

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

  // ── Platega.io webhook ─────────────────────────────────────
  // X-Secret static header auth. Body: { id, amount, currency, status, paymentMethod, payload }.
  // Since the secret is shared, we also re-fetch transaction status before confirming.
  app.post('/platega', async (req, reply) => {
    try {
      const headerSecret = req.headers['x-secret'] as string | undefined
      const ok = await paymentService.platega.verifyWebhookSecret(headerSecret)
      if (!ok) {
        logger.warn('Platega webhook: invalid X-Secret header')
        return reply.status(401).send({ error: 'Invalid secret' })
      }

      const body = req.body as any
      const txId   = body.id
      const status = body.status
      const orderId = body.payload

      if (!txId || !orderId) {
        logger.warn('Platega webhook: missing id or payload')
        return reply.status(200).send({ ok: true })
      }

      // Re-verify via API call — X-Secret is shared and could leak
      const verified = await paymentService.platega.getTransaction(txId).catch(() => null)
      if (!verified) {
        logger.warn(`Platega webhook: transaction ${txId} not found in API`)
        return reply.status(200).send({ ok: true })
      }

      const payment = await prisma.payment.findFirst({
        where: {
          OR: [{ id: orderId }, { providerOrderId: txId }],
          provider: 'PLATEGA',
        },
      })
      if (!payment) {
        logger.warn(`Platega webhook: payment not found orderId=${orderId}`)
        return reply.status(200).send({ ok: true })
      }

      if (verified.status === 'CONFIRMED' && payment.status !== 'PAID') {
        // Verify amount matches what we created
        if (Number(verified.paymentDetails?.amount) !== Number(payment.amount)) {
          logger.error(`Platega amount mismatch: api=${verified.paymentDetails?.amount} db=${payment.amount}`)
          return reply.status(200).send({ ok: true })
        }
        await paymentService.confirmPayment(payment.id)
        logger.info(`Platega payment confirmed: ${payment.id}`)
      } else if (verified.status === 'CANCELED' || verified.status === 'CHARGEBACKED') {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'FAILED' },
        })
        logger.info(`Platega payment ${verified.status.toLowerCase()}: ${payment.id}`)
      }

      return reply.status(200).send({ ok: true })
    } catch (err) {
      logger.error('Platega webhook error:', err)
      return reply.status(200).send({ ok: true })
    }
  })
}
