/**
 * HIDEYOU — In-process cron scheduler
 * Runs alongside the API server inside the backend container.
 * For production, prefer external cron (see Makefile setup-cron).
 */

import { logger } from '../utils/logger'
import { config } from '../config'

type CronJob = {
  name:     string
  interval: number   // ms
  fn:       () => Promise<void>
  lastRun?: Date
}

class Scheduler {
  private jobs:    CronJob[] = []
  private timers:  NodeJS.Timeout[] = []
  private running: boolean = false

  register(job: CronJob) {
    this.jobs.push(job)
  }

  start() {
    if (this.running) return
    this.running = true

    for (const job of this.jobs) {
      // Initial delay: stagger jobs by index * 30s to avoid startup spike
      const idx = this.jobs.indexOf(job)
      const timer = setTimeout(async () => {
        await this.runJob(job)
        // Then run on interval
        const intervalTimer = setInterval(() => this.runJob(job), job.interval)
        this.timers.push(intervalTimer)
      }, 30_000 * (idx + 1))

      this.timers.push(timer)
    }

    logger.info(`Scheduler started with ${this.jobs.length} jobs`)
  }

  stop() {
    this.timers.forEach(t => clearTimeout(t))
    this.timers  = []
    this.running = false
    logger.info('Scheduler stopped')
  }

  private async runJob(job: CronJob) {
    try {
      logger.info(`Running cron: ${job.name}`)
      await job.fn()
      job.lastRun = new Date()
    } catch (err) {
      logger.error(`Cron error (${job.name}):`, err)
    }
  }
}

export const scheduler = new Scheduler()

/**
 * Register all cron jobs.
 * Called from src/index.ts after server starts.
 */
export async function setupCronJobs() {
  if (!config.isProd) {
    logger.info('Cron jobs disabled in development mode')
    return
  }

  // Sync subscriptions every hour
  scheduler.register({
    name:     'sync-subscriptions',
    interval: 60 * 60_000,
    fn:       async () => {
      const { syncSubscriptions } = await import('../scripts/sync-subscriptions')
      await syncSubscriptions()
    },
  })

  // Expiry notifications daily at ~09:00
  scheduler.register({
    name:     'expiry-notifications',
    interval: 24 * 60 * 60_000,
    fn:       async () => {
      const { runExpiryNotifications } = await import('../scripts/notify-expiry')
      await runExpiryNotifications()
    },
  })

  scheduler.start()
}
