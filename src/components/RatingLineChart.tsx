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
import { formatDateTime, formatDuration } from '@/lib/format'
import { useThemeColors } from '@/lib/theme-colors'
import type { ChartPoint } from '@/lib/stats'

type Mode = 'day' | 'week' | 'month'
type Metric = 'time' | 'rating'

interface RatingLineChartProps {
  sessions: Array<{
    id: string
    started_at: string
    rating: number | null
    actual_duration_minutes: number
    goals: { name: string } | null
    session_name: string | null
  }>
  onNavigateToSession?: (sessionId: string) => void
}

export function RatingLineChart({ sessions, onNavigateToSession }: RatingLineChartProps) {
  const [mode, setMode] = useState<Mode>('day')
  const [metric, setMetric] = useState<Metric>('time')
  const [selected, setSelected] = useState<ChartPoint | null>(null)
  const theme = useThemeColors()

  const rawData =
    mode === 'day'
      ? getDayViewPoints(sessions)
      : mode === 'week'
      ? getWeekViewPoints(sessions)
      : getMonthViewPoints(sessions)

  // Rating mode still needs to skip points without a rating so the line doesn't dip to 0.
  const data =
    metric === 'rating' ? rawData.filter((p) => p.hasRating) : rawData

  const formatXTick = (v: string) => {
    // Week/month points are local YYYY-MM-DD keys; parse them as local dates
    // (a bare date string parses as UTC midnight, a day early in the west).
    const d = v.length === 10 ? new Date(`${v}T00:00:00`) : new Date(v)
    if (mode === 'month') return d.toLocaleString('en-US', { month: 'short' })
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  const handleChartClick = (payload: unknown) => {
    if (mode !== 'day') return
    const active = (payload as { activePayload?: { payload: ChartPoint }[] })
      ?.activePayload?.[0]?.payload
    if (active) setSelected(active)
  }

  // Y-axis config swaps by metric. Time uses a nice-rounded upper bound so the
  // line doesn't kiss the top of the chart.
  const maxMinutes = Math.max(1, ...data.map((p) => p.minutes))
  const yMax = Math.ceil((maxMinutes * 1.1) / 15) * 15   // round up to nearest 15m
  const yConfig =
    metric === 'time'
      ? { domain: [0, yMax], ticks: undefined as unknown as number[] | undefined, formatter: (v: number) => `${v}m` }
      : { domain: [0, 5], ticks: [0, 1, 2, 3, 4, 5], formatter: (v: number) => String(v) }

  return (
    <div>
      {/* Metric + mode toggles on one line */}
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
      </div>

      {data.length === 0 ? (
        <p className="font-sans text-sm text-text-muted py-8 text-center">
          {metric === 'time' ? 'No sessions yet.' : 'No rated sessions yet.'}
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart
            data={data}
            margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
            onClick={handleChartClick}
            style={{ cursor: mode === 'day' ? 'pointer' : 'default' }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={theme.borderWarm} vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatXTick}
              tick={{ fontFamily: 'var(--font-outfit)', fontSize: 10, fill: theme.textMuted }}
              tickLine={false}
              axisLine={{ stroke: theme.borderWarm }}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={yConfig.domain}
              ticks={yConfig.ticks}
              tickFormatter={yConfig.formatter}
              tick={{ fontFamily: 'var(--font-quicksand)', fontSize: 10, fill: theme.textMuted }}
              tickLine={false}
              axisLine={false}
            />
            <Line
              type="monotone"
              dataKey={metric === 'time' ? 'minutes' : 'rating'}
              stroke={theme.coral}
              strokeWidth={1.5}
              dot={{ r: 3, fill: theme.coralLight, stroke: theme.coral, strokeWidth: 1.5 }}
              activeDot={{ r: 5, fill: theme.coral, stroke: theme.coral }}
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
              {metric === 'time'
                ? formatDuration(selected.minutes)
                : selected.hasRating
                ? `${selected.rating.toFixed(1)}/5`
                : 'unrated'}
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
