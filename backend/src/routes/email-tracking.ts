import type { FastifyInstance } from 'fastify'
import { prisma } from '../db'
import { logger } from '../utils/logger'

/**
 * Allow redirects ONLY to hostnames that are part of our own deployment
 * (config.appUrl + admin/api subdomains derived from it).
 *
 * Open-redirect on /click was used in audit to demonstrate phishing on
 * the trusted admin domain — we now whitelist the destination.
 */
function isAllowedRedirect(target: string): boolean {
  try {
    const u = new URL(target)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    const host = u.hostname.toLowerCase()
    const appUrl = process.env.APP_URL || ''
    let appHost = ''
    try { appHost = new URL(appUrl).hostname.toLowerCase() } catch {}
    if (!appHost) return false

    // Strip leading "lk." / "admin." / "api." to get root
    const root = appHost.replace(/^(lk|admin|api)\./, '')

    // Allow exact matches OR same root domain (lk., admin., api., subdomains)
    if (host === appHost || host === root) return true
    if (host.endsWith('.' + root)) return true
    return false
  } catch {
    return false
  }
}

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
    if (url && isAllowedRedirect(url)) {
      return reply.redirect(url, 302)
    }
    if (url) logger.warn(`/click rejected redirect to ${url}`)
    return reply.redirect('/', 302)
  })
}
