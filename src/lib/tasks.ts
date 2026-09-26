/*
  Per-task durations. Each completed task records the session's elapsed
  seconds at the moment it was checked; its duration is the gap since the
  previous check-off (or since the session started, for the first one).
*/

interface CheckedTask {
  id: string
  completedAt: string | null
  elapsedSecondsAtCompletion: number | null
}

/** Duration in seconds for each completed task, keyed by task id. */
export function taskDurations(tasks: CheckedTask[]): Map<string, number> {
  const completed = tasks
    .filter((t) => t.completedAt !== null && t.elapsedSecondsAtCompletion !== null)
    .sort((a, b) => a.elapsedSecondsAtCompletion! - b.elapsedSecondsAtCompletion!)
  const durations = new Map<string, number>()
  let prev = 0
  for (const t of completed) {
    durations.set(t.id, Math.max(0, t.elapsedSecondsAtCompletion! - prev))
    prev = t.elapsedSecondsAtCompletion!
  }
  return durations
}

/** "45s", "3m", "3m 20s". */
export function formatTaskDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s === 0 ? `${m}m` : `${m}m ${s}s`
}
