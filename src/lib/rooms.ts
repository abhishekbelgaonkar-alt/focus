/*
  Time math for rooms. Each participant runs their own personal timer:
    * Elapsed = now - joined_at
    * Remaining = planned_duration_minutes - elapsed (can go negative in overtime)

  Room-time is a separate ambient value: now - room.started_at, shown as
  "Room started X min ago" in the header.

  All values are computed from server-issued timestamps, so client clock
  drift is never an issue. The client just diffs against Date.now().
*/

const MS_PER_MIN = 60_000
const MS_PER_SEC = 1_000

/** Elapsed minutes since a participant joined. Never negative. */
export function elapsedMinutes(joinedAtIso: string, nowMs = Date.now()): number {
  const joinedMs = new Date(joinedAtIso).getTime()
  return Math.max(0, Math.floor((nowMs - joinedMs) / MS_PER_MIN))
}

/** Elapsed seconds since a participant joined. Never negative. */
export function elapsedSeconds(joinedAtIso: string, nowMs = Date.now()): number {
  const joinedMs = new Date(joinedAtIso).getTime()
  return Math.max(0, Math.floor((nowMs - joinedMs) / MS_PER_SEC))
}

/**
 * Remaining minutes for a participant given their joined_at and the room's
 * planned duration. Positive = countdown, negative = overtime.
 */
export function remainingMinutes(
  joinedAtIso: string,
  plannedDurationMinutes: number,
  nowMs = Date.now()
): number {
  const joinedMs = new Date(joinedAtIso).getTime()
  const elapsedMs = nowMs - joinedMs
  const plannedMs = plannedDurationMinutes * MS_PER_MIN
  return Math.floor((plannedMs - elapsedMs) / MS_PER_MIN)
}

/** True when the participant's timer has passed the planned duration. */
export function isInOvertime(
  joinedAtIso: string,
  plannedDurationMinutes: number,
  nowMs = Date.now()
): boolean {
  return remainingMinutes(joinedAtIso, plannedDurationMinutes, nowMs) < 0
}

/**
 * Formats a duration in minutes into a compact human string.
 * Under an hour: "42m". Over: "1h 23m". Zero: "0m".
 */
export function formatMinutesShort(minutes: number): string {
  const abs = Math.abs(minutes)
  if (abs < 60) return `${abs}m`
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/**
 * Formats a participant's status for display in the participant list.
 * Returns something like "25m in, 10m left" or "25m in, +5m over".
 */
export function formatParticipantStatus(
  joinedAtIso: string,
  plannedDurationMinutes: number,
  nowMs = Date.now()
): string {
  const elapsed = elapsedMinutes(joinedAtIso, nowMs)
  const remaining = remainingMinutes(joinedAtIso, plannedDurationMinutes, nowMs)
  const elapsedStr = formatMinutesShort(elapsed)
  if (remaining >= 0) {
    return `${elapsedStr} in, ${formatMinutesShort(remaining)} left`
  }
  return `${elapsedStr} in, +${formatMinutesShort(-remaining)} over`
}

/**
 * A "target end time" for a participant, expressed as an ISO string. Used
 * for the sync ("Stay with") feature: syncing to a participant sets your
 * own target end time to theirs.
 */
export function participantTargetEndIso(
  joinedAtIso: string,
  plannedDurationMinutes: number
): string {
  const joinedMs = new Date(joinedAtIso).getTime()
  return new Date(joinedMs + plannedDurationMinutes * MS_PER_MIN).toISOString()
}

/**
 * Given a target end ISO and the current user's joined_at, compute the
 * effective planned_duration_minutes so their timer will end at that
 * target. Used after a sync to override the user's local target.
 */
export function effectiveDurationForTarget(
  joinedAtIso: string,
  targetEndIso: string
): number {
  const joinedMs = new Date(joinedAtIso).getTime()
  const targetMs = new Date(targetEndIso).getTime()
  return Math.max(0, Math.floor((targetMs - joinedMs) / MS_PER_MIN))
}
