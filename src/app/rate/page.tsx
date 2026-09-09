'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { loadSession, clearSession } from '@/lib/session-state'
import { createClient } from '@/lib/supabase/client'
import { RatingForm } from '@/components/RatingForm'
import { AccountNudge } from '@/components/AccountNudge'
import { formatDuration } from '@/lib/format'
import { getRatingLabel } from '@/lib/timer'
import type { InProgressSession } from '@/lib/session-state'
import type { DistractionTag, EndReason } from '@/lib/types'
import type { RatingFormData, GoalOption } from '@/components/RatingForm'

const BRANCH_OPTIONS: { reason: EndReason; label: string }[] = [
  { reason: 'still_focused',  label: "I was still deep in focus — didn't notice" },
  { reason: 'distracted',     label: 'I got distracted and lost track of time' },
  { reason: 'forgot_to_end',  label: 'I finished early and forgot to end it' },
  { reason: 'other',          label: 'Something else' },
]

export default function RatePage() {
  const router = useRouter()
  const supabase = createClient()
  const [session, setSession] = useState<InProgressSession | null>(null)
  const [tags, setTags] = useState<DistractionTag[]>([])
  const [goalOptions, setGoalOptions] = useState<GoalOption[]>([])
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState<number | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Branch state — only relevant when session.isExpired is true
  const [branchReason, setBranchReason] = useState<EndReason | null>(null)
  const [stillFocusedMinutes, setStillFocusedMinutes] = useState<string>('')

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
    if (!s) { router.replace('/setup'); return }
    setSession(s)

    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const [{ data: t }, { data: g }, { data: c }] = await Promise.all([
        supabase.from('distraction_tags').select('*').order('created_at'),
        supabase.from('goals').select('id, name').eq('user_id', data.user.id).order('name'),
        supabase.from('categories').select('id, name').eq('user_id', data.user.id).order('name'),
      ])
      setTags((t ?? []) as DistractionTag[])
      const opts: GoalOption[] = [
        ...((g ?? []) as { id: string; name: string }[]).map((x) => ({ ...x, type: 'goal' as const })),
        ...((c ?? []) as { id: string; name: string }[]).map((x) => ({ ...x, type: 'category' as const })),
      ]
      setGoalOptions(opts)
    })
  }, [])

  const handleAddTag = async (name: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: newTag } = await supabase
      .from('distraction_tags')
      .insert({ user_id: user.id, name })
      .select()
      .single()
    if (newTag) setTags((prev) => [...prev, newTag as DistractionTag])
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

    const { data: userData, error: userErr } = await supabase.auth.getUser()
    const user = userData?.user
    if (userErr || !user) {
      console.error('[save] no authenticated user', userErr)
      setErrorMsg(
        `Not signed in. ${userErr?.message ?? 'Anonymous sign-in may not be enabled in Supabase, or the network call failed.'}`
      )
      setSaving(false)
      return
    }

    let goalId = session.goalId ?? form.existingGoalId
    const categoryId = session.categoryId ?? form.existingCategoryId

    if (!goalId && !categoryId && form.goalText.trim()) {
      const { data: newGoal, error: goalErr } = await supabase
        .from('goals')
        .insert({ user_id: user.id, name: form.goalText.trim() })
        .select()
        .single()
      if (goalErr) {
        console.error('[save] goal insert failed', goalErr)
        setErrorMsg(`Couldn't create goal: ${goalErr.message}`)
        setSaving(false)
        return
      }
      goalId = newGoal?.id ?? null
    }

    const finalActual = resolveActualMinutes()
    const finalEndReason = session.isExpired ? branchReason : session.endReason

    // If the user didn't name the session but added tasks, use the task names
    // as the session's default title (comma-joined, in entry order).
    const typedName = form.sessionName.trim()
    const finalSessionName =
      typedName ||
      (session.tasks.length > 0
        ? session.tasks
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((t) => t.name)
            .join(', ')
        : null)

    // If any tasks were rated, the session's rating is the average across
    // them (rounded to one decimal). Otherwise fall back to the form slider.
    const finalRating =
      aggregateRating !== null
        ? Math.round(aggregateRating * 10) / 10
        : form.rating

    const { data: saved, error } = await supabase
      .from('sessions')
      .insert({
        user_id: user.id,
        goal_id: goalId,
        category_id: categoryId,
        session_name: finalSessionName,
        planned_duration_minutes: session.plannedDurationMinutes,
        actual_duration_minutes: finalActual,
        started_at: session.startedAt,
        ended_at: new Date().toISOString(),
        rating: finalRating,
        notes: form.notes.trim() || null,
        end_reason: finalEndReason,
      })
      .select()
      .single()

    if (error || !saved) {
      console.error('[save] session insert failed', error)
      setErrorMsg(`Couldn't save session: ${error?.message ?? 'unknown error'}`)
      setSaving(false)
      return
    }

    if (form.selectedTagIds.length > 0) {
      await supabase.from('session_distraction_tags').insert(
        form.selectedTagIds.map((tag_id) => ({ session_id: saved.id, tag_id }))
      )
    }

    // Persist sub-tasks entered at setup + their check-off durations.
    if (session.tasks.length > 0) {
      // Derive per-task duration from elapsedSecondsAtCompletion sequence.
      const completedSorted = [...session.tasks]
        .filter((t) => t.completedAt !== null && t.elapsedSecondsAtCompletion !== null)
        .sort((a, b) => (a.elapsedSecondsAtCompletion ?? 0) - (b.elapsedSecondsAtCompletion ?? 0))
      const durationById = new Map<string, number>()
      let prev = 0
      for (const t of completedSorted) {
        durationById.set(t.id, Math.max(0, (t.elapsedSecondsAtCompletion ?? 0) - prev))
        prev = t.elapsedSecondsAtCompletion ?? prev
      }

      await supabase.from('session_tasks').insert(
        session.tasks.map((t) => ({
          session_id: saved.id,
          name: t.name,
          position: t.position,
          completed_at: t.completedAt,
          duration_seconds: durationById.get(t.id) ?? null,
          rating: taskRatings.has(t.id) ? taskRatings.get(t.id) : null,
        }))
      )
    }

    if (goalId) {
      await supabase
        .from('goals')
        .update({ last_used_duration_minutes: session.plannedDurationMinutes })
        .eq('id', goalId)
    }

    const { count } = await supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    clearSession()

    const c = count ?? 0
    const nudgeEnabled = localStorage.getItem('focus_nudge_enabled') !== 'false'
    if (nudgeEnabled && (c === 1 || c % 5 === 0)) {
      setSavedCount(c)
    } else {
      router.push('/')
    }
  }

  if (!session) return null

  const durationLabel = (() => {
    if (session.isExpired && branchReason === null) {
      return `Planned ${formatDuration(session.plannedDurationMinutes)} session`
    }
    return `${formatDuration(resolveActualMinutes())} session`
  })()

  // Format a task's recorded duration for display next to its name.
  const fmtTaskDur = (sec: number | null): string | null => {
    if (sec === null) return null
    if (sec < 60) return `${sec}s`
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return s === 0 ? `${m}m` : `${m}m ${s}s`
  }
  // Per-task duration map (same math as timer + session-detail views).
  const taskDurationById = (() => {
    const map = new Map<string, number>()
    const completedSorted = [...session.tasks]
      .filter((t) => t.completedAt !== null && t.elapsedSecondsAtCompletion !== null)
      .sort((a, b) => (a.elapsedSecondsAtCompletion ?? 0) - (b.elapsedSecondsAtCompletion ?? 0))
    let prev = 0
    for (const t of completedSorted) {
      map.set(t.id, Math.max(0, (t.elapsedSecondsAtCompletion ?? 0) - prev))
      prev = t.elapsedSecondsAtCompletion ?? prev
    }
    return map
  })()

  const header = (
    <div>
      <p className="font-numbers text-sm text-text-muted">{durationLabel}</p>

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
                Session score — average of the tasks you rated
              </p>
            </div>
          )}

          <p className="font-sans text-xs text-text-muted uppercase tracking-wide mb-3">
            Tasks — rate them individually (optional)
          </p>
          <ul>
            {session.tasks.map((t) => {
              const done = t.completedAt !== null
              const dur = fmtTaskDur(taskDurationById.get(t.id) ?? null)
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
        tags={tags}
        onAddTag={handleAddTag}
        onSave={handleSave}
        saving={saving}
        showGoalPrompt={!session.goalId && !session.categoryId}
        goalOptions={goalOptions}
        header={header}
        saveDisabled={session.isExpired && branchReason === null}
        hideSessionRating={aggregateRating !== null}
      />
      {errorMsg && (
        <div className="fixed bottom-4 left-4 right-4 max-w-md mx-auto p-3 rounded-xl border border-red-300 bg-red-50 text-red-900 text-sm font-sans z-50">
          {errorMsg}
        </div>
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
