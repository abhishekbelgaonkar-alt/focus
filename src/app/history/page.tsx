'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { SessionRow } from '@/components/SessionRow'
import { SearchBar } from '@/components/SearchBar'
import { formatDuration } from '@/lib/format'
import { getGoalColor } from '@/lib/goal-color'

interface HistoryRow {
  id: string
  session_name: string | null
  started_at: string
  actual_duration_minutes: number
  rating: number | null
  goals: { id: string; name: string; color: string | null } | null
  categories: { name: string } | null
  session_tasks: { id: string }[]
}

// Bucket sessions by relative date so the log reads naturally.
function bucketLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const dayDiff = Math.round((startOfToday - dayStart) / 86_400_000)
  if (dayDiff === 0) return 'Today'
  if (dayDiff === 1) return 'Yesterday'
  if (dayDiff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' })
  if (d.getFullYear() === now.getFullYear())
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export default function HistoryPage() {
  const router = useRouter()
  const supabase = createClient()
  const [sessions, setSessions] = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser()
        if (!userData?.user) return
        const { data } = await supabase
          .from('sessions')
          .select(
            'id, session_name, started_at, actual_duration_minutes, rating, goals(id, name, color), categories(name), session_tasks(id)'
          )
          .eq('user_id', userData.user.id)
          .eq('status', 'completed')
          .order('started_at', { ascending: false })
          .limit(500)
        setSessions((data ?? []) as unknown as HistoryRow[])
      } catch {
        /* empty state renders */
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  if (loading) return null

  // Group sessions by their bucket label, preserving date-desc order.
  const buckets: { label: string; rows: HistoryRow[]; totalMinutes: number }[] = []
  for (const s of sessions) {
    const lbl = bucketLabel(s.started_at)
    let bucket = buckets[buckets.length - 1]
    if (!bucket || bucket.label !== lbl) {
      bucket = { label: lbl, rows: [], totalMinutes: 0 }
      buckets.push(bucket)
    }
    bucket.rows.push(s)
    bucket.totalMinutes += s.actual_duration_minutes
  }

  return (
    <main className="min-h-screen bg-cream px-6 pt-12 pb-10 max-w-md mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="font-sans text-sm text-text-muted">
            ← Back
          </button>
          <h1 className="font-sans text-xl font-medium text-text-primary">History</h1>
        </div>
        <button
          onClick={() => router.push('/incomplete-tasks')}
          className="font-sans text-xs text-coral"
        >
          Unfinished tasks →
        </button>
      </div>

      {/* Search — quick jump to a past session without going home first */}
      <div className="mb-8">
        <SearchBar />
      </div>

      {sessions.length === 0 ? (
        <div className="border border-border-warm rounded-xl p-5">
          <p className="font-sans text-sm text-text-primary mb-2">No sessions yet.</p>
          <p className="font-sans text-sm text-text-muted">
            Once you finish and save a session, it&apos;ll show up here in
            reverse-chronological order.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {buckets.map((b) => (
            <div key={b.label}>
              <div className="flex items-baseline justify-between mb-2">
                <p className="font-sans text-xs font-medium text-text-muted uppercase tracking-wide">
                  {b.label}
                </p>
                <p className="font-numbers text-xs text-text-light">
                  {formatDuration(b.totalMinutes)} · {b.rows.length}{' '}
                  {b.rows.length === 1 ? 'session' : 'sessions'}
                </p>
              </div>
              <div>
                {b.rows.map((s) => (
                  <SessionRow
                    key={s.id}
                    id={s.id}
                    sessionName={s.session_name}
                    startedAt={s.started_at}
                    actualDurationMinutes={s.actual_duration_minutes}
                    rating={s.rating}
                    goalName={s.goals?.name ?? s.categories?.name ?? null}
                    goalColor={
                      s.goals
                        ? getGoalColor({ id: s.goals.id, color: s.goals.color })
                        : null
                    }
                    taskCount={s.session_tasks.length}
                    onClick={() => router.push(`/sessions/${s.id}`)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
