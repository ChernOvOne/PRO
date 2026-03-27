import type { FastifyInstance } from 'fastify'
import fastifyCookie    from '@fastify/cookie'
import fastifyJwt       from '@fastify/jwt'
import fastifyCors      from '@fastify/cors'
import fastifyRateLimit from '@fastify/rate-limit'
import fastifySwagger   from '@fastify/swagger'
import fastifySwaggerUi from '@fastify/swagger-ui'
import { securityPlugin } from './security'
import { config }         from '../config'

export async function registerPlugins(app: FastifyInstance) {
  // ── Security headers ─────────────────────────────────────
  await app.register(securityPlugin)

  // ── CORS ────────────────────────────────────────────────
  await app.register(fastifyCors, {
    origin: [
      config.appUrl,
      `https://${config.domain}`,
      `https://admin.${config.domain}`,
      `https://api.${config.domain}`,
      ...(config.isDev ? ['http://localhost:3000', 'http://localhost:4000'] : []),
    ],
    credentials: true,
  })

  // ── Cookie ──────────────────────────────────────────────
  await app.register(fastifyCookie, {
    secret: config.cookieSecret,
    hook:   'onRequest',
  })

  // ── JWT ─────────────────────────────────────────────────
  await app.register(fastifyJwt, {
    secret: config.jwtSecret,
    cookie: { cookieName: 'token', signed: false },
    sign:   { expiresIn: config.jwtExpires },
  })

  // Decorate authenticate hook
  app.decorate('authenticate', async function (req: any, reply: any) {
    try {
      await req.jwtVerify()
    } catch {
      reply.status(401).send({ error: 'Unauthorized' })
    }
  })

  // Decorate admin-only hook
  app.decorate('adminOnly', async function (req: any, reply: any) {
    try {
      await req.jwtVerify()
      if ((req.user as any).role !== 'ADMIN') {
        reply.status(403).send({ error: 'Forbidden' })
      }
    } catch {
      reply.status(401).send({ error: 'Unauthorized' })
    }
  })

  // ── Rate limiting ────────────────────────────────────────
  await app.register(fastifyRateLimit, {
    max:        100,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      error: 'Too many requests, please slow down.',
    }),
  })

  // ── Swagger (dev only) ───────────────────────────────────
  if (config.isDev) {
    await app.register(fastifySwagger, {
      openapi: {
        info:    { title: 'HIDEYOU API', version: '1.0.0' },
        servers: [{ url: 'http://localhost:4000' }],
      },
    })
    await app.register(fastifySwaggerUi, {
      routePrefix: '/docs',
    })
  }
}
