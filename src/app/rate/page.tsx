'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { loadSession, clearSession } from '@/lib/session-state'
import { createClient } from '@/lib/supabase/client'
import { RatingForm } from '@/components/RatingForm'
import { AccountNudge } from '@/components/AccountNudge'
import { ErrorToast } from '@/components/ErrorToast'
import { formatDuration } from '@/lib/format'
import { taskDurations, formatTaskDuration, toTaskRows, nameFromTasks } from '@/lib/tasks'
import { togetherTime } from '@/lib/rooms'
import { getRatingLabel } from '@/lib/timer'
import type { InProgressSession } from '@/lib/session-state'
import type { EndReason } from '@/lib/types'
import type { RatingFormData, GoalOption } from '@/components/RatingForm'

const BRANCH_OPTIONS: { reason: EndReason; label: string }[] = [
  { reason: 'still_focused',  label: "I was still deep in focus, didn't notice" },
  { reason: 'distracted',     label: 'I got distracted and lost track of time' },
  { reason: 'forgot_to_end',  label: 'I finished early and forgot to end it' },
  { reason: 'other',          label: 'Something else' },
]

export default function RatePage() {
  const router = useRouter()
  const supabase = createClient()
  const [session, setSession] = useState<InProgressSession | null>(null)
  const [goalOptions, setGoalOptions] = useState<GoalOption[]>([])
  // Prior accumulation on the goal this session belongs to. Rendered next to
  // the completion hero so users see today's session in the context of the
  // arc it's part of — the "feel good looking back at the hours" ethic.
  const [goalContext, setGoalContext] = useState<{
    goalId: string
    name: string
    priorMinutes: number
  } | null>(null)
  // Room co-participants (excludes self). Populated only when the session
  // came from a room. `friendStatus` is 'none' | 'pending' | 'friends' | 'self'.
  const [roomMates, setRoomMates] = useState<
    Array<{ userId: string; handle: string; friendStatus: 'none' | 'pending' | 'friends' }>
  >([])
  const [sharedMinutes, setSharedMinutes] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState<number | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Branch state — only relevant when session.isExpired is true
  const [branchReason, setBranchReason] = useState<EndReason | null>(null)
  const [stillFocusedMinutes, setStillFocusedMinutes] = useState<string>('')

  // Save this session's shape as a reusable quick-start template.
  const [saveAsTemplate, setSaveAsTemplate] = useState(false)

  // Per-task ratings (0-5, whole numbers). Only set when the user taps a pip.
  const [taskRatings, setTaskRatings] = useState<Map<string, number>>(new Map())
  const setTaskRating = (taskId: string, rating: number | null) => {
    setTaskRatings((prev) => {
      const next = new Map(prev)
      if (rating === null) next.delete(taskId)
      else next.set(taskId, rating)
      return next
    })
  }
  const aggregateRating: number | null = (() => {
    if (taskRatings.size === 0) return null
    const vals = Array.from(taskRatings.values())
    return vals.reduce((a, b) => a + b, 0) / vals.length
  })()

  useEffect(() => {
    const s = loadSession()
    if (!s) { router.replace('/'); return }
    setSession(s)

    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const { data: g } = await supabase
        .from('goals').select('id, name').eq('user_id', data.user.id).order('name')
      setGoalOptions((g ?? []) as GoalOption[])

      // If this session is attached to a goal, load prior-session totals for
      // that goal so we can render the accumulated context on the Rate page.
      // Excludes the current session (it hasn't been saved yet); the display
      // combines prior + current at render time.
      if (s.goalId) {
        const goalRow = (g ?? []).find((x) => x.id === s.goalId)
        if (goalRow) {
          const { data: prior } = await supabase
            .from('sessions')
            .select('actual_duration_minutes')
            .eq('user_id', data.user.id)
            .eq('goal_id', s.goalId)
            .eq('status', 'completed')
          const priorMinutes = ((prior ?? []) as { actual_duration_minutes: number | null }[])
            .reduce((sum, r) => sum + (r.actual_duration_minutes ?? 0), 0)
          setGoalContext({ goalId: s.goalId, name: goalRow.name, priorMinutes })
        }
      }

      // Room context: who you actually overlapped with, and for how long,
      // plus an add-as-friend prompt for each of them.
      if (s.roomId) {
        const myId = data.user.id
        const { data: partRows } = await supabase
          .from('room_participants')
          .select('user_id, joined_at, left_at')
          .eq('room_id', s.roomId)
        const others = ((partRows ?? []) as Array<{
          user_id: string
          joined_at: string
          left_at: string | null
        }>).filter((r) => r.user_id !== myId)

        const now = Date.now()
        const { minutes, overlapped } = togetherTime(
          { startMs: new Date(s.startedAt).getTime(), endMs: now },
          others.map((r) => ({
            startMs: new Date(r.joined_at).getTime(),
            endMs: r.left_at ? new Date(r.left_at).getTime() : now,
          }))
        )
        const otherIds = others.filter((_, i) => overlapped[i]).map((r) => r.user_id)
        setSharedMinutes(minutes)

        if (otherIds.length > 0) {
          const [{ data: profiles }, { data: friendships }, { data: requests }] = await Promise.all([
            supabase.from('user_profiles').select('user_id, handle').in('user_id', otherIds),
            supabase
              .from('friendships')
              .select('user_a_id, user_b_id')
              .or(`user_a_id.eq.${myId},user_b_id.eq.${myId}`),
            supabase
              .from('friend_requests')
              .select('from_user_id, to_user_id')
              .or(`from_user_id.eq.${myId},to_user_id.eq.${myId}`),
          ])
          const friendIds = new Set<string>()
          ;((friendships ?? []) as Array<{ user_a_id: string; user_b_id: string }>).forEach((f) => {
            friendIds.add(f.user_a_id === myId ? f.user_b_id : f.user_a_id)
          })
          const pendingIds = new Set<string>()
          ;((requests ?? []) as Array<{ from_user_id: string; to_user_id: string }>).forEach((r) => {
            pendingIds.add(r.from_user_id === myId ? r.to_user_id : r.from_user_id)
          })
          const profileMap = new Map(
            ((profiles ?? []) as Array<{ user_id: string; handle: string }>).map((p) => [p.user_id, p.handle])
          )
          setRoomMates(
            otherIds.map((uid) => ({
              userId: uid,
              handle: profileMap.get(uid) ?? 'someone',
              friendStatus: friendIds.has(uid)
                ? 'friends'
                : pendingIds.has(uid)
                  ? 'pending'
                  : 'none',
            }))
          )
        }
      }
    })
  }, [])

  const sendFriendRequest = async (toUserId: string) => {
    const { data, error } = await supabase.rpc('send_friend_request_to_roommate', { p_to: toUserId })
    if (!error && (data === 'sent' || data === 'already_requested')) {
      setRoomMates((prev) =>
        prev.map((m) => (m.userId === toUserId ? { ...m, friendStatus: 'pending' } : m))
      )
    }
  }

  // Derives the final logged duration based on branch answer (if expired)
  // or the elapsed minutes captured at Done (if not expired).
  const resolveActualMinutes = (): number => {
    if (!session) return 0
    if (!session.isExpired) {
      return session.actualDurationMinutes ?? session.plannedDurationMinutes
    }
    if (branchReason === 'still_focused' && stillFocusedMinutes.trim()) {
      return Math.max(1, parseInt(stillFocusedMinutes) || session.plannedDurationMinutes)
    }
    // distracted / forgot / other → default to planned
    return session.plannedDurationMinutes
  }

  const handleSave = async (form: RatingFormData) => {
    if (!session) return
    setSaving(true)
    setErrorMsg(null)

    // If any tasks were rated, the session's rating is their average
    // (one decimal). Otherwise the form slider's value.
    const finalRating =
      aggregateRating !== null ? Math.round(aggregateRating * 10) / 10 : form.rating

    // One call saves the session, its tasks, a new goal, the quick start,
    // and the room link together, or none of them.
    const { error } = await supabase.rpc('save_session', {
      p_session_id: session.existingSessionId,
      p_status: 'completed',
      p_goal_id: session.goalId ?? form.existingGoalId,
      p_new_goal_name: form.goalText,
      p_session_name: form.sessionName.trim() || nameFromTasks(session.tasks),
      p_planned_minutes: session.plannedDurationMinutes,
      p_actual_minutes: resolveActualMinutes(),
      p_elapsed_seconds: null,
      p_started_at: session.startedAt,
      p_rating: finalRating,
      p_notes: form.notes.trim(),
      p_end_reason: session.isExpired ? branchReason : session.endReason,
      p_room_id: session.roomId,
      p_tasks: toTaskRows(session.tasks, taskRatings),
      p_save_as_template: saveAsTemplate,
    })
    if (error) {
      console.error('[save] save_session failed', error)
      setErrorMsg("Couldn't save your session. Check your connection and try again.")
      setSaving(false)
      return
    }

    clearSession()

    const { data: userData } = await supabase.auth.getUser()
    const { count } = await supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userData.user?.id ?? '')
      .eq('status', 'completed')

    const c = count ?? 0
    let nudgeEnabled = true
    try { nudgeEnabled = localStorage.getItem('focus_nudge_enabled') !== 'false' } catch { /* default on */ }
    if (nudgeEnabled && userData.user?.is_anonymous && (c === 1 || c % 5 === 0)) {
      setSavedCount(c)
    } else {
      router.push('/')
    }
  }

  if (!session) return null

  const taskDurationById = taskDurations(session.tasks)

  const header = (
    <div>
      {/* Session-complete hero — the warm sentence is the primary anchor,
          duration is the supporting fact. Same emotional register for a
          2-minute session as a 4-hour one, because the identity is that
          any amount counts. */}
      <p className="font-sans text-2xl font-medium text-text-primary leading-tight">
        You showed up.
      </p>
      <p className="font-sans text-sm text-text-muted mt-1">
        {session.isExpired && branchReason === null
          ? `Planned ${formatDuration(session.plannedDurationMinutes)}.`
          : `${formatDuration(resolveActualMinutes())} banked.`}
      </p>

      {/* Room context — the "you weren't alone" note. Shown just under the
          duration and above the goal accumulation, because a shared session
          is the emotional anchor of the recap. */}
      {session.roomId && roomMates.length > 0 && (
        <div className="mt-4">
          <p className="font-sans text-sm text-text-primary">
            You focused with{' '}
            <span className="font-medium">
              {roomMates.map((m) => m.handle).join(', ')}
            </span>
            {sharedMinutes !== null && (
              <span className="text-text-muted"> for {formatDuration(sharedMinutes)}.</span>
            )}
          </p>
          <div className="mt-3 flex flex-col gap-1.5">
            {roomMates
              .filter((m) => m.friendStatus !== 'friends')
              .map((m) => (
                <div key={m.userId} className="flex items-center justify-between">
                  <span className="font-sans text-xs text-text-muted">{m.handle}</span>
                  {m.friendStatus === 'pending' ? (
                    <span className="font-sans text-xs text-text-light">Request pending</span>
                  ) : (
                    <button
                      onClick={() => sendFriendRequest(m.userId)}
                      className="font-sans text-xs text-coral"
                    >
                      Add as friend
                    </button>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Goal accumulation — puts today's session in the arc of an ongoing
          goal. Only shown when a goal is attached at start (not for sessions
          being retroactively grouped via the form below). */}
      {goalContext && (
        <button
          onClick={() => router.push(`/goals/${goalContext.goalId}`)}
          className="mt-4 text-left w-full"
        >
          <p className="font-sans text-xs text-text-muted">
            Your <span className="text-text-primary font-medium">{goalContext.name}</span> time:{' '}
            <span className="text-text-primary font-medium font-numbers">
              {formatDuration(goalContext.priorMinutes + resolveActualMinutes())}
            </span>
          </p>
        </button>
      )}

      {session.isExpired && (
        <div className="mt-6 p-4 border border-border-warm rounded-xl">
          <p className="font-sans text-sm font-medium text-text-primary mb-1">
            Your timer ended a while ago.
          </p>
          <p className="font-sans text-sm text-text-muted mb-4">What happened?</p>

          <div className="flex flex-col gap-2 mb-2">
            {BRANCH_OPTIONS.map((opt) => (
              <button
                key={opt.reason}
                onClick={() => setBranchReason(opt.reason)}
                className={`w-full text-left px-4 py-2.5 rounded-pill border-[1.5px] font-sans text-sm ${
                  branchReason === opt.reason
                    ? 'bg-coral-light border-coral text-tag-text'
                    : 'bg-transparent border-border-warm text-text-primary'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {branchReason === 'still_focused' && (
            <div className="mt-4">
              <label className="block font-sans text-xs text-text-muted mb-2">
                How long do you think you actually focused for?
              </label>
              <div className="flex items-baseline gap-2">
                <input
                  type="number"
                  value={stillFocusedMinutes}
                  onChange={(e) => setStillFocusedMinutes(e.target.value)}
                  placeholder={String(session.plannedDurationMinutes)}
                  min={1}
                  max={600}
                  className="w-24 bg-transparent border-b border-border-warm pb-1 font-numbers text-2xl text-text-primary focus:outline-none focus:border-coral"
                />
                <span className="font-sans text-text-muted text-sm">min</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Per-task rating pips. When any task is rated, the aggregate replaces
          the session-wide rating slider. Untouched pips just sit as ambient
          dots — no interaction required to save. */}
      {session.tasks.length > 0 && (
        <div className="mt-6">
          {aggregateRating !== null && (
            <div className="mb-4">
              <p className="font-sans text-sm text-text-muted mb-0.5">
                {getRatingLabel(aggregateRating)}
              </p>
              <p className="font-numbers text-4xl font-semibold text-text-primary">
                {aggregateRating.toFixed(1)}
                <span className="text-text-light text-lg font-normal">/5</span>
              </p>
              <p className="font-sans text-xs text-text-light mt-1">
                Session score, averaged from the tasks you rated
              </p>
            </div>
          )}

          <p className="font-sans text-xs text-text-muted uppercase tracking-wide mb-3">
            Tasks (rate them individually, optional)
          </p>
          <ul>
            {session.tasks.map((t) => {
              const done = t.completedAt !== null
              const sec = taskDurationById.get(t.id)
              const dur = sec === undefined ? null : formatTaskDuration(sec)
              const current = taskRatings.get(t.id) ?? null
              return (
                <li
                  key={t.id}
                  className="py-2.5 border-b border-border-warm last:border-0"
                >
                  <div className="flex items-baseline gap-3 mb-1.5">
                    <span
                      className={`flex-1 font-sans text-sm ${
                        done ? 'text-text-primary' : 'text-text-muted'
                      }`}
                    >
                      {t.name}
                    </span>
                    {done && dur ? (
                      <span className="font-numbers text-xs text-text-muted shrink-0">
                        {dur}
                      </span>
                    ) : !done ? (
                      <span className="font-sans text-xs text-text-light shrink-0">
                        unfinished
                      </span>
                    ) : null}
                  </div>
                  <div className="flex gap-1.5">
                    {[0, 1, 2, 3, 4, 5].map((n) => {
                      const isSelected = current === n
                      return (
                        <button
                          key={n}
                          onClick={() => setTaskRating(t.id, isSelected ? null : n)}
                          aria-label={`Rate ${t.name} ${n} of 5`}
                          className={`w-6 h-6 rounded-full text-xs font-numbers flex items-center justify-center transition-colors ${
                            isSelected
                              ? 'bg-coral text-white'
                              : 'border border-border-warm text-text-light'
                          }`}
                        >
                          {n}
                        </button>
                      )
                    })}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )

  return (
    <>
      <RatingForm
        initialSessionName={session.setupFocusText ?? ''}
        focusText={session.setupFocusText}
        onSave={handleSave}
        saving={saving}
        showGoalPrompt={!session.goalId}
        goalOptions={goalOptions}
        header={header}
        saveDisabled={session.isExpired && branchReason === null}
        hideSessionRating={aggregateRating !== null}
        footer={
          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={saveAsTemplate}
              onChange={(e) => setSaveAsTemplate(e.target.checked)}
              className="mt-0.5 accent-coral"
            />
            <span className="font-sans text-xs text-text-muted">
              Save this as a <strong className="text-text-primary font-medium">quick start</strong>. It’ll appear on the home page so you can run this exact session shape (name, tasks, duration, goal) again in one tap.
            </span>
          </label>
        }
      />
      {errorMsg && (
        <ErrorToast message={errorMsg} />
      )}
      {savedCount !== null && (
        <AccountNudge
          sessionCount={savedCount}
          onDismiss={() => router.push('/')}
        />
      )}
    </>
  )
}
