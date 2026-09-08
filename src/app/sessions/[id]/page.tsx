'use client'
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getRatingLabel } from '@/lib/timer'
import { formatDuration, formatDateTime } from '@/lib/format'

interface TagRow {
  distraction_tags: { id: string; name: string }
}

interface SessionDetail {
  id: string
  session_name: string | null
  started_at: string
  actual_duration_minutes: number
  rating: number | null
  notes: string | null
  goals: { name: string } | null
  categories: { name: string } | null
  session_distraction_tags: TagRow[]
}

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = use(params)
  const router = useRouter()
  const supabase = createClient()
  const [session, setSession] = useState<SessionDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('sessions')
      .select(`
        id,
        session_name,
        started_at,
        actual_duration_minutes,
        rating,
        notes,
        goals(name),
        categories(name),
        session_distraction_tags(distraction_tags(id, name))
      `)
      .eq('id', sessionId)
      .single()
      .then(({ data }) => {
        setSession(data as SessionDetail | null)
        setLoading(false)
      })
  }, [sessionId])

  if (loading) return null
  if (!session) return <p className="p-6 font-sans text-text-muted">Session not found.</p>

  const contextName = session.goals?.name ?? session.categories?.name ?? null
  const tags = session.session_distraction_tags.map((t) => t.distraction_tags)

  return (
    <main className="min-h-screen bg-cream px-6 pt-12 pb-10 max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => router.back()} className="font-sans text-sm text-text-muted">
          ← Back
        </button>
        <button
          onClick={() => router.push(`/sessions/${sessionId}/edit`)}
          className="font-sans text-sm text-coral"
        >
          Edit
        </button>
      </div>

      {contextName && (
        <p className="font-sans text-sm text-text-muted mb-1">{contextName}</p>
      )}
      <h1 className="font-sans text-xl font-medium text-text-primary mb-1">
        {session.session_name ?? 'Session'}
      </h1>
      <p className="font-sans text-xs text-text-muted mb-8">
        {formatDateTime(session.started_at)} · {formatDuration(session.actual_duration_minutes)}
      </p>

      {session.rating !== null && (
        <div className="mb-8">
          <p className="font-numbers text-4xl font-semibold text-text-primary">
            {session.rating.toFixed(1)}/5
          </p>
          <p className="font-sans text-sm text-text-muted mt-1">
            {getRatingLabel(session.rating)}
          </p>
        </div>
      )}

      {tags.length > 0 && (
        <div className="mb-8">
          <p className="font-sans text-xs text-text-muted uppercase tracking-wide mb-3">
            Distractions
          </p>
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <span
                key={t.id}
                className="px-3 py-1.5 rounded-pill text-sm font-sans bg-coral-light border-[1.5px] border-coral text-tag-text"
              >
                {t.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {session.notes && (
        <div className="mb-8">
          <p className="font-sans text-xs text-text-muted uppercase tracking-wide mb-2">Notes</p>
          <p className="font-sans text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
            {session.notes}
          </p>
        </div>
      )}
    </main>
  )
}
