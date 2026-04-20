import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import crypto from 'node:crypto'
import { prisma } from '../db'

export async function adminWebhookKeyRoutes(app: FastifyInstance) {
  const admin = { preHandler: [app.adminOnly] }

  // ── GET /keys — list all API keys ──────────────────────────
  app.get('/keys', admin, async () => {
    return prisma.buhWebhookApiKey.findMany({
      orderBy: { createdAt: 'desc' },
    })
  })

  // ── POST /keys — create a new API key ──────────────────────
  app.post('/keys', admin, async (req) => {
    const body = z.object({ name: z.string().min(1) }).parse(req.body)
    const key = crypto.randomBytes(32).toString('hex')
    return prisma.buhWebhookApiKey.create({
      data: { name: body.name, key },
    })
  })

  // ── DELETE /keys/:id — soft-delete (deactivate) ────────────
  app.delete('/keys/:id', admin, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    return prisma.buhWebhookApiKey.update({
      where: { id },
      data: { isActive: false },
    })
  })

  // ── POST /keys/:id/activate — re-enable a deactivated key ──
  app.post('/keys/:id/activate', admin, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    return prisma.buhWebhookApiKey.update({
      where: { id },
      data: { isActive: true },
    })
  })

  // ── GET /payments — paginated webhook payment history ──────
  app.get('/payments', admin, async (req) => {
    const q = z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      apiKeyId: z.string().optional(),
    }).parse(req.query || {})

    const where: any = {}
    if (q.apiKeyId) where.apiKeyId = q.apiKeyId

    const [items, total] = await Promise.all([
      prisma.buhWebhookPayment.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        include: { apiKey: { select: { name: true } } },
      }),
      prisma.buhWebhookPayment.count({ where }),
    ])
    return { items, total, page: q.page, limit: q.limit }
  })

  // ── GET /payments/:id — single payment with raw_data ───────
  app.get('/payments/:id', admin, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    const row = await prisma.buhWebhookPayment.findUnique({
      where: { id },
      include: { apiKey: { select: { name: true } } },
    })
    if (!row) return reply.status(404).send({ error: 'Not found' })
    return row
  })

  // ── POST /test — admin sends a test webhook using real ingest
  // Body: { keyId } — we look up the real key value and build a sample payload
  app.post('/test', admin, async (req, reply) => {
    const body = z.object({ keyId: z.string() }).parse(req.body)
    const key = await prisma.buhWebhookApiKey.findUnique({ where: { id: body.keyId } })
    if (!key) return reply.status(404).send({ error: 'Key not found' })

    const testPayload = {
      external_id:    `test_${Date.now()}`,
      amount:         299,
      currency:       'RUB',
      customer_email: 'test@example.com',
      customer_name:  'Тестовый клиент',
      plan:           'Тестовый тариф',
      plan_tag:       'test',
      description:    'Тестовый webhook от админ-панели',
      source:         'admin_test',
    }

    try {
      // Resolve host dynamically from the admin request itself
      const proto = (req.headers['x-forwarded-proto'] as string) || 'https'
      const host  = (req.headers['x-forwarded-host'] as string) || req.headers.host
      const url   = `${proto}://${host}/api/webhooks/payment-ingest/`

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${key.key}`,
        },
        body: JSON.stringify(testPayload),
        signal: AbortSignal.timeout(10000),
      })
      const data = await res.json().catch(() => ({}))
      return { ok: res.ok, status: res.status, response: data, sentPayload: testPayload }
    } catch (e: any) {
      return reply.status(500).send({ ok: false, error: e.message })
    }
  })
}
