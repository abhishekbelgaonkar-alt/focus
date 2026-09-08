'use client'
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { SessionRow } from '@/components/SessionRow'
import { formatDuration } from '@/lib/format'

interface SessionItem {
  id: string
  session_name: string | null
  started_at: string
  actual_duration_minutes: number
  rating: number | null
}

interface GoalData {
  id: string
  name: string
}

export default function GoalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: goalId } = use(params)
  const router = useRouter()
  const supabase = createClient()

  const [goal, setGoal] = useState<GoalData | null>(null)
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('goals').select('id, name').eq('id', goalId).single(),
      supabase
        .from('sessions')
        .select('id, session_name, started_at, actual_duration_minutes, rating')
        .eq('goal_id', goalId)
        .order('started_at', { ascending: false }),
    ]).then(([{ data: g }, { data: s }]) => {
      if (g) setGoal(g as GoalData)
      setSessions((s ?? []) as SessionItem[])
      setLoading(false)
    })
  }, [goalId])

  if (loading) return null
  if (!goal) return <p className="p-6 font-sans text-text-muted">Goal not found.</p>

  const totalMinutes = sessions.reduce((sum, s) => sum + s.actual_duration_minutes, 0)
  const ratings = sessions.map((s) => s.rating).filter((r): r is number => r !== null)
  const avgRating =
    ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null

  return (
    <main className="min-h-screen bg-cream px-6 pt-12 pb-10 max-w-md mx-auto">
      <button
        onClick={() => router.back()}
        className="font-sans text-sm text-text-muted mb-6 block"
      >
        ← Back
      </button>

      <h1 className="font-sans text-2xl font-medium text-text-primary mb-6">{goal.name}</h1>

      {/* Three stats */}
      <div className="flex gap-6 mb-10">
        <div>
          <p className="font-numbers text-2xl font-semibold text-text-primary">
            {formatDuration(totalMinutes)}
          </p>
          <p className="font-sans text-xs text-text-muted mt-0.5">total time</p>
        </div>
        <div>
          <p className="font-numbers text-2xl font-semibold text-text-primary">
            {sessions.length}
          </p>
          <p className="font-sans text-xs text-text-muted mt-0.5">sessions</p>
        </div>
        <div>
          <p className="font-numbers text-2xl font-semibold text-text-primary">
            {avgRating !== null ? `${avgRating.toFixed(1)}/5` : '—'}
          </p>
          <p className="font-sans text-xs text-text-muted mt-0.5">avg rating</p>
        </div>
      </div>

      <p className="font-sans text-xs text-text-muted uppercase tracking-wide mb-2">
        Session history
      </p>

      {sessions.length === 0 ? (
        <p className="font-sans text-sm text-text-muted py-4">No sessions yet.</p>
      ) : (
        <div>
          {sessions.map((s) => (
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
      )}
    </main>
  )
}
