import type { EndReason } from './types'

export interface InProgressTask {
  id: string                              // client-generated
  name: string
  position: number
  completedAt: string | null              // ISO timestamp when checkbox was ticked
  elapsedSecondsAtCompletion: number | null  // session elapsed (paused time excluded) at check moment
}

export interface InProgressSession {
  plannedDurationMinutes: number
  startedAt: string           // ISO timestamp set when "Start" is clicked
  setupFocusText: string | null
  goalId: string | null
  endReason: EndReason | null   // set by branch question on /rate when isExpired
  actualDurationMinutes: number | null  // elapsed at Done (rounded, min 1); null if expired
  isExpired: boolean            // true if planned duration passed before Done was clicked
  tasks: InProgressTask[]       // optional sub-tasks entered at setup, checked during timer
  existingSessionId: string | null   // set when resuming a saved-for-later session
  roomId: string | null              // set when the session was part of a shared room
}

const KEY = 'focus_in_progress'

export function saveSession(s: InProgressSession): void {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(KEY, JSON.stringify(s))
}

export function loadSession(): InProgressSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as InProgressSession) : null
  } catch {
    return null   // unreadable or corrupt: treat as no session in progress
  }
}

export function clearSession(): void {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(KEY)
}

// The solo timer's clock (pauses included), kept separately from the session
// so a resume or a page reload picks up exactly where it was.
export interface TimerState {
  startedAt: number
  plannedMs: number
  pausedAt: number | null
  totalPausedMs: number
}

const TIMER_KEY = 'focus_timer_state'

export function loadTimerState(): TimerState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(TIMER_KEY)
    return raw ? (JSON.parse(raw) as TimerState) : null
  } catch {
    return null
  }
}

export function saveTimerState(s: TimerState): void {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(TIMER_KEY, JSON.stringify(s))
}

export function clearTimerState(): void {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(TIMER_KEY)
}
