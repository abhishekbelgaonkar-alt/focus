'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DurationPicker } from '@/components/DurationPicker'
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

  // Timer setup state — lives on the home screen now
  const [duration, setDuration] = useState(DEFAULT_DURATION)
  const [focusText, setFocusText] = useState('')
  const [resolvedGoalId, setResolvedGoalId] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser()
        if (!data.user) return

        const { data: stats } = await supabase.rpc('get_goal_stats')
        const all = (stats ?? []) as GoalStat[]
        setGoalStats(all)

        const today = WEEKDAYS[new Date().getDay()]
        setTodayGoals(all.filter((g) => g.schedule?.includes(today) ?? false))

        // If a specific goal was preselected via ?goalId=…, prefill setup form
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
        /* renders defaults */
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
    })
    router.push('/timer')
  }

  const handleContinueGoal = (goalId: string) => {
    // Update URL so the setup form prefills — a soft "continue" flow.
    router.push(`/?goalId=${goalId}`)
  }

  if (loading) return null

  const recentGoals = goalStats.filter((g) => g.last_session_at !== null).slice(0, 3)
  const todayDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  return (
    <main className="min-h-screen bg-cream px-6 pt-12 pb-10 max-w-md mx-auto">
      <p className="font-sans text-sm text-text-muted mb-8">{todayDate}</p>

      {/* ── Timer setup — top of home ───────────────────────────────────── */}
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
            // Typing a fresh focus decouples from any preselected goal
            if (resolvedGoalId) setResolvedGoalId(null)
          }}
          placeholder="e.g. Finish thermodynamics ch. 1"
          className="w-full bg-transparent border-b border-border-warm pb-2 text-text-primary placeholder:text-text-light focus:outline-none focus:border-coral font-sans text-base mb-10"
        />

        <DurationPicker value={duration} onChange={setDuration} />

        <button
          onClick={handleStart}
          className="w-full bg-coral text-white font-sans font-medium text-base py-3 rounded-pill mt-10"
        >
          Start focus session
        </button>
      </div>

      {/* ── Today's plan ─────────────────────────────────────────────────── */}
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

      {/* ── Pick up where you left off ───────────────────────────────────── */}
      {recentGoals.length > 0 && (
        <div className="mb-8">
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

      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <div className="flex gap-6 mt-8 pt-6 border-t border-border-warm">
        <button
          onClick={() => router.push('/goals')}
          className="font-sans text-sm text-text-muted"
        >
          All goals
        </button>
        <button
          onClick={() => router.push('/search')}
          className="font-sans text-sm text-text-muted"
        >
          Search
        </button>
        <button
          onClick={() => router.push('/profile')}
          className="font-sans text-sm text-text-muted"
        >
          Profile
        </button>
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
