import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db'

export async function buhUtmPublicRoutes(app: FastifyInstance) {

  // ─────────────────────────────────────────────────────────
  //  UTM REDIRECT
  // ─────────────────────────────────────────────────────────
  app.get('/go/:code', async (req, reply) => {
    const { code } = req.params as { code: string }

    const campaign = await prisma.buhAdCampaign.findUnique({
      where: { utmCode: code },
    })

    if (!campaign) return reply.redirect('/')

    await prisma.buhUtmClick.create({
      data: {
        utmCode:   code,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
        referer:   req.headers.referer ?? null,
      },
    })

    return reply.redirect(campaign.targetUrl ?? '/')
  })

  // ─────────────────────────────────────────────────────────
  //  RECEIVE UTM LEAD
  // ─────────────────────────────────────────────────────────
  app.post('/api/utm/lead', async (req) => {
    const body = z.object({
      utmCode:      z.string(),
      customerId:   z.string().optional(),
      customerName: z.string().optional(),
      username:     z.string().optional(),
      extraData:    z.any().optional(),
    }).parse(req.body)

    // Check for duplicate
    if (body.customerId) {
      const existing = await prisma.buhUtmLead.findFirst({
        where: {
          utmCode:    body.utmCode,
          customerId: body.customerId,
        },
      })

      if (existing) {
        return { ok: true, status: 'duplicate' }
      }
    }

    await prisma.buhUtmLead.create({
      data: {
        utmCode:      body.utmCode,
        customerId:   body.customerId ?? null,
        customerName: body.customerName ?? null,
        username:     body.username ?? null,
        extraData:    body.extraData ?? null,
      },
    })

    return { ok: true, status: 'created' }
  })
}
