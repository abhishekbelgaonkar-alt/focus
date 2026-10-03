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
  // Minutes already saved on the session being continued, when a room
  // continues a saved-for-later session. Added to this stint on save.
  priorMinutes?: number
}

/*
  Kept in localStorage, not sessionStorage: a running session has to
  survive the tab being closed, the phone discarding it, or the app being
  opened in a new tab. Every access is guarded, because storage can be
  unavailable (private mode, blocked site data) or full.
*/
function read<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null   // unreadable or corrupt: treat as nothing stored
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* not persisted */ }
}

function remove(key: string): void {
  if (typeof window === 'undefined') return
  try { localStorage.removeItem(key) } catch { /* ignore */ }
}

export const SESSION_KEY = 'focus_in_progress'

export const saveSession = (s: InProgressSession) => write(SESSION_KEY, s)
export const loadSession = () => read<InProgressSession>(SESSION_KEY)
export const clearSession = () => remove(SESSION_KEY)

// The solo timer's clock (pauses included), kept separately from the session
// so a resume or a page reload picks up exactly where it was.
export interface TimerState {
  startedAt: number
  plannedMs: number
  pausedAt: number | null
  totalPausedMs: number
}

export const TIMER_KEY = 'focus_timer_state'

export const loadTimerState = () => read<TimerState>(TIMER_KEY)
export const saveTimerState = (s: TimerState) => write(TIMER_KEY, s)
export const clearTimerState = () => remove(TIMER_KEY)
