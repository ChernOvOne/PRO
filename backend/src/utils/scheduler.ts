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

  // Expiry notifications — DISABLED.
  // Superseded by funnel-engine triggers (expiring_7d/3d/1d) which fire via
  // auto-funnels cron every 15min. The legacy hardcoded notifier caused
  // duplicate/ungovernable messages. Managed via /admin/communications/funnel-builder instead.

  // Auto-funnels every 1 minute. State-check triggers (state_*) need this to be
  // responsive for short intervals (e.g. trigger=1 minute). Dedup via funnel_logs
  // ensures no spam — each user fires each scenario once.
  scheduler.register({
    name:     'auto-funnels',
    interval: 60_000,
    fn:       async () => {
      const { runCronFunnels } = await import('../services/funnel-engine')
      await runCronFunnels()
    },
  })

  // Pending funnel node steps every 30 seconds (delayed nodes, wait_event timeouts, repeats).
  // Combined with in-process setTimeout for delays <5min, this gives sub-minute precision.
  scheduler.register({
    name:     'funnel-pending-steps',
    interval: 30_000,
    fn:       async () => {
      const { processPendingNodeSteps } = await import('../services/funnel-engine')
      await processPendingNodeSteps()
    },
  })

  // Auto-renew (subscription + paid squads) every 15 minutes.
  // Also expires past-due addons after the renew attempt.
  scheduler.register({
    name:     'auto-renew',
    interval: 15 * 60_000,
    fn:       async () => {
      const { runAutoRenew, expireAddonsAfterRenew } = await import('../services/auto-renew')
      await runAutoRenew()
      await expireAddonsAfterRenew()
    },
  })

  scheduler.start()
}
