'use client'
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getRatingLabel } from '@/lib/timer'
import { formatDuration, formatDateTime } from '@/lib/format'

interface TagRow {
  distraction_tags: { id: string; name: string }
}

interface TaskRow {
  id: string
  name: string
  position: number
  completed_at: string | null
  duration_seconds: number | null
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
  session_tasks: TaskRow[]
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
        session_distraction_tags(distraction_tags(id, name)),
        session_tasks(id, name, position, completed_at, duration_seconds)
      `)
      .eq('id', sessionId)
      .order('position', { foreignTable: 'session_tasks', ascending: true })
      .single()
      .then(({ data }) => {
        setSession(data as unknown as SessionDetail | null)
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

      {session.session_tasks && session.session_tasks.length > 0 && (() => {
        const fmtDur = (sec: number | null) => {
          if (sec === null) return null
          if (sec < 60) return `${sec}s`
          const m = Math.floor(sec / 60)
          const s = sec % 60
          return s === 0 ? `${m}m` : `${m}m ${s}s`
        }
        const done = session.session_tasks.filter((t) => t.completed_at)
        const unfinished = session.session_tasks.filter((t) => !t.completed_at)
        return (
          <div className="mb-8">
            <p className="font-sans text-xs text-text-muted uppercase tracking-wide mb-3">
              Tasks {done.length > 0 && (
                <span className="text-text-light normal-case tracking-normal">
                  · {done.length} of {session.session_tasks.length} finished
                </span>
              )}
            </p>
            <ul>
              {session.session_tasks.map((t) => {
                const isDone = t.completed_at !== null
                return (
                  <li
                    key={t.id}
                    className="flex items-center gap-3 py-2 border-b border-border-warm last:border-0"
                  >
                    <span
                      className={`w-4 h-4 rounded-full border-[1.5px] shrink-0 flex items-center justify-center ${
                        isDone ? 'bg-coral border-coral' : 'border-border-warm bg-transparent'
                      }`}
                    >
                      {isDone && (
                        <svg width="8" height="8" viewBox="0 0 10 10" aria-hidden="true">
                          <path
                            d="M1.5 5.5 L4 8 L8.5 2.5"
                            stroke="white"
                            strokeWidth="1.75"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                    <span
                      className={`flex-1 font-sans text-sm ${
                        isDone ? 'text-text-muted line-through' : 'text-text-primary'
                      }`}
                    >
                      {t.name}
                    </span>
                    {isDone ? (
                      <span className="font-numbers text-xs text-text-muted shrink-0">
                        {fmtDur(t.duration_seconds) ?? '—'}
                      </span>
                    ) : (
                      <span className="font-sans text-xs text-text-light shrink-0">unfinished</span>
                    )}
                  </li>
                )
              })}
            </ul>
            {/* Redundant summary; harmless if empty */}
            {unfinished.length > 0 && done.length > 0 && (
              <p className="font-sans text-xs text-text-muted mt-3">
                {unfinished.length} left unfinished.
              </p>
            )}
          </div>
        )
      })()}

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
