'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatDuration } from '@/lib/format'

interface GoalStat {
  goal_id: string
  name: string
  status: string
  session_count: number
  total_minutes: number
  avg_rating: number | null
  last_session_at: string | null
}

export default function AllGoalsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [goals, setGoals] = useState<GoalStat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.rpc('get_goal_stats')
        setGoals((data ?? []) as GoalStat[])
      } catch {
        /* empty state renders */
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  if (loading) return null

  return (
    <main className="min-h-screen bg-cream px-6 pt-12 pb-10 max-w-md mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => router.back()}
          className="font-sans text-sm text-text-muted"
        >
          ← Back
        </button>
        <h1 className="font-sans text-xl font-medium text-text-primary">All goals</h1>
      </div>

      {goals.length === 0 ? (
        <div className="border border-border-warm rounded-xl p-5">
          <p className="font-sans text-sm text-text-primary mb-2">No goals yet.</p>
          <p className="font-sans text-sm text-text-muted leading-relaxed">
            A goal groups sessions on a shared project — like{' '}
            <em>&ldquo;Ship v1&rdquo;</em> or <em>&ldquo;Learn Spanish&rdquo;</em>. Add one on
            any Save screen after finishing a session, and it&apos;ll appear here with running totals.
          </p>
        </div>
      ) : (
        <div className="flex flex-col">
          {goals.map((g) => (
            <button
              key={g.goal_id}
              onClick={() => router.push(`/goals/${g.goal_id}`)}
              className="flex items-center justify-between py-4 border-b border-border-warm last:border-0 text-left gap-4"
            >
              <div className="min-w-0">
                <p className="font-sans text-sm font-medium text-text-primary truncate">
                  {g.name}
                </p>
                <p className="font-sans text-xs text-text-muted mt-0.5">
                  {formatDuration(g.total_minutes)} · {g.session_count}{' '}
                  {g.session_count === 1 ? 'session' : 'sessions'}
                  {g.avg_rating !== null ? ` · ${g.avg_rating.toFixed(1)}/5` : ''}
                </p>
              </div>
              <span className="text-text-light shrink-0">›</span>
            </button>
          ))}
        </div>
      )}
    </main>
  )
}
