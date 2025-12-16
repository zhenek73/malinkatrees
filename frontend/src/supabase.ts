import { createClient } from '@supabase/supabase-js'

// Получаем конфигурацию Supabase через API
let supabaseClient: ReturnType<typeof createClient> | null = null

export const getSupabaseClient = async () => {
  if (supabaseClient) return supabaseClient
  
  try {
    const response = await fetch('/api/config')
    if (!response.ok) {
      console.warn('⚠️ [Supabase] Failed to get config from API, Realtime disabled')
      return null
    }
    
    const data = await response.json()
    if (!data.supabaseUrl || !data.supabaseAnonKey) {
      console.warn('⚠️ [Supabase] No configuration in API response, Realtime disabled')
      return null
    }
    
    supabaseClient = createClient(data.supabaseUrl, data.supabaseAnonKey)
    return supabaseClient
  } catch (error) {
    console.error('❌ [Supabase] Error getting config:', error)
    return null
  }
}

