import { createClient } from '@supabase/supabase-js'
import { config } from './config.js'
import { Decoration, DecorationType } from './types.js'

const supabase = createClient(config.supabase.url, config.supabase.anonKey)

export async function insertDecoration(decoration: Decoration, txId?: string): Promise<Decoration | null> {
  try {
    // Проверка на дубликат по tx_id (если передан)
    if (txId) {
      const { data: existing } = await supabase
        .from('decorations')
        .select('id')
        .eq('tx_id', txId)
        .single()

      if (existing) {
        console.log(`⚠️  Transaction ${txId.substring(0, 8)}... already processed, skipping`)
        return null
      }
    }

    // Принудительно сохраняем type в нижнем регистре
    const decorationToInsert: any = {
      ...decoration,
      type: decoration.type.toLowerCase()
    }
    
    // Добавляем tx_id только для дедупликации в БД, но не возвращаем его
    if (txId) {
      decorationToInsert.tx_id = txId
    }

    const { data, error } = await supabase
      .from('decorations')
      .insert([decorationToInsert])
      .select('type,from_account,username,text,amount')
      .single()

    if (error) {
      console.error('❌ Error inserting decoration:', error)
      return null
    }

    console.log(`✅ Decoration inserted: ${decoration.type} from ${decoration.from_account}`)
    return data
  } catch (error) {
    console.error('❌ Database error:', error)
    return null
  }
}

export async function getDecorations(limit: number = 1000): Promise<Decoration[]> {
  try {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    console.log(`📊 [DB] Fetching decorations (limit: ${limit}, since: ${thirtyDaysAgo.toISOString()})`)
    const { data, error } = await supabase
      .from('decorations')
      .select('type,from_account,username,text,amount')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('id', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('❌ [DB] Error fetching decorations:', error)
      return []
    }
    console.log(`✅ [DB] Fetched ${data?.length || 0} decorations`)
    return data || []
  } catch (error) {
    console.error('❌ Database error:', error)
    return []
  }
}

export async function broadcastDecoration(decoration: Decoration): Promise<void> {
  try {
    const channel = supabase.channel('decorations')
    const result = await channel.send({
      type: 'broadcast',
      event: 'new_decoration',
      payload: decoration
    })

    if (result !== 'ok') {
      console.error('❌ Error broadcasting decoration:', result)
    } else {
      console.log(`📡 Broadcasted decoration: ${decoration.type}`)
    }
  } catch (error) {
    console.error('❌ Broadcast error:', error)
  }
}

export async function getTopDonors(limit: number = 10): Promise<Array<{ from_account: string; total_amount: number; count: number }>> {
  try {
    console.log(`📊 [DB] Fetching top donors (limit: ${limit})...`)
    const { data, error } = await supabase
      .from('decorations')
      .select('from_account, amount')
      .order('id', { ascending: false })
      .limit(10000) // Получаем больше данных для агрегации

    if (error) {
      console.error('❌ [DB] Error fetching donors:', error)
      return []
    }
    
    console.log(`📊 [DB] Processing ${data?.length || 0} donation records...`)

    // Группируем по аккаунту и суммируем
    const donorsMap = new Map<string, { total: number; count: number }>()
    
    data?.forEach((item: any) => {
      // amount теперь число, не строка
      const amount = typeof item.amount === 'number' ? item.amount : parseFloat(item.amount || '0')
      
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
    console.error('❌ [DB] Error calculating top donors:', error)
    return []
  }
}

export async function getLastProcessedTxId(): Promise<string | null> {
  try {
    const { data } = await supabase.from('parser_state').select('last_tx_id').eq('id', 1).single()
    return data?.last_tx_id || null
  } catch (error) {
    console.error('❌ [DB] Error getting last processed tx_id:', error)
    return null
  }
}

export async function setLastProcessedTxId(txId: string): Promise<void> {
  try {
    await supabase.from('parser_state').upsert({ id: 1, last_tx_id: txId })
    console.log(`✅ [DB] Updated last processed tx_id: ${txId.substring(0, 8)}...`)
  } catch (error) {
    console.error('❌ [DB] Error setting last processed tx_id:', error)
  }
}

export { supabase }


