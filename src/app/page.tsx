'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DurationPicker } from '@/components/DurationPicker'
import { SearchBar } from '@/components/SearchBar'
import dynamic from 'next/dynamic'
import { FriendsDropdown } from '@/components/FriendsDropdown'
// Modals are lazy-loaded — they're gated behind a tap, so keeping them out of
// the initial home-page bundle shaves parse/eval time on first paint.
const HowItWorksModal = dynamic(
  () => import('@/components/HowItWorksModal').then((m) => m.HowItWorksModal),
  { ssr: false }
)
const AboutModal = dynamic(
  () => import('@/components/AboutModal').then((m) => m.AboutModal),
  { ssr: false }
)
import { CyclingPlaceholder } from '@/components/CyclingPlaceholder'
import { ThemeToggle } from '@/components/ThemeToggle'
import { WeekdayPicker } from '@/components/WeekdayPicker'
import type { Weekday } from '@/lib/types'
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
  const [weeklyStats, setWeeklyStats] = useState<{ count: number; minutes: number } | null>(null)

  // Inline scheduler on the home page — expands when "+ Schedule a goal" is tapped.
  const [scheduling, setScheduling] = useState(false)
  const [scheduleGoalId, setScheduleGoalId] = useState<string>('')
  const [scheduleDays, setScheduleDays] = useState<Weekday[]>([])
  const [savingSchedule, setSavingSchedule] = useState(false)

  const saveSchedule = async () => {
    if (!scheduleGoalId || scheduleDays.length === 0 || savingSchedule) return
    setSavingSchedule(true)
    await supabase.from('goals').update({ schedule: scheduleDays }).eq('id', scheduleGoalId)
    // Refresh goalStats so Today's plan re-computes with the new schedule.
    const { data: stats } = await supabase.rpc('get_goal_stats')
    const all = (stats ?? []) as GoalStat[]
    setGoalStats(all)
    const today = WEEKDAYS[new Date().getDay()]
    setTodayGoals(all.filter((g) => g.schedule?.includes(today) ?? false))
    setScheduling(false)
    setScheduleGoalId('')
    setScheduleDays([])
    setSavingSchedule(false)
  }
  const [templates, setTemplates] = useState<
    Array<{
      id: string
      goal_id: string | null
      name: string
      planned_duration_minutes: number
      tasks: Array<{ name: string }>
      schedule: string[] | null
    }>
  >([])
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
  const [aboutOpen, setAboutOpen] = useState(false)
  const [friendsOpen, setFriendsOpen] = useState(false)
  const [pendingRequestCount, setPendingRequestCount] = useState(0)
  const [isAnonymousUser, setIsAnonymousUser] = useState(true)

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
        setIsAnonymousUser(!data.user.email)

        // Pending friend requests inbound to this user. Cheap count query
        // for the nav-button dot indicator.
        supabase
          .from('friend_requests')
          .select('id', { count: 'exact', head: true })
          .eq('to_user_id', data.user.id)
          .then(({ count }) => setPendingRequestCount(count ?? 0))

        const [{ data: stats }, inProgressQuery, tmplQuery] = await Promise.all([
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
          // Reusable session recipes
          supabase
            .from('session_templates')
            .select('id, goal_id, name, planned_duration_minutes, tasks, schedule')
            .eq('user_id', data.user.id)
            .order('last_used_at', { ascending: false, nullsFirst: false }),
        ])
        const all = (stats ?? []) as GoalStat[]
        setGoalStats(all)
        setInProgressSessions(
          (inProgressQuery.data ?? []) as unknown as typeof inProgressSessions
        )
        setTemplates(
          (tmplQuery.data ?? []) as unknown as typeof templates
        )

        // This-week stats — Monday 00:00 to now. Session count + total minutes.
        const wkStart = new Date()
        const dow = wkStart.getDay()
        const back = dow === 0 ? 6 : dow - 1  // ISO week: Monday-first
        wkStart.setDate(wkStart.getDate() - back)
        wkStart.setHours(0, 0, 0, 0)
        const { data: weekly, count: weekCount } = await supabase
          .from('sessions')
          .select('actual_duration_minutes', { count: 'exact' })
          .eq('user_id', data.user.id)
          .eq('status', 'completed')
          .gte('started_at', wkStart.toISOString())
        const weekMinutes = ((weekly ?? []) as { actual_duration_minutes: number | null }[])
          .reduce((s, x) => s + (x.actual_duration_minutes ?? 0), 0)
        setWeeklyStats({ count: weekCount ?? 0, minutes: weekMinutes })

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
      roomId: null,
    })
    router.push('/timer')
  }

  // Create a shared room with the current setup and route to it. The host
  // becomes the first participant; the room page handles timer + presence.
  const handleStartRoom = async () => {
    let goalId: string | null = null
    let goalLabel: string | null = null

    if (goalMode.kind === 'existing') {
      goalId = goalMode.id
      const g = goalStats.find((s) => s.goal_id === goalMode.id)
      goalLabel = g?.name ?? null
    } else if (goalMode.kind === 'new' && newGoalName.trim()) {
      const { data: userData } = await supabase.auth.getUser()
      if (userData?.user) {
        const { data: newGoal } = await supabase
          .from('goals')
          .insert({ user_id: userData.user.id, name: newGoalName.trim() })
          .select()
          .single()
        goalId = newGoal?.id ?? null
        goalLabel = newGoalName.trim()
      }
    }

    const { data: code, error } = await supabase.rpc('create_room', {
      p_duration: duration,
      p_session_name: focusText.trim() || null,
      p_goal_id: goalId,
      p_goal_label: goalLabel,
      p_tasks: taskDrafts.map((t) => ({ name: t.name })),
      p_propagate_setup: true,
    })

    if (error || !code) {
      return
    }
    router.push(`/r/${code}`)
  }

  // In-page click: just apply the goal directly to local state. No URL push
  // (which would leave a noisy /?goalId=... in the address bar).
  const handleContinueGoal = (goalId: string) => {
    const g = goalStats.find((s) => s.goal_id === goalId)
    if (g) selectExistingGoal(goalId, g.name)
  }

  // Load a template's shape into the setup form: focus text, duration,
  // tasks, and optional goal. User can edit anything before hitting Start.
  const handleUseTemplate = (t: (typeof templates)[number]) => {
    setFocusText(t.name)
    setDuration(t.planned_duration_minutes)
    setTaskDrafts(
      t.tasks.map((task) => ({
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36),
        name: task.name,
      }))
    )
    if (t.goal_id) {
      const g = goalStats.find((s) => s.goal_id === t.goal_id)
      if (g) {
        setGoalMode({ kind: 'existing', id: t.goal_id, name: g.name })
      }
    } else {
      setGoalMode({ kind: 'none' })
    }
    // Fire-and-forget: bump last_used_at so recent templates rank higher.
    void supabase
      .from('session_templates')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', t.id)
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
    // Date.now() is safe here: this whole function is a user-triggered click
    // handler, not part of the render path.
    // eslint-disable-next-line react-hooks/purity
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
      roomId: null,
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
          {/* Brand mark — 時 with a small "tokiroom" label underneath.
              No border, no accent fill — reads as a logo, not a button.
              The soft warm-gray disc is subtle enough to feel decorative
              rather than tappable. */}
          <div
            aria-label="Tokiroom"
            className="flex flex-col items-center gap-0.5 shrink-0 select-none"
          >
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-border-warm text-text-primary text-sm leading-none">
              時
            </span>
            <span className="font-sans text-[8px] text-text-light tracking-wider lowercase leading-none">
              tokiroom
            </span>
          </div>
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
          <button
            onClick={() => setAboutOpen(true)}
            className="font-sans text-sm text-text-muted whitespace-nowrap"
          >
            About
          </button>
          <div className="relative">
            <button
              onClick={() => {
                setFriendsOpen((o) => !o)
                // Clear the badge as soon as the user opens the dropdown;
                // the section itself lists the actual requests.
                if (!friendsOpen) setPendingRequestCount(0)
              }}
              className="font-sans text-sm text-text-muted whitespace-nowrap relative"
            >
              Friends
              {pendingRequestCount > 0 && (
                <span
                  aria-label={`${pendingRequestCount} pending`}
                  className="absolute -top-1 -right-2 w-2 h-2 rounded-full"
                  style={{ backgroundColor: 'var(--color-coral)' }}
                />
              )}
            </button>
            <FriendsDropdown
              open={friendsOpen}
              onClose={() => setFriendsOpen(false)}
              isAnonymous={isAnonymousUser}
            />
          </div>
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

      {/* ── Weekly stats — subtle line right below the search bar ─────── */}
      <p className="font-sans text-xs text-text-muted text-center mb-6">
        {weeklyStats === null ? (
          <span className="text-text-light">Loading this week…</span>
        ) : weeklyStats.count === 0 ? (
          <span className="text-text-light">No sessions logged yet this week.</span>
        ) : (
          <>
            <span className="font-numbers font-medium text-text-primary">
              {formatDuration(weeklyStats.minutes)}
            </span>
            {' · '}
            <span className="font-numbers font-medium text-text-primary">
              {weeklyStats.count}
            </span>{' '}
            {weeklyStats.count === 1 ? 'session' : 'sessions'} this week
          </>
        )}
      </p>

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
            Becomes the session&apos;s name. Link a goal below to track it over time.
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
              Break the session into steps. Check them off as you go and see how long each takes.
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
          <button
            onClick={handleStartRoom}
            className="w-full font-sans text-sm text-text-muted py-3 mt-2"
          >
            Focus with someone
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
          <p className="font-sans text-sm text-text-muted flex items-center gap-2">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="shrink-0"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            {todayDate}
          </p>

          {(() => {
            const weekdayName = new Date().toLocaleDateString('en-US', { weekday: 'long' })
            const weekdayShort = WEEKDAYS[new Date().getDay()]
            const scheduledTemplates = templates.filter((t) =>
              t.schedule?.includes(weekdayShort) ?? false
            )
            const quickStartTemplates = templates.filter(
              (t) => !(t.schedule?.includes(weekdayShort) ?? false)
            )
            const hasReminders = todayGoals.length > 0
            const hasScheduled = scheduledTemplates.length > 0
            const hasQuickStarts = quickStartTemplates.length > 0
            const hasTodayContent = hasReminders || hasScheduled
            // Goals the user could add to a schedule (has no schedule yet, OR has one
            // but not for today — either way, adding today makes sense).
            const schedulableGoals = goalStats.filter(
              (g) => !(g.schedule?.includes(weekdayShort) ?? false)
            )

            return (
              <>
                {/* Empty-state: nothing scheduled for today → discoverable scheduler. */}
                {!hasTodayContent && (
                  <div className="border border-dashed border-border-warm rounded-xl p-4">
                    <p className="font-sans text-xs font-medium text-text-muted uppercase tracking-wide">
                      Today&apos;s plan
                    </p>
                    <p className="font-sans text-xs text-text-light mt-0.5 mb-3">
                      Nothing scheduled for {weekdayName}. Pin a goal to specific
                      days and it&apos;ll show up here as a gentle nudge.
                    </p>

                    {!scheduling ? (
                      <button
                        onClick={() => {
                          if (schedulableGoals.length === 0) {
                            router.push('/rate?intent=new-goal')
                            return
                          }
                          setScheduling(true)
                          setScheduleGoalId(schedulableGoals[0].goal_id)
                          setScheduleDays([weekdayShort])
                        }}
                        className="w-full text-left font-sans text-xs px-3 py-1.5 rounded-pill border-[1.5px] border-dashed border-border-warm text-text-muted"
                      >
                        {schedulableGoals.length === 0
                          ? '+ Create a goal first'
                          : '+ Schedule a goal'}
                      </button>
                    ) : (
                      <div className="flex flex-col gap-3">
                        <div>
                          <p className="font-sans text-xs text-text-muted mb-2">Goal</p>
                          <div className="flex flex-wrap gap-1.5">
                            {schedulableGoals.map((g) => {
                              const color = getGoalColor({ id: g.goal_id, color: g.color })
                              const active = scheduleGoalId === g.goal_id
                              return (
                                <button
                                  key={g.goal_id}
                                  onClick={() => setScheduleGoalId(g.goal_id)}
                                  className={`px-2.5 py-1 rounded-pill text-xs font-sans border-[1.5px] flex items-center gap-1.5 ${
                                    active
                                      ? 'bg-coral-light border-coral text-tag-text'
                                      : 'bg-transparent border-border-warm text-text-muted'
                                  }`}
                                >
                                  <span
                                    className="w-1.5 h-1.5 rounded-full"
                                    style={{ backgroundColor: color }}
                                  />
                                  {g.name}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                        <div>
                          <p className="font-sans text-xs text-text-muted mb-2">Days</p>
                          <WeekdayPicker selected={scheduleDays} onChange={setScheduleDays} />
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={saveSchedule}
                            disabled={
                              !scheduleGoalId ||
                              scheduleDays.length === 0 ||
                              savingSchedule
                            }
                            className="flex-1 bg-coral text-white font-sans text-xs font-medium py-2 rounded-pill disabled:opacity-50"
                          >
                            {savingSchedule ? 'Saving…' : 'Save schedule'}
                          </button>
                          <button
                            onClick={() => {
                              setScheduling(false)
                              setScheduleGoalId('')
                              setScheduleDays([])
                            }}
                            className="font-sans text-xs text-text-muted px-3"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {hasTodayContent && (
                  <div className="bg-coral-light rounded-xl p-4">
                    <p className="font-sans text-xs font-medium text-tag-text uppercase tracking-wide">
                      Today&apos;s plan
                    </p>
                    <p className="font-sans text-xs text-tag-text/70 mb-3 mt-0.5">
                      Scheduled for {weekdayName}.
                    </p>
                    <div className="flex flex-col gap-3">
                      {/* Goal reminders — one-line, dot + name */}
                      {todayGoals.map((g) => {
                        const color = getGoalColor({ id: g.goal_id, color: g.color })
                        return (
                          <button
                            key={`goal-${g.goal_id}`}
                            onClick={() => handleContinueGoal(g.goal_id)}
                            className="w-full text-left flex items-center gap-2"
                          >
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: color }}
                            />
                            <span className="font-sans text-sm font-medium text-text-primary truncate">
                              {g.name}
                            </span>
                          </button>
                        )
                      })}

                      {/* Scheduled templates — two-line, dot + name + meta */}
                      {scheduledTemplates.map((t) => {
                        const linkedGoal = t.goal_id
                          ? goalStats.find((g) => g.goal_id === t.goal_id)
                          : null
                        const color = linkedGoal
                          ? getGoalColor({ id: linkedGoal.goal_id, color: linkedGoal.color })
                          : '#c9b79c'
                        const taskCount = t.tasks?.length ?? 0
                        return (
                          <button
                            key={`tmpl-${t.id}`}
                            onClick={() => handleUseTemplate(t)}
                            className="w-full text-left flex items-start gap-2"
                          >
                            <span
                              className="w-2 h-2 rounded-full shrink-0 mt-1.5"
                              style={{ backgroundColor: color }}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block font-sans text-sm font-medium text-text-primary truncate">
                                {t.name}
                              </span>
                              <span className="block font-sans text-xs text-tag-text/70 mt-0.5">
                                {t.planned_duration_minutes} min
                                {taskCount > 0 && ` · ${taskCount} ${taskCount === 1 ? 'task' : 'tasks'}`}
                              </span>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Quick starts — non-scheduled templates for one-tap use */}
                <div>
                  <p className="font-sans text-xs text-text-muted uppercase tracking-wide">
                    Quick starts
                  </p>
                  <p className="font-sans text-xs text-text-light mt-0.5 mb-3">
                    {hasQuickStarts
                      ? 'Recipes for sessions you run often.'
                      : 'Save any session as a quick start from the save screen. It’ll appear here to run again in one tap.'}
                  </p>

                  {hasQuickStarts && (
                    <div className="flex flex-col gap-3 mb-3">
                      {quickStartTemplates.map((t) => {
                        const linkedGoal = t.goal_id
                          ? goalStats.find((g) => g.goal_id === t.goal_id)
                          : null
                        const color = linkedGoal
                          ? getGoalColor({ id: linkedGoal.goal_id, color: linkedGoal.color })
                          : '#c9b79c'
                        const taskCount = t.tasks?.length ?? 0
                        return (
                          <button
                            key={`quick-${t.id}`}
                            onClick={() => handleUseTemplate(t)}
                            className="w-full text-left flex items-start gap-2"
                          >
                            <span
                              className="w-2 h-2 rounded-full shrink-0 mt-1.5"
                              style={{ backgroundColor: color }}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block font-sans text-sm font-medium text-text-primary truncate">
                                {t.name}
                              </span>
                              <span className="block font-sans text-xs text-text-muted mt-0.5">
                                {t.planned_duration_minutes} min
                                {taskCount > 0 && ` · ${taskCount} ${taskCount === 1 ? 'task' : 'tasks'}`}
                              </span>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  <button
                    onClick={() => router.push('/templates/new')}
                    className="w-full text-left font-sans text-xs px-3 py-1.5 rounded-pill border-[1.5px] border-dashed border-border-warm text-text-muted"
                  >
                    + New quick start
                  </button>
                </div>
              </>
            )
          })()}
        </div>
      </div>

      <HowItWorksModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
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
