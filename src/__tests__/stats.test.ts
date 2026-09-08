import { describe, it, expect } from 'vitest'
import {
  calcDayStreak,
  getDayViewPoints,
  getWeekViewPoints,
  getMonthViewPoints,
  getRatingTierColor,
  buildHeatmapDays,
  getMonthGridDays,
  generateCSV,
} from '@/lib/stats'

const today = new Date().toISOString().slice(0, 10)
const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10)

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

  it('deduplicates dates (multiple sessions same day)', () => {
    expect(calcDayStreak([today, today, yesterday])).toBe(2)
  })
})

describe('getRatingTierColor', () => {
  it('returns the pale color for null (no session)', () => {
    expect(getRatingTierColor(null)).toBe('#f0ece2')
  })

  it.each([
    [1.0, '#f3d9bd'],
    [1.5, '#f3d9bd'],
    [2.0, '#f3d9bd'],
    [2.1, '#f0b587'],
    [3.0, '#f0b587'],
    [3.1, '#e8905a'],
    [4.0, '#e8905a'],
    [4.1, '#d9642e'],
    [5.0, '#d9642e'],
  ])('rating %f → %s', (rating, expected) => {
    expect(getRatingTierColor(rating)).toBe(expected)
  })
})

const SESSIONS = [
  { id: 'a', started_at: '2026-09-01T10:00:00Z', rating: 4.0, goals: { name: 'Study' }, session_name: 'Ch. 1' },
  { id: 'b', started_at: '2026-09-01T14:00:00Z', rating: 3.0, goals: { name: 'Study' }, session_name: null },
  { id: 'c', started_at: '2026-09-08T09:00:00Z', rating: 5.0, goals: null, session_name: 'Deep work' },
]

describe('getDayViewPoints', () => {
  it('returns one point per rated session, sorted by date', () => {
    const pts = getDayViewPoints(SESSIONS)
    expect(pts).toHaveLength(3)
    expect(pts[0].sessionId).toBe('a')
    expect(pts[0].rating).toBe(4.0)
  })

  it('skips sessions with null rating', () => {
    const withNull = [...SESSIONS, { id: 'd', started_at: '2026-09-09T10:00:00Z', rating: null, goals: null, session_name: null }]
    expect(getDayViewPoints(withNull)).toHaveLength(3)
  })
})

describe('getWeekViewPoints', () => {
  it('averages multiple sessions on the same day into one point', () => {
    const pts = getWeekViewPoints(SESSIONS)
    const sep1 = pts.find(p => p.date === '2026-09-01')
    expect(sep1).toBeDefined()
    expect(sep1!.rating).toBe(3.5)
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

describe('generateCSV', () => {
  const SESSION = {
    id: 'abc',
    session_name: 'Fix bug',
    planned_duration_minutes: 25,
    actual_duration_minutes: 25,
    started_at: '2026-09-01T10:00:00Z',
    ended_at: '2026-09-01T10:25:00Z',
    rating: 4.0,
    notes: 'It went well',
    end_reason: 'on_time' as const,
    goals: { name: 'Work' },
    categories: null,
    session_distraction_tags: [{ distraction_tags: { name: 'Phone' } }],
  }

  it('produces a CSV string with a header row and one data row', () => {
    const lines = generateCSV([SESSION]).split('\n')
    expect(lines[0]).toContain('id')
    expect(lines[0]).toContain('rating')
    expect(lines).toHaveLength(2)
  })

  it('includes tag names in the tags column', () => {
    expect(generateCSV([SESSION])).toContain('Phone')
  })

  it('escapes double-quotes inside cell values', () => {
    expect(generateCSV([{ ...SESSION, notes: 'She said "hello"' }])).toContain('She said ""hello""')
  })
})
