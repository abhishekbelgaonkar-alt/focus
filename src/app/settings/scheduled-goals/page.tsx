'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const DAY_LABELS: Record<string, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu',
  fri: 'Fri', sat: 'Sat', sun: 'Sun',
}

interface ScheduledGoal {
  id: string
  name: string
  schedule: string[]
}

export default function ScheduledGoalsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [goals, setGoals] = useState<ScheduledGoal[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('goals')
          .select('id, name, schedule')
          .not('schedule', 'is', null)
          .order('name')
        setGoals(
          ((data ?? []) as ScheduledGoal[]).filter(
            (g) => g.schedule && g.schedule.length > 0
          )
        )
      } catch {
        // Swallow — empty state will render.
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const handleRemove = async (goalId: string) => {
    await supabase.from('goals').update({ schedule: null }).eq('id', goalId)
    setGoals((prev) => prev.filter((g) => g.id !== goalId))
  }

  if (loading) return null

  return (
    <main className="min-h-screen bg-cream px-6 pt-12 pb-10 max-w-md mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => router.back()} className="font-sans text-sm text-text-muted">
          ← Back
        </button>
        <h1 className="font-sans text-xl font-medium text-text-primary">Scheduled goals</h1>
      </div>

      {goals.length === 0 ? (
        <div className="border border-border-warm rounded-xl p-5">
          <p className="font-sans text-sm text-text-primary mb-2">No scheduled goals yet.</p>
          <p className="font-sans text-sm text-text-muted mb-4">
            To schedule a goal, open{' '}
            <button
              onClick={() => router.push('/goals')}
              className="text-coral underline"
            >
              All goals
            </button>
            , tap a goal, then hit &ldquo;Schedule this goal&rdquo;.
          </p>
        </div>
      ) : (
        <div className="flex flex-col">
          {goals.map((g) => (
            <div
              key={g.id}
              className="flex items-center justify-between py-4 border-b border-border-warm last:border-0 gap-4"
            >
              <div className="min-w-0">
                <p className="font-sans text-sm font-medium text-text-primary truncate">
                  {g.name}
                </p>
                <p className="font-sans text-xs text-text-muted mt-0.5">
                  {g.schedule.map((d) => DAY_LABELS[d] ?? d).join(', ')}
                </p>
              </div>
              <button
                onClick={() => handleRemove(g.id)}
                className="font-sans text-lg text-text-light leading-none shrink-0"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
