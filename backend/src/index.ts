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
