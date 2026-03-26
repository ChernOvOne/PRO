import type { FastifyInstance } from 'fastify'
import { config } from '../config'

/**
 * Security headers plugin — adds sensible HTTP security headers
 * without depending on @fastify/helmet
 */
export async function securityPlugin(app: FastifyInstance) {
  app.addHook('onSend', async (req, reply) => {
    // Prevent clickjacking
    reply.header('X-Frame-Options', 'SAMEORIGIN')

    // Prevent MIME sniffing
    reply.header('X-Content-Type-Options', 'nosniff')

    // XSS protection (legacy browsers)
    reply.header('X-XSS-Protection', '1; mode=block')

    // Referrer policy
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin')

    // Permissions policy — disable unused browser features
    reply.header(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=()',
    )

    // HSTS in production
    if (config.isProd) {
      reply.header(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload',
      )
    }

    // Remove server fingerprint
    reply.removeHeader('server')
    reply.removeHeader('x-powered-by')
  })
}
