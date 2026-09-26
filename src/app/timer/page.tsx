'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  loadSession,
  saveSession,
  clearSession,
  loadTimerState,
  saveTimerState,
  clearTimerState,
  type TimerState,
} from '@/lib/session-state'
import { getRemainingMs, formatTime, isTimerExpired, EXPIRY_GRACE_MS } from '@/lib/timer'
import { createClient } from '@/lib/supabase/client'
import { formatDuration } from '@/lib/format'
import { taskDurations, formatTaskDuration, toTaskRows, nameFromTasks } from '@/lib/tasks'
import { ErrorToast } from '@/components/ErrorToast'
import { TaskCheck } from '@/components/TaskCheck'
import type { InProgressSession } from '@/lib/session-state'

export default function TimerPage() {
  const router = useRouter()
  const supabase = createClient()
  const [session, setSession] = useState<InProgressSession | null>(null)
  const [timer, setTimer] = useState<TimerState | null>(null)
  const [displayMs, setDisplayMs] = useState(0)
  const [savingLater, setSavingLater] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // Total minutes already saved to Supabase from today's completed sessions.
  // Combines with mid-session elapsed to show a running "time banked today."
  const [todayBankedMinutes, setTodayBankedMinutes] = useState(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const s = loadSession()
    if (!s) { router.replace('/'); return }
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

    // Load today's already-banked minutes so the ticker shows a running total.
    ;(async () => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData?.user) return
      const dayStart = new Date()
      dayStart.setHours(0, 0, 0, 0)
      const { data: rows } = await supabase
        .from('sessions')
        .select('actual_duration_minutes')
        .eq('user_id', userData.user.id)
        .eq('status', 'completed')
        .gte('started_at', dayStart.toISOString())
      const sum = ((rows ?? []) as { actual_duration_minutes: number | null }[])
        .reduce((s, x) => s + (x.actual_duration_minutes ?? 0), 0)
      setTodayBankedMinutes(sum)
    })()
  }, [])

  // rAF loop reading the latest timer through a ref. It only sets state
  // when the displayed second changes, so the page re-renders once a second
  // rather than every frame.
  const timerRef = useRef<TimerState | null>(null)
  useEffect(() => { timerRef.current = timer }, [timer])
  useEffect(() => {
    let lastSecond = -1
    const loop = () => {
      const t = timerRef.current
      if (t && t.pausedAt === null) {
        const remaining = getRemainingMs(t.startedAt, t.plannedMs, null, t.totalPausedMs)
        const second = Math.ceil(remaining / 1000)
        if (second !== lastSecond) {
          lastSecond = second
          setDisplayMs(remaining)
        }
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current) }
  }, [])

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

  // Persist the session as in_progress so it can be resumed from any
  // device. Browser state is cleared only once the save has succeeded.
  const handleSaveForLater = async () => {
    if (!session || !timer || savingLater) return
    setSavingLater(true)
    setSaveError(null)

    const now = timer.pausedAt ?? Date.now()
    const elapsedSec = Math.max(0, Math.round((now - timer.startedAt - timer.totalPausedMs) / 1000))

    const { error } = await supabase.rpc('save_session', {
      p_session_id: session.existingSessionId,
      p_status: 'in_progress',
      p_goal_id: session.goalId,
      p_new_goal_name: null,
      p_session_name: session.setupFocusText ?? nameFromTasks(session.tasks),
      p_planned_minutes: session.plannedDurationMinutes,
      p_actual_minutes: null,
      p_elapsed_seconds: elapsedSec,
      p_started_at: session.startedAt,
      p_rating: null,
      p_notes: null,
      p_end_reason: null,
      p_room_id: null,
      p_tasks: toTaskRows(session.tasks),
      p_save_as_template: false,
    })
    if (error) {
      console.error('[timer] save for later failed', error)
      setSaveError("Couldn't save. Your timer is still running; try again in a moment.")
      setSavingLater(false)
      return
    }

    clearSession()
    clearTimerState()
    router.push('/')
  }

  // Compute duration a newly-checked task should record.
  // = current session elapsed - sum of already-completed tasks' elapsed values
  const toggleTask = (taskId: string) => {
    if (!session || !timer) return
    // Handler is invoked from a checkbox click, never during render.
    // eslint-disable-next-line react-hooks/purity
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
    const expired = isTimerExpired(timer.startedAt, timer.plannedMs, timer.totalPausedMs, EXPIRY_GRACE_MS)

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
          <p className="text-sm text-text-muted mb-2 font-sans">Today, you&apos;re working on</p>
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
          const stroke = isTall || isMedium ? 'var(--color-text-muted)' : 'var(--color-text-light)'
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
                  style={{ stroke: t.stroke }}
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
                transform={`rotate(${markerAngle} ${CENTER} ${CENTER})`}
                style={{
                  fill: 'var(--color-coral-soft)',
                  // Updates arrive once a second; glide between them.
                  transition: isPaused ? 'none' : 'transform 1s linear',
                }}
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
          I&apos;m done
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

      {/* Time banked today — accumulates mid-session so the reward feels real. */}
      {(() => {
        const elapsedMs = Math.max(0, timer.plannedMs - displayMs)
        const liveMinutes = todayBankedMinutes + Math.floor(elapsedMs / 60_000)
        return (
          <p className="font-sans text-xs text-text-light mt-6">
            <span className="font-numbers font-medium text-text-muted">
              {formatDuration(liveMinutes)}
            </span>{' '}
            banked today
          </p>
        )
      })()}

      {/* Task list — check off as you complete each; duration recorded per task */}
      {session.tasks.length > 0 && (() => {
        const durationById = taskDurations(session.tasks)
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
                    <TaskCheck done={done} taskName={t.name} onToggle={() => toggleTask(t.id)} />
                    <span
                      className={`flex-1 font-sans text-sm ${
                        done ? 'text-text-muted line-through' : 'text-text-primary'
                      }`}
                    >
                      {t.name}
                    </span>
                    {done && dur !== undefined && (
                      <span className="font-numbers text-xs text-text-muted shrink-0">
                        {formatTaskDuration(dur)}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })()}
      {saveError && <ErrorToast message={saveError} onDismiss={() => setSaveError(null)} />}
    </main>
  )
}
