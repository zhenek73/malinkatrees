type LogLevel = 'error' | 'warn' | 'info' | 'debug'

const LEVEL_RANK: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
}

function resolveLogLevel(): LogLevel {
  const fromEnv = process.env.LOG_LEVEL?.toLowerCase()
  if (fromEnv && fromEnv in LEVEL_RANK) {
    return fromEnv as LogLevel
  }
  // В production по умолчанию только warn/error — без шума от polling
  return process.env.NODE_ENV === 'production' ? 'warn' : 'info'
}

const activeLevel = resolveLogLevel()

function shouldLog(level: LogLevel): boolean {
  return LEVEL_RANK[level] <= LEVEL_RANK[activeLevel]
}

export const logger = {
  error: (...args: unknown[]) => {
    if (shouldLog('error')) console.error(...args)
  },
  warn: (...args: unknown[]) => {
    if (shouldLog('warn')) console.warn(...args)
  },
  info: (...args: unknown[]) => {
    if (shouldLog('info')) console.log(...args)
  },
  debug: (...args: unknown[]) => {
    if (shouldLog('debug')) console.log(...args)
  },
}
