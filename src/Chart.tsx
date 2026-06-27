import type { ChartMode, JournalEntry, PeriodFilter } from './types'

type ChartProps = {
  entries: JournalEntry[]
  period: PeriodFilter
  chartMode: ChartMode
  formatUSD: (value: number) => string
}

const WIDTH = 320
const HEIGHT = 170
const PADDING = 24

function formatShortDate(date: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(`${date}T00:00:00`))
}

function getWeekKey(date: string) {
  const current = new Date(`${date}T00:00:00`)
  const start = new Date(current.getFullYear(), 0, 1)
  const dayNumber = Math.floor((current.getTime() - start.getTime()) / 86400000) + 1
  const weekNumber = Math.ceil((dayNumber + start.getDay()) / 7)
  return `${current.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`
}

function getPeriodKey(date: string, period: PeriodFilter) {
  if (period === 'weekly') return getWeekKey(date)
  if (period === 'monthly') return date.slice(0, 7)
  return date
}

function getEquityPoints(entries: JournalEntry[], period: PeriodFilter) {
  const sorted = [...entries]
    .filter((entry) => entry.equityUSD > 0)
    .sort((a, b) => a.date.localeCompare(b.date))

  if (period === 'daily' || period === 'all') {
    return sorted.map((entry) => ({ date: entry.date, value: entry.equityUSD }))
  }

  const points = new Map<string, { date: string; value: number }>()

  sorted.forEach((entry) => {
    points.set(getPeriodKey(entry.date, period), {
      date: entry.date,
      value: entry.equityUSD,
    })
  })

  return [...points.values()]
}

function getPnlPoints(entries: JournalEntry[], period: PeriodFilter) {
  const sorted = [...entries]
    .filter((entry) => entry.type === 'trade' && entry.plUSD !== null)
    .sort((a, b) => a.date.localeCompare(b.date))

  let running = 0
  const dailyPoints = sorted.map((entry) => {
    running += entry.plUSD ?? 0
    return { date: entry.date, value: running }
  })

  if (period === 'daily' || period === 'all') return dailyPoints

  const points = new Map<string, { date: string; value: number }>()
  dailyPoints.forEach((point) => {
    points.set(getPeriodKey(point.date, period), point)
  })

  return [...points.values()]
}

export function EquityChart({ entries, period, chartMode, formatUSD }: ChartProps) {
  const points = chartMode === 'pnl' ? getPnlPoints(entries, period) : getEquityPoints(entries, period)
  const title = chartMode === 'pnl' ? 'Net P/L curve' : 'Equity curve'

  if (points.length === 0) {
    return <div className="empty-chart">{chartMode === 'pnl' ? 'Belum ada data P/L trade.' : 'Belum ada data equity.'}</div>
  }

  const values = points.map((point) => point.value)
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const range = maxValue - minValue || 1
  const innerWidth = WIDTH - PADDING * 2
  const innerHeight = HEIGHT - PADDING * 2

  const svgPoints = points.map((point, index) => {
    const x = PADDING + (points.length === 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth)
    const y = PADDING + ((maxValue - point.value) / range) * innerHeight
    return { ...point, x, y }
  })

  const polyline = svgPoints.map((point) => `${point.x},${point.y}`).join(' ')
  const area = `${PADDING},${HEIGHT - PADDING} ${polyline} ${WIDTH - PADDING},${HEIGHT - PADDING}`
  const latest = points.at(-1)

  return (
    <div className="chart-wrap">
      <div className="chart-head">
        <div>
          <p className="eyebrow">{title}</p>
          <h2>{latest ? formatUSD(latest.value) : '$0.00'}</h2>
        </div>
        <span>{points.length} data</span>
      </div>

      <svg className="equity-chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Grafik trading">
        <defs>
          <linearGradient id="lineGradient" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
          <linearGradient id="areaGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={PADDING} x2={WIDTH - PADDING} y1={HEIGHT - PADDING} y2={HEIGHT - PADDING} />
        <line x1={PADDING} x2={PADDING} y1={PADDING} y2={HEIGHT - PADDING} />
        <polygon points={area} fill="url(#areaGradient)" />
        <polyline points={polyline} fill="none" stroke="url(#lineGradient)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {svgPoints.map((point) => (
          <circle key={`${point.date}-${point.value}`} cx={point.x} cy={point.y} r="5" />
        ))}
      </svg>

      <div className="chart-labels">
        <span>{formatShortDate(points[0].date)}</span>
        <span>{formatUSD(minValue)} - {formatUSD(maxValue)}</span>
        <span>{formatShortDate(points.at(-1)?.date ?? points[0].date)}</span>
      </div>
    </div>
  )
}
