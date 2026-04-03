import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'

export async function buhWebhookPaymentRoutes(app: FastifyInstance) {
  // ── POST / — receive payment webhook (public, API-key auth) ─
  app.post('/', async (req, reply) => {
    const body = z
      .object({
        api_key:        z.string(),
        external_id:    z.string(),
        amount:         z.number(),
        currency:       z.string().default('RUB'),
        customer_email: z.string().optional(),
        customer_id:    z.string().optional(),
        customer_name:  z.string().optional(),
        plan:           z.string().optional(),
        plan_tag:       z.string().optional(),
        sub_start:      z.string().optional(),
        sub_end:        z.string().optional(),
        description:    z.string().optional(),
        source:         z.string().optional(),
        utm_code:       z.string().optional(),
        raw_data:       z.any().optional(),
      })
      .parse(req.body)

    // 1. Validate API key
    const apiKey = await prisma.buhWebhookApiKey.findFirst({
      where: { key: body.api_key, isActive: true },
    })

    if (!apiKey) {
      return reply.status(401).send({ error: 'Invalid API key' })
    }

    // 2. Check duplicate by externalId
    const existing = await prisma.buhWebhookPayment.findUnique({
      where: { externalId: body.external_id },
    })

    if (existing) {
      return { ok: true, status: 'duplicate', paymentId: existing.id }
    }

    // 3. Create BuhTransaction
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const description = body.plan || 'Оплата подписки'

    const transaction = await prisma.buhTransaction.create({
      data: {
        type:        'INCOME',
        amount:      body.amount,
        date:        today,
        description,
      },
    })

    // 4. Auto-categorize using BuhAutoTagRule
    const rules = await prisma.buhAutoTagRule.findMany()
    const lowerDesc = description.toLowerCase()

    for (const rule of rules) {
      if (lowerDesc.includes(rule.keyword.toLowerCase())) {
        await prisma.buhTransaction.update({
          where: { id: transaction.id },
          data:  { categoryId: rule.categoryId },
        })
        break
      }
    }

    // 5. Create BuhWebhookPayment
    const payment = await prisma.buhWebhookPayment.create({
      data: {
        externalId:    body.external_id,
        apiKeyId:      apiKey.id,
        amount:        body.amount,
        currency:      body.currency,
        customerEmail: body.customer_email,
        customerId:    body.customer_id,
        customerName:  body.customer_name,
        plan:          body.plan,
        planTag:       body.plan_tag,
        subStart:      body.sub_start ? new Date(body.sub_start) : undefined,
        subEnd:        body.sub_end   ? new Date(body.sub_end)   : undefined,
        description:   body.description,
        rawData:       body.raw_data,
        source:        body.source,
        utmCode:       body.utm_code,
        transactionId: transaction.id,
        date:          today,
      },
    })

    // 6. Update API key usage stats
    await prisma.buhWebhookApiKey.update({
      where: { id: apiKey.id },
      data: {
        lastUsed:     new Date(),
        requestCount: { increment: 1 },
      },
    })

    // 7. If customerId provided — update User
    let resolvedUser: { id: string } | null = null

    if (body.customer_id) {
      resolvedUser = await prisma.user.findUnique({
        where: { telegramId: body.customer_id },
        select: { id: true },
      })

      if (resolvedUser) {
        await prisma.user.update({
          where: { id: resolvedUser.id },
          data: {
            totalPaid:      { increment: body.amount },
            paymentsCount:  { increment: 1 },
            lastPaymentAt:  new Date(),
            currentPlan:    body.plan     ?? undefined,
            currentPlanTag: body.plan_tag ?? undefined,
          },
        })
      }
    }

    // 8. If utmCode provided — mark UTM lead as converted
    if (body.utm_code && resolvedUser) {
      await prisma.buhUtmLead.updateMany({
        where: {
          utmCode:    body.utm_code,
          customerId: resolvedUser.id,
        },
        data: { converted: true },
      })
    }

    return { ok: true, status: 'created', paymentId: payment.id, transactionId: transaction.id }
  })
}
