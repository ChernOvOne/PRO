import Fastify from 'fastify'
import { registerPlugins } from './plugins'
import { registerRoutes }  from './routes'
import { setupCronJobs }   from './utils/scheduler'
import { logger }          from './utils/logger'
import { config }          from './config'

const app = Fastify({
  logger:       false,
  trustProxy:   true,
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
