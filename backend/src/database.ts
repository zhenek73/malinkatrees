import { createClient } from '@supabase/supabase-js'
import { config } from './config.js'
import { Decoration, DecorationType } from './types.js'

// Клиент с anon key (для fallback, если service_role не задан)
const supabase = createClient(config.supabase.url, config.supabase.anonKey)

// Admin клиент с service_role key (обходит RLS)
// Используется для всех операций бэкенда
const supabaseAdmin = config.supabase.serviceRoleKey
  ? createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : (() => {
      console.error('❌ [DB] SUPABASE_SERVICE_ROLE_KEY not set! Falling back to anon key (may fail with RLS)')
      return supabase
    })()

// In-memory кеш обработанных tx_id для снижения Egress трафика
// При старте загружается последние 1000 tx_id из БД
const processedTxCache = new Set<string>()

/**
 * Инициализирует in-memory кеш tx_id при старте парсера.
 * Загружает последние 1000 обработанных tx_id из базы данных.
 * Это позволяет избежать повторных запросов к Supabase для проверки дубликатов.
 */
export async function initTxCache(): Promise<void> {
  try {
    console.log('🔄 [Cache] Loading recent tx_ids into memory...')
    const { data, error } = await supabaseAdmin
      .from('decorations')
      .select('tx_id')
      .order('created_at', { ascending: false })
      .limit(1000)

    if (error) {
      console.error('❌ [Cache] Error loading tx_ids: ' + JSON.stringify(error))
      return
    }

    if (data) {
      data.forEach(d => processedTxCache.add(d.tx_id))
      console.log(`✅ [Cache] Loaded ${data.length} tx_ids into cache`)
    }
  } catch (error) {
    console.error('❌ [Cache] Error: ' + String(error))
  }
}

export async function insertDecoration(decoration: Decoration, skipDeduplication: boolean = false): Promise<Decoration | null> {
  try {
    // ✅ ВРЕМЕННО: если skipDeduplication = true, пропускаем проверку дубликатов
    if (!skipDeduplication) {
      // ✅ Сначала проверяем in-memory кеш (мгновенно, без запроса к Supabase)
      if (processedTxCache.has(decoration.tx_id)) {
        console.log(`⚠️  [Cache] Transaction ${decoration.tx_id.substring(0, 8)}... already in cache, skipping`)
        return null
      }

      // ✅ Если нет в кеше, проверяем в базе данных (редкий случай)
      const { data: existing } = await supabaseAdmin
        .from('decorations')
        .select('id')
        .eq('tx_id', decoration.tx_id)
        .single()

      if (existing) {
        console.log(`⚠️  [DB] Transaction ${decoration.tx_id.substring(0, 8)}... found in DB, adding to cache`)
        processedTxCache.add(decoration.tx_id)
        return null
      }
    } else {
      console.log(`🔄 [DB] FORCE_REPROCESS: skipping deduplication for ${decoration.tx_id.substring(0, 8)}...`)
    }

    // Принудительно сохраняем type в нижнем регистре
    const decorationToInsert = {
      ...decoration,
      type: decoration.type.toLowerCase()
    }

    const { data, error } = await supabaseAdmin
      .from('decorations')
      .upsert(
        decorationToInsert,
        {
          onConflict: 'tx_id',
          ignoreDuplicates: true
        }
      )
      .select()
      .single()

    if (error) {
      console.error('❌ Error inserting decoration: ' + JSON.stringify(error))
      return null
    }

    console.log(`✅ Decoration inserted: ${decoration.type} from ${decoration.from_account}`)
    
    // ✅ Добавляем tx_id в кеш после успешной вставки
    processedTxCache.add(decoration.tx_id)
    
    return data
  } catch (error) {
    console.error('❌ Database error: ' + String(error))
    return null
  }
}

/**
 * Проверяет, какие из переданных tx_id уже существуют в базе данных.
 * Используется для batch-проверки вместо множественных одиночных запросов.
 * Найденные tx_id автоматически добавляются в in-memory кеш.
 * 
 * @param txIds - Массив tx_id для проверки
 * @returns Set с tx_id, которые уже есть в базе данных
 */
export async function checkExistingTxIds(txIds: string[]): Promise<Set<string>> {
  try {
    if (txIds.length === 0) return new Set()
    console.log(`🔍 [Batch] Checking ${txIds.length} tx_ids in database...`)
    
    const { data, error } = await supabaseAdmin
      .from('decorations')
      .select('tx_id')
      .in('tx_id', txIds)

    if (error) {
      console.error('❌ [Batch] Error checking tx_ids: ' + JSON.stringify(error))
      return new Set()
    }

    const existingSet = new Set(data?.map(d => d.tx_id) || [])
    console.log(`✅ [Batch] Found ${existingSet.size} existing tx_ids`)
    
    // ✅ Добавляем все найденные tx_id в кеш
    existingSet.forEach(txId => processedTxCache.add(txId))
    
    return existingSet
  } catch (error) {
    console.error('❌ [Batch] Error: ' + String(error))
    return new Set()
  }
}

export async function getDecorations(limit: number = 1000): Promise<Decoration[]> {
  try {
    // Проверка, какой клиент используется
    console.log('[DB] Using client:', supabaseAdmin === supabase ? 'anon key' : 'service_role key')
    
    //const thirtyDaysAgo = new Date()
    //thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    console.log('[DB] getDecorations called with limit:', limit)
    //console.log(`📊 [DB] Fetching decorations (limit: ${limit}, since: ${thirtyDaysAgo.toISOString()})`)
    const { data, error } = await supabaseAdmin
      .from('decorations')
      .select('*')
      //.gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('❌ [DB] Error fetching decorations: ' + JSON.stringify(error))
      return []
    }
    
    // Подробное логирование результата
    console.log('[DB] Supabase returned rows:', data?.length || 0)
    if (data && data.length > 0) {
      console.log('[DB] First row date:', data[0].created_at)
      console.log('[DB] Last row date:', data[data.length - 1].created_at)
    } else {
      console.log('[DB] No data returned from Supabase')
    }
    
    console.log(`✅ [DB] Fetched ${data?.length || 0} decorations`)
    return data || []
  } catch (error) {
    console.error('❌ Database error: ' + String(error))
    return []
  }
}

export async function getTopDonors(limit: number = 10): Promise<Array<{ from_account: string; total_amount: number; count: number }>> {
  try {
    console.log(`📊 [DB] Fetching top donors (limit: ${limit})...`)
    const { data, error } = await supabaseAdmin
      .from('decorations')
      .select('from_account, amount')
      .order('created_at', { ascending: false })
      .limit(10000) // Получаем больше данных для агрегации

    if (error) {
      console.error('❌ [DB] Error fetching donors: ' + JSON.stringify(error))
      return []
    }
    
    console.log(`📊 [DB] Processing ${data?.length || 0} donation records...`)

    // Группируем по аккаунту и суммируем
    const donorsMap = new Map<string, { total: number; count: number }>()
    
    data?.forEach((item: any) => {
      // Парсим amount из формата "1.0000 MALINKA" или "1.0000"
      const amountStr = item.amount || '0'
      const amountMatch = amountStr.toString().match(/^(\d+\.?\d*)/)
      const amount = amountMatch ? parseFloat(amountMatch[1]) : 0
      
      const existing = donorsMap.get(item.from_account) || { total: 0, count: 0 }
      donorsMap.set(item.from_account, {
        total: existing.total + amount,
        count: existing.count + 1
      })
    })

    const result = Array.from(donorsMap.entries())
      .map(([from_account, { total, count }]) => ({
        from_account,
        total_amount: total,
        count
      }))
      .sort((a, b) => b.total_amount - a.total_amount)
      .slice(0, limit)
    
    console.log(`✅ [DB] Calculated ${result.length} top donors`)
    return result
  } catch (error) {
    console.error('❌ [DB] Error calculating top donors: ' + String(error))
    return []
  }
}

export async function getLastProcessedTxId(): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin.from('parser_state').select('last_tx_id').eq('id', 1).single()
    return data?.last_tx_id || null
  } catch (error) {
    console.error('❌ [DB] Error getting last processed tx_id: ' + String(error))
    return null
  }
}

export async function setLastProcessedTxId(txId: string): Promise<void> {
  try {
    await supabaseAdmin.from('parser_state').upsert({ id: 1, last_tx_id: txId })
    console.log(`✅ [DB] Updated last processed tx_id: ${txId.substring(0, 8)}...`)
  } catch (error) {
    console.error('❌ [DB] Error setting last processed tx_id: ' + String(error))
  }
}

// Экспортируем admin клиент для использования в других модулях (если нужно)
export { supabaseAdmin }


