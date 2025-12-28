import { createClient, SupabaseClient } from '@supabase/supabase-js'

let supabase: SupabaseClient | null = null
let configPromise: Promise<{ supabaseUrl: string, supabaseAnonKey: string }> | null = null

async function fetchConfig() {
  if (configPromise) return configPromise

  configPromise = fetch('/api/config')
    .then(res => res.json())
    .catch(error => {
      console.error('❌ [Supabase Client] Error fetching config:', error)
      return { supabaseUrl: '', supabaseAnonKey: '' }
    })
  return configPromise
}

export async function getSupabaseClient(): Promise<SupabaseClient | null> {
  if (supabase) return supabase

  const config = await fetchConfig()
  if (config.supabaseUrl && config.supabaseAnonKey) {
    supabase = createClient(config.supabaseUrl, config.supabaseAnonKey)
    return supabase
  }
  return null
}







