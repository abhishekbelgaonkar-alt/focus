'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { loadSession, saveSession } from '@/lib/session-state'
import { getRemainingMs, formatTime, isTimerExpired } from '@/lib/timer'
import type { InProgressSession } from '@/lib/session-state'

interface TimerState {
  startedAt: number
  plannedMs: number
  pausedAt: number | null
  totalPausedMs: number
}

const TIMER_KEY = 'focus_timer_state'

function loadTimerState(): TimerState | null {
  const raw = sessionStorage.getItem(TIMER_KEY)
  return raw ? (JSON.parse(raw) as TimerState) : null
}

function saveTimerState(s: TimerState): void {
  sessionStorage.setItem(TIMER_KEY, JSON.stringify(s))
}

function clearTimerState(): void {
  sessionStorage.removeItem(TIMER_KEY)
}

export default function TimerPage() {
  const router = useRouter()
  const [session, setSession] = useState<InProgressSession | null>(null)
  const [timer, setTimer] = useState<TimerState | null>(null)
  const [displayMs, setDisplayMs] = useState(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const s = loadSession()
    if (!s) { router.replace('/setup'); return }
    setSession(s)

    let t = loadTimerState()
    if (!t) {
      t = {
        startedAt: new Date(s.startedAt).getTime(),
        plannedMs: s.plannedDurationMinutes * 60 * 1000,
        pausedAt: null,
        totalPausedMs: 0,
      }
      saveTimerState(t)
    }
    setTimer(t)
    setDisplayMs(getRemainingMs(t.startedAt, t.plannedMs, t.pausedAt, t.totalPausedMs))
  }, [])

  const tick = useCallback(() => {
    setTimer((prev) => {
      if (!prev) return prev
      if (prev.pausedAt === null) {
        const remaining = getRemainingMs(prev.startedAt, prev.plannedMs, null, prev.totalPausedMs)
        setDisplayMs(remaining)
      }
      return prev
    })
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current) }
  }, [tick])

  const handlePause = () => {
    setTimer((prev) => {
      if (!prev || prev.pausedAt !== null) return prev
      const next = { ...prev, pausedAt: Date.now() }
      saveTimerState(next)
      return next
    })
  }

  const handleResume = () => {
    setTimer((prev) => {
      if (!prev || prev.pausedAt === null) return prev
      const next = {
        ...prev,
        pausedAt: null,
        totalPausedMs: prev.totalPausedMs + (Date.now() - prev.pausedAt),
      }
      saveTimerState(next)
      return next
    })
  }

  const handleDone = () => {
    if (!timer || !session) return
    const expired = isTimerExpired(timer.startedAt, timer.plannedMs, timer.totalPausedMs)

    saveSession({
      ...session,
      endReason: expired ? null : 'on_time',
      actualDurationMinutes: expired ? null : session.plannedDurationMinutes,
    })
    clearTimerState()

    router.push(expired ? '/end' : '/rate')
  }

  if (!session || !timer) return null

  const isPaused = timer.pausedAt !== null

  return (
    <main className="min-h-screen bg-cream flex flex-col items-center justify-center px-6">
      {session.setupFocusText && (
        <>
          <p className="text-sm text-text-muted mb-2 font-sans">Today, you're working on</p>
          <h1 className="text-xl font-medium text-text-primary mb-12 text-center font-sans max-w-xs">
            {session.setupFocusText}
          </h1>
        </>
      )}

      <div className="font-numbers text-8xl font-semibold text-text-primary mb-16 tabular-nums">
        {formatTime(displayMs)}
      </div>

      <div className="flex gap-4 w-full max-w-xs">
        {isPaused ? (
          <button
            onClick={handleResume}
            className="flex-1 border-[1.5px] border-coral text-coral font-sans font-medium py-3 rounded-pill"
          >
            Resume
          </button>
        ) : (
          <button
            onClick={handlePause}
            className="flex-1 border-[1.5px] border-border-warm text-text-muted font-sans font-medium py-3 rounded-pill"
          >
            Pause
          </button>
        )}
        <button
          onClick={handleDone}
          className="flex-1 bg-coral text-white font-sans font-medium py-3 rounded-pill"
        >
          I'm done
        </button>
      </div>
    </main>
  )
}
