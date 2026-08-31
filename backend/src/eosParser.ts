import axios from 'axios'
import { config } from './config.js'
import { EOSTransfer, Decoration, DecorationType } from './types.js'
import { insertDecoration, initTxCache, checkExistingTxIds } from './database.js'
import { logger } from './logger.js'

// ВРЕМЕННЫЙ ФЛАГ ДЛЯ ПОЛНОГО РЕПРОЦЕССИНГА
// После одного успешного запуска поставь false и перезапусти бекенд
export const FORCE_REPROCESS_ALL = false

let isPolling = false

// Поддерживаемые контракты для переводов MALINKA
const SUPPORTED_CONTRACTS = ['malinka.token', 'swap.pcash']

async function fetchTransfers(limit: number = 100): Promise<EOSTransfer[]> {
  try {
    const response = await axios.get(`${config.eos.hyperionApiUrl}/history/get_actions`, {
      params: {
        account: config.eos.account,
        act_name: 'transfer',
        limit: limit * 2,
        skip: 0,
        sort: 'desc'
      },
      timeout: 15000
    })

    const transfers: EOSTransfer[] = []
    const seenTxIds = new Set<string>()

    if (response.data?.actions) {
      for (const action of response.data.actions) {
        if (action.act?.name === 'transfer' && action.act?.data) {
          const data = action.act.data
          const contract = action.act?.account

          if (data.to === config.eos.account &&
              contract && SUPPORTED_CONTRACTS.includes(contract)) {

              const txId = action.trx_id || action.action_trace?.trx_id || ''

              if (txId && seenTxIds.has(txId)) {
                continue
              }
              seenTxIds.add(txId)

              const quantity = data.quantity || '0.0000 MLNK'

              transfers.push({
                from: data.from || contract || '',
                to: data.to,
                quantity: quantity,
                memo: data.memo || '',
                trx_id: txId,
                block_time: action['@timestamp'] || action.block_time || new Date().toISOString()
              })
          }
        }
      }
    }

    transfers.sort((a, b) => new Date(b.block_time).getTime() - new Date(a.block_time).getTime())
    return transfers
  } catch (error: any) {
    logger.error('[EOS] Error fetching transfers:', error.message)
    if (error.response) {
      logger.error('[EOS] Response status:', error.response.status)
    }
    return []
  }
}

function parseTransfer(transfer: EOSTransfer): { type: DecorationType | null; count?: number; username?: string; text?: string; imageUrl?: string } {
  const amountMatch = transfer.quantity.match(/^(\d+\.?\d*)\s*(?:MLNK|MLNKA)?/i)
  if (!amountMatch) {
    return { type: null }
  }

  const amount = parseFloat(amountMatch[1])
  const memo = transfer.memo?.trim() || ''
  const memoLower = memo.toLowerCase()

  if (memoLower === 'звезда' || memoLower === 'star') {
    return {
      type: 'star',
      username: transfer.from
    }
  }

  if (amount === 10) {
    return {
      type: 'ball',
      username: transfer.from
    }
  }

  if (amount === 100) {
    return {
      type: 'candle',
      text: memo ? memo.substring(0, 200) : undefined
    }
  }

  if (amount === 1000) {
    if (memo) {
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
    return { type: 'gift', imageUrl: memo || undefined }
  }

  const lightCount = Math.floor(amount)
  if (lightCount > 0) {
    return {
      type: 'light',
      count: lightCount
    }
  }

  return { type: null }
}

async function processTransfer(transfer: EOSTransfer): Promise<boolean> {
  if (transfer.from === 'cryptozhenek' || transfer.from === 'bot1pr.pcash') {
    return false
  }

  const parsed = parseTransfer(transfer)
  if (!parsed.type) {
    return false
  }

  if (parsed.type === 'star') {
    const amount = parseFloat(transfer.quantity.split(' ')[0])
    const decoration: Decoration = {
      type: 'star',
      from_account: transfer.from,
      username: parsed.username || transfer.from || undefined,
      text: undefined,
      amount: amount.toFixed(6),
      tx_id: transfer.trx_id
    }

    const inserted = await insertDecoration(decoration, FORCE_REPROCESS_ALL)
    if (inserted) {
      logger.info(`[EOS] New star from ${transfer.from}, tx ${transfer.trx_id.substring(0, 8)}`)
      return true
    }
    return false
  }

  const count = parsed.type === 'light' ? (parsed.count || 1) : 1
  const amount = parseFloat(transfer.quantity.split(' ')[0])
  let insertedAny = false

  for (let i = 0; i < count; i++) {
    const decoration: Decoration = {
      type: parsed.type.toLowerCase() as DecorationType,
      from_account: transfer.from,
      username: parsed.username || undefined,
      text: parsed.type === 'candle' ? (parsed.text || undefined) : undefined,
      amount: amount.toFixed(6),
      tx_id: transfer.trx_id
    }

    const inserted = await insertDecoration(decoration, FORCE_REPROCESS_ALL)
    if (inserted) {
      insertedAny = true
    }
  }

  if (insertedAny) {
    logger.info(`[EOS] New ${parsed.type} from ${transfer.from}, tx ${transfer.trx_id.substring(0, 8)}`)
  }

  return insertedAny
}

export async function startParser(): Promise<void> {
  if (isPolling) {
    logger.warn('[EOS] Parser already running')
    return
  }

  isPolling = true
  logger.info(`[EOS] Parser started (account: ${config.eos.account}, poll: 10s)`)
  await initTxCache()
  await pollTransactions()

  setInterval(async () => {
    await pollTransactions()
  }, 10000)
}

async function pollTransactions(): Promise<void> {
  try {
    const transfers = await fetchTransfers(100)
    if (transfers.length === 0) {
      return
    }

    let existingTxIds: Set<string>

    if (FORCE_REPROCESS_ALL) {
      logger.warn('[EOS] FORCE_REPROCESS_ALL enabled — deduplication disabled')
      existingTxIds = new Set<string>()
    } else {
      const txIds = transfers.map(t => t.trx_id)
      existingTxIds = await checkExistingTxIds(txIds)
    }

    const newTransfers = transfers.filter(t => !existingTxIds.has(t.trx_id))
    if (newTransfers.length === 0 && !FORCE_REPROCESS_ALL) {
      return
    }

    let processed = 0
    for (const transfer of newTransfers.reverse()) {
      const inserted = await processTransfer(transfer)
      if (inserted) processed++
    }

    if (processed > 0) {
      logger.info(`[EOS] Applied ${processed} new transfer(s)`)
    }
  } catch (error: any) {
    logger.error('[EOS] pollTransactions error:', error.message)
  }
}

export async function getLatestTransfers(count: number = 10): Promise<EOSTransfer[]> {
  return await fetchTransfers(count)
}
