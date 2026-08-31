import { createClient } from '@supabase/supabase-js'
import { config } from './config.js'
import { Decoration } from './types.js'
import { logger } from './logger.js'

const supabase = createClient(config.supabase.url, config.supabase.anonKey)

const supabaseAdmin = config.supabase.serviceRoleKey
  ? createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : (() => {
      logger.error('[DB] SUPABASE_SERVICE_ROLE_KEY not set — falling back to anon key')
      return supabase
    })()

const processedTxCache = new Set<string>()

export async function initTxCache(): Promise<void> {
  try {
    const { data, error } = await supabaseAdmin
      .from('decorations')
      .select('tx_id')
      .order('created_at', { ascending: false })
      .limit(1000)

    if (error) {
      logger.error('[DB] Error loading tx_ids:', JSON.stringify(error))
      return
    }

    if (data) {
      data.forEach(d => processedTxCache.add(d.tx_id))
      logger.info(`[DB] Tx cache loaded (${data.length} ids)`)
    }
  } catch (error) {
    logger.error('[DB] initTxCache error:', String(error))
  }
}

export async function insertDecoration(decoration: Decoration, skipDeduplication: boolean = false): Promise<Decoration | null> {
  try {
    if (!skipDeduplication) {
      if (processedTxCache.has(decoration.tx_id)) {
        return null
      }

      const { data: existing } = await supabaseAdmin
        .from('decorations')
        .select('id')
        .eq('tx_id', decoration.tx_id)
        .single()

      if (existing) {
        processedTxCache.add(decoration.tx_id)
        return null
      }
    }

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
      logger.error('[DB] Error inserting decoration:', JSON.stringify(error))
      return null
    }

    processedTxCache.add(decoration.tx_id)
    return data
  } catch (error) {
    logger.error('[DB] insertDecoration error:', String(error))
    return null
  }
}

export async function checkExistingTxIds(txIds: string[]): Promise<Set<string>> {
  try {
    if (txIds.length === 0) return new Set()

    const { data, error } = await supabaseAdmin
      .from('decorations')
      .select('tx_id')
      .in('tx_id', txIds)

    if (error) {
      logger.error('[DB] Error checking tx_ids:', JSON.stringify(error))
      return new Set()
    }

    const existingSet = new Set(data?.map(d => d.tx_id) || [])
    existingSet.forEach(txId => processedTxCache.add(txId))
    return existingSet
  } catch (error) {
    logger.error('[DB] checkExistingTxIds error:', String(error))
    return new Set()
  }
}

export async function getDecorations(limit: number = 1000): Promise<Decoration[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('decorations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      logger.error('[DB] Error fetching decorations:', JSON.stringify(error))
      return []
    }

    return data || []
  } catch (error) {
    logger.error('[DB] getDecorations error:', String(error))
    return []
  }
}

export async function getTopDonors(limit: number = 10): Promise<Array<{ from_account: string; total_amount: number; count: number }>> {
  try {
    const { data, error } = await supabaseAdmin
      .from('decorations')
      .select('from_account, amount')
      .order('created_at', { ascending: false })
      .limit(10000)

    if (error) {
      logger.error('[DB] Error fetching donors:', JSON.stringify(error))
      return []
    }

    const donorsMap = new Map<string, { total: number; count: number }>()

    data?.forEach((item: any) => {
      const amountStr = item.amount || '0'
      const amountMatch = amountStr.toString().match(/^(\d+\.?\d*)/)
      const amount = amountMatch ? parseFloat(amountMatch[1]) : 0

      const existing = donorsMap.get(item.from_account) || { total: 0, count: 0 }
      donorsMap.set(item.from_account, {
        total: existing.total + amount,
        count: existing.count + 1
      })
    })

    return Array.from(donorsMap.entries())
      .map(([from_account, { total, count }]) => ({
        from_account,
        total_amount: total,
        count
      }))
      .sort((a, b) => b.total_amount - a.total_amount)
      .slice(0, limit)
  } catch (error) {
    logger.error('[DB] getTopDonors error:', String(error))
    return []
  }
}

export async function getLastProcessedTxId(): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin.from('parser_state').select('last_tx_id').eq('id', 1).single()
    return data?.last_tx_id || null
  } catch (error) {
    logger.error('[DB] Error getting last processed tx_id:', String(error))
    return null
  }
}

export async function setLastProcessedTxId(txId: string): Promise<void> {
  try {
    await supabaseAdmin.from('parser_state').upsert({ id: 1, last_tx_id: txId })
  } catch (error) {
    logger.error('[DB] Error setting last processed tx_id:', String(error))
  }
}

export { supabaseAdmin }
