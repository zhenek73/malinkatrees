import { Decoration, TopDonor } from './types'
import { createClient } from '@supabase/supabase-js'

// В режиме разработки используем прокси Vite, в продакшене - полный URL или относительный путь
const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? '/api' : '/api')

// Синхронное создание Supabase клиента через env-переменные Vite
// Это самый надёжный способ для Telegram Mini App (без fetch config.json)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let supabaseClient: any = null

export async function fetchDecorations(): Promise<Decoration[]> {
  try {
    console.log(`🔍 [API] Fetching decorations from ${API_URL}/decorations`)
    const response = await fetch(`${API_URL}/decorations`)
    
    if (!response.ok) {
      const text = await response.text()
      console.error(`❌ [API] Failed to fetch decorations: ${response.status} ${response.statusText}`, text.substring(0, 200))
      if (response.status === 404 || response.status === 0) {
        console.error('💡 [API] Hint: Make sure backend is running on http://localhost:3000')
      }
      return []
    }
    
    const contentType = response.headers.get('content-type')
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text()
      console.error(`❌ [API] Invalid content type: ${contentType}`, text.substring(0, 200))
      if (contentType?.includes('text/html')) {
        console.error('💡 [API] Hint: Backend might not be running. Start it with: cd backend && npm run dev')
      }
      return []
    }
    
    const data = await response.json()
    console.log(`✅ [API] Received ${data.data?.length || 0} decorations`)
    return data.success ? data.data : []
  } catch (error) {
    console.error('❌ [API] Error fetching decorations:', error)
    return []
  }
}

export async function fetchTopDonors(limit: number = 10): Promise<TopDonor[]> {
  try {
    console.log(`🔍 [API] Fetching top donors from ${API_URL}/donors?limit=${limit}`)
    const response = await fetch(`${API_URL}/donors?limit=${limit}`)
    
    if (!response.ok) {
      const text = await response.text()
      console.error(`❌ [API] Failed to fetch top donors: ${response.status} ${response.statusText}`, text.substring(0, 200))
      if (response.status === 404 || response.status === 0) {
        console.error('💡 [API] Hint: Make sure backend is running on http://localhost:3000')
      }
      return []
    }
    
    const contentType = response.headers.get('content-type')
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text()
      console.error(`❌ [API] Invalid content type: ${contentType}`, text.substring(0, 200))
      if (contentType?.includes('text/html')) {
        console.error('💡 [API] Hint: Backend might not be running. Start it with: cd backend && npm run dev')
      }
      return []
    }
    
    const data = await response.json()
    console.log(`✅ [API] Received ${data.data?.length || 0} top donors`)
    return data.success ? data.data : []
  } catch (error) {
    console.error('❌ [API] Error fetching top donors:', error)
    return []
  }
}

export async function getSupabaseClient() {
  if (!supabaseClient) {
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('⚠️ [Supabase] Missing env variables VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
      console.error('💡 [Supabase] Add them to frontend/.env and redeploy')
      return null
    }
    
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey)
    console.log('✅ [Supabase] Client initialized')
  }
  
  return supabaseClient
}