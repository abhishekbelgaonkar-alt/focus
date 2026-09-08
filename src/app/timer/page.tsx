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

    const sessionStartedAt = new Date(s.startedAt).getTime()
    let t = loadTimerState()
    // Discard stale timer state from a previous session — its startedAt won't match.
    if (!t || t.startedAt !== sessionStartedAt) {
      t = {
        startedAt: sessionStartedAt,
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

    // Rounded elapsed minutes (paused time excluded), floor 1. If Done was hit
    // AFTER the timer expired, we leave actualDurationMinutes null and let the
    // branch question on /rate decide the final duration.
    const elapsedMs = Date.now() - timer.startedAt - timer.totalPausedMs
    const actualMinutes = Math.max(1, Math.round(elapsedMs / 60000))

    saveSession({
      ...session,
      isExpired: expired,
      endReason: expired ? null : 'on_time',
      actualDurationMinutes: expired ? null : actualMinutes,
    })
    clearTimerState()

    router.push('/rate')
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

      {/* Circular scale + numeric countdown centered inside.
          60 tiny ticks (every 6°), 12 medium (every 30°), 4 tall at
          cardinal points — three tiers to match the ruler slider.
          A dimmer coral marker rotates clockwise from 12 o'clock as time
          depletes; it completes one full revolution when the timer expires. */}
      {(() => {
        const SIZE = 300
        const CENTER = SIZE / 2
        const R_OUTER = 138
        const elapsedFraction = 1 - displayMs / timer.plannedMs
        const markerAngle = Math.min(360, Math.max(0, elapsedFraction * 360))

        const ticks = []
        for (let i = 0; i < 60; i++) {
          const angleDeg = i * 6
          const isTall = i % 15 === 0
          const isMedium = !isTall && i % 5 === 0
          const len = isTall ? 14 : isMedium ? 9 : 5
          const stroke = isTall || isMedium ? '#b08c6a' : '#c9b79c'
          const width = isTall ? 1.5 : 1
          ticks.push({ angleDeg, len, stroke, width })
        }

        return (
          <div
            className="relative mb-16"
            style={{ width: SIZE, height: SIZE }}
          >
            <svg
              className="absolute inset-0"
              width={SIZE}
              height={SIZE}
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              aria-hidden="true"
            >
              {ticks.map((t) => (
                <line
                  key={t.angleDeg}
                  x1={CENTER}
                  y1={CENTER - R_OUTER}
                  x2={CENTER}
                  y2={CENTER - R_OUTER + t.len}
                  stroke={t.stroke}
                  strokeWidth={t.width}
                  transform={`rotate(${t.angleDeg} ${CENTER} ${CENTER})`}
                />
              ))}
              {/* Rotating marker — thin vertical coral bar at 12 o'clock, rotated by elapsed angle */}
              <rect
                x={CENTER - 2}
                y={CENTER - R_OUTER - 4}
                width={4}
                height={22}
                rx={1.5}
                fill="#e8905a"
                transform={`rotate(${markerAngle} ${CENTER} ${CENTER})`}
                style={{ transition: isPaused ? 'none' : 'transform 100ms linear' }}
              />
            </svg>

            {/* Numeric countdown centered inside the ring */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-numbers text-7xl font-semibold text-text-primary tabular-nums">
                {formatTime(displayMs)}
              </span>
            </div>
          </div>
        )
      })()}

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
