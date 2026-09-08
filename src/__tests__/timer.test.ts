import { describe, it, expect } from 'vitest'
import {
  getRemainingMs,
  formatTime,
  isTimerExpired,
  getRatingLabel,
  getNotePlaceholder,
} from '@/lib/timer'

describe('getRemainingMs', () => {
  it('returns approximately full duration when timer just started', () => {
    const now = Date.now()
    const remaining = getRemainingMs(now, 25 * 60 * 1000, null, 0)
    expect(remaining).toBeGreaterThan(25 * 60 * 1000 - 100)
    expect(remaining).toBeLessThanOrEqual(25 * 60 * 1000)
  })

  it('decreases as time passes', () => {
    const startedAt = Date.now() - 60_000
    const remaining = getRemainingMs(startedAt, 25 * 60 * 1000, null, 0)
    expect(remaining).toBeGreaterThan(23 * 60 * 1000)
    expect(remaining).toBeLessThan(25 * 60 * 1000)
  })

  it('accounts for total paused time', () => {
    const startedAt = Date.now() - 120_000
    const withPause = getRemainingMs(startedAt, 25 * 60 * 1000, null, 60_000)
    const withoutPause = getRemainingMs(startedAt, 25 * 60 * 1000, null, 0)
    expect(withPause).toBeGreaterThan(withoutPause)
  })

  it('uses pausedAt snapshot instead of Date.now() when paused', () => {
    const startedAt = Date.now() - 120_000
    const pausedAt = Date.now() - 60_000
    const remaining = getRemainingMs(startedAt, 25 * 60 * 1000, pausedAt, 0)
    expect(remaining).toBeGreaterThan(23.5 * 60 * 1000)
    expect(remaining).toBeLessThan(24.5 * 60 * 1000)
  })

  it('never returns negative', () => {
    const startedAt = Date.now() - 30 * 60 * 1000
    expect(getRemainingMs(startedAt, 25 * 60 * 1000, null, 0)).toBe(0)
  })
})

describe('formatTime', () => {
  it('formats 0ms as 0:00', () => {
    expect(formatTime(0)).toBe('0:00')
  })

  it('formats 90 000ms as 1:30', () => {
    expect(formatTime(90_000)).toBe('1:30')
  })

  it('formats 25 minutes exactly', () => {
    expect(formatTime(25 * 60 * 1000)).toBe('25:00')
  })

  it('pads seconds below 10 with a leading zero', () => {
    expect(formatTime(65_000)).toBe('1:05')
  })
})

describe('isTimerExpired', () => {
  it('returns false when time remains', () => {
    expect(isTimerExpired(Date.now() - 10_000, 25 * 60 * 1000, 0)).toBe(false)
  })

  it('returns true when past planned duration', () => {
    expect(isTimerExpired(Date.now() - 26 * 60 * 1000, 25 * 60 * 1000, 0)).toBe(true)
  })

  it('does not count paused time toward elapsed', () => {
    expect(isTimerExpired(Date.now() - 26 * 60 * 1000, 25 * 60 * 1000, 5 * 60 * 1000)).toBe(false)
  })
})

describe('getRatingLabel', () => {
  it.each([
    [1.0, 'Rough'],
    [1.5, 'Rough'],
    [2.0, 'Distracted'],
    [2.5, 'Distracted'],
    [3.0, 'Okay'],
    [3.5, 'Okay'],
    [4.0, 'Focused'],
    [4.5, 'Focused'],
    [5.0, 'Locked in'],
  ])('rating %f → "%s"', (rating, expected) => {
    expect(getRatingLabel(rating)).toBe(expected)
  })
})

describe('getNotePlaceholder', () => {
  it.each([
    [1.0, 'What made it hard to focus at all'],
    [1.5, 'What made it hard to focus at all'],
    [2.0, 'What kept pulling your attention away'],
    [2.5, 'What kept pulling your attention away'],
    [3.0, 'What would have made this session better'],
    [3.5, 'What would have made this session better'],
    [4.0, 'What made this focused'],
    [4.5, 'What made this focused'],
    [5.0, 'What made this session click'],
  ])('rating %f → correct placeholder', (rating, expected) => {
    expect(getNotePlaceholder(rating)).toBe(expected)
  })
})
