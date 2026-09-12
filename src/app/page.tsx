'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DurationPicker } from '@/components/DurationPicker'
import { SearchBar } from '@/components/SearchBar'
import { HowItWorksModal } from '@/components/HowItWorksModal'
import { CyclingPlaceholder } from '@/components/CyclingPlaceholder'
import { ThemeToggle } from '@/components/ThemeToggle'
import { timeAgo } from '@/lib/format'
import { getGoalColor } from '@/lib/goal-color'
import { calcDayStreak } from '@/lib/stats'

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
  color: string | null
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
  const [inProgressSessions, setInProgressSessions] = useState<
    Array<{
      id: string
      session_name: string | null
      started_at: string
      planned_duration_minutes: number
      elapsed_seconds: number | null
      goal_id: string | null
      category_id: string | null
      goals: { id: string; name: string; color: string | null } | null
    }>
  >([])
  const [incompleteTaskCount, setIncompleteTaskCount] = useState(0)
  const [goalStreaks, setGoalStreaks] = useState<Map<string, number>>(new Map())
  const [incompleteTasks, setIncompleteTasks] = useState<
    Array<{
      id: string
      name: string
      sessions: {
        id: string
        session_name: string | null
        goals: { id: string; name: string; color: string | null } | null
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

    // Default the session name to 'Session #N' for this goal — only if the
    // user hasn't typed anything of their own. Uses goalStats.session_count
    // (already loaded), which counts COMPLETED sessions; +1 = the number this
    // one will become on save.
    const stat = goalStats.find((s) => s.goal_id === id)
    if (stat && !focusText.trim()) {
      setFocusText(`Session #${stat.session_count + 1}`)
    }

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

        const [{ data: stats }, inProgressQuery] = await Promise.all([
          supabase.rpc('get_goal_stats'),
          // Paused / saved-for-later sessions
          supabase
            .from('sessions')
            .select(
              'id, session_name, started_at, planned_duration_minutes, elapsed_seconds, goal_id, category_id, goals(id, name, color)'
            )
            .eq('user_id', data.user.id)
            .eq('status', 'in_progress')
            .order('created_at', { ascending: false }),
        ])
        const all = (stats ?? []) as GoalStat[]
        setGoalStats(all)
        setInProgressSessions(
          (inProgressQuery.data ?? []) as unknown as typeof inProgressSessions
        )

        // Tasks that were never checked off, in concluded sessions.
        // One query for both the preview list and the total count.
        const { data: incTasks, count: incompleteCount } = await supabase
          .from('session_tasks')
          .select(
            'id, name, sessions!inner(id, session_name, user_id, status, goals(id, name, color), categories(name))',
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

        // Per-goal streak for the top few recent goals shown in Continue-a-goal.
        const topGoalIds = all
          .filter((g) => g.last_session_at !== null)
          .slice(0, 3)
          .map((g) => g.goal_id)
        if (topGoalIds.length > 0) {
          const { data: goalSessions } = await supabase
            .from('sessions')
            .select('goal_id, started_at')
            .eq('user_id', data.user.id)
            .eq('status', 'completed')
            .in('goal_id', topGoalIds)
            .order('started_at', { ascending: false })
            .limit(500)
          const grouped = new Map<string, string[]>()
          for (const row of (goalSessions ?? []) as { goal_id: string; started_at: string }[]) {
            if (!grouped.has(row.goal_id)) grouped.set(row.goal_id, [])
            grouped.get(row.goal_id)!.push(row.started_at)
          }
          const streaks = new Map<string, number>()
          for (const [gid, dates] of grouped) {
            streaks.set(gid, calcDayStreak(dates))
          }
          setGoalStreaks(streaks)
        }

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

  // In-page click: just apply the goal directly to local state. No URL push
  // (which would leave a noisy /?goalId=... in the address bar).
  const handleContinueGoal = (goalId: string) => {
    const g = goalStats.find((s) => s.goal_id === goalId)
    if (g) selectExistingGoal(goalId, g.name)
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
    <main className="min-h-screen bg-cream px-6 pt-8 pb-10 max-w-5xl mx-auto">
      {/* ── Top nav — grid on md+ with equal side cells so search bar
          sits at page center; falls back to flex-wrap on mobile ────── */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 mb-6 relative z-40 md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:gap-x-6">
        <div className="flex items-center gap-5">
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
        <div className="w-full max-w-sm md:justify-self-center">
          <SearchBar onOpenChange={setSearchOpen} />
        </div>
        <div className="flex items-center gap-5 md:justify-self-end">
          <button
            onClick={() => router.push('/history')}
            className="font-sans text-sm text-text-muted whitespace-nowrap"
          >
            History
          </button>
          <ThemeToggle />
          <button
            onClick={() => router.push('/profile')}
            className="font-sans text-sm text-text-muted whitespace-nowrap"
          >
            Profile
          </button>
        </div>
      </div>

      {/* ── Three-column grid: LEFT (goals) | CENTER (timer) | RIGHT (date + plan).
          Side columns are equal (both minmax(0,1fr)), so the center column —
          and the timer inputs inside it — sit at page center. Right column
          is an intentional empty spacer that balances the left one. On mobile
          the grid collapses to one column; DOM order puts the timer first. */}
      <div
        className={`grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-x-8 gap-y-10 items-start transition-[filter,opacity] duration-150 ${
          searchOpen ? 'blur-sm opacity-40 pointer-events-none select-none' : ''
        }`}
      >
        {/* CENTER — Timer setup (DOM-first so mobile shows it up top) */}
        <div className="md:col-start-2 md:row-start-1 w-full max-w-md md:mx-auto">
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
          {inProgressSessions.length > 0 && (
            <div>
              <p className="font-sans text-xs text-text-muted uppercase tracking-wide">
                Sessions in progress
              </p>
              <p className="font-sans text-xs text-text-light mb-3 mt-0.5">
                Sessions you saved for later. Tap to resume where you left off.
              </p>
              <div>
                {inProgressSessions.map((s) => {
                  const elapsedMin = Math.max(1, Math.round((s.elapsed_seconds ?? 0) / 60))
                  const label = s.session_name ?? 'Session'
                  const gcolor = s.goals
                    ? getGoalColor({ id: s.goals.id, color: s.goals.color })
                    : null
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
                              <span style={gcolor ? { color: gcolor } : undefined}>
                                {s.goals.name}
                              </span>
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
              <div className="flex items-baseline justify-between">
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
              <p className="font-sans text-xs text-text-light mb-3 mt-0.5">
                Recent goals you&apos;ve been working on. Pick one to start a new session for it.
              </p>
              <div>
                {recentGoals.map((g) => {
                  const color = getGoalColor({ id: g.goal_id, color: g.color })
                  const streak = goalStreaks.get(g.goal_id) ?? 0
                  const metaParts = [
                    `${formatDuration(g.total_minutes)}`,
                    `${g.session_count} ${g.session_count === 1 ? 'session' : 'sessions'}`,
                    streak > 0 ? `${streak}d streak` : null,
                    g.last_session_at ? `last ${timeAgo(g.last_session_at)}` : null,
                  ].filter(Boolean)
                  return (
                    <button
                      key={g.goal_id}
                      onClick={() => handleContinueGoal(g.goal_id)}
                      className="w-full text-left py-3.5 border-b border-border-warm last:border-0 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p
                          className="font-sans text-sm font-medium truncate"
                          style={{ color }}
                        >
                          {g.name}
                        </p>
                        <p className="font-sans text-xs text-text-muted mt-0.5 truncate">
                          {metaParts.join(' · ')}
                        </p>
                      </div>
                      <span className="shrink-0 font-sans text-xs text-coral">
                        Continue →
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Always visible so users can discover the feature. Empty state
              relies on the section subtitle. */}
          <div>
            <div className="flex items-baseline justify-between">
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
            <p className="font-sans text-xs text-text-light mb-3 mt-0.5">
              Tasks from past sessions you never checked off. Tap to jump back to the session.
            </p>

            {incompleteTasks.length === 0 ? (
              <p className="font-sans text-xs text-text-light/70 italic py-1">
                Nothing here yet.
              </p>
            ) : (
              <>
                <div>
                  {incompleteTasks.map((t) => {
                    const s = t.sessions
                    const goalName = s?.goals?.name ?? null
                    const goalColor = s?.goals
                      ? getGoalColor({ id: s.goals.id, color: s.goals.color })
                      : null
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
                            <p
                              className="font-sans text-xs mt-0.5 truncate"
                              style={{ color: goalColor ?? undefined }}
                            >
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

        {/* RIGHT column — date at the top, followed by scheduling context
            (Today's plan). Column width matches the left column so the
            CENTER (timer) stays at page center. */}
        <div className="md:col-start-3 md:row-start-1 flex flex-col gap-6">
          <p className="font-sans text-sm text-text-muted">
            {todayDate}
          </p>

          {todayGoals.length > 0 && (
            <div className="bg-coral-light rounded-xl p-4">
              <p className="font-sans text-xs font-medium text-tag-text uppercase tracking-wide">
                Today&apos;s plan
              </p>
              <p className="font-sans text-xs text-tag-text/70 mb-3 mt-0.5">
                Goals you scheduled for {new Date().toLocaleDateString('en-US', { weekday: 'long' })}.
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
