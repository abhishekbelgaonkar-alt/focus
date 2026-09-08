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
  categoryId: string | null
  endReason: EndReason | null   // set by branch question on /rate when isExpired
  actualDurationMinutes: number | null  // elapsed at Done (rounded, min 1); null if expired
  isExpired: boolean            // true if planned duration passed before Done was clicked
  tasks: InProgressTask[]       // optional sub-tasks entered at setup, checked during timer
}

const KEY = 'focus_in_progress'

export function saveSession(s: InProgressSession): void {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(KEY, JSON.stringify(s))
}

export function loadSession(): InProgressSession | null {
  if (typeof window === 'undefined') return null
  const raw = sessionStorage.getItem(KEY)
  return raw ? (JSON.parse(raw) as InProgressSession) : null
}

export function clearSession(): void {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(KEY)
}
