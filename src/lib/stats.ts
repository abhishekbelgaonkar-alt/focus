import type { SupabaseClient } from '@supabase/supabase-js'
import { localDateKey } from './format'

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
  count: number       // rated sessions this day
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

// ── Daily totals ─────────────────────────────────────────────────────────────

// One local day's completed sessions, from the get_daily_totals() RPC. The
// database does the adding up, so long histories aren't cut off at the
// API's row limit.
export interface DailyTotal {
  date: string        // YYYY-MM-DD in the user's timezone
  sessions: number
  minutes: number
  rating_sum: number
  rated: number       // sessions with a rating
}

/** Per-day totals in the browser's timezone, optionally for one goal. */
export async function fetchDailyTotals(
  supabase: SupabaseClient,
  goalId: string | null = null
): Promise<DailyTotal[]> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const { data, error } = await supabase.rpc('get_daily_totals', { p_tz: tz, p_goal_id: goalId })
  if (error) throw error
  return (data ?? []) as DailyTotal[]
}

export interface Bucket {
  sessions: number
  minutes: number
  ratingSum: number
  rated: number
}

/** Sums daily totals into buckets, keyed by keyOf(day) (a week, a month…). */
export function groupDays(days: DailyTotal[], keyOf: (date: string) => string): Map<string, Bucket> {
  const out = new Map<string, Bucket>()
  for (const d of days) {
    const k = keyOf(d.date)
    const b = out.get(k) ?? { sessions: 0, minutes: 0, ratingSum: 0, rated: 0 }
    b.sessions += d.sessions
    b.minutes += d.minutes
    b.ratingSum += d.rating_sum
    b.rated += d.rated
    out.set(k, b)
  }
  return out
}

/** Average rating of a bucket, or null when nothing in it was rated. */
export function bucketAverage(b: Pick<Bucket, 'ratingSum' | 'rated'> | undefined): number | null {
  return b && b.rated > 0 ? b.ratingSum / b.rated : null
}

/** Monday of the week containing `date`, as YYYY-MM-DD. */
export function weekStartKey(date: Date): string {
  const d = new Date(date)
  const dow = d.getDay()
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
  return localDateKey(d)
}

/** weekStartKey for a YYYY-MM-DD day key (read as a local date). */
export const weekOfDay = (dateKey: string) => weekStartKey(new Date(`${dateKey}T00:00:00`))

/** YYYY-MM for a YYYY-MM-DD day key. */
export const monthOfDay = (dateKey: string) => dateKey.slice(0, 7)

// ── Streak ───────────────────────────────────────────────────────────────────

/**
 * Consecutive local days with a session, ending today, or ending yesterday
 * when today has none yet (so the streak doesn't read 0 every morning).
 */
export function streakFromDays(dayKeys: Iterable<string>): number {
  const days = new Set(dayKeys)
  if (days.size === 0) return 0
  const d = new Date()
  if (!days.has(localDateKey(d))) d.setDate(d.getDate() - 1)
  let streak = 0
  while (days.has(localDateKey(d))) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

/** streakFromDays for a list of session start timestamps. */
export function calcDayStreak(sessionTimestamps: string[]): number {
  return streakFromDays(sessionTimestamps.map((t) => localDateKey(t)))
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

function bucketPoints(buckets: Map<string, Bucket>): ChartPoint[] {
  return Array.from(buckets.entries())
    .map(([date, b]) => {
      const avg = bucketAverage(b)
      return {
        date,
        rating: avg === null ? 0 : Math.round(avg * 10) / 10,
        hasRating: avg !== null,
        minutes: b.minutes,
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** One point per day. */
export function getWeekViewPoints(days: DailyTotal[]): ChartPoint[] {
  return bucketPoints(groupDays(days, (d) => d))
}

/** One point per week (Monday start). */
export function getMonthViewPoints(days: DailyTotal[]): ChartPoint[] {
  return bucketPoints(groupDays(days, weekOfDay))
}

// ── Heatmap ──────────────────────────────────────────────────────────────────

export function buildHeatmapDays(days: DailyTotal[]): Map<string, HeatmapEntry> {
  return new Map(
    days.map((d) => [
      d.date,
      {
        date: d.date,
        avgRating: d.rated > 0 ? d.rating_sum / d.rated : 0,
        minutes: d.minutes,
        count: d.rated,
      },
    ])
  )
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
