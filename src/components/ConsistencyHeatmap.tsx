'use client'
import { useState } from 'react'
import { getRatingTierColor, getMonthGridDays } from '@/lib/stats'
import { PeriodNoteBox } from '@/components/PeriodNoteBox'
import type { HeatmapEntry } from '@/lib/stats'
import type { PeriodType } from '@/lib/types'

type HeatmapMode = 'day' | 'week' | 'month'

interface ConsistencyHeatmapProps {
  dayMap: Map<string, HeatmapEntry>
  sessions: Array<{ started_at: string; rating: number | null }>
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

function isoWeekMonday(date: Date): string {
  const d = new Date(date)
  const dow = d.getDay()
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
  return d.toISOString().slice(0, 10)
}

function avgOrNull(ratings: number[]): number | null {
  return ratings.length === 0 ? null : ratings.reduce((a, b) => a + b, 0) / ratings.length
}

export function ConsistencyHeatmap({ dayMap, sessions }: ConsistencyHeatmapProps) {
  const now = new Date()
  const [mode, setMode] = useState<HeatmapMode>('day')
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [selected, setSelected] = useState<SelectedPeriod | null>(null)

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
                  color: '#c9b79c',
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
                    backgroundColor: getRatingTierColor(entry?.avgRating ?? null),
                    borderRadius: 3,
                    cursor: 'pointer',
                    outline: isSelected ? '2px solid #d9642e' : 'none',
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

        {/* Legend */}
        <div className="flex items-center gap-1.5 mt-3">
          <span style={{ fontSize: 9 }} className="text-text-light font-sans">Rough</span>
          {(['#f3d9bd', '#f0b587', '#e8905a', '#d9642e'] as const).map((c) => (
            <div key={c} style={{ width: CELL, height: CELL, backgroundColor: c, borderRadius: 3 }} />
          ))}
          <span style={{ fontSize: 9 }} className="text-text-light font-sans">Locked in</span>
        </div>
      </div>
    )
  }

  // ── Week view ────────────────────────────────────────────────────────────────

  const renderWeekView = () => {
    const weekMap = new Map<string, number[]>()
    sessions.filter((s) => s.rating !== null).forEach((s) => {
      const k = isoWeekMonday(new Date(s.started_at))
      if (!weekMap.has(k)) weekMap.set(k, [])
      weekMap.get(k)!.push(s.rating!)
    })

    const weeks: string[] = []
    for (let i = 51; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i * 7)
      weeks.push(isoWeekMonday(d))
    }
    const unique = [...new Set(weeks)].sort()

    return (
      <div className="flex flex-col items-center">
        <div className="flex flex-wrap gap-1.5 justify-center max-w-xs">
          {unique.map((week) => {
            const avg = avgOrNull(weekMap.get(week) ?? [])
            const isSelected = selected?.date === week
            const title = `Week of ${new Date(week + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
            return (
              <div
                key={week}
                onClick={() => toggle({ type: 'week', date: week, title })}
                style={{
                  width: CELL * 1.5,
                  height: CELL * 1.5,
                  backgroundColor: getRatingTierColor(avg),
                  borderRadius: 3,
                  cursor: 'pointer',
                  outline: isSelected ? '2px solid #d9642e' : 'none',
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
    const monthMap = new Map<string, number[]>()
    sessions.filter((s) => s.rating !== null).forEach((s) => {
      const k = s.started_at.slice(0, 7)
      if (!monthMap.has(k)) monthMap.set(k, [])
      monthMap.get(k)!.push(s.rating!)
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
            const avg = avgOrNull(monthMap.get(mk) ?? [])
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
                    backgroundColor: getRatingTierColor(avg),
                    borderRadius: 4,
                    cursor: 'pointer',
                    outline: isSelected ? '2px solid #d9642e' : 'none',
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
      {/* Toggle — independent from line chart */}
      <div className="flex gap-2 mb-4">
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
