'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/format'

interface IncompleteTaskRow {
  id: string
  name: string
  sessions: {
    id: string
    session_name: string | null
    started_at: string
    status: string
    goals: { name: string } | null
    categories: { name: string } | null
  } | null
}

export default function IncompleteTasksPage() {
  const router = useRouter()
  const supabase = createClient()
  const [tasks, setTasks] = useState<IncompleteTaskRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser()
        if (!userData?.user) return
        const { data } = await supabase
          .from('session_tasks')
          .select(
            'id, name, sessions!inner(id, session_name, started_at, status, user_id, goals(name), categories(name))'
          )
          .is('completed_at', null)
          .eq('sessions.user_id', userData.user.id)
          .eq('sessions.status', 'completed')
          .order('sessions(started_at)', { ascending: false })
          .limit(500)
        setTasks((data ?? []) as unknown as IncompleteTaskRow[])
      } catch {
        /* empty state */
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
        <h1 className="font-sans text-xl font-medium text-text-primary">Unfinished tasks</h1>
      </div>

      {tasks.length === 0 ? (
        <div className="border border-border-warm rounded-xl p-5">
          <p className="font-sans text-sm text-text-primary mb-2">Nothing left unfinished.</p>
          <p className="font-sans text-sm text-text-muted">
            Any task you didn&apos;t check off before saving a session will show up here.
          </p>
        </div>
      ) : (
        <div>
          {tasks.map((t) => {
            const s = t.sessions
            if (!s) return null
            const context = s.goals?.name ?? s.categories?.name ?? null
            return (
              <button
                key={t.id}
                onClick={() => router.push(`/sessions/${s.id}`)}
                className="w-full text-left py-3.5 border-b border-border-warm last:border-0 block"
              >
                <p className="font-sans text-sm font-medium text-text-primary truncate">
                  {t.name}
                </p>
                <p className="font-sans text-xs text-text-muted mt-0.5 truncate">
                  {[
                    context,
                    s.session_name ?? 'Session',
                    formatDate(s.started_at),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </button>
            )
          })}
        </div>
      )}
    </main>
  )
}
