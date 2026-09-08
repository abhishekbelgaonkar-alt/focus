'use client'
import { useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'
import { getDayViewPoints, getWeekViewPoints, getMonthViewPoints } from '@/lib/stats'
import { formatDateTime } from '@/lib/format'
import type { ChartPoint } from '@/lib/stats'

type Mode = 'day' | 'week' | 'month'

interface RatingLineChartProps {
  sessions: Array<{
    id: string
    started_at: string
    rating: number | null
    goals: { name: string } | null
    session_name: string | null
  }>
  onNavigateToSession?: (sessionId: string) => void
}

export function RatingLineChart({ sessions, onNavigateToSession }: RatingLineChartProps) {
  const [mode, setMode] = useState<Mode>('day')
  const [selected, setSelected] = useState<ChartPoint | null>(null)

  const data =
    mode === 'day'
      ? getDayViewPoints(sessions)
      : mode === 'week'
      ? getWeekViewPoints(sessions)
      : getMonthViewPoints(sessions)

  const formatXTick = (v: string) => {
    const d = new Date(v)
    if (mode === 'month') return d.toLocaleString('en-US', { month: 'short' })
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  const handleChartClick = (payload: unknown) => {
    if (mode !== 'day') return
    const active = (payload as { activePayload?: { payload: ChartPoint }[] })
      ?.activePayload?.[0]?.payload
    if (active) setSelected(active)
  }

  return (
    <div>
      {/* Mode toggle */}
      <div className="flex gap-2 mb-4">
        {(['day', 'week', 'month'] as Mode[]).map((m) => (
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

      {data.length === 0 ? (
        <p className="font-sans text-sm text-text-muted py-8 text-center">
          No rated sessions yet.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart
            data={data}
            margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
            onClick={handleChartClick}
            style={{ cursor: mode === 'day' ? 'pointer' : 'default' }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#ecdcc9" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatXTick}
              tick={{ fontFamily: 'var(--font-outfit)', fontSize: 10, fill: '#b08c6a' }}
              tickLine={false}
              axisLine={{ stroke: '#ecdcc9' }}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[1, 5]}
              ticks={[1, 2, 3, 4, 5]}
              tick={{ fontFamily: 'var(--font-quicksand)', fontSize: 10, fill: '#b08c6a' }}
              tickLine={false}
              axisLine={false}
            />
            <Line
              type="monotone"
              dataKey="rating"
              stroke="#d9642e"
              strokeWidth={1.5}
              dot={{ r: 3, fill: '#fbe6d4', stroke: '#d9642e', strokeWidth: 1.5 }}
              activeDot={{ r: 5, fill: '#d9642e', stroke: '#d9642e' }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}

      {/* Click card — Day view only */}
      {selected && mode === 'day' && (
        <div className="mt-3 p-3 border border-border-warm rounded-xl">
          <p className="font-sans text-xs text-text-muted">{formatDateTime(selected.date)}</p>
          <p className="font-sans text-sm font-medium text-text-primary mt-0.5">
            {selected.label}
          </p>
          <div className="flex items-center gap-3 mt-1">
            <span className="font-numbers text-xl font-semibold text-coral">
              {selected.rating.toFixed(1)}/5
            </span>
            {selected.sessionId && onNavigateToSession && (
              <button
                onClick={() => onNavigateToSession(selected.sessionId!)}
                className="font-sans text-xs text-coral underline"
              >
                View session →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
