export type DecorationType = 'light' | 'ball' | 'candle' | 'gift' | 'star'

export interface Decoration {
  type: DecorationType
  from_account: string
  username?: string | null
  text?: string | null
  amount: number
}

export interface EOSTransfer {
  from: string
  to: string
  quantity: string
  memo: string
  trx_id: string
  block_time: string
}

