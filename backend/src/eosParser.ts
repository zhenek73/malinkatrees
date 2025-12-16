import axios from 'axios'
import { config } from './config.js'
import { EOSTransfer, Decoration, DecorationType } from './types.js'
import { insertDecoration, broadcastDecoration } from './database.js'

let lastProcessedBlock = 0
let isPolling = false

// Поддерживаемые контракты для переводов MALINKA
const SUPPORTED_CONTRACTS = ['malinka.token', 'swap.pcash']

async function fetchTransfers(limit: number = 100): Promise<EOSTransfer[]> {
  try {
    console.log(`🔍 [EOS] Fetching transfers from ${config.eos.hyperionApiUrl}...`)
    console.log(`   Supported contracts: ${SUPPORTED_CONTRACTS.join(', ')}`)
    
    // Делаем один запрос для всех переводов, затем фильтруем по поддерживаемым контрактам
    // Это эквивалентно OR условию: action.contract IN ('malinka.token', 'swap.pcash')
    const response = await axios.get(`${config.eos.hyperionApiUrl}/history/get_actions`, {
      params: {
        account: config.eos.account,
        act_name: 'transfer',
        limit: limit * 2, // Берем больше, чтобы отфильтровать нужные контракты
        skip: 0,
        sort: 'desc'
      },
      timeout: 15000
    })

    const transfers: EOSTransfer[] = []
    const seenTxIds = new Set<string>() // Для дедупликации
    
    // Обрабатываем результаты и фильтруем по поддерживаемым контрактам
    if (response.data?.actions) {
      for (const action of response.data.actions) {
        if (action.act?.name === 'transfer' && action.act?.data) {
          const data = action.act.data
          const contract = action.act?.account
          
          // OR условие: проверяем, что контракт в списке поддерживаемых
          // action.contract IN ('malinka.token', 'swap.pcash')
          if (data.to === config.eos.account && 
              contract && SUPPORTED_CONTRACTS.includes(contract)) {
              
              const txId = action.trx_id || action.action_trace?.trx_id || ''
              
              // Пропускаем дубликаты
              if (txId && seenTxIds.has(txId)) {
                continue
              }
              seenTxIds.add(txId)
              
              // Парсим amount из data.quantity (работает для обоих контрактов: malinka.token и swap.pcash)
              const quantity = data.quantity || '0.0000 MLNK'
              
              transfers.push({
                from: data.from || contract || '',
                to: data.to,
                quantity: quantity,
                memo: data.memo || '',
                trx_id: txId,
                block_time: action['@timestamp'] || action.block_time || new Date().toISOString()
              })
              
              console.log(`📥 [EOS] Found transfer from ${contract}: ${quantity} from ${data.from}, memo: "${data.memo}"`)
          }
        }
      }
    }

    // Сортируем по времени (новые сначала)
    transfers.sort((a, b) => new Date(b.block_time).getTime() - new Date(a.block_time).getTime())

    console.log(`✅ [EOS] Found ${transfers.length} transfers from ${SUPPORTED_CONTRACTS.join(' and ')}`)
    return transfers
  } catch (error: any) {
    console.error('❌ [EOS] Error fetching EOS transfers:', error.message)
    if (error.response) {
      console.error('   Response status:', error.response.status)
      console.error('   Response data:', JSON.stringify(error.response.data).substring(0, 200))
    }
    return []
  }
}

// Новая логика: парсинг по сумме, а не по memo
function parseTransfer(transfer: EOSTransfer): { type: DecorationType | null; count?: number; username?: string; text?: string; imageUrl?: string } {
  // Парсим amount из формата "1.000000 MLNK" или "10.000000 MLNK"
  const amountMatch = transfer.quantity.match(/^(\d+\.?\d*)\s*(?:MLNK|MLNKA)?/i)
  if (!amountMatch) {
    return { type: null }
  }
  
  const amount = parseFloat(amountMatch[1])
  const memo = transfer.memo?.trim() || ''
  const memoLower = memo.toLowerCase()
  
  // Приоритет: если memo = "звезда" или "star" (case-insensitive) → создавать запись type 'star'
  if (memoLower === 'звезда' || memoLower === 'star') {
    return { 
      type: 'star',
      username: transfer.from
    }
  }
  
  // Ровно 10 MLNK → шарик с именем отправителя
  if (amount === 10) {
    return { 
      type: 'ball', 
      username: transfer.from 
    }
  }
  
  // Ровно 100 MLNK → открытка с текстом из memo
  if (amount === 100) {
    return { 
      type: 'candle', 
      text: memo ? memo.substring(0, 200) : undefined 
    }
  }
  
  // Ровно 1000 MLNK → кастомный подарок (гифка по ссылке из memo)
  if (amount === 1000) {
    if (memo) {
      // Проверяем, что это валидный URL
      const urlMatch = memo.match(/^(https?:\/\/.+)$/i)
      if (urlMatch) {
        const url = urlMatch[1].trim()
        const validExtensions = ['.gif', '.png', '.jpg', '.jpeg', '.webp']
        const hasValidExtension = validExtensions.some(ext => url.toLowerCase().includes(ext))
        
        if (hasValidExtension) {
          return { 
            type: 'gift', 
            imageUrl: url 
          }
        }
      }
    }
    // Если нет валидного URL, всё равно создаём подарок
    return { type: 'gift', imageUrl: memo || undefined }
  }
  
  // Любая другая сумма (не 10, не 100, не 1000) → количество огоньков = floor(amount)
  const lightCount = Math.floor(amount)
  if (lightCount > 0) {
    return { 
      type: 'light', 
      count: lightCount 
    }
  }
  
  return { type: null }
}

async function processTransfer(transfer: EOSTransfer): Promise<void> {
  console.log(`🔄 [EOS] Processing transfer: ${transfer.trx_id.substring(0, 8)}... from ${transfer.from}, amount: ${transfer.quantity}, memo: "${transfer.memo}"`)
  const parsed = parseTransfer(transfer)

  if (!parsed.type) {
    console.log(`⏭️  [EOS] Skipping transfer: amount ${transfer.quantity} doesn't match any decoration type`)
    return
  }
  
  console.log(`✅ [EOS] Parsed transfer as type: ${parsed.type} (amount: ${transfer.quantity})`)

  // Для звезды создаём одну запись с полной суммой
  if (parsed.type === 'star') {
    const amount = parseFloat(transfer.quantity.split(' ')[0])
    const decoration: Decoration = {
      type: 'star',
      from_account: transfer.from,
      username: parsed.username || transfer.from || null,
      text: null,
      amount: amount
    }

    const inserted = await insertDecoration(decoration, transfer.trx_id)
    
    if (inserted) {
      await broadcastDecoration(inserted)
      console.log(`⭐ [EOS] Created star decoration from transfer`)
    }
    return  // Завершаем функцию после создания звезды, чтобы не создавать лишние записи
  }

  // Для огоньков создаём несколько записей (по количеству)
  const count = parsed.type === 'light' ? (parsed.count || 1) : 1
  const amount = parseFloat(transfer.quantity.split(' ')[0])
  
  for (let i = 0; i < count; i++) {
    const decoration: Decoration = {
      type: parsed.type.toLowerCase() as DecorationType,
      from_account: transfer.from,
      username: parsed.username || null,
      text: parsed.type === 'candle' ? (parsed.text || null) : null,
      amount: amount
    }

    const inserted = await insertDecoration(decoration, transfer.trx_id)
    
    if (inserted) {
      await broadcastDecoration(inserted)
    }
  }
  
  if (count > 1) {
    console.log(`✨ [EOS] Created ${count} lights from single transfer`)
  }
}

export async function startParser(): Promise<void> {
  if (isPolling) {
    console.log('⚠️  Parser already running')
    return
  }

  isPolling = true
  console.log('🚀 Starting EOS transaction parser...')
  console.log(`   Supported contracts: ${SUPPORTED_CONTRACTS.join(', ')}`)
  console.log(`   Account: ${config.eos.account}`)
  console.log(`   API: ${config.eos.hyperionApiUrl}`)

  // Начальная загрузка последних транзакций
  await pollTransactions()

  // Опрос каждые 10 секунд
  setInterval(async () => {
    await pollTransactions()
  }, 10000)
}

async function pollTransactions(): Promise<void> {
  try {
    console.log(`🔄 [EOS] Polling for new transactions...`)
    const transfers = await fetchTransfers(100)
    
    if (transfers.length === 0) {
      console.log(`📭 [EOS] No new transfers found`)
      return
    }

    console.log(`📥 [EOS] Found ${transfers.length} transfer(s), processing...`)

    // Обрабатываем в обратном порядке (старые сначала)
    let processed = 0
    for (const transfer of transfers.reverse()) {
      await processTransfer(transfer)
      processed++
    }
    console.log(`✅ [EOS] Processed ${processed} transfers`)
  } catch (error: any) {
    console.error('❌ [EOS] Error in pollTransactions:', error.message)
  }
}

export async function getLatestTransfers(count: number = 10): Promise<EOSTransfer[]> {
  return await fetchTransfers(count)
}