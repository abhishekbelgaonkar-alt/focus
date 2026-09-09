'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { loadSession, saveSession, clearSession } from '@/lib/session-state'
import { getRemainingMs, formatTime, isTimerExpired } from '@/lib/timer'
import { createClient } from '@/lib/supabase/client'
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
  const supabase = createClient()
  const [session, setSession] = useState<InProgressSession | null>(null)
  const [timer, setTimer] = useState<TimerState | null>(null)
  const [displayMs, setDisplayMs] = useState(0)
  const [savingLater, setSavingLater] = useState(false)
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

  // Extend the timer's planned duration mid-session. Applied to both the
  // browser timer state (so the countdown re-renders) and the session state
  // (so it's persisted correctly on save or save-for-later).
  const handleAddTime = (minutes: number) => {
    if (!session || !timer) return
    const nextSession = {
      ...session,
      plannedDurationMinutes: session.plannedDurationMinutes + minutes,
    }
    const nextTimer = {
      ...timer,
      plannedMs: timer.plannedMs + minutes * 60 * 1000,
    }
    setSession(nextSession)
    setTimer(nextTimer)
    saveSession(nextSession)
    saveTimerState(nextTimer)
  }

  // Persist the session as in_progress and clear browser state so the user
  // can resume from any device. If a DB row already exists (resumed session),
  // UPDATE it; otherwise INSERT a new row with status='in_progress'.
  const handleSaveForLater = async () => {
    if (!session || !timer || savingLater) return
    setSavingLater(true)

    const now = timer.pausedAt ?? Date.now()
    const elapsedSec = Math.max(
      0,
      Math.round((now - timer.startedAt - timer.totalPausedMs) / 1000)
    )

    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) { setSavingLater(false); return }

    let sessionRowId: string | null = session.existingSessionId

    // Auto-derive a name from tasks if the user gave none — matches /rate.
    const derivedName =
      session.setupFocusText ??
      (session.tasks.length > 0
        ? session.tasks.slice().sort((a, b) => a.position - b.position).map((t) => t.name).join(', ')
        : null)

    const rowPayload = {
      user_id: userData.user.id,
      goal_id: session.goalId,
      category_id: session.categoryId,
      session_name: derivedName,
      planned_duration_minutes: session.plannedDurationMinutes,
      actual_duration_minutes: null,
      started_at: session.startedAt,
      ended_at: null,
      rating: null,
      notes: null,
      end_reason: null,
      status: 'in_progress',
      elapsed_seconds: elapsedSec,
    }

    if (sessionRowId) {
      await supabase.from('sessions').update(rowPayload).eq('id', sessionRowId)
    } else {
      const { data: saved } = await supabase
        .from('sessions')
        .insert(rowPayload)
        .select('id')
        .single()
      sessionRowId = saved?.id ?? null
    }

    // Replace task rows so the current check-off state persists.
    if (sessionRowId) {
      await supabase.from('session_tasks').delete().eq('session_id', sessionRowId)
      if (session.tasks.length > 0) {
        await supabase.from('session_tasks').insert(
          session.tasks.map((t) => ({
            session_id: sessionRowId,
            name: t.name,
            position: t.position,
            completed_at: t.completedAt,
            duration_seconds: null,   // final duration only computed on conclude
          }))
        )
      }
    }

    clearSession()
    clearTimerState()
    router.push('/')
  }

  // Compute duration a newly-checked task should record.
  // = current session elapsed - sum of already-completed tasks' elapsed values
  const toggleTask = (taskId: string) => {
    if (!session || !timer) return
    const now = timer.pausedAt ?? Date.now()
    const elapsedSec = Math.max(
      0,
      Math.round((now - timer.startedAt - timer.totalPausedMs) / 1000)
    )

    const nextTasks = session.tasks.map((t) => {
      if (t.id !== taskId) return t
      if (t.completedAt) {
        // Uncheck — clear completion. Later-completed tasks keep their own
        // recorded values; those durations were correct at check time.
        return { ...t, completedAt: null, elapsedSecondsAtCompletion: null }
      }
      return {
        ...t,
        completedAt: new Date().toISOString(),
        elapsedSecondsAtCompletion: elapsedSec,
      }
    })

    const nextSession = { ...session, tasks: nextTasks }
    setSession(nextSession)
    saveSession(nextSession)
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
    <main
      className={`min-h-screen bg-cream flex flex-col items-center px-6 ${
        session.tasks.length > 0 ? 'pt-12 pb-16' : 'justify-center'
      }`}
    >
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
                x={CENTER - 1}
                y={CENTER - R_OUTER - 4}
                width={2}
                height={22}
                rx={1}
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

      {/* Secondary actions — extend timer or save for later */}
      <div className="flex justify-between items-center gap-4 w-full max-w-xs mt-4">
        <button
          onClick={() => handleAddTime(15)}
          className="font-sans text-xs text-text-muted"
        >
          + 15 min
        </button>
        <button
          onClick={handleSaveForLater}
          disabled={savingLater}
          className="font-sans text-xs text-text-muted disabled:opacity-50"
        >
          {savingLater ? 'Saving…' : 'Save & continue later'}
        </button>
      </div>

      {/* Task list — check off as you complete each; duration recorded per task */}
      {session.tasks.length > 0 && (() => {
        const sortedCompleted = [...session.tasks]
          .filter((t) => t.completedAt !== null && t.elapsedSecondsAtCompletion !== null)
          .sort((a, b) => (a.elapsedSecondsAtCompletion ?? 0) - (b.elapsedSecondsAtCompletion ?? 0))

        // Per-task duration = its elapsed - previous completed task's elapsed
        const durationById = new Map<string, number>()
        let prev = 0
        for (const t of sortedCompleted) {
          durationById.set(t.id, Math.max(0, (t.elapsedSecondsAtCompletion ?? 0) - prev))
          prev = t.elapsedSecondsAtCompletion ?? prev
        }

        const fmtDur = (sec: number) => {
          if (sec < 60) return `${sec}s`
          const m = Math.floor(sec / 60)
          const s = sec % 60
          return s === 0 ? `${m}m` : `${m}m ${s}s`
        }

        return (
          <div className="w-full max-w-sm mt-12">
            <p className="font-sans text-xs text-text-muted uppercase tracking-wide mb-3">
              Tasks
            </p>
            <ul>
              {session.tasks.map((t) => {
                const done = t.completedAt !== null
                const dur = durationById.get(t.id)
                return (
                  <li
                    key={t.id}
                    className="flex items-center gap-3 py-2.5 border-b border-border-warm last:border-0"
                  >
                    <button
                      onClick={() => toggleTask(t.id)}
                      aria-label={done ? `Uncheck ${t.name}` : `Check off ${t.name}`}
                      className={`w-5 h-5 rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-colors ${
                        done ? 'bg-coral border-coral' : 'border-border-warm bg-transparent'
                      }`}
                    >
                      {done && (
                        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                          <path
                            d="M1.5 5.5 L4 8 L8.5 2.5"
                            stroke="white"
                            strokeWidth="1.75"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </button>
                    <span
                      className={`flex-1 font-sans text-sm ${
                        done ? 'text-text-muted line-through' : 'text-text-primary'
                      }`}
                    >
                      {t.name}
                    </span>
                    {done && dur !== undefined && (
                      <span className="font-numbers text-xs text-text-muted shrink-0">
                        {fmtDur(dur)}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })()}
    </main>
  )
}
