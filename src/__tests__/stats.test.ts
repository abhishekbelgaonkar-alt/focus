import { describe, it, expect } from 'vitest'
import {
  calcDayStreak,
  getDayViewPoints,
  getWeekViewPoints,
  getMonthViewPoints,
  getRatingTierColor,
  buildHeatmapDays,
  getMonthGridDays,
} from '@/lib/stats'

const daysAgo = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}
const today = daysAgo(0)
const yesterday = daysAgo(1)
const twoDaysAgo = daysAgo(2)

describe('calcDayStreak', () => {
  it('returns 0 when no sessions', () => {
    expect(calcDayStreak([])).toBe(0)
  })

  it('returns 1 when only today has a session', () => {
    expect(calcDayStreak([today])).toBe(1)
  })

  it('counts consecutive days ending today', () => {
    expect(calcDayStreak([twoDaysAgo, yesterday, today])).toBe(3)
  })

  it('breaks at a gap', () => {
    expect(calcDayStreak([twoDaysAgo, today])).toBe(1)
  })

  it('counts back from yesterday when today has no session yet', () => {
    expect(calcDayStreak([twoDaysAgo, yesterday])).toBe(2)
  })

  it('deduplicates dates (multiple sessions same day)', () => {
    expect(calcDayStreak([today, today, yesterday])).toBe(2)
  })
})

// Colors are now CSS variable references so the heatmap/chart follow the
// active theme. Tests check the token identity, not the resolved hex.
describe('getRatingTierColor', () => {
  it('returns the "none" token for null (no session)', () => {
    expect(getRatingTierColor(null)).toBe('var(--color-heatmap-none)')
  })

  it.each([
    [1.0, 'var(--color-heatmap-low)'],
    [1.5, 'var(--color-heatmap-low)'],
    [2.0, 'var(--color-heatmap-low)'],
    [2.1, 'var(--color-heatmap-mid)'],
    [3.0, 'var(--color-heatmap-mid)'],
    [3.1, 'var(--color-heatmap-high)'],
    [4.0, 'var(--color-heatmap-high)'],
    [4.1, 'var(--color-heatmap-peak)'],
    [5.0, 'var(--color-heatmap-peak)'],
  ])('rating %f → %s', (rating, expected) => {
    expect(getRatingTierColor(rating)).toBe(expected)
  })
})

const SESSIONS = [
  { id: 'a', started_at: '2026-09-01T10:00:00Z', rating: 4.0, actual_duration_minutes: 25, goals: { name: 'Study' }, session_name: 'Ch. 1' },
  { id: 'b', started_at: '2026-09-01T14:00:00Z', rating: 3.0, actual_duration_minutes: 45, goals: { name: 'Study' }, session_name: null },
  { id: 'c', started_at: '2026-09-08T09:00:00Z', rating: 5.0, actual_duration_minutes: 50, goals: null, session_name: 'Deep work' },
]

describe('getDayViewPoints', () => {
  it('returns one point per session, sorted by date', () => {
    const pts = getDayViewPoints(SESSIONS)
    expect(pts).toHaveLength(3)
    expect(pts[0].sessionId).toBe('a')
    expect(pts[0].rating).toBe(4.0)
    expect(pts[0].minutes).toBe(25)
  })

  it('includes unrated sessions but flags them via hasRating', () => {
    const withNull = [
      ...SESSIONS,
      { id: 'd', started_at: '2026-09-09T10:00:00Z', rating: null, actual_duration_minutes: 30, goals: null, session_name: null },
    ]
    const pts = getDayViewPoints(withNull)
    expect(pts).toHaveLength(4)
    const unrated = pts.find((p) => p.sessionId === 'd')!
    expect(unrated.hasRating).toBe(false)
    expect(unrated.minutes).toBe(30)
  })
})

describe('getWeekViewPoints', () => {
  it('averages ratings and sums minutes across same-day sessions', () => {
    const pts = getWeekViewPoints(SESSIONS)
    const sep1 = pts.find(p => p.date === '2026-09-01')
    expect(sep1).toBeDefined()
    expect(sep1!.rating).toBe(3.5)
    expect(sep1!.minutes).toBe(70)  // 25 + 45
  })

  it('produces one point per unique day', () => {
    expect(getWeekViewPoints(SESSIONS)).toHaveLength(2)
  })
})

describe('getMonthViewPoints', () => {
  it('groups sessions by ISO week (Monday start) and averages', () => {
    expect(getMonthViewPoints(SESSIONS)).toHaveLength(2)
  })
})

describe('buildHeatmapDays', () => {
  it('maps each date to its average rating and count', () => {
    const map = buildHeatmapDays(SESSIONS)
    const sep1 = map.get('2026-09-01')
    expect(sep1).toBeDefined()
    expect(sep1!.count).toBe(2)
    expect(sep1!.avgRating).toBeCloseTo(3.5)
  })
})

describe('getMonthGridDays', () => {
  it('Sep 1 2026 is Tuesday — Monday slot before it is null', () => {
    const days = getMonthGridDays(2026, 8) // month 8 = September
    expect(days[0]).toBeNull()
    expect(days[1]).toBe('2026-09-01')
  })

  it('contains Sep 30', () => {
    expect(getMonthGridDays(2026, 8)).toContain('2026-09-30')
  })

  it('total cells is divisible by 7', () => {
    expect(getMonthGridDays(2026, 8).length % 7).toBe(0)
  })
})
