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
  // Собираем все разрешённые домены из .env.
  // Используем отдельные ADMIN_DOMAIN и API_DOMAIN — они могут отличаться от DOMAIN.
  const corsOrigins: (string | RegExp)[] = [
    config.appUrl,
    `https://${config.domain}`,
  ]
  // Добавляем adminDomain и apiDomain если они заданы и отличаются от основного
  if (config.adminDomain) corsOrigins.push(`https://${config.adminDomain}`)
  if (config.apiDomain)   corsOrigins.push(`https://${config.apiDomain}`)
  // Add all subdomains for the root domain
  const rootDomain = config.domain?.split('.').slice(-2).join('.')
  if (rootDomain && rootDomain !== config.domain) {
    corsOrigins.push(new RegExp(`https://[\\w-]+\\.${rootDomain.replace('.', '\\.')}$`))
  }
  if (config.isDev) {
    corsOrigins.push('http://localhost:3000', 'http://localhost:4000')
  }

  await app.register(fastifyCors, {
    origin: corsOrigins,
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

  // ── Role-based access hooks (Buhgalteria merge) ─────────
  // requireRole(...roles) — generic role checker
  app.decorate('requireRole', function (...roles: string[]) {
    return async function (req: any, reply: any) {
      try {
        await req.jwtVerify()
        const userRole = (req.user as any).role
        if (!roles.includes(userRole)) {
          reply.status(403).send({ error: 'Forbidden' })
        }
      } catch {
        reply.status(401).send({ error: 'Unauthorized' })
      }
    }
  })

  // Shortcut: admin or editor
  app.decorate('requireEditor', async function (req: any, reply: any) {
    try {
      await req.jwtVerify()
      const role = (req.user as any).role
      if (role !== 'ADMIN' && role !== 'EDITOR') {
        reply.status(403).send({ error: 'Forbidden' })
      }
    } catch {
      reply.status(401).send({ error: 'Unauthorized' })
    }
  })

  // Shortcut: any staff role (not USER)
  app.decorate('requireStaff', async function (req: any, reply: any) {
    try {
      await req.jwtVerify()
      const role = (req.user as any).role
      if (role === 'USER') {
        reply.status(403).send({ error: 'Forbidden' })
      }
    } catch {
      reply.status(401).send({ error: 'Unauthorized' })
    }
  })

  // ── Rate limiting ────────────────────────────────────────
  // Key by userId when authenticated (cookie or Bearer), else by IP.
  // This prevents one authenticated user from draining the shared IP budget
  // when the app sits behind a reverse proxy (nginx).
  await app.register(fastifyRateLimit, {
    max:        300,
    timeWindow: '1 minute',
    keyGenerator: (req: any) => {
      try {
        const token = (req.headers.authorization as string | undefined)?.replace(/^Bearer /, '')
          || req.cookies?.token
        if (token) {
          const decoded = app.jwt.decode(token) as { sub?: string } | null
          if (decoded?.sub) return `user:${decoded.sub}`
        }
      } catch { /* fall through */ }
      return `ip:${req.ip}`
    },
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
