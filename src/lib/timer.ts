export function getRemainingMs(
  startedAt: number,
  plannedMs: number,
  pausedAt: number | null,
  totalPausedMs: number
): number {
  const effectiveNow = pausedAt ?? Date.now()
  const elapsed = effectiveNow - startedAt - totalPausedMs
  return Math.max(0, plannedMs - elapsed)
}

export function formatTime(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

// Pressing Done within this long after the timer hits zero still counts as
// finishing on time; only a later Done asks "what happened?".
export const EXPIRY_GRACE_MS = 2 * 60 * 1000

export function isTimerExpired(
  startedAt: number,
  plannedMs: number,
  totalPausedMs: number,
  graceMs = 0
): boolean {
  return Date.now() - startedAt - totalPausedMs >= plannedMs + graceMs
}

// Mood-language anchors for the session slider. These describe how the
// session felt rather than grading it — the identity rejects quality-based
// framing, so "scattered" is a state, not a verdict.
export function getRatingLabel(rating: number): string {
  const labels: Record<number, string> = {
    0: '',
    1: 'scattered',
    2: 'choppy',
    3: 'steady',
    4: 'focused',
    5: 'flowing',
  }
  return labels[Math.floor(rating)] ?? ''
}

// A single universal placeholder for the notes textarea. Softly names
// distractions as one thing the user might write about, without demanding
// it. Also invites wins and stray thoughts — anything future-you might
// want to search for.
export function getNotePlaceholder(): string {
  return 'wins, hiccups, thoughts, anything future-you might wanna find'
}
