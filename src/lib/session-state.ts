import type { EndReason } from './types'

export interface InProgressSession {
  plannedDurationMinutes: number
  startedAt: string           // ISO timestamp set when "Start" is clicked
  setupFocusText: string | null
  goalId: string | null
  categoryId: string | null
  endReason: EndReason | null  // set by /end screen
  actualDurationMinutes: number | null // set by /end screen (still_focused path)
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
