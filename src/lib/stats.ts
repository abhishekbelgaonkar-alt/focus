export interface ChartPoint {
  date: string
  rating: number       // 0 when no rating (line-chart still needs a number)
  minutes: number      // per-session minutes in day view, aggregated in week/month
  hasRating: boolean   // whether `rating` reflects a real value
  sessionId?: string
  label?: string
}

export interface HeatmapEntry {
  date: string
  avgRating: number   // 0 when no rated sessions
  minutes: number     // total across all sessions this day (rated or not)
  count: number
}

// ── Color scale ──────────────────────────────────────────────────────────────
// Returns CSS variable references (not raw hex) so the heatmap + chart
// colours track the active theme (cherry blossom, dark, cream, etc.).
// The palette tokens are defined per-theme in globals.css.

export function getRatingTierColor(avgRating: number | null): string {
  if (avgRating === null) return 'var(--color-heatmap-none)'
  if (avgRating <= 2.0) return 'var(--color-heatmap-low)'
  if (avgRating <= 3.0) return 'var(--color-heatmap-mid)'
  if (avgRating <= 4.0) return 'var(--color-heatmap-high)'
  return 'var(--color-heatmap-peak)'
}

// Colour a heatmap cell by minutes-spent. Same palette as the rating tiers
// so the two views feel like the same "language" — deeper hue = more time.
// 0 min = neutral, then buckets at 25 / 60 / 120+ minutes.
export function getMinutesTierColor(minutes: number): string {
  if (minutes <= 0) return 'var(--color-heatmap-none)'
  if (minutes < 25) return 'var(--color-heatmap-low)'
  if (minutes < 60) return 'var(--color-heatmap-mid)'
  if (minutes < 120) return 'var(--color-heatmap-high)'
  return 'var(--color-heatmap-peak)'
}

// ── Streak ───────────────────────────────────────────────────────────────────

export function calcDayStreak(sessionDates: string[]): number {
  if (sessionDates.length === 0) return 0
  const days = new Set(sessionDates.map((d) => d.slice(0, 10)))
  let streak = 0
  const today = new Date()
  for (let i = 0; i < 365; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    if (days.has(key)) streak++
    else break
  }
  return streak
}

// ── Chart aggregation ────────────────────────────────────────────────────────

type RawSession = {
  id: string
  started_at: string
  rating: number | null
  actual_duration_minutes: number
  goals: { name: string } | null
  session_name: string | null
}

export function getDayViewPoints(sessions: RawSession[]): ChartPoint[] {
  // Day view = every session, so time series is complete even for unrated ones.
  return sessions
    .map((s) => ({
      date: s.started_at,
      rating: s.rating ?? 0,
      hasRating: s.rating !== null,
      minutes: s.actual_duration_minutes,
      sessionId: s.id,
      label:
        [s.goals?.name, s.session_name].filter(Boolean).join(' · ') || 'Session',
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function getWeekViewPoints(
  sessions: Pick<RawSession, 'started_at' | 'rating' | 'actual_duration_minutes'>[]
): ChartPoint[] {
  const byDay = new Map<string, { ratings: number[]; minutes: number }>()
  sessions.forEach((s) => {
    const day = s.started_at.slice(0, 10)
    if (!byDay.has(day)) byDay.set(day, { ratings: [], minutes: 0 })
    const bucket = byDay.get(day)!
    if (s.rating !== null) bucket.ratings.push(s.rating)
    bucket.minutes += s.actual_duration_minutes
  })
  return Array.from(byDay.entries())
    .map(([date, { ratings, minutes }]) => ({
      date,
      rating:
        ratings.length > 0
          ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
          : 0,
      hasRating: ratings.length > 0,
      minutes,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function getMonthViewPoints(
  sessions: Pick<RawSession, 'started_at' | 'rating' | 'actual_duration_minutes'>[]
): ChartPoint[] {
  const byWeek = new Map<string, { ratings: number[]; minutes: number }>()
  sessions.forEach((s) => {
    const d = new Date(s.started_at)
    const dow = d.getDay()
    const diff = d.getDate() - dow + (dow === 0 ? -6 : 1)
    const mon = new Date(d)
    mon.setDate(diff)
    const weekKey = mon.toISOString().slice(0, 10)
    if (!byWeek.has(weekKey)) byWeek.set(weekKey, { ratings: [], minutes: 0 })
    const bucket = byWeek.get(weekKey)!
    if (s.rating !== null) bucket.ratings.push(s.rating)
    bucket.minutes += s.actual_duration_minutes
  })
  return Array.from(byWeek.entries())
    .map(([date, { ratings, minutes }]) => ({
      date,
      rating:
        ratings.length > 0
          ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
          : 0,
      hasRating: ratings.length > 0,
      minutes,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ── Heatmap ──────────────────────────────────────────────────────────────────

export function buildHeatmapDays(
  sessions: Pick<RawSession, 'started_at' | 'rating' | 'actual_duration_minutes'>[]
): Map<string, HeatmapEntry> {
  const map = new Map<string, HeatmapEntry>()
  sessions.forEach((s) => {
    const date = s.started_at.slice(0, 10)
    if (!map.has(date)) map.set(date, { date, avgRating: 0, minutes: 0, count: 0 })
    const entry = map.get(date)!
    entry.minutes += s.actual_duration_minutes
    if (s.rating !== null) {
      const prevRatedCount = entry.count
      const prevSum = entry.avgRating * prevRatedCount
      entry.count = prevRatedCount + 1
      entry.avgRating = (prevSum + s.rating) / entry.count
    }
  })
  return map
}

// Returns a flat array sized to complete Mon–Sun week rows for the given month.
// null = padding cell. month is 0-indexed (0 = January).
export function getMonthGridDays(year: number, month: number): (string | null)[] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  // (getDay()+6)%7 maps: Sun→6, Mon→0, Tue→1, …, Sat→5
  const leadPad = (firstDay.getDay() + 6) % 7
  const trailPad = 6 - ((lastDay.getDay() + 6) % 7)

  const days: (string | null)[] = Array(leadPad).fill(null)
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(
      `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    )
  }
  if (trailPad > 0) days.push(...Array(trailPad).fill(null))
  return days
}

// ── CSV export ───────────────────────────────────────────────────────────────

type FullSession = {
  id: string
  session_name: string | null
  planned_duration_minutes: number
  actual_duration_minutes: number
  started_at: string
  ended_at: string
  rating: number | null
  notes: string | null
  end_reason: string | null
  goals: { name: string } | null
  categories: { name: string } | null
}

export function generateCSV(sessions: FullSession[]): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const headers = [
    'id', 'goal', 'category', 'session_name', 'planned_minutes',
    'actual_minutes', 'started_at', 'ended_at', 'rating', 'notes',
    'end_reason',
  ]
  const rows = sessions.map((s) => [
    s.id,
    s.goals?.name ?? '',
    s.categories?.name ?? '',
    s.session_name ?? '',
    s.planned_duration_minutes,
    s.actual_duration_minutes,
    s.started_at,
    s.ended_at,
    s.rating ?? '',
    s.notes ?? '',
    s.end_reason ?? '',
  ])
  return [headers.map(esc), ...rows.map((r) => r.map(esc))]
    .map((r) => r.join(','))
    .join('\n')
}
