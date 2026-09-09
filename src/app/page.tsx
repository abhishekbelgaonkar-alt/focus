'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DurationPicker } from '@/components/DurationPicker'
import { SearchBar } from '@/components/SearchBar'
import { SessionRow } from '@/components/SessionRow'
import { HowItWorksModal } from '@/components/HowItWorksModal'
import { CyclingPlaceholder } from '@/components/CyclingPlaceholder'

const FOCUS_PLACEHOLDERS = [
  'e.g. Finish thermodynamics ch. 1',
  'e.g. Refactor login component',
  'e.g. Practice guitar chord changes',
  'e.g. Write chapter 3 outline',
  'e.g. Review yesterday’s math problems',
  'e.g. Draft cover letter',
]

const TASK_PLACEHOLDERS = [
  'e.g. Paper 1',
  'e.g. Read section 3.2',
  'e.g. Draft outline',
  'e.g. Solve 5 problems',
  'e.g. Review flashcards',
  'e.g. Warm up scales',
]

const NEW_GOAL_PLACEHOLDERS = [
  'e.g. Finals prep',
  'e.g. Portfolio site',
  'e.g. Learn Spanish',
  'e.g. Master’s thesis',
  'e.g. Ship v1',
]
import { saveSession } from '@/lib/session-state'
import { formatDuration } from '@/lib/format'
import type { Weekday } from '@/lib/types'

interface GoalStat {
  goal_id: string
  name: string
  status: string
  schedule: string[] | null
  created_at: string
  session_count: number
  total_minutes: number
  avg_rating: number | null
  last_session_at: string | null
}

const WEEKDAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const DEFAULT_DURATION = 3

function HomePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedGoalId = searchParams.get('goalId')
  const supabase = createClient()

  const [goalStats, setGoalStats] = useState<GoalStat[]>([])
  const [todayGoals, setTodayGoals] = useState<GoalStat[]>([])
  const [sessionCount, setSessionCount] = useState<number | null>(null)
  const [recentSessions, setRecentSessions] = useState<
    Array<{
      id: string
      session_name: string | null
      started_at: string
      actual_duration_minutes: number
      rating: number | null
      goals: { name: string } | null
      session_tasks: { id: string }[]
    }>
  >([])
  const [inProgressSessions, setInProgressSessions] = useState<
    Array<{
      id: string
      session_name: string | null
      started_at: string
      planned_duration_minutes: number
      elapsed_seconds: number | null
      goal_id: string | null
      category_id: string | null
      goals: { name: string } | null
    }>
  >([])
  const [incompleteTaskCount, setIncompleteTaskCount] = useState(0)
  const [incompleteTasks, setIncompleteTasks] = useState<
    Array<{
      id: string
      name: string
      sessions: {
        id: string
        session_name: string | null
        goals: { name: string } | null
        categories: { name: string } | null
      } | null
    }>
  >([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  // Timer setup state — lives on the home screen.
  const [duration, setDuration] = useState(DEFAULT_DURATION)
  const [focusText, setFocusText] = useState('')
  const [taskDrafts, setTaskDrafts] = useState<{ id: string; name: string }[]>([])
  const [taskInput, setTaskInput] = useState('')
  // Goal picker: none | new (typing a fresh name) | existing (linked to a real goal)
  type GoalMode =
    | { kind: 'none' }
    | { kind: 'new' }
    | { kind: 'existing'; id: string; name: string }
  const [goalMode, setGoalMode] = useState<GoalMode>({ kind: 'none' })
  const [newGoalName, setNewGoalName] = useState('')

  const selectExistingGoal = async (id: string, name: string) => {
    setGoalMode({ kind: 'existing', id, name })
    // Note: intentionally do NOT copy the goal name into the focus/session
    // name field. Session name is per-run (e.g. 'Chapter 1'); the goal is
    // the umbrella project ('Thermodynamics'). Keep them independent.
    try {
      const { data: g } = await supabase
        .from('goals')
        .select('last_used_duration_minutes')
        .eq('id', id)
        .single()
      if (g?.last_used_duration_minutes) setDuration(g.last_used_duration_minutes)
    } catch { /* ignore */ }
  }

  const addTask = () => {
    const name = taskInput.trim()
    if (!name) return
    setTaskDrafts((prev) => [...prev, { id: crypto.randomUUID(), name }])
    setTaskInput('')
  }
  const removeTask = (id: string) => {
    setTaskDrafts((prev) => prev.filter((t) => t.id !== id))
  }

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser()
        if (!data.user) return

        const [{ data: stats }, recentQuery, inProgressQuery] = await Promise.all([
          supabase.rpc('get_goal_stats'),
          // Single query gets both the last 5 sessions AND the total count.
          supabase
            .from('sessions')
            .select(
              'id, session_name, started_at, actual_duration_minutes, rating, goals(name), session_tasks(id)',
              { count: 'exact' }
            )
            .eq('user_id', data.user.id)
            .eq('status', 'completed')
            .order('started_at', { ascending: false })
            .limit(5),
          // Paused / saved-for-later sessions
          supabase
            .from('sessions')
            .select(
              'id, session_name, started_at, planned_duration_minutes, elapsed_seconds, goal_id, category_id, goals(name)'
            )
            .eq('user_id', data.user.id)
            .eq('status', 'in_progress')
            .order('created_at', { ascending: false }),
        ])
        const all = (stats ?? []) as GoalStat[]
        setGoalStats(all)
        setSessionCount(recentQuery.count ?? 0)
        setRecentSessions(
          (recentQuery.data ?? []) as unknown as typeof recentSessions
        )
        setInProgressSessions(
          (inProgressQuery.data ?? []) as unknown as typeof inProgressSessions
        )

        // Tasks that were never checked off, in concluded sessions.
        // One query for both the preview list and the total count.
        const { data: incTasks, count: incompleteCount } = await supabase
          .from('session_tasks')
          .select(
            'id, name, sessions!inner(id, session_name, user_id, status, goals(name), categories(name))',
            { count: 'exact' }
          )
          .is('completed_at', null)
          .eq('sessions.user_id', data.user.id)
          .eq('sessions.status', 'completed')
          .order('created_at', { ascending: false })
          .limit(3)
        setIncompleteTaskCount(incompleteCount ?? 0)
        setIncompleteTasks(
          (incTasks ?? []) as unknown as typeof incompleteTasks
        )

        const today = WEEKDAYS[new Date().getDay()]
        setTodayGoals(all.filter((g) => g.schedule?.includes(today) ?? false))

        if (preselectedGoalId) {
          const match = all.find((g) => g.goal_id === preselectedGoalId)
          if (match) {
            setGoalMode({ kind: 'existing', id: preselectedGoalId, name: match.name })
            // Don't pre-fill session name from the goal name — the goal pill
            // in the picker below already shows which goal is selected.
            const { data: g } = await supabase
              .from('goals')
              .select('last_used_duration_minutes')
              .eq('id', preselectedGoalId)
              .single()
            if (g?.last_used_duration_minutes) {
              setDuration(g.last_used_duration_minutes)
            }
          }
        }
      } catch {
        /* falls through to defaults */
      }
    })()
  }, [preselectedGoalId])

  const handleStart = async () => {
    let goalId: string | null = null

    if (goalMode.kind === 'existing') {
      goalId = goalMode.id
    } else if (goalMode.kind === 'new' && newGoalName.trim()) {
      // Create the goal upfront so this session (and subsequent ones on it)
      // roll up under it in All Goals.
      const { data: userData } = await supabase.auth.getUser()
      if (userData?.user) {
        const { data: newGoal } = await supabase
          .from('goals')
          .insert({ user_id: userData.user.id, name: newGoalName.trim() })
          .select()
          .single()
        goalId = newGoal?.id ?? null
      }
    }

    saveSession({
      plannedDurationMinutes: duration,
      startedAt: new Date().toISOString(),
      setupFocusText: focusText.trim() || null,
      goalId,
      categoryId: null,
      endReason: null,
      actualDurationMinutes: null,
      isExpired: false,
      tasks: taskDrafts.map((t, i) => ({
        id: t.id,
        name: t.name,
        position: i,
        completedAt: null,
        elapsedSecondsAtCompletion: null,
      })),
      existingSessionId: null,
    })
    router.push('/timer')
  }

  const handleContinueGoal = (goalId: string) => {
    router.push(`/?goalId=${goalId}`)
  }

  // Resume a paused session — pull its full state + tasks, hydrate the browser
  // session, and land back on /timer where the countdown picks up where the
  // user left off.
  const handleResumeSession = async (sessionId: string) => {
    const { data: row } = await supabase
      .from('sessions')
      .select(
        'id, session_name, planned_duration_minutes, elapsed_seconds, goal_id, category_id, session_tasks(id, name, position, completed_at)'
      )
      .eq('id', sessionId)
      .single()
    if (!row) return

    const elapsedSec = row.elapsed_seconds ?? 0
    // Virtual startedAt: pretend the session started `elapsedSec` seconds ago,
    // with no accumulated pauses — the countdown then reads exactly (planned - elapsed).
    const virtualStartedAt = new Date(Date.now() - elapsedSec * 1000).toISOString()

    saveSession({
      plannedDurationMinutes: row.planned_duration_minutes,
      startedAt: virtualStartedAt,
      setupFocusText: row.session_name,
      goalId: row.goal_id,
      categoryId: row.category_id,
      endReason: null,
      actualDurationMinutes: null,
      isExpired: false,
      existingSessionId: row.id,
      tasks: (row.session_tasks ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((t) => ({
          id: t.id,
          name: t.name,
          position: t.position,
          completedAt: t.completed_at,
          // Elapsed at completion for previously-checked tasks: recompute as
          // best-effort by assuming their check time was proportional to
          // position. We can't restore the exact moments; but the total
          // elapsed since resume plus the recorded task completions is fine
          // for downstream duration math.
          elapsedSecondsAtCompletion: t.completed_at ? elapsedSec : null,
        })),
    })

    // Clear any timer state so /timer builds a fresh one aligned to virtualStartedAt.
    if (typeof window !== 'undefined') sessionStorage.removeItem('focus_timer_state')

    router.push('/timer')
  }

  const recentGoals = goalStats.filter((g) => g.last_session_at !== null).slice(0, 3)
  const todayDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  return (
    <main className="min-h-screen bg-cream px-6 pt-8 pb-10 max-w-6xl mx-auto">
      {/* ── Top nav — grid matches the 3-col content grid below so the
          search bar sits above the timer's inputs, not stretched. ───── */}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] md:gap-x-8 items-center gap-y-3 mb-6 relative z-40">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/goals')}
            className="font-sans text-sm text-text-muted whitespace-nowrap"
          >
            All goals
          </button>
          <button
            onClick={() => setHelpOpen(true)}
            className="font-sans text-sm text-text-muted whitespace-nowrap"
          >
            How it works
          </button>
        </div>
        <div>
          <SearchBar onOpenChange={setSearchOpen} />
        </div>
        <div className="flex md:justify-end">
          <button
            onClick={() => router.push('/profile')}
            className="font-sans text-sm text-text-muted whitespace-nowrap"
          >
            Profile
          </button>
        </div>
      </div>

      {/* ── Date ─────────────────────────────────────────────────────────── */}
      <p className="font-sans text-sm text-text-muted mb-8 relative z-40">
        {todayDate}
      </p>

      {/* ── Three-column grid: LEFT (goals) | CENTER (timer) | RIGHT (sessions) ──
          On mobile everything stacks: timer first (primary action), then goals,
          then sessions. Blurs as a whole when search is open. */}
      <div
        className={`grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] gap-x-8 gap-y-10 items-start transition-[filter,opacity] duration-150 ${
          searchOpen ? 'blur-sm opacity-40 pointer-events-none select-none' : ''
        }`}
      >
        {/* CENTER — Timer setup (col 2 on md+, DOM-first so mobile shows it up top) */}
        <div className="md:col-start-2 md:row-start-1">
          <label className="block font-sans text-lg font-medium text-text-primary mb-1">
            What are you working on?
          </label>
          <p className="text-sm text-text-muted mb-4">
            Becomes the session&apos;s name — link a goal below to track it over time
          </p>
          <div className="relative mb-8">
            <input
              type="text"
              value={focusText}
              onChange={(e) => setFocusText(e.target.value)}
              placeholder=""
              className="w-full bg-transparent border-b border-border-warm pb-2 text-text-primary focus:outline-none focus:border-coral font-sans text-base"
            />
            <CyclingPlaceholder
              active={focusText === ''}
              placeholders={FOCUS_PLACEHOLDERS}
              className="font-sans text-base"
              paddingClass="pb-2"
            />
          </div>

          {/* Goal picker — pick existing, create new, or skip */}
          <div className="mb-8">
            <p className="font-sans text-sm text-text-muted mb-3">
              Goal <span className="text-text-light">(optional)</span>
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              <button
                onClick={() => setGoalMode({ kind: 'none' })}
                className={`px-3 py-1.5 rounded-pill text-sm font-sans border-[1.5px] ${
                  goalMode.kind === 'none'
                    ? 'bg-coral-light border-coral text-tag-text'
                    : 'bg-transparent border-border-warm text-text-muted'
                }`}
              >
                None
              </button>
              {goalStats.map((g) => {
                const isSelected = goalMode.kind === 'existing' && goalMode.id === g.goal_id
                return (
                  <button
                    key={g.goal_id}
                    onClick={() => selectExistingGoal(g.goal_id, g.name)}
                    className={`px-3 py-1.5 rounded-pill text-sm font-sans border-[1.5px] ${
                      isSelected
                        ? 'bg-coral-light border-coral text-tag-text'
                        : 'bg-transparent border-border-warm text-text-muted'
                    }`}
                  >
                    {g.name}
                  </button>
                )
              })}
              <button
                onClick={() => setGoalMode({ kind: 'new' })}
                className={`px-3 py-1.5 rounded-pill text-sm font-sans border-[1.5px] border-dashed ${
                  goalMode.kind === 'new'
                    ? 'border-coral text-coral'
                    : 'border-border-warm text-text-muted'
                }`}
              >
                + New goal
              </button>
            </div>
            {goalMode.kind === 'new' && (
              <div className="relative">
                <input
                  autoFocus
                  type="text"
                  value={newGoalName}
                  onChange={(e) => setNewGoalName(e.target.value)}
                  placeholder=""
                  className="w-full bg-transparent border-b border-border-warm pb-1 text-text-primary focus:outline-none focus:border-coral font-sans text-sm"
                />
                <CyclingPlaceholder
                  active={newGoalName === ''}
                  placeholders={NEW_GOAL_PLACEHOLDERS}
                  className="font-sans text-sm"
                  paddingClass="pb-1"
                />
              </div>
            )}
          </div>

          {/* Optional tasks — checked off during the timer */}
          <div className="mb-8">
            <label className="block font-sans text-sm text-text-muted">
              Tasks <span className="text-text-light">(optional)</span>
            </label>
            <p className="font-sans text-xs text-text-light mb-3 mt-0.5">
              Break the session into steps — check them off as you go and see how long each takes
            </p>
            {taskDrafts.length > 0 && (
              <ol className="flex flex-col mb-3">
                {taskDrafts.map((t, i) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-3 py-1.5 border-b border-border-warm last:border-0"
                  >
                    <span className="font-numbers text-xs text-text-light w-4">{i + 1}</span>
                    <span className="flex-1 font-sans text-sm text-text-primary">{t.name}</span>
                    <button
                      onClick={() => removeTask(t.id)}
                      className="font-sans text-lg text-text-light leading-none"
                      aria-label={`Remove ${t.name}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ol>
            )}
            <div className="relative">
              <input
                type="text"
                value={taskInput}
                onChange={(e) => setTaskInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTask())}
                placeholder=""
                className="w-full bg-transparent border-b border-border-warm pb-1 text-text-primary focus:outline-none focus:border-coral font-sans text-sm"
              />
              <CyclingPlaceholder
                active={taskInput === ''}
                placeholders={
                  taskDrafts.length === 0
                    ? TASK_PLACEHOLDERS
                    : ['Add another task', 'Add another', 'One more…', 'Another step']
                }
                className="font-sans text-sm"
                paddingClass="pb-1"
              />
            </div>
          </div>

          <DurationPicker value={duration} onChange={setDuration} max={180} />

          <button
            onClick={handleStart}
            className="w-full bg-coral text-white font-sans font-medium text-base py-3 rounded-pill mt-10"
          >
            Start focus session
          </button>
        </div>

        {/* LEFT column — Today's plan + Continue a goal (col 1 on md+) */}
        <div className="md:col-start-1 md:row-start-1 flex flex-col gap-8">
          {todayGoals.length > 0 && (
            <div className="bg-coral-light rounded-xl p-4">
              <p className="font-sans text-xs font-medium text-tag-text uppercase tracking-wide mb-3">
                Today&apos;s plan
              </p>
              <div className="flex flex-col gap-2">
                {todayGoals.map((g) => (
                  <button
                    key={g.goal_id}
                    onClick={() => handleContinueGoal(g.goal_id)}
                    className="text-left font-sans text-sm font-medium text-text-primary"
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {inProgressSessions.length > 0 && (
            <div>
              <p className="font-sans text-xs text-text-muted uppercase tracking-wide mb-2">
                Sessions in progress
              </p>
              <div>
                {inProgressSessions.map((s) => {
                  const elapsedMin = Math.max(1, Math.round((s.elapsed_seconds ?? 0) / 60))
                  const label = s.session_name ?? 'Session'
                  return (
                    <button
                      key={s.id}
                      onClick={() => handleResumeSession(s.id)}
                      className="w-full text-left py-3.5 border-b border-border-warm last:border-0 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="font-sans text-sm font-medium text-text-primary truncate">
                          {label}
                        </p>
                        <p className="font-sans text-xs text-text-muted mt-0.5 truncate">
                          {s.goals?.name && (
                            <>
                              <span className="text-goal-green">{s.goals.name}</span>
                              {' · '}
                            </>
                          )}
                          {elapsedMin} of {s.planned_duration_minutes} min
                        </p>
                      </div>
                      <span className="shrink-0 font-sans text-xs text-coral">
                        Resume →
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {recentGoals.length > 0 && (
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <p className="font-sans text-xs text-text-muted uppercase tracking-wide">
                  Continue a goal
                </p>
                <button
                  onClick={() => router.push('/goals')}
                  className="font-sans text-xs text-coral"
                >
                  All →
                </button>
              </div>
              <div>
                {recentGoals.map((g) => (
                  <button
                    key={g.goal_id}
                    onClick={() => handleContinueGoal(g.goal_id)}
                    className="w-full text-left py-3.5 border-b border-border-warm last:border-0 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-sans text-sm font-medium text-text-primary truncate">
                        {g.name}
                      </p>
                      <p className="font-sans text-xs text-text-muted mt-0.5 truncate">
                        {formatDuration(g.total_minutes)} · {g.session_count}{' '}
                        {g.session_count === 1 ? 'session' : 'sessions'}
                      </p>
                    </div>
                    <span className="shrink-0 font-sans text-xs text-coral">
                      Continue →
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Always visible so users can discover the feature. Empty state
              explains what belongs here; loaded state shows a preview. */}
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <p className="font-sans text-xs text-text-muted uppercase tracking-wide">
                Unfinished tasks
              </p>
              {incompleteTasks.length > 0 && (
                <button
                  onClick={() => router.push('/incomplete-tasks')}
                  className="font-sans text-xs text-coral"
                >
                  View all →
                </button>
              )}
            </div>

            {incompleteTasks.length === 0 ? (
              <p className="font-sans text-xs text-text-light leading-relaxed py-2">
                Anything you don&apos;t check off before saving a session
                lands here so it&apos;s easy to come back to.
              </p>
            ) : (
              <>
                <div>
                  {incompleteTasks.map((t) => {
                    const s = t.sessions
                    const goalName = s?.goals?.name ?? null
                    const otherContext = goalName
                      ? null
                      : s?.categories?.name ?? s?.session_name ?? null
                    return (
                      <button
                        key={t.id}
                        onClick={() => s && router.push(`/sessions/${s.id}`)}
                        className="w-full text-left py-3.5 border-b border-border-warm last:border-0 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="font-sans text-sm font-medium text-text-primary truncate">
                            {t.name}
                          </p>
                          {goalName ? (
                            <p className="font-sans text-xs text-goal-green mt-0.5 truncate">
                              {goalName}
                            </p>
                          ) : otherContext ? (
                            <p className="font-sans text-xs text-text-muted mt-0.5 truncate">
                              {otherContext}
                            </p>
                          ) : null}
                        </div>
                        <span className="shrink-0 font-sans text-xs text-coral">
                          Open →
                        </span>
                      </button>
                    )
                  })}
                </div>
                {incompleteTaskCount > incompleteTasks.length && (
                  <button
                    onClick={() => router.push('/incomplete-tasks')}
                    className="mt-3 font-sans text-xs text-text-muted w-full text-left"
                  >
                    + {incompleteTaskCount - incompleteTasks.length} more →
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* RIGHT column — History (col 3 on md+). Header links to the
            full log at /history; the last 5 sessions preview below. */}
        <div className="md:col-start-3 md:row-start-1">
          <div className="flex items-baseline justify-between mb-2">
            <p className="font-sans text-xs text-text-muted uppercase tracking-wide">
              History
            </p>
            <button
              onClick={() => router.push('/history')}
              className="font-sans text-xs text-coral"
            >
              View all →
            </button>
          </div>

          {recentSessions.length === 0 ? (
            <p className="font-sans text-xs text-text-light py-2">
              No sessions logged yet.
            </p>
          ) : (
            <div>
              {recentSessions.map((s) => (
                <SessionRow
                  key={s.id}
                  id={s.id}
                  sessionName={s.session_name}
                  startedAt={s.started_at}
                  actualDurationMinutes={s.actual_duration_minutes}
                  rating={s.rating}
                  goalName={s.goals?.name ?? null}
                  taskCount={s.session_tasks.length}
                  onClick={() => router.push(`/sessions/${s.id}`)}
                />
              ))}
            </div>
          )}

          {sessionCount !== null && sessionCount > 5 && (
            <button
              onClick={() => router.push('/history')}
              className="mt-3 font-sans text-xs text-text-muted w-full text-left"
            >
              + {sessionCount - 5} more →
            </button>
          )}
        </div>
      </div>

      <HowItWorksModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </main>
  )
}

export default function HomePage() {
  return (
    <Suspense>
      <HomePageInner />
    </Suspense>
  )
}
