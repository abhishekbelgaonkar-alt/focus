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

export function isTimerExpired(
  startedAt: number,
  plannedMs: number,
  totalPausedMs: number
): boolean {
  return Date.now() - startedAt - totalPausedMs >= plannedMs
}

export function getRatingLabel(rating: number): string {
  const labels: Record<number, string> = {
    0: 'None',
    1: 'Rough',
    2: 'Distracted',
    3: 'Okay',
    4: 'Focused',
    5: 'Locked in',
  }
  return labels[Math.floor(rating)] ?? ''
}

export function getNotePlaceholder(rating: number): string {
  if (rating <= 1.5) return 'What made it hard to focus at all'
  if (rating <= 2.5) return 'What kept pulling your attention away'
  if (rating <= 3.5) return 'What would have made this session better'
  if (rating <= 4.5) return 'What made this focused'
  return 'What made this session click'
}
