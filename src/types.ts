export type TransactionType = 'trade' | 'deposit' | 'withdrawal' | 'expense'

export type PeriodFilter = 'daily' | 'weekly' | 'monthly' | 'all'

export type Currency = 'USD' | 'IDR'

export type TradeDirection = 'buy' | 'sell'

export type JournalEntry = {
  id: string
  date: string
  type: TransactionType
  broker: string
  note: string
  depositAmount: number
  depositCurrency: Currency
  depositIDR: number
  withdrawalUSD: number
  withdrawalIDR: number
  expenseUSD: number
  plUSD: number | null
  equityUSD: number
  instrument: string
  direction: TradeDirection
  entryPrice: number
  exitPrice: number
  pips: number
  lot: number
}

export type RateState = {
  value: number
  updatedAt: string | null
  source: 'realtime' | 'cached' | 'fallback'
}
