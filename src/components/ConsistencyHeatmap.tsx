'use client'
import { useState } from 'react'
import { getRatingTierColor, getMinutesTierColor, getMonthGridDays, weekStartKey } from '@/lib/stats'
import { PeriodNoteBox } from '@/components/PeriodNoteBox'
import type { HeatmapEntry } from '@/lib/stats'
import type { PeriodType } from '@/lib/types'

type HeatmapMode = 'day' | 'week' | 'month'
type Metric = 'time' | 'rating'

interface ConsistencyHeatmapProps {
  dayMap: Map<string, HeatmapEntry>
  sessions: Array<{ started_at: string; rating: number | null; actual_duration_minutes: number }>
}

interface SelectedPeriod {
  type: PeriodType
  date: string
  title: string
}

const CELL = 18
const GAP = 3
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function avgOrNull(ratings: number[]): number | null {
  return ratings.length === 0 ? null : ratings.reduce((a, b) => a + b, 0) / ratings.length
}

export function ConsistencyHeatmap({ dayMap, sessions }: ConsistencyHeatmapProps) {
  const now = new Date()
  const [mode, setMode] = useState<HeatmapMode>('day')
  const [metric, setMetric] = useState<Metric>('time')
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [selected, setSelected] = useState<SelectedPeriod | null>(null)

  // Colour a cell by the active metric — time (minutes tier) or rating tier.
  const cellColor = (minutes: number, avgRating: number | null): string =>
    metric === 'time' ? getMinutesTierColor(minutes) : getRatingTierColor(avgRating)

  const toggle = (period: SelectedPeriod) =>
    setSelected((prev) => (prev?.date === period.date ? null : period))

  // ── Day view ────────────────────────────────────────────────────────────────

  const renderDayView = () => {
    const days = getMonthGridDays(viewYear, viewMonth)
    const prevMonth = () => {
      if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1) }
      else setViewMonth((m) => m - 1)
      setSelected(null)
    }
    const nextMonth = () => {
      if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1) }
      else setViewMonth((m) => m + 1)
      setSelected(null)
    }

    return (
      <div className="flex flex-col items-center">
        {/* Month nav */}
        <div className="flex items-center gap-4 mb-3">
          <button onClick={prevMonth} className="font-sans text-base text-text-muted leading-none">‹</button>
          <span className="font-sans text-sm font-medium text-text-primary w-36 text-center">
            {MONTH_NAMES[viewMonth]} {viewYear}
          </span>
          <button onClick={nextMonth} className="font-sans text-base text-text-muted leading-none">›</button>
        </div>

        {/* Weekday labels + grid row */}
        <div className="flex" style={{ gap: GAP }}>
          {/* Weekday label column */}
          <div className="flex flex-col" style={{ gap: GAP }}>
            {WEEKDAY_LABELS.map((d) => (
              <div
                key={d}
                style={{
                  fontSize: 9,
                  color: 'var(--color-text-light)',
                  height: CELL,
                  lineHeight: `${CELL}px`,
                  width: 22,
                  textAlign: 'right',
                }}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Day grid — grid-auto-flow:column fills weeks left→right within 7-row columns */}
          <div
            style={{
              display: 'grid',
              gridTemplateRows: `repeat(7, ${CELL}px)`,
              gridAutoFlow: 'column',
              gridAutoColumns: CELL,
              gap: GAP,
            }}
          >
            {days.map((date, i) => {
              if (!date) return <div key={i} style={{ width: CELL, height: CELL }} />
              const entry = dayMap.get(date)
              const dayNum = parseInt(date.slice(8))
              const isSelected = selected?.date === date
              const title = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
              })
              return (
                <div
                  key={date}
                  onClick={() => toggle({ type: 'day', date, title })}
                  style={{
                    width: CELL,
                    height: CELL,
                    backgroundColor: cellColor(entry?.minutes ?? 0, entry?.avgRating ?? null),
                    borderRadius: 3,
                    cursor: 'pointer',
                    outline: isSelected ? '2px solid var(--color-coral)' : 'none',
                    outlineOffset: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span style={{ fontSize: 7, color: 'rgba(61,49,38,0.5)', lineHeight: 1 }}>
                    {dayNum}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Legend — copy swaps with metric */}
        <div className="flex items-center gap-1.5 mt-3">
          <span style={{ fontSize: 9 }} className="text-text-light font-sans">
            {metric === 'time' ? 'A little' : 'Rough'}
          </span>
          {(['--color-heatmap-low', '--color-heatmap-mid', '--color-heatmap-high', '--color-heatmap-peak'] as const).map((token) => (
            <div
              key={token}
              style={{ width: CELL, height: CELL, backgroundColor: `var(${token})`, borderRadius: 3 }}
            />
          ))}
          <span style={{ fontSize: 9 }} className="text-text-light font-sans">
            {metric === 'time' ? 'Deep session' : 'Locked in'}
          </span>
        </div>
      </div>
    )
  }

  // ── Week view ────────────────────────────────────────────────────────────────

  const renderWeekView = () => {
    const weekMap = new Map<string, { ratings: number[]; minutes: number }>()
    sessions.forEach((s) => {
      const k = weekStartKey(new Date(s.started_at))
      if (!weekMap.has(k)) weekMap.set(k, { ratings: [], minutes: 0 })
      const bucket = weekMap.get(k)!
      if (s.rating !== null) bucket.ratings.push(s.rating)
      bucket.minutes += s.actual_duration_minutes
    })

    const weeks: string[] = []
    for (let i = 51; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i * 7)
      weeks.push(weekStartKey(d))
    }
    const unique = [...new Set(weeks)].sort()

    return (
      <div className="flex flex-col items-center">
        <div className="flex flex-wrap gap-1.5 justify-center max-w-xs">
          {unique.map((week) => {
            const bucket = weekMap.get(week)
            const avg = avgOrNull(bucket?.ratings ?? [])
            // For week/month, scale minutes-per-cell up (a full week of "deep"
            // work looks nothing like a single deep session) — 7× the day scale.
            const minutes = (bucket?.minutes ?? 0) / 7
            const isSelected = selected?.date === week
            const title = `Week of ${new Date(week + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
            return (
              <div
                key={week}
                onClick={() => toggle({ type: 'week', date: week, title })}
                style={{
                  width: CELL * 1.5,
                  height: CELL * 1.5,
                  backgroundColor: cellColor(minutes, avg),
                  borderRadius: 3,
                  cursor: 'pointer',
                  outline: isSelected ? '2px solid var(--color-coral)' : 'none',
                  outlineOffset: 1,
                }}
              />
            )
          })}
        </div>
      </div>
    )
  }

  // ── Month view ───────────────────────────────────────────────────────────────

  const renderMonthView = () => {
    const monthMap = new Map<string, { ratings: number[]; minutes: number }>()
    sessions.forEach((s) => {
      const k = s.started_at.slice(0, 7)
      if (!monthMap.has(k)) monthMap.set(k, { ratings: [], minutes: 0 })
      const bucket = monthMap.get(k)!
      if (s.rating !== null) bucket.ratings.push(s.rating)
      bucket.minutes += s.actual_duration_minutes
    })

    const months: string[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      months.push(d.toISOString().slice(0, 7))
    }

    return (
      <div className="flex flex-col items-center">
        <div className="flex flex-wrap gap-2 justify-center">
          {months.map((mk) => {
            const bucket = monthMap.get(mk)
            const avg = avgOrNull(bucket?.ratings ?? [])
            // Same rationale as the week view — average daily minutes across
            // the ~30 days so a month of steady 30-min days looks warm.
            const minutes = (bucket?.minutes ?? 0) / 30
            const [y, m] = mk.split('-').map(Number)
            const periodDate = `${mk}-01`
            const isSelected = selected?.date === periodDate
            const title = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
            return (
              <div key={mk} className="flex flex-col items-center gap-1">
                <div
                  onClick={() => toggle({ type: 'month', date: periodDate, title })}
                  style={{
                    width: CELL * 2,
                    height: CELL * 2,
                    backgroundColor: cellColor(minutes, avg),
                    borderRadius: 4,
                    cursor: 'pointer',
                    outline: isSelected ? '2px solid var(--color-coral)' : 'none',
                    outlineOffset: 1,
                  }}
                />
                <span style={{ fontSize: 9 }} className="text-text-light font-sans">
                  {MONTH_NAMES[m - 1]}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Metric + granularity toggles — independent from the line chart. */}
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="flex gap-2">
          {(['time', 'rating'] as Metric[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMetric(m); setSelected(null) }}
              className={`font-sans text-xs px-3 py-1 rounded-pill capitalize ${
                metric === m
                  ? 'bg-text-primary text-cream'
                  : 'border-[1.5px] border-border-warm text-text-muted'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {(['day', 'week', 'month'] as HeatmapMode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setSelected(null) }}
              className={`font-sans text-xs px-3 py-1 rounded-pill capitalize ${
                mode === m
                  ? 'bg-coral text-white'
                  : 'border-[1.5px] border-border-warm text-text-muted'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {mode === 'day' && renderDayView()}
      {mode === 'week' && renderWeekView()}
      {mode === 'month' && renderMonthView()}

      {selected && (
        <PeriodNoteBox
          periodType={selected.type}
          periodDate={selected.date}
          title={selected.title}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
