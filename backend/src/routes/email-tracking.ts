import type { FastifyInstance } from 'fastify'
import { prisma } from '../db'

// Transparent 1x1 pixel (GIF)
const PIXEL = Buffer.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
  0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00,
  0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02,
  0x44, 0x01, 0x00, 0x3b,
])

export async function emailTrackingRoutes(app: FastifyInstance) {
  // Open tracking
  app.get('/open', async (req, reply) => {
    const { rid } = req.query as { rid?: string }
    if (rid) {
      prisma.broadcastRecipient.update({
        where: { id: rid },
        data: { emailOpenedAt: new Date(), emailStatus: 'opened' },
      }).catch(() => {})
    }
    reply.header('Content-Type', 'image/gif')
    reply.header('Cache-Control', 'no-cache, no-store, must-revalidate')
    return PIXEL
  })

  // Click tracking + redirect
  app.get('/click', async (req, reply) => {
    const { rid, url } = req.query as { rid?: string; url?: string }
    if (rid) {
      prisma.broadcastRecipient.update({
        where: { id: rid },
        data: { emailClickedAt: new Date(), emailStatus: 'clicked' },
      }).catch(() => {})
    }
    if (url && /^https?:\/\//.test(url)) {
      return reply.redirect(url, 302)
    }
    return reply.redirect('/', 302)
  })
}
