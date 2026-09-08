export interface ChartPoint {
  date: string
  rating: number
  sessionId?: string
  label?: string
}

export interface HeatmapEntry {
  date: string
  avgRating: number
  count: number
}

// ── Color scale ──────────────────────────────────────────────────────────────

export function getRatingTierColor(avgRating: number | null): string {
  if (avgRating === null) return '#f0ece2'
  if (avgRating <= 2.0) return '#f3d9bd'
  if (avgRating <= 3.0) return '#f0b587'
  if (avgRating <= 4.0) return '#e8905a'
  return '#d9642e'
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
  goals: { name: string } | null
  session_name: string | null
}

export function getDayViewPoints(sessions: RawSession[]): ChartPoint[] {
  return sessions
    .filter((s) => s.rating !== null)
    .map((s) => ({
      date: s.started_at,
      rating: s.rating!,
      sessionId: s.id,
      label:
        [s.goals?.name, s.session_name].filter(Boolean).join(' — ') || 'Session',
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function getWeekViewPoints(
  sessions: Pick<RawSession, 'started_at' | 'rating'>[]
): ChartPoint[] {
  const byDay = new Map<string, number[]>()
  sessions.filter((s) => s.rating !== null).forEach((s) => {
    const day = s.started_at.slice(0, 10)
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day)!.push(s.rating!)
  })
  return Array.from(byDay.entries())
    .map(([date, ratings]) => ({
      date,
      rating:
        Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function getMonthViewPoints(
  sessions: Pick<RawSession, 'started_at' | 'rating'>[]
): ChartPoint[] {
  const byWeek = new Map<string, number[]>()
  sessions.filter((s) => s.rating !== null).forEach((s) => {
    const d = new Date(s.started_at)
    const dow = d.getDay()
    const diff = d.getDate() - dow + (dow === 0 ? -6 : 1)
    const mon = new Date(d)
    mon.setDate(diff)
    const weekKey = mon.toISOString().slice(0, 10)
    if (!byWeek.has(weekKey)) byWeek.set(weekKey, [])
    byWeek.get(weekKey)!.push(s.rating!)
  })
  return Array.from(byWeek.entries())
    .map(([date, ratings]) => ({
      date,
      rating:
        Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ── Heatmap ──────────────────────────────────────────────────────────────────

export function buildHeatmapDays(
  sessions: Pick<RawSession, 'started_at' | 'rating'>[]
): Map<string, HeatmapEntry> {
  const map = new Map<string, HeatmapEntry>()
  sessions.filter((s) => s.rating !== null).forEach((s) => {
    const date = s.started_at.slice(0, 10)
    if (!map.has(date)) map.set(date, { date, avgRating: 0, count: 0 })
    const entry = map.get(date)!
    const prevSum = entry.avgRating * entry.count
    entry.count++
    entry.avgRating = (prevSum + s.rating!) / entry.count
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
  session_distraction_tags: { distraction_tags: { name: string } }[]
}

export function generateCSV(sessions: FullSession[]): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const headers = [
    'id', 'goal', 'category', 'session_name', 'planned_minutes',
    'actual_minutes', 'started_at', 'ended_at', 'rating', 'notes',
    'end_reason', 'tags',
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
    s.session_distraction_tags.map((t) => t.distraction_tags.name).join(';'),
  ])
  return [headers.map(esc), ...rows.map((r) => r.map(esc))]
    .map((r) => r.join(','))
    .join('\n')
}
