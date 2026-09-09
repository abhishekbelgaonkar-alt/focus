'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { SessionRow } from '@/components/SessionRow'

interface HistoryRow {
  id: string
  session_name: string | null
  started_at: string
  actual_duration_minutes: number
  rating: number | null
  goals: { name: string } | null
  categories: { name: string } | null
  session_tasks: { id: string }[]
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
            'id, session_name, started_at, actual_duration_minutes, rating, goals(name), categories(name), session_tasks(id)'
          )
          .eq('user_id', userData.user.id)
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

  return (
    <main className="min-h-screen bg-cream px-6 pt-12 pb-10 max-w-md mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => router.back()} className="font-sans text-sm text-text-muted">
          ← Back
        </button>
        <h1 className="font-sans text-xl font-medium text-text-primary">History</h1>
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
        <div>
          {sessions.map((s) => (
            <SessionRow
              key={s.id}
              id={s.id}
              sessionName={s.session_name}
              startedAt={s.started_at}
              actualDurationMinutes={s.actual_duration_minutes}
              rating={s.rating}
              goalName={s.goals?.name ?? s.categories?.name ?? null}
              taskCount={s.session_tasks.length}
              onClick={() => router.push(`/sessions/${s.id}`)}
            />
          ))}
        </div>
      )}
    </main>
  )
}
