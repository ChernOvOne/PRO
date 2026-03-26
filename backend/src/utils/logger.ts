import { config } from '../config'

type Level = 'debug' | 'info' | 'warn' | 'error'

const LEVELS: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 }

const currentLevel: number = LEVELS[(config.logLevel as Level) ?? 'info'] ?? 1

const colors: Record<Level, string> = {
  debug: '\x1b[36m', // cyan
  info:  '\x1b[32m', // green
  warn:  '\x1b[33m', // yellow
  error: '\x1b[31m', // red
}
const RESET = '\x1b[0m'

function log(level: Level, message: string, meta?: unknown) {
  if (LEVELS[level] < currentLevel) return
  const ts  = new Date().toISOString()
  const col = colors[level]
  const out = meta
    ? `${col}[${level.toUpperCase()}]${RESET} ${ts} ${message} ${JSON.stringify(meta)}`
    : `${col}[${level.toUpperCase()}]${RESET} ${ts} ${message}`
  level === 'error' ? console.error(out) : console.log(out)
}

export const logger = {
  debug: (msg: string, meta?: unknown) => log('debug', msg, meta),
  info:  (msg: string, meta?: unknown) => log('info',  msg, meta),
  warn:  (msg: string, meta?: unknown) => log('warn',  msg, meta),
  error: (msg: string, meta?: unknown) => log('error', msg, meta),
}
