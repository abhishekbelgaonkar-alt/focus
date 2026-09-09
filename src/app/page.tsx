'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DurationPicker } from '@/components/DurationPicker'
import { SearchBar } from '@/components/SearchBar'
import { SessionRow } from '@/components/SessionRow'
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

  const [loading, setLoading] = useState(true)
  const [goalStats, setGoalStats] = useState<GoalStat[]>([])
  const [todayGoals, setTodayGoals] = useState<GoalStat[]>([])
  const [recentSessions, setRecentSessions] = useState<
    { id: string; session_name: string | null; started_at: string; actual_duration_minutes: number; rating: number | null }[]
  >([])
  const [searchOpen, setSearchOpen] = useState(false)

  // Timer setup state — lives on the home screen.
  const [duration, setDuration] = useState(DEFAULT_DURATION)
  const [focusText, setFocusText] = useState('')
  const [resolvedGoalId, setResolvedGoalId] = useState<string | null>(null)
  const [taskDrafts, setTaskDrafts] = useState<{ id: string; name: string }[]>([])
  const [taskInput, setTaskInput] = useState('')

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

        const [{ data: stats }, { data: recent }] = await Promise.all([
          supabase.rpc('get_goal_stats'),
          supabase
            .from('sessions')
            .select('id, session_name, started_at, actual_duration_minutes, rating')
            .eq('user_id', data.user.id)
            .order('started_at', { ascending: false })
            .limit(5),
        ])
        const all = (stats ?? []) as GoalStat[]
        setGoalStats(all)
        setRecentSessions(
          (recent ?? []) as { id: string; session_name: string | null; started_at: string; actual_duration_minutes: number; rating: number | null }[]
        )

        const today = WEEKDAYS[new Date().getDay()]
        setTodayGoals(all.filter((g) => g.schedule?.includes(today) ?? false))

        if (preselectedGoalId) {
          const match = all.find((g) => g.goal_id === preselectedGoalId)
          if (match) {
            setResolvedGoalId(preselectedGoalId)
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
      } finally {
        setLoading(false)
      }
    })()
  }, [preselectedGoalId])

  const handleStart = () => {
    saveSession({
      plannedDurationMinutes: duration,
      startedAt: new Date().toISOString(),
      setupFocusText: focusText.trim() || null,
      goalId: resolvedGoalId,
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

  if (loading) return null

  const recentGoals = goalStats.filter((g) => g.last_session_at !== null).slice(0, 3)
  const todayDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  return (
    <main className="min-h-screen bg-cream px-6 pt-8 pb-10 max-w-md mx-auto">
      {/* ── Top nav ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6 relative z-40">
        <button
          onClick={() => router.push('/goals')}
          className="font-sans text-sm text-text-muted"
        >
          All goals
        </button>
        <button
          onClick={() => router.push('/profile')}
          className="font-sans text-sm text-text-muted"
        >
          Profile
        </button>
      </div>

      {/* ── Date + search — search stays anchored here even when open ───── */}
      <p className="font-sans text-sm text-text-muted mb-3 relative z-40">
        {todayDate}
      </p>

      <div className="mb-8">
        <SearchBar onOpenChange={setSearchOpen} />
      </div>

      {/* ── Everything below dims + blurs when search is open ──────────── */}
      <div
        className={`transition-[filter,opacity] duration-150 ${
          searchOpen ? 'blur-sm opacity-40 pointer-events-none select-none' : ''
        }`}
      >
        {/* Timer setup */}
        <div className="mb-10">
          <label className="block font-sans text-lg font-medium text-text-primary mb-1">
            What are you focusing on?
          </label>
          <p className="text-sm text-text-muted mb-4">
            Optional — you can skip this and add it after
          </p>
          <input
            type="text"
            value={focusText}
            onChange={(e) => {
              setFocusText(e.target.value)
              if (resolvedGoalId) setResolvedGoalId(null)
            }}
            placeholder="e.g. Finish thermodynamics ch. 1"
            className="w-full bg-transparent border-b border-border-warm pb-2 text-text-primary placeholder:text-text-light focus:outline-none focus:border-coral font-sans text-base mb-8"
          />

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
            <input
              type="text"
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTask())}
              placeholder={taskDrafts.length === 0 ? 'e.g. Paper 1' : 'Add another task'}
              className="w-full bg-transparent border-b border-border-warm pb-1 text-text-primary placeholder:text-text-light focus:outline-none focus:border-coral font-sans text-sm"
            />
          </div>

          <DurationPicker value={duration} onChange={setDuration} max={180} />

          <button
            onClick={handleStart}
            className="w-full bg-coral text-white font-sans font-medium text-base py-3 rounded-pill mt-10"
          >
            Start focus session
          </button>
        </div>

        {/* Today's plan */}
        {todayGoals.length > 0 && (
          <div className="bg-coral-light rounded-xl p-4 mb-8">
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

        {/* Pick up where you left off */}
        {recentGoals.length > 0 && (
          <div>
            <p className="font-sans text-xs text-text-muted uppercase tracking-wide mb-4">
              Or pick up where you left off
            </p>
            <div className="flex flex-col gap-4">
              {recentGoals.map((g, i) => (
                <div key={g.goal_id} className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-sans text-sm font-medium text-text-primary truncate">
                      {g.name}
                    </p>
                    <p className="font-sans text-xs text-text-muted mt-0.5">
                      {formatDuration(g.total_minutes)} across {g.session_count}{' '}
                      {g.session_count === 1 ? 'session' : 'sessions'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleContinueGoal(g.goal_id)}
                    className={`shrink-0 px-4 py-2 rounded-pill font-sans text-sm font-medium ${
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

        {/* Recent sessions — includes uncategorized/orphan saves so they're findable */}
        {recentSessions.length > 0 && (
          <div className="mt-10">
            <p className="font-sans text-xs text-text-muted uppercase tracking-wide mb-2">
              Recent sessions
            </p>
            <div>
              {recentSessions.map((s) => (
                <SessionRow
                  key={s.id}
                  id={s.id}
                  sessionName={s.session_name}
                  startedAt={s.started_at}
                  actualDurationMinutes={s.actual_duration_minutes}
                  rating={s.rating}
                  onClick={() => router.push(`/sessions/${s.id}`)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
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
