import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { EquityChart } from './Chart'
import type { JournalEntry, PeriodFilter, RateState, TradeDirection, TransactionType } from './types'
import './App.css'

const ENTRIES_KEY_V1 = 'trading-journal.entries.v1'
const ENTRIES_KEY_V2 = 'trading-journal.entries.v2'
const ENTRIES_KEY_V3 = 'trading-journal.entries.v3'
const ENTRIES_KEY_V4 = 'trading-journal.entries.v4'
const RATE_KEY = 'trading-journal.usd-idr-rate.v1'
const FALLBACK_RATE = 16400
const RATE_REFRESH_MS = 60_000

const TRANSACTION_LABELS: Record<TransactionType, string> = {
  trade: 'Trade',
  deposit: 'Deposit',
  withdrawal: 'Penarikan',
  expense: 'Pengeluaran',
}

const PERIOD_LABELS: Record<PeriodFilter, string> = {
  daily: 'Hari',
  weekly: 'Minggu',
  monthly: 'Bulan',
  all: 'Semua',
}

const DIRECTION_LABELS: Record<TradeDirection, string> = {
  buy: 'Buy',
  sell: 'Sell',
}

const SEED_ENTRIES: JournalEntry[] = []

type V1Entry = {
  id: string
  date: string
  note: string
  depositUSD: number
  depositIDR: number
  plUSD: number | null
  equityUSD: number
  bankUSD: number
}

type V2Entry = V1Entry & {
  type: TransactionType
  withdrawalUSD: number
  expenseUSD: number
}

type FormState = {
  date: string
  type: TransactionType
  note: string
  depositAmount: string
  depositIDR: string
  withdrawalUSD: string
  withdrawalIDR: string
  expenseUSD: string
  plUSD: string
  equityUSD: string
  instrument: string
  direction: TradeDirection
  entryPrice: string
  exitPrice: string
  pips: string
  lot: string
}

type Summary = {
  plUSD: number
  depositUSD: number
  depositIDR: number
  withdrawalUSD: number
  withdrawalIDR: number
  expenseUSD: number
  netCashflowUSD: number
  realizedIDR: number
}

type EntryGroup = {
  key: string
  label: string
  entries: JournalEntry[]
  summary: Summary
}

function getToday() {
  return new Date().toISOString().slice(0, 10)
}

function createEmptyForm(): FormState {
  return {
    date: getToday(),
    type: 'trade',
    note: '',
    depositAmount: '',
    depositIDR: '',
    withdrawalUSD: '',
    withdrawalIDR: '',
    expenseUSD: '',
    plUSD: '',
    equityUSD: '',
    instrument: '',
    direction: 'buy',
    entryPrice: '',
    exitPrice: '',
    pips: '',
    lot: '',
  }
}

function normalizeEntry(entry: Partial<JournalEntry> & Pick<JournalEntry, 'id' | 'date' | 'type' | 'note'>): JournalEntry {
  return {
    id: entry.id,
    date: entry.date,
    type: entry.type,
    note: entry.note,
    depositAmount: entry.depositAmount ?? 0,
    depositCurrency: 'USD',
    depositIDR: entry.depositIDR ?? 0,
    withdrawalUSD: entry.withdrawalUSD ?? 0,
    withdrawalIDR: entry.withdrawalIDR ?? 0,
    expenseUSD: entry.expenseUSD ?? 0,
    plUSD: entry.plUSD ?? null,
    equityUSD: entry.equityUSD ?? 0,
    instrument: entry.instrument ?? '',
    direction: entry.direction ?? 'buy',
    entryPrice: entry.entryPrice ?? 0,
    exitPrice: entry.exitPrice ?? 0,
    pips: entry.pips ?? 0,
    lot: entry.lot ?? 0,
  }
}

function appendLegacyBankNote(note: string, bankUSD: number) {
  if (bankUSD <= 0) return note
  const suffix = `Rekening lama: $${bankUSD}`
  return note ? `${note} · ${suffix}` : suffix
}

function migrateV1ToV2(v1Entries: V1Entry[]): V2Entry[] {
  return v1Entries.flatMap((entry) => {
    const nextEntries: V2Entry[] = []

    if (entry.depositUSD > 0 || entry.depositIDR > 0) {
      nextEntries.push({
        id: `${entry.id}-deposit`,
        date: entry.date,
        type: 'deposit',
        note: entry.note || 'Deposit dari data lama.',
        depositUSD: entry.depositUSD,
        depositIDR: entry.depositIDR,
        withdrawalUSD: 0,
        expenseUSD: 0,
        plUSD: null,
        equityUSD: entry.equityUSD,
        bankUSD: entry.bankUSD,
      })
    }

    if (entry.plUSD !== null) {
      nextEntries.push({
        id: `${entry.id}-trade`,
        date: entry.date,
        type: 'trade',
        note: entry.note || 'Trade dari data lama.',
        depositUSD: 0,
        depositIDR: 0,
        withdrawalUSD: 0,
        expenseUSD: 0,
        plUSD: entry.plUSD,
        equityUSD: entry.equityUSD,
        bankUSD: entry.bankUSD,
      })
    }

    if (nextEntries.length === 0) {
      nextEntries.push({
        id: `${entry.id}-note`,
        date: entry.date,
        type: 'trade',
        note: entry.note,
        depositUSD: 0,
        depositIDR: 0,
        withdrawalUSD: 0,
        expenseUSD: 0,
        plUSD: null,
        equityUSD: entry.equityUSD,
        bankUSD: entry.bankUSD,
      })
    }

    return nextEntries
  })
}

function migrateV2ToV3(v2Entries: V2Entry[]): JournalEntry[] {
  const migrated = v2Entries.flatMap((entry) => {
    const note = appendLegacyBankNote(entry.note, entry.bankUSD)
    const base = {
      date: entry.date,
      note,
      withdrawalUSD: entry.withdrawalUSD,
      expenseUSD: entry.expenseUSD,
      plUSD: entry.plUSD,
      equityUSD: entry.equityUSD,
    }

    if (entry.type === 'deposit' && entry.depositUSD > 0 && entry.depositIDR > 0) {
      return normalizeEntry({
        ...base,
        id: entry.id,
        type: 'deposit',
        depositAmount: entry.depositUSD,
        depositIDR: entry.depositIDR,
      })
    }

    return normalizeEntry({
      ...base,
      id: entry.id,
      type: entry.type,
      depositAmount: entry.type === 'deposit' ? entry.depositUSD || entry.depositIDR / FALLBACK_RATE : 0,
      depositIDR: entry.type === 'deposit' ? entry.depositIDR : 0,
    })
  })

  return sortEntries(migrated)
}

function migrateV3ToV4(v3Entries: JournalEntry[]): JournalEntry[] {
  return sortEntries(v3Entries.map((entry) => {
    const wasIDRDeposit = entry.depositCurrency === 'IDR'
    return normalizeEntry({
      ...entry,
      depositAmount: wasIDRDeposit ? entry.depositAmount / FALLBACK_RATE : entry.depositAmount,
      depositIDR: entry.depositIDR || (wasIDRDeposit ? entry.depositAmount : 0),
      withdrawalIDR: entry.withdrawalIDR ?? 0,
    })
  }))
}

function parseStoredEntries(): JournalEntry[] {
  const storedV4 = localStorage.getItem(ENTRIES_KEY_V4)
  if (storedV4) {
    try {
      const parsed = JSON.parse(storedV4) as JournalEntry[]
      return Array.isArray(parsed) ? sortEntries(parsed.map(normalizeEntry)) : SEED_ENTRIES
    } catch {
      return SEED_ENTRIES
    }
  }

  const storedV3 = localStorage.getItem(ENTRIES_KEY_V3)
  if (storedV3) {
    try {
      const parsed = JSON.parse(storedV3) as JournalEntry[]
      if (Array.isArray(parsed)) {
        const migrated = migrateV3ToV4(parsed)
        localStorage.setItem(ENTRIES_KEY_V4, JSON.stringify(migrated))
        return migrated
      }
    } catch {
      return SEED_ENTRIES
    }
  }

  const storedV2 = localStorage.getItem(ENTRIES_KEY_V2)
  if (storedV2) {
    try {
      const parsed = JSON.parse(storedV2) as V2Entry[]
      if (Array.isArray(parsed)) {
        const migrated = migrateV3ToV4(migrateV2ToV3(parsed))
        localStorage.setItem(ENTRIES_KEY_V4, JSON.stringify(migrated))
        return migrated
      }
    } catch {
      return SEED_ENTRIES
    }
  }

  const storedV1 = localStorage.getItem(ENTRIES_KEY_V1)
  if (storedV1) {
    try {
      const parsed = JSON.parse(storedV1) as V1Entry[]
      if (Array.isArray(parsed) && parsed.length > 0) {
        const migrated = migrateV3ToV4(migrateV2ToV3(migrateV1ToV2(parsed)))
        localStorage.setItem(ENTRIES_KEY_V4, JSON.stringify(migrated))
        return migrated
      }
    } catch {
      return SEED_ENTRIES
    }
  }

  return SEED_ENTRIES
}

function parseNumber(value: string) {
  const normalized = value.replace(',', '.').trim()
  if (!normalized) return 0
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseNullableNumber(value: string) {
  const normalized = value.replace(',', '.').trim()
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00`))
}

function formatMonth(date: string) {
  return new Intl.DateTimeFormat('id-ID', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${date}-01T00:00:00`))
}

function formatUSD(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}

function formatIDR(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDeposit(entry: JournalEntry) {
  return formatUSD(entry.depositAmount)
}

function sortEntries(entries: JournalEntry[]) {
  return [...entries].sort((a, b) => b.date.localeCompare(a.date))
}

function getWeekKey(date: string) {
  const current = new Date(`${date}T00:00:00`)
  const start = new Date(current.getFullYear(), 0, 1)
  const dayNumber = Math.floor((current.getTime() - start.getTime()) / 86400000) + 1
  const weekNumber = Math.ceil((dayNumber + start.getDay()) / 7)
  return `${current.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`
}

function getPeriodKey(date: string, period: PeriodFilter) {
  if (period === 'daily') return date
  if (period === 'weekly') return getWeekKey(date)
  if (period === 'monthly') return date.slice(0, 7)
  return 'all'
}

function getPeriodLabel(key: string, period: PeriodFilter, entries: JournalEntry[]) {
  if (period === 'daily') return formatDate(key)
  if (period === 'weekly') return `Minggu ${key.split('-W')[1]} · ${key.split('-W')[0]}`
  if (period === 'monthly') return formatMonth(key)
  return `${entries.length} semua catatan`
}

function summarizeEntries(entries: JournalEntry[]): Summary {
  const plUSD = entries.reduce((total, entry) => total + (entry.plUSD ?? 0), 0)
  const depositUSD = entries.reduce((total, entry) => total + (entry.type === 'deposit' ? entry.depositAmount : 0), 0)
  const depositIDR = entries.reduce((total, entry) => total + (entry.type === 'deposit' ? entry.depositIDR : 0), 0)
  const withdrawalUSD = entries.reduce((total, entry) => total + entry.withdrawalUSD, 0)
  const withdrawalIDR = entries.reduce((total, entry) => total + entry.withdrawalIDR, 0)
  const expenseUSD = entries.reduce((total, entry) => total + entry.expenseUSD, 0)

  return {
    plUSD,
    depositUSD,
    depositIDR,
    withdrawalUSD,
    withdrawalIDR,
    expenseUSD,
    netCashflowUSD: depositUSD - withdrawalUSD - expenseUSD,
    realizedIDR: withdrawalIDR - depositIDR,
  }
}

function filterEntriesByLatestPeriod(entries: JournalEntry[], period: PeriodFilter) {
  if (period === 'all' || entries.length === 0) return entries
  const latest = sortEntries(entries)[0]
  const latestKey = getPeriodKey(latest.date, period)
  return entries.filter((entry) => getPeriodKey(entry.date, period) === latestKey)
}

function groupEntries(entries: JournalEntry[], period: PeriodFilter): EntryGroup[] {
  const fallbackPeriod = period === 'all' ? 'monthly' : period
  const groupMap = new Map<string, JournalEntry[]>()

  sortEntries(entries).forEach((entry) => {
    const key = getPeriodKey(entry.date, fallbackPeriod)
    const group = groupMap.get(key) ?? []
    group.push(entry)
    groupMap.set(key, group)
  })

  return [...groupMap.entries()].map(([key, group]) => ({
    key,
    label: getPeriodLabel(key, fallbackPeriod, group),
    entries: sortEntries(group),
    summary: summarizeEntries(group),
  }))
}

function getSignedEntryAmount(entry: JournalEntry) {
  if (entry.type === 'trade') return entry.plUSD
  if (entry.type === 'deposit') return entry.depositAmount
  if (entry.type === 'withdrawal') return -entry.withdrawalUSD
  return -entry.expenseUSD
}

function formatEntryAmount(entry: JournalEntry) {
  if (entry.type === 'trade') return entry.plUSD === null ? '-' : formatUSD(entry.plUSD)
  if (entry.type === 'deposit') return formatDeposit(entry)
  if (entry.type === 'withdrawal') return `-${formatUSD(entry.withdrawalUSD)}`
  return `-${formatUSD(entry.expenseUSD)}`
}

function entryToForm(entry: JournalEntry): FormState {
  return {
    date: entry.date,
    type: entry.type,
    note: entry.note,
    depositAmount: entry.depositAmount ? String(entry.depositAmount) : '',
    depositIDR: entry.depositIDR ? String(entry.depositIDR) : '',
    withdrawalUSD: entry.withdrawalUSD ? String(entry.withdrawalUSD) : '',
    withdrawalIDR: entry.withdrawalIDR ? String(entry.withdrawalIDR) : '',
    expenseUSD: entry.expenseUSD ? String(entry.expenseUSD) : '',
    plUSD: entry.plUSD !== null ? String(entry.plUSD) : '',
    equityUSD: entry.equityUSD ? String(entry.equityUSD) : '',
    instrument: entry.instrument,
    direction: entry.direction,
    entryPrice: entry.entryPrice ? String(entry.entryPrice) : '',
    exitPrice: entry.exitPrice ? String(entry.exitPrice) : '',
    pips: entry.pips ? String(entry.pips) : '',
    lot: entry.lot ? String(entry.lot) : '',
  }
}

function validateForm(form: FormState) {
  if (!form.date) return 'Tanggal wajib diisi.'

  if (form.type === 'deposit') {
    if (parseNumber(form.depositAmount) <= 0) return 'Deposit USD wajib lebih dari 0.'
    if (parseNumber(form.depositIDR) <= 0) return 'Nilai rupiah saat deposit wajib diisi.'
  }

  if (form.type === 'withdrawal') {
    if (parseNumber(form.withdrawalUSD) <= 0) return 'Penarikan USD wajib lebih dari 0.'
    if (parseNumber(form.withdrawalIDR) <= 0) return 'Nilai rupiah saat penarikan wajib diisi.'
  }

  if (form.type === 'expense' && parseNumber(form.expenseUSD) <= 0) {
    return 'Pengeluaran USD wajib lebih dari 0.'
  }

  if (form.type === 'trade') {
    if (!form.instrument.trim()) return 'Instrumen trade wajib diisi.'
    if (parseNullableNumber(form.plUSD) === null) return 'Profit/Loss USD wajib diisi.'
    const hasTradeDetail = [form.entryPrice, form.exitPrice, form.pips, form.lot].some((value) => parseNumber(value) !== 0)
    if (!hasTradeDetail) return 'Isi minimal salah satu detail trade: entry, exit, pips, atau lot.'
  }

  return null
}

function App() {
  const [entries, setEntries] = useState<JournalEntry[]>(parseStoredEntries)
  const [period, setPeriod] = useState<PeriodFilter>('monthly')
  const [rate, setRate] = useState<RateState>(() => {
    const stored = localStorage.getItem(RATE_KEY)
    if (!stored) return { value: FALLBACK_RATE, updatedAt: null, source: 'fallback' }

    try {
      const parsed = JSON.parse(stored) as RateState
      return parsed.value ? { ...parsed, source: 'cached' } : { value: FALLBACK_RATE, updatedAt: null, source: 'fallback' }
    } catch {
      return { value: FALLBACK_RATE, updatedAt: null, source: 'fallback' }
    }
  })
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [form, setForm] = useState<FormState>(createEmptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)

  useEffect(() => {
    localStorage.setItem(ENTRIES_KEY_V4, JSON.stringify(entries))
  }, [entries])

  useEffect(() => {
    let ignore = false

    async function fetchRate() {
      try {
        const response = await fetch('https://open.er-api.com/v6/latest/USD')
        const data = await response.json() as { rates?: { IDR?: number } }
        const idrRate = data.rates?.IDR

        if (!ignore && idrRate) {
          const nextRate: RateState = {
            value: idrRate,
            updatedAt: new Date().toISOString(),
            source: 'realtime',
          }
          setRate(nextRate)
          localStorage.setItem(RATE_KEY, JSON.stringify(nextRate))
        }
      } catch {
        setRate((current) => current)
      }
    }

    void fetchRate()
    const refreshTimer = window.setInterval(() => {
      void fetchRate()
    }, RATE_REFRESH_MS)

    return () => {
      ignore = true
      window.clearInterval(refreshTimer)
    }
  }, [])

  const sortedEntries = useMemo(() => sortEntries(entries), [entries])
  const visibleEntries = useMemo(() => filterEntriesByLatestPeriod(entries, period), [entries, period])
  const entryGroups = useMemo(() => groupEntries(visibleEntries, period), [visibleEntries, period])
  const summary = useMemo(() => summarizeEntries(visibleEntries), [visibleEntries])
  const latestEntry = sortedEntries[0]
  const latestEquityUSD = latestEntry?.equityUSD ?? 0
  const activePeriodLabel = entryGroups[0]?.label ?? 'Belum ada data'

  function updateForm<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }))
    setFormError(null)
  }

  function handleTypeChange(type: TransactionType) {
    setForm((current) => ({ ...current, type }))
    setFormError(null)
  }

  function openAddForm() {
    setEditingEntryId(null)
    setForm(createEmptyForm())
    setFormError(null)
    setIsFormOpen(true)
  }

  function openEditForm(entry: JournalEntry) {
    setEditingEntryId(entry.id)
    setForm(entryToForm(entry))
    setFormError(null)
    setIsFormOpen(true)
  }

  function closeForm() {
    setIsFormOpen(false)
    setEditingEntryId(null)
    setForm(createEmptyForm())
    setFormError(null)
  }

  function handleDelete(entry: JournalEntry) {
    if (!window.confirm(`Hapus catatan ${TRANSACTION_LABELS[entry.type]} ini?`)) return
    setEntries((current) => current.filter((item) => item.id !== entry.id))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const validationError = validateForm(form)
    if (validationError) {
      setFormError(validationError)
      return
    }

    const nextEntry = normalizeEntry({
      id: editingEntryId ?? crypto.randomUUID(),
      date: form.date,
      type: form.type,
      note: form.note.trim(),
      depositAmount: form.type === 'deposit' ? parseNumber(form.depositAmount) : 0,
      depositCurrency: 'USD',
      depositIDR: form.type === 'deposit' ? parseNumber(form.depositIDR) : 0,
      withdrawalUSD: form.type === 'withdrawal' ? parseNumber(form.withdrawalUSD) : 0,
      withdrawalIDR: form.type === 'withdrawal' ? parseNumber(form.withdrawalIDR) : 0,
      expenseUSD: form.type === 'expense' ? parseNumber(form.expenseUSD) : 0,
      plUSD: form.type === 'trade' ? parseNullableNumber(form.plUSD) : null,
      equityUSD: parseNumber(form.equityUSD),
      instrument: form.type === 'trade' ? form.instrument.trim().toUpperCase() : '',
      direction: form.direction,
      entryPrice: form.type === 'trade' ? parseNumber(form.entryPrice) : 0,
      exitPrice: form.type === 'trade' ? parseNumber(form.exitPrice) : 0,
      pips: form.type === 'trade' ? parseNumber(form.pips) : 0,
      lot: form.type === 'trade' ? parseNumber(form.lot) : 0,
    })

    setEntries((current) => {
      if (editingEntryId) {
        return sortEntries(current.map((entry) => entry.id === editingEntryId ? nextEntry : entry))
      }
      return sortEntries([nextEntry, ...current])
    })
    closeForm()
  }

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div className="hero-main">
          <p className="eyebrow">Equity sekarang</p>
          <h1>{formatUSD(latestEquityUSD)}</h1>
          <p className="subtitle">{formatIDR(latestEquityUSD * rate.value)}</p>
          <div className="hero-metrics">
            <span>
              P/L periode
              <strong className={summary.plUSD >= 0 ? 'positive' : 'negative'}>{formatUSD(summary.plUSD)}</strong>
            </span>
            <span>
              Realisasi Rp
              <strong className={summary.realizedIDR >= 0 ? 'positive' : 'negative'}>{formatIDR(summary.realizedIDR)}</strong>
            </span>
          </div>
        </div>
        <div className="rate-pill">
          <span>USD/IDR</span>
          <strong>{formatIDR(rate.value)}</strong>
          <small>Auto 1 menit</small>
        </div>
      </section>

      <div className="period-tabs" aria-label="Filter periode">
        {(Object.keys(PERIOD_LABELS) as PeriodFilter[]).map((item) => (
          <button className={period === item ? 'active' : ''} type="button" key={item} onClick={() => setPeriod(item)}>
            {PERIOD_LABELS[item]}
          </button>
        ))}
      </div>

      <section className="period-card">
        <p className="eyebrow">Ringkasan aktif</p>
        <h2>{activePeriodLabel}</h2>
      </section>

      <section className="stats-grid" aria-label="Ringkasan dashboard">
        <article className="stat-card primary">
          <span>Equity sekarang</span>
          <strong>{formatUSD(latestEquityUSD)}</strong>
          <small>{formatIDR(latestEquityUSD * rate.value)}</small>
        </article>
        <article className="stat-card">
          <span>P/L periode</span>
          <strong className={summary.plUSD >= 0 ? 'positive' : 'negative'}>{formatUSD(summary.plUSD)}</strong>
          <small>{formatIDR(summary.plUSD * rate.value)}</small>
        </article>
        <article className="stat-card">
          <span>Deposit</span>
          <strong>{formatUSD(summary.depositUSD)}</strong>
          <small>{formatIDR(summary.depositIDR)} aktual</small>
        </article>
        <article className="stat-card">
          <span>Realisasi Rupiah</span>
          <strong className={summary.realizedIDR >= 0 ? 'positive' : 'negative'}>{formatIDR(summary.realizedIDR)}</strong>
          <small>WD IDR - Deposit IDR</small>
        </article>
        <article className="stat-card">
          <span>Penarikan</span>
          <strong className="negative">{formatUSD(summary.withdrawalUSD)}</strong>
          <small>{formatIDR(summary.withdrawalIDR)} aktual</small>
        </article>
        <article className="stat-card">
          <span>Pengeluaran</span>
          <strong className="negative">{formatUSD(summary.expenseUSD)}</strong>
          <small>Net cashflow {formatUSD(summary.netCashflowUSD)}</small>
        </article>
      </section>

      <EquityChart entries={visibleEntries} period={period} formatUSD={formatUSD} />

      <section className="journal-section">
        <div className="section-title">
          <div>
            <p className="eyebrow">History · {activePeriodLabel}</p>
            <h2>Catatan trading</h2>
          </div>
          <span>{visibleEntries.length} entry</span>
        </div>

        <div className="entry-list">
          {entryGroups.map((group) => (
            <section className="entry-group" key={group.key}>
              <div className="group-head">
                <div>
                  <h3>{group.label}</h3>
                  <p>{group.entries.length} catatan</p>
                </div>
                <strong className={group.summary.plUSD >= 0 ? 'positive' : 'negative'}>{formatUSD(group.summary.plUSD)}</strong>
              </div>

              {group.entries.map((entry) => {
                const amount = getSignedEntryAmount(entry)
                return (
                  <article className="entry-card" key={entry.id}>
                    <div className="entry-top">
                      <div>
                        <span className={`type-badge ${entry.type}`}>{TRANSACTION_LABELS[entry.type]}</span>
                        <h3>{entry.type === 'trade' && entry.instrument ? entry.instrument : formatDate(entry.date)}</h3>
                        <p>{entry.note || 'Tanpa catatan'}</p>
                      </div>
                      <strong className={amount === null || amount >= 0 ? 'positive' : 'negative'}>
                        {formatEntryAmount(entry)}
                      </strong>
                    </div>
                    <div className="entry-meta">
                      {entry.type === 'trade' && entry.instrument && <span>{DIRECTION_LABELS[entry.direction]} {entry.instrument}</span>}
                      {entry.type === 'trade' && entry.entryPrice > 0 && <span>Entry {entry.entryPrice}</span>}
                      {entry.type === 'trade' && entry.exitPrice > 0 && <span>Exit {entry.exitPrice}</span>}
                      {entry.type === 'trade' && entry.pips !== 0 && <span>{entry.pips} pips</span>}
                      {entry.type === 'trade' && entry.lot > 0 && <span>{entry.lot} lot</span>}
                      {entry.type === 'deposit' && entry.depositAmount > 0 && <span>Deposit {formatDeposit(entry)}</span>}
                      {entry.type === 'deposit' && entry.depositIDR > 0 && <span>Rupiah masuk {formatIDR(entry.depositIDR)}</span>}
                      {entry.withdrawalUSD > 0 && <span>Tarik {formatUSD(entry.withdrawalUSD)}</span>}
                      {entry.withdrawalIDR > 0 && <span>Rupiah cair {formatIDR(entry.withdrawalIDR)}</span>}
                      {entry.expenseUSD > 0 && <span>Expense {formatUSD(entry.expenseUSD)}</span>}
                      {entry.equityUSD > 0 && <span>Equity {formatUSD(entry.equityUSD)}</span>}
                    </div>
                    <div className="entry-actions">
                      <button type="button" onClick={() => openEditForm(entry)}>Edit</button>
                      <button className="danger" type="button" onClick={() => handleDelete(entry)}>Hapus</button>
                    </div>
                  </article>
                )
              })}
            </section>
          ))}
        </div>
      </section>

      <button className="fab" type="button" onClick={openAddForm} aria-label="Tambah catatan trading">
        +
      </button>

      {isFormOpen && (
        <div className="sheet-backdrop" role="presentation">
          <form className="entry-sheet" onSubmit={handleSubmit}>
            <div className="sheet-handle" />
            <div className="sheet-head">
              <div>
                <p className="eyebrow">{editingEntryId ? 'Edit data' : 'Input baru'}</p>
                <h2>{editingEntryId ? 'Edit catatan' : 'Tambah catatan'}</h2>
              </div>
              <button type="button" onClick={closeForm}>Tutup</button>
            </div>

            <div className="type-tabs" aria-label="Jenis transaksi">
              {(Object.keys(TRANSACTION_LABELS) as TransactionType[]).map((type) => (
                <button className={form.type === type ? 'active' : ''} type="button" key={type} onClick={() => handleTypeChange(type)}>
                  {TRANSACTION_LABELS[type]}
                </button>
              ))}
            </div>

            {formError && <div className="form-error">{formError}</div>}

            <label>
              Tanggal
              <input type="date" value={form.date} onChange={(event) => updateForm('date', event.target.value)} required />
            </label>
            <label>
              Catatan
              <textarea value={form.note} onChange={(event) => updateForm('note', event.target.value)} placeholder="Contoh: setup bagus, news, WD profit, bayar VPS" />
            </label>
            <div className="form-grid">
              {form.type === 'deposit' && (
                <>
                  <label>
                    Deposit USD
                    <input inputMode="decimal" value={form.depositAmount} onChange={(event) => updateForm('depositAmount', event.target.value)} placeholder="112" />
                  </label>
                  <label>
                    Rupiah saat deposit
                    <input inputMode="numeric" value={form.depositIDR} onChange={(event) => updateForm('depositIDR', event.target.value)} placeholder="1800000" />
                  </label>
                </>
              )}
              {form.type === 'trade' && (
                <>
                  <label>
                    Instrumen
                    <input value={form.instrument} onChange={(event) => updateForm('instrument', event.target.value)} placeholder="XAUUSD" />
                  </label>
                  <label>
                    Arah
                    <select value={form.direction} onChange={(event) => updateForm('direction', event.target.value as TradeDirection)}>
                      <option value="buy">Buy</option>
                      <option value="sell">Sell</option>
                    </select>
                  </label>
                  <label>
                    Entry price
                    <input inputMode="decimal" value={form.entryPrice} onChange={(event) => updateForm('entryPrice', event.target.value)} placeholder="2320" />
                  </label>
                  <label>
                    Exit price
                    <input inputMode="decimal" value={form.exitPrice} onChange={(event) => updateForm('exitPrice', event.target.value)} placeholder="2325" />
                  </label>
                  <label>
                    Pips
                    <input inputMode="decimal" value={form.pips} onChange={(event) => updateForm('pips', event.target.value)} placeholder="50" />
                  </label>
                  <label>
                    Lot
                    <input inputMode="decimal" value={form.lot} onChange={(event) => updateForm('lot', event.target.value)} placeholder="0.10" />
                  </label>
                  <label>
                    Profit/Loss USD
                    <input inputMode="decimal" value={form.plUSD} onChange={(event) => updateForm('plUSD', event.target.value)} placeholder="25" />
                  </label>
                </>
              )}
              {form.type === 'withdrawal' && (
                <>
                  <label>
                    Penarikan USD
                    <input inputMode="decimal" value={form.withdrawalUSD} onChange={(event) => updateForm('withdrawalUSD', event.target.value)} placeholder="50" />
                  </label>
                  <label>
                    Rupiah saat penarikan
                    <input inputMode="numeric" value={form.withdrawalIDR} onChange={(event) => updateForm('withdrawalIDR', event.target.value)} placeholder="850000" />
                  </label>
                </>
              )}
              {form.type === 'expense' && (
                <label>
                  Pengeluaran USD
                  <input inputMode="decimal" value={form.expenseUSD} onChange={(event) => updateForm('expenseUSD', event.target.value)} placeholder="10" />
                </label>
              )}
              <label>
                Equity USD
                <input inputMode="decimal" value={form.equityUSD} onChange={(event) => updateForm('equityUSD', event.target.value)} placeholder="250" />
              </label>
            </div>

            <button className="save-button" type="submit">{editingEntryId ? 'Update journal' : 'Simpan journal'}</button>
          </form>
        </div>
      )}
    </main>
  )
}

export default App
