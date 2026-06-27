export type TransactionType = 'trade' | 'deposit' | 'withdrawal' | 'expense'

export type PeriodFilter = 'daily' | 'weekly' | 'monthly' | 'all'

export type JournalEntry = {
  id: string
  date: string
  type: TransactionType
  note: string
  depositUSD: number
  depositIDR: number
  withdrawalUSD: number
  expenseUSD: number
  plUSD: number | null
  equityUSD: number
  bankUSD: number
}

export type RateState = {
  value: number
  updatedAt: string | null
  source: 'realtime' | 'cached' | 'fallback'
}
