'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
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

export default function HomePage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [goalStats, setGoalStats] = useState<GoalStat[]>([])
  const [todayGoals, setTodayGoals] = useState<GoalStat[]>([])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setLoading(false); return }

      const { count } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', data.user.id)

      if (!count) {
        router.replace('/setup')
        return
      }

      const { data: stats } = await supabase.rpc('get_goal_stats')
      const all = (stats ?? []) as GoalStat[]
      setGoalStats(all)

      const today = WEEKDAYS[new Date().getDay()]
      setTodayGoals(all.filter((g) => g.schedule?.includes(today) ?? false))
      setLoading(false)
    })
  }, [])

  if (loading) return null

  const recentGoals = goalStats.filter((g) => g.last_session_at !== null).slice(0, 3)
  const todayDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  return (
    <main className="min-h-screen bg-cream px-6 pt-12 pb-10 max-w-md mx-auto">
      <p className="font-sans text-sm text-text-muted mb-8">{todayDate}</p>

      {/* Today's plan */}
      {todayGoals.length > 0 && (
        <div className="bg-coral-light rounded-xl p-4 mb-8">
          <p className="font-sans text-xs font-medium text-tag-text uppercase tracking-wide mb-3">
            Today's plan
          </p>
          <div className="flex flex-col gap-2">
            {todayGoals.map((g) => (
              <button
                key={g.goal_id}
                onClick={() => router.push(`/setup?goalId=${g.goal_id}`)}
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
                  onClick={() => router.push(`/setup?goalId=${g.goal_id}`)}
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

      {/* Start something new */}
      <button
        onClick={() => router.push('/setup')}
        className="w-full border-[1.5px] border-dashed border-border-warm text-text-muted font-sans text-sm py-3 rounded-pill"
      >
        Start something new
      </button>

      {/* Nav */}
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
