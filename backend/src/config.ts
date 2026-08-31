import dotenv from 'dotenv'
import { logger } from './logger.js'

dotenv.config()

export const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  },

  eos: {
    contract: process.env.EOS_CONTRACT || 'malinka.token',
    account: process.env.EOS_ACCOUNT || 'malinkatrees',
    hyperionApiUrl: process.env.HYPERION_API_URL || 'https://eos.hyperion.eosrio.io/v2'
  }
}

if (!config.supabase.url || !config.supabase.anonKey) {
  logger.warn('SUPABASE_URL or SUPABASE_ANON_KEY not set')
}

if (!config.supabase.serviceRoleKey) {
  logger.warn('SUPABASE_SERVICE_ROLE_KEY not set')
}
