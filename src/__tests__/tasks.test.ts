import { describe, it, expect } from 'vitest'
import { taskDurations, formatTaskDuration, restoreCheckOffs } from '@/lib/tasks'

const task = (id: string, elapsed: number | null) => ({
  id,
  completedAt: elapsed === null ? null : '2026-01-01T12:00:00.000Z',
  elapsedSecondsAtCompletion: elapsed,
})

describe('taskDurations', () => {
  it('measures the first task from session start', () => {
    expect(taskDurations([task('a', 90)]).get('a')).toBe(90)
  })

  it('measures later tasks from the previous check-off', () => {
    const d = taskDurations([task('a', 60), task('b', 150)])
    expect(d.get('a')).toBe(60)
    expect(d.get('b')).toBe(90)
  })

  it('orders by check-off time, not list position', () => {
    const d = taskDurations([task('a', 200), task('b', 50)])
    expect(d.get('b')).toBe(50)
    expect(d.get('a')).toBe(150)
  })

  it('skips unfinished tasks', () => {
    const d = taskDurations([task('a', null), task('b', 30)])
    expect(d.has('a')).toBe(false)
    expect(d.get('b')).toBe(30)
  })
})

describe('formatTaskDuration', () => {
  it('formats seconds, minutes, and both', () => {
    expect(formatTaskDuration(45)).toBe('45s')
    expect(formatTaskDuration(180)).toBe('3m')
    expect(formatTaskDuration(200)).toBe('3m 20s')
  })
})

describe('restoreCheckOffs', () => {
  it('rebuilds check-off moments so resumed durations match the saved ones', () => {
    // Saved for later: "b" took 120s and was checked first, then "a" took 300s.
    const saved = [
      { id: 'a', completed_at: '2026-01-01T12:07:00Z', duration_seconds: 300 },
      { id: 'b', completed_at: '2026-01-01T12:02:00Z', duration_seconds: 120 },
      { id: 'c', completed_at: null, duration_seconds: null },
    ]
    const restored = restoreCheckOffs(saved).map((t) => ({
      id: t.id,
      completedAt: t.completed_at,
      elapsedSecondsAtCompletion: t.elapsedSecondsAtCompletion,
    }))
    expect(restored.map((t) => t.elapsedSecondsAtCompletion)).toEqual([420, 120, null])
    const durations = taskDurations(restored)
    expect(durations.get('a')).toBe(300)
    expect(durations.get('b')).toBe(120)
    expect(durations.has('c')).toBe(false)
  })
})
