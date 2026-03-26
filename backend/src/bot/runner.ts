/**
 * HIDEYOU — Telegram Bot standalone runner
 * Run separately from the API server
 */

import { startBot } from './index'
import { logger }   from '../utils/logger'
import { config }   from '../config'

logger.info('Starting HIDEYOU Telegram Bot...')
logger.info(`Mode: ${config.nodeEnv}`)

startBot().catch(err => {
  logger.error('Bot crashed:', err)
  process.exit(1)
})
