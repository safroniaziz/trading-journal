import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { EquityChart } from './Chart'
import type { JournalEntry, PeriodFilter, RateState, TransactionType } from './types'
import './App.css'

const ENTRIES_KEY_V1 = 'trading-journal.entries.v1'
const ENTRIES_KEY_V2 = 'trading-journal.entries.v2'
const RATE_KEY = 'trading-journal.usd-idr-rate.v1'
const FALLBACK_RATE = 16400

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

type FormState = {
  date: string
  type: TransactionType
  note: string
  depositUSD: string
  depositIDR: string
  withdrawalUSD: string
  expenseUSD: string
  plUSD: string
  equityUSD: string
  bankUSD: string
}

type Summary = {
  plUSD: number
  depositUSD: number
  depositIDR: number
  withdrawalUSD: number
  expenseUSD: number
  netCashflowUSD: number
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
    depositUSD: '',
    depositIDR: '',
    withdrawalUSD: '',
    expenseUSD: '',
    plUSD: '',
    equityUSD: '',
    bankUSD: '',
  }
}

function createEntry(base: Omit<JournalEntry, 'withdrawalUSD' | 'expenseUSD'> & Partial<Pick<JournalEntry, 'withdrawalUSD' | 'expenseUSD'>>): JournalEntry {
  return {
    ...base,
    withdrawalUSD: base.withdrawalUSD ?? 0,
    expenseUSD: base.expenseUSD ?? 0,
  }
}

function migrateV1ToV2(v1Entries: V1Entry[]) {
  const migrated = v1Entries.flatMap((entry) => {
    const nextEntries: JournalEntry[] = []

    if (entry.depositUSD > 0 || entry.depositIDR > 0) {
      nextEntries.push(createEntry({
        id: `${entry.id}-deposit`,
        date: entry.date,
        type: 'deposit',
        note: entry.note || 'Deposit dari data lama.',
        depositUSD: entry.depositUSD,
        depositIDR: entry.depositIDR,
        plUSD: null,
        equityUSD: entry.equityUSD,
        bankUSD: entry.bankUSD,
      }))
    }

    if (entry.plUSD !== null) {
      nextEntries.push(createEntry({
        id: `${entry.id}-trade`,
        date: entry.date,
        type: 'trade',
        note: entry.note || 'Trade dari data lama.',
        depositUSD: 0,
        depositIDR: 0,
        plUSD: entry.plUSD,
        equityUSD: entry.equityUSD,
        bankUSD: entry.bankUSD,
      }))
    }

    if (nextEntries.length === 0) {
      nextEntries.push(createEntry({
        id: `${entry.id}-note`,
        date: entry.date,
        type: 'trade',
        note: entry.note,
        depositUSD: 0,
        depositIDR: 0,
        plUSD: null,
        equityUSD: entry.equityUSD,
        bankUSD: entry.bankUSD,
      }))
    }

    return nextEntries
  })

  return sortEntries(migrated)
}

function parseStoredEntries(): JournalEntry[] {
  const storedV2 = localStorage.getItem(ENTRIES_KEY_V2)
  if (storedV2) {
    try {
      const parsed = JSON.parse(storedV2) as JournalEntry[]
      return Array.isArray(parsed) ? sortEntries(parsed) : SEED_ENTRIES
    } catch {
      return SEED_ENTRIES
    }
  }

  const storedV1 = localStorage.getItem(ENTRIES_KEY_V1)
  if (storedV1) {
    try {
      const parsed = JSON.parse(storedV1) as V1Entry[]
      if (Array.isArray(parsed) && parsed.length > 0) {
        const migrated = migrateV1ToV2(parsed)
        localStorage.setItem(ENTRIES_KEY_V2, JSON.stringify(migrated))
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

function formatRateDate(date: string | null) {
  if (!date) return 'fallback'

  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
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
  const depositUSD = entries.reduce((total, entry) => total + entry.depositUSD, 0)
  const depositIDR = entries.reduce((total, entry) => total + entry.depositIDR, 0)
  const withdrawalUSD = entries.reduce((total, entry) => total + entry.withdrawalUSD, 0)
  const expenseUSD = entries.reduce((total, entry) => total + entry.expenseUSD, 0)

  return {
    plUSD,
    depositUSD,
    depositIDR,
    withdrawalUSD,
    expenseUSD,
    netCashflowUSD: depositUSD - withdrawalUSD - expenseUSD,
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

function getEntryAmount(entry: JournalEntry) {
  if (entry.type === 'trade') return entry.plUSD
  if (entry.type === 'deposit') return entry.depositUSD || entry.depositIDR
  if (entry.type === 'withdrawal') return -entry.withdrawalUSD
  return -entry.expenseUSD
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

  useEffect(() => {
    localStorage.setItem(ENTRIES_KEY_V2, JSON.stringify(entries))
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

    return () => {
      ignore = true
    }
  }, [])

  const sortedEntries = useMemo(() => sortEntries(entries), [entries])
  const visibleEntries = useMemo(() => filterEntriesByLatestPeriod(entries, period), [entries, period])
  const entryGroups = useMemo(() => groupEntries(visibleEntries, period), [visibleEntries, period])
  const summary = useMemo(() => summarizeEntries(visibleEntries), [visibleEntries])
  const latestEntry = sortedEntries[0]
  const latestEquityUSD = latestEntry?.equityUSD ?? 0
  const activePeriodLabel = entryGroups[0]?.label ?? 'Belum ada data'

  function updateForm(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function handleTypeChange(type: TransactionType) {
    setForm((current) => ({ ...current, type }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextEntry: JournalEntry = {
      id: crypto.randomUUID(),
      date: form.date,
      type: form.type,
      note: form.note.trim(),
      depositUSD: form.type === 'deposit' ? parseNumber(form.depositUSD) : 0,
      depositIDR: form.type === 'deposit' ? parseNumber(form.depositIDR) : 0,
      withdrawalUSD: form.type === 'withdrawal' ? parseNumber(form.withdrawalUSD) : 0,
      expenseUSD: form.type === 'expense' ? parseNumber(form.expenseUSD) : 0,
      plUSD: form.type === 'trade' ? parseNullableNumber(form.plUSD) : null,
      equityUSD: parseNumber(form.equityUSD),
      bankUSD: parseNumber(form.bankUSD),
    }

    setEntries((current) => sortEntries([nextEntry, ...current]))
    setForm(createEmptyForm())
    setIsFormOpen(false)
  }

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Private iPhone journal</p>
          <h1>Trading Journal</h1>
          <p className="subtitle">Trade, deposit, penarikan, pengeluaran. Semua lokal.</p>
        </div>
        <div className="rate-pill">
          <span>USD/IDR</span>
          <strong>{formatIDR(rate.value)}</strong>
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
          <span>Deposit USD</span>
          <strong>{formatUSD(summary.depositUSD)}</strong>
          <small>{formatIDR(summary.depositUSD * rate.value)}</small>
        </article>
        <article className="stat-card">
          <span>Deposit IDR</span>
          <strong>{formatIDR(summary.depositIDR)}</strong>
          <small>Kurs {rate.source} · {formatRateDate(rate.updatedAt)}</small>
        </article>
        <article className="stat-card">
          <span>Penarikan</span>
          <strong className="negative">{formatUSD(summary.withdrawalUSD)}</strong>
          <small>{formatIDR(summary.withdrawalUSD * rate.value)}</small>
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
            <p className="eyebrow">History</p>
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
                const amount = getEntryAmount(entry)
                return (
                  <article className="entry-card" key={entry.id}>
                    <div className="entry-top">
                      <div>
                        <span className={`type-badge ${entry.type}`}>{TRANSACTION_LABELS[entry.type]}</span>
                        <h3>{formatDate(entry.date)}</h3>
                        <p>{entry.note || 'Tanpa catatan'}</p>
                      </div>
                      <strong className={amount === null || amount >= 0 ? 'positive' : 'negative'}>
                        {amount === null ? '-' : typeof amount === 'number' && entry.type === 'deposit' && entry.depositIDR > 0 && entry.depositUSD === 0 ? formatIDR(amount) : formatUSD(amount)}
                      </strong>
                    </div>
                    <div className="entry-meta">
                      {entry.depositUSD > 0 && <span>Deposit {formatUSD(entry.depositUSD)}</span>}
                      {entry.depositIDR > 0 && <span>{formatIDR(entry.depositIDR)}</span>}
                      {entry.withdrawalUSD > 0 && <span>Tarik {formatUSD(entry.withdrawalUSD)}</span>}
                      {entry.expenseUSD > 0 && <span>Expense {formatUSD(entry.expenseUSD)}</span>}
                      {entry.equityUSD > 0 && <span>Equity {formatUSD(entry.equityUSD)}</span>}
                      {entry.bankUSD > 0 && <span>Rekening {formatUSD(entry.bankUSD)}</span>}
                    </div>
                  </article>
                )
              })}
            </section>
          ))}
        </div>
      </section>

      <button className="fab" type="button" onClick={() => setIsFormOpen(true)} aria-label="Tambah catatan trading">
        +
      </button>

      {isFormOpen && (
        <div className="sheet-backdrop" role="presentation">
          <form className="entry-sheet" onSubmit={handleSubmit}>
            <div className="sheet-handle" />
            <div className="sheet-head">
              <div>
                <p className="eyebrow">Input baru</p>
                <h2>Tambah catatan</h2>
              </div>
              <button type="button" onClick={() => setIsFormOpen(false)}>Tutup</button>
            </div>

            <div className="type-tabs" aria-label="Jenis transaksi">
              {(Object.keys(TRANSACTION_LABELS) as TransactionType[]).map((type) => (
                <button className={form.type === type ? 'active' : ''} type="button" key={type} onClick={() => handleTypeChange(type)}>
                  {TRANSACTION_LABELS[type]}
                </button>
              ))}
            </div>

            <label>
              Tanggal
              <input type="date" value={form.date} onChange={(event) => updateForm('date', event.target.value)} required />
            </label>
            <label>
              Catatan
              <textarea value={form.note} onChange={(event) => updateForm('note', event.target.value)} placeholder="Contoh: WD profit, bayar VPS, ikut kelas" />
            </label>
            <div className="form-grid">
              {form.type === 'deposit' && (
                <>
                  <label>
                    Deposit USD
                    <input inputMode="decimal" value={form.depositUSD} onChange={(event) => updateForm('depositUSD', event.target.value)} placeholder="112" />
                  </label>
                  <label>
                    Deposit IDR
                    <input inputMode="numeric" value={form.depositIDR} onChange={(event) => updateForm('depositIDR', event.target.value)} placeholder="500000" />
                  </label>
                </>
              )}
              {form.type === 'trade' && (
                <label>
                  P/L USD
                  <input inputMode="decimal" value={form.plUSD} onChange={(event) => updateForm('plUSD', event.target.value)} placeholder="25" />
                </label>
              )}
              {form.type === 'withdrawal' && (
                <label>
                  Penarikan USD
                  <input inputMode="decimal" value={form.withdrawalUSD} onChange={(event) => updateForm('withdrawalUSD', event.target.value)} placeholder="50" />
                </label>
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
              <label>
                Rekening USD
                <input inputMode="decimal" value={form.bankUSD} onChange={(event) => updateForm('bankUSD', event.target.value)} placeholder="50" />
              </label>
            </div>

            <button className="save-button" type="submit">Simpan journal</button>
          </form>
        </div>
      )}
    </main>
  )
}

export default App
