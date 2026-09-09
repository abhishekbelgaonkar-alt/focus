'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DurationPicker } from '@/components/DurationPicker'
import { SearchBar } from '@/components/SearchBar'
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
    if (!focusText.trim()) setFocusText(name)
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

        const [{ data: stats }, { count }] = await Promise.all([
          supabase.rpc('get_goal_stats'),
          supabase
            .from('sessions')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', data.user.id),
        ])
        const all = (stats ?? []) as GoalStat[]
        setGoalStats(all)
        setSessionCount(count ?? 0)

        const today = WEEKDAYS[new Date().getDay()]
        setTodayGoals(all.filter((g) => g.schedule?.includes(today) ?? false))

        if (preselectedGoalId) {
          const match = all.find((g) => g.goal_id === preselectedGoalId)
          if (match) {
            setGoalMode({ kind: 'existing', id: preselectedGoalId, name: match.name })
            setFocusText(match.name)
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
    })
    router.push('/timer')
  }

  const handleContinueGoal = (goalId: string) => {
    router.push(`/?goalId=${goalId}`)
  }

  const recentGoals = goalStats.filter((g) => g.last_session_at !== null).slice(0, 3)
  const todayDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  return (
    <main className="min-h-screen bg-cream px-6 pt-8 pb-10 max-w-6xl mx-auto">
      {/* ── Top nav ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 mb-6 relative z-40">
        <button
          onClick={() => router.push('/goals')}
          className="font-sans text-sm text-text-muted whitespace-nowrap shrink-0"
        >
          All goals
        </button>
        <button
          onClick={() => setHelpOpen(true)}
          className="font-sans text-sm text-text-muted whitespace-nowrap shrink-0"
        >
          How it works
        </button>
        {/* Search bar sits toward the right at a fixed max width so its
            underline doesn't stretch across the whole nav. */}
        <div className="ml-auto w-full max-w-xs">
          <SearchBar onOpenChange={setSearchOpen} />
        </div>
        <button
          onClick={() => router.push('/profile')}
          className="font-sans text-sm text-text-muted whitespace-nowrap shrink-0"
        >
          Profile
        </button>
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

          {recentGoals.length > 0 && (
            <div>
              <p className="font-sans text-xs text-text-muted uppercase tracking-wide mb-4">
                Continue a goal
              </p>
              <div className="flex flex-col gap-3">
                {recentGoals.map((g, i) => (
                  <div
                    key={g.goal_id}
                    className="border border-border-warm rounded-xl p-3"
                  >
                    <p className="font-sans text-sm font-medium text-text-primary truncate">
                      {g.name}
                    </p>
                    <p className="font-sans text-xs text-text-muted mt-0.5 mb-3">
                      {formatDuration(g.total_minutes)} · {g.session_count}{' '}
                      {g.session_count === 1 ? 'session' : 'sessions'}
                    </p>
                    <button
                      onClick={() => handleContinueGoal(g.goal_id)}
                      className={`w-full px-3 py-1.5 rounded-pill font-sans text-xs font-medium ${
                        i === 0
                          ? 'bg-coral text-white'
                          : 'border-[1.5px] border-coral text-coral'
                      }`}
                    >
                      Continue
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT column — History (col 3 on md+). Single button opens
            the full session log at /history. */}
        <div className="md:col-start-3 md:row-start-1">
          <button
            onClick={() => router.push('/history')}
            className="w-full border border-border-warm rounded-xl p-5 text-left"
          >
            <p className="font-sans text-xs text-text-muted uppercase tracking-wide mb-2">
              History
            </p>
            <div className="flex items-baseline justify-between">
              <span className="font-sans text-sm font-medium text-text-primary">
                View all sessions
              </span>
              <span className="font-sans text-lg text-text-muted">→</span>
            </div>
            {sessionCount !== null && sessionCount > 0 && (
              <p className="font-numbers text-xs text-text-light mt-2">
                {sessionCount} {sessionCount === 1 ? 'session' : 'sessions'} logged
              </p>
            )}
          </button>
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
