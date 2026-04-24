import Fastify from 'fastify'
import { registerPlugins } from './plugins'
import { registerRoutes }  from './routes'
import { setupCronJobs }   from './utils/scheduler'
import { logger }          from './utils/logger'
import { config }          from './config'

const app = Fastify({
  logger:       false,
  // Trust ONE proxy hop (our nginx). With `trustProxy: true`, Fastify takes
  // the leftmost X-Forwarded-For value, which is attacker-controlled — they
  // can prepend any IP and nginx just appends real client. With hop=1,
  // Fastify counts back one entry from the right (nginx) → real client IP.
  trustProxy:   1,
  bodyLimit:    10 * 1024 * 1024, // 10 MB
})

async function bootstrap() {
  try {
    // Разрешаем POST-запросы с пустым телом и Content-Type: application/json.
    // Без этого Fastify возвращает 400 когда тело пустое но заголовок указан.
    app.addContentTypeParser(
      'application/json',
      { parseAs: 'string' },
      (req, body: string, done) => {
        if (!body || body.trim() === '') {
          done(null, {})
          return
        }
        try {
          done(null, JSON.parse(body))
        } catch (err: any) {
          err.statusCode = 400
          done(err, undefined)
        }
      },
    )

    await app.register(import('@fastify/multipart'), { limits: { fileSize: 5 * 1024 * 1024 } })
    await registerPlugins(app)
    await registerRoutes(app)
    await app.listen({ port: config.port, host: '0.0.0.0' })
    logger.info(`HIDEYOU API running on port ${config.port}`)
    logger.info(`Environment: ${config.nodeEnv}`)

    // Start background cron jobs (production only)
    await setupCronJobs()

    // Fresh-install bootstrap: pre-populate ready-to-use bot constructor blocks
    // and broadcast funnels so an admin isn't staring at an empty canvas on
    // first launch. Existing deployments are skipped (the seeder probes the DB
    // and bails if data is present).
    try {
      const { seedBotTemplates } = await import('./services/bot-templates-seed')
      await seedBotTemplates()
    } catch (e: any) {
      logger.warn(`[bot-templates-seed] failed: ${e.message}`)
    }

    // Idempotently seed the retention retargeting funnel (disabled by default)
    try {
      const { seedRetentionFunnel } = await import('./services/retention-funnel-seed')
      await seedRetentionFunnel()
    } catch (e: any) {
      logger.warn(`[retention-funnel-seed] failed: ${e.message}`)
    }
  } catch (err) {
    logger.error('Failed to start server:', err)
    process.exit(1)
  }
}

const shutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully...`)
  await app.close()
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))

bootstrap()
