import { config } from './config.js'
import { startServer } from './server.js'
import { logger } from './logger.js'

if (!config.supabase.url || !config.supabase.anonKey) {
  logger.error('Supabase credentials not configured (SUPABASE_URL, SUPABASE_ANON_KEY)')
  process.exit(1)
}

if (!config.supabase.serviceRoleKey) {
  logger.warn('SUPABASE_SERVICE_ROLE_KEY not set — backend may fail with RLS')
}

startServer()
