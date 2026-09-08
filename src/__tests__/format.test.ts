import { describe, it, expect } from 'vitest'
import { formatDuration, formatDate, formatDateTime, getSnippet } from '@/lib/format'

describe('formatDuration', () => {
  it('shows minutes only when under 60', () => {
    expect(formatDuration(25)).toBe('25m')
    expect(formatDuration(1)).toBe('1m')
    expect(formatDuration(59)).toBe('59m')
  })

  it('shows hours only when evenly divisible', () => {
    expect(formatDuration(60)).toBe('1h')
    expect(formatDuration(120)).toBe('2h')
  })

  it('shows hours and minutes together', () => {
    expect(formatDuration(90)).toBe('1h 30m')
    expect(formatDuration(252)).toBe('4h 12m')
  })

  it('handles 0 minutes', () => {
    expect(formatDuration(0)).toBe('0m')
  })
})

describe('formatDate', () => {
  it('formats an ISO string to short date', () => {
    const result = formatDate('2026-09-07T14:30:00Z')
    expect(result).toMatch(/Sep/)
    expect(result).toMatch(/2026/)
  })
})

describe('formatDateTime', () => {
  it('includes both date and time', () => {
    const result = formatDateTime('2026-09-07T14:30:00Z')
    expect(result).toMatch(/Sep/)
    expect(result).toMatch(/:/)
  })
})

describe('getSnippet', () => {
  it('returns a short excerpt when match is near the start', () => {
    const text = 'Phone kept buzzing and I lost focus completely'
    const result = getSnippet(text, 'Phone')
    expect(result).toContain('Phone')
  })

  it('adds ellipsis when the match is deep inside the text', () => {
    const long = 'a'.repeat(80) + 'match' + 'b'.repeat(80)
    const result = getSnippet(long, 'match')
    expect(result).toContain('match')
    expect(result.startsWith('…')).toBe(true)
    expect(result.endsWith('…')).toBe(true)
  })

  it('falls back to first 120 chars when query is not found', () => {
    const text = 'x'.repeat(200)
    const result = getSnippet(text, 'notfound')
    expect(result.length).toBeLessThanOrEqual(124)
  })

  it('is case-insensitive', () => {
    const result = getSnippet('Started feeling tired', 'TIRED')
    expect(result).toContain('tired')
  })
})
