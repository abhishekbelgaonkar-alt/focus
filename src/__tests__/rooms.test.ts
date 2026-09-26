import { describe, it, expect } from 'vitest'
import {
  elapsedMinutes,
  elapsedSeconds,
  remainingMinutes,
  isInOvertime,
  formatParticipantStatus,
  participantTargetEndIso,
  effectiveDurationForTarget,
  plannedMinutesFor,
  togetherTime,
} from '../lib/rooms'

/*
  Personal-clock math for rooms. All values derive from server-issued
  timestamps + client Date.now(), so we test with pinned nowMs and joined
  ISO strings to keep results deterministic.
*/

const JOINED = '2026-01-01T12:00:00.000Z'
const joinedMs = new Date(JOINED).getTime()

describe('elapsedMinutes', () => {
  it('is 0 exactly at joined_at', () => {
    expect(elapsedMinutes(JOINED, joinedMs)).toBe(0)
  })

  it('floors down to whole minutes', () => {
    expect(elapsedMinutes(JOINED, joinedMs + 59_000)).toBe(0)
    expect(elapsedMinutes(JOINED, joinedMs + 60_000)).toBe(1)
    expect(elapsedMinutes(JOINED, joinedMs + 25 * 60_000)).toBe(25)
  })

  it('never returns a negative value even if clock is skewed backwards', () => {
    expect(elapsedMinutes(JOINED, joinedMs - 5000)).toBe(0)
  })
})

describe('elapsedSeconds', () => {
  it('floors down to whole seconds', () => {
    expect(elapsedSeconds(JOINED, joinedMs + 999)).toBe(0)
    expect(elapsedSeconds(JOINED, joinedMs + 1000)).toBe(1)
    expect(elapsedSeconds(JOINED, joinedMs + 3700)).toBe(3)
  })

  it('clamps at zero for backwards skew', () => {
    expect(elapsedSeconds(JOINED, joinedMs - 5000)).toBe(0)
  })
})

describe('remainingMinutes', () => {
  it('equals planned duration at joined_at', () => {
    expect(remainingMinutes(JOINED, 25, joinedMs)).toBe(25)
  })

  it('counts down as time passes', () => {
    expect(remainingMinutes(JOINED, 25, joinedMs + 10 * 60_000)).toBe(15)
  })

  it('goes negative in overtime', () => {
    // 30m in on a 25m plan => -5
    expect(remainingMinutes(JOINED, 25, joinedMs + 30 * 60_000)).toBe(-5)
  })

  it('handles zero planned duration', () => {
    expect(remainingMinutes(JOINED, 0, joinedMs)).toBe(0)
    expect(remainingMinutes(JOINED, 0, joinedMs + 60_000)).toBe(-1)
  })
})

describe('isInOvertime', () => {
  it('is false before the target', () => {
    expect(isInOvertime(JOINED, 25, joinedMs + 24 * 60_000)).toBe(false)
  })

  it('is false exactly at the target', () => {
    // remaining === 0 → not overtime yet by the strict-negative rule
    expect(isInOvertime(JOINED, 25, joinedMs + 25 * 60_000)).toBe(false)
  })

  it('is true past the target', () => {
    expect(isInOvertime(JOINED, 25, joinedMs + 26 * 60_000)).toBe(true)
  })
})

describe('formatParticipantStatus', () => {
  it('shows elapsed + remaining before target', () => {
    expect(formatParticipantStatus(JOINED, 25, joinedMs + 10 * 60_000))
      .toBe('10m in, 15m left')
  })

  it('shows elapsed + overtime after target', () => {
    expect(formatParticipantStatus(JOINED, 25, joinedMs + 30 * 60_000))
      .toBe('30m in, +5m over')
  })

  it('handles the exact-target boundary as "left" (not overtime)', () => {
    expect(formatParticipantStatus(JOINED, 25, joinedMs + 25 * 60_000))
      .toBe('25m in, 0m left')
  })
})

describe('participantTargetEndIso', () => {
  it('is joined_at + planned duration', () => {
    expect(participantTargetEndIso(JOINED, 25))
      .toBe(new Date(joinedMs + 25 * 60_000).toISOString())
  })

  it('handles zero duration', () => {
    expect(participantTargetEndIso(JOINED, 0)).toBe(JOINED)
  })
})

describe('effectiveDurationForTarget', () => {
  it('round-trips with participantTargetEndIso', () => {
    const target = participantTargetEndIso(JOINED, 25)
    expect(effectiveDurationForTarget(JOINED, target)).toBe(25)
  })

  it('is zero when target equals joined_at', () => {
    expect(effectiveDurationForTarget(JOINED, JOINED)).toBe(0)
  })

  it('clamps to zero for a past target (skew guard)', () => {
    const past = new Date(joinedMs - 5 * 60_000).toISOString()
    expect(effectiveDurationForTarget(JOINED, past)).toBe(0)
  })

  it('supports syncing to a later participant', () => {
    // I joined at 12:00 with a 20-min plan (target 12:20). Someone else's
    // target is 12:35. Syncing should bump my effective duration to 35.
    const laterTarget = new Date(joinedMs + 35 * 60_000).toISOString()
    expect(effectiveDurationForTarget(JOINED, laterTarget)).toBe(35)
  })
})

describe('plannedMinutesFor', () => {
  it('uses the room duration without a personal target', () => {
    expect(plannedMinutesFor(JOINED, 25, null)).toBe(25)
  })

  it('uses the personal target when set', () => {
    const target = new Date(joinedMs + 40 * 60_000).toISOString()
    expect(plannedMinutesFor(JOINED, 25, target)).toBe(40)
  })
})

describe('togetherTime', () => {
  const min = (m: number) => joinedMs + m * 60_000
  const mine = { startMs: min(0), endMs: min(60) }

  it('counts only time that overlaps mine', () => {
    const r = togetherTime(mine, [{ startMs: min(-30), endMs: min(20) }])
    expect(r.minutes).toBe(20)
    expect(r.overlapped).toEqual([true])
  })

  it('does not double-count people who were there at the same time', () => {
    const r = togetherTime(mine, [
      { startMs: min(10), endMs: min(30) },
      { startMs: min(20), endMs: min(40) },
    ])
    expect(r.minutes).toBe(30)
  })

  it('adds up separate stretches', () => {
    const r = togetherTime(mine, [
      { startMs: min(0), endMs: min(10) },
      { startMs: min(50), endMs: min(70) },
    ])
    expect(r.minutes).toBe(20)
  })

  it('excludes someone who left before I arrived', () => {
    const r = togetherTime(mine, [{ startMs: min(-40), endMs: min(-5) }])
    expect(r.minutes).toBe(0)
    expect(r.overlapped).toEqual([false])
  })
})
