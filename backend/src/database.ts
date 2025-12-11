import { createClient } from '@supabase/supabase-js'
import { config } from './config.js'
import { Decoration, DecorationType } from './types.js'

const supabase = createClient(config.supabase.url, config.supabase.anonKey)

export async function insertDecoration(decoration: Decoration): Promise<Decoration | null> {
  try {
    // Проверка на дубликат по tx_id
    const { data: existing } = await supabase
      .from('decorations')
      .select('id')
      .eq('tx_id', decoration.tx_id)
      .single()

    if (existing) {
      console.log(`⚠️  Transaction ${decoration.tx_id} already processed, skipping`)
      return null
    }

    // Принудительно сохраняем type в нижнем регистре
    const decorationToInsert = {
      ...decoration,
      type: decoration.type.toLowerCase()
    }

    const { data, error } = await supabase
      .from('decorations')
      .insert([decorationToInsert])
      .select()
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
      .select('*')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false })
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
      .order('created_at', { ascending: false })
      .limit(10000) // Получаем больше данных для агрегации

    if (error) {
      console.error('❌ [DB] Error fetching donors:', error)
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
    console.error('❌ [DB] Error calculating top donors:', error)
    return []
  }
}

export { supabase }


