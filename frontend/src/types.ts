export type DecorationType = 'light' | 'ball' | 'candle' | 'envelope' | 'gift' | 'star'

export interface Decoration {
  type: DecorationType
  from_account: string
  username?: string | null
  text?: string | null
  amount: number
  createdAt?: number  // timestamp в ms (для старых украшений будет undefined)
}

export interface TopDonor {
  from_account: string
  total_amount: number
  count: number
}

