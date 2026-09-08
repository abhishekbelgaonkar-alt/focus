'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { RatingLineChart } from '@/components/RatingLineChart'
import { ConsistencyHeatmap } from '@/components/ConsistencyHeatmap'
import { calcDayStreak, buildHeatmapDays, generateCSV } from '@/lib/stats'
import { formatDuration } from '@/lib/format'

interface FullSession {
  id: string
  session_name: string | null
  planned_duration_minutes: number
  actual_duration_minutes: number
  started_at: string
  ended_at: string
  rating: number | null
  notes: string | null
  end_reason: string | null
  goals: { name: string } | null
  categories: { name: string } | null
  session_distraction_tags: { distraction_tags: { name: string } }[]
}

export default function ProfilePage() {
  const router = useRouter()
  const supabase = createClient()

  const [sessions, setSessions] = useState<FullSession[]>([])
  const [email, setEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser()
        if (!data.user) return
        setEmail(data.user.email ?? null)

        const { data: s } = await supabase
          .from('sessions')
          .select(`
            id, session_name, planned_duration_minutes, actual_duration_minutes,
            started_at, ended_at, rating, notes, end_reason,
            goals(name), categories(name),
            session_distraction_tags(distraction_tags(name))
          `)
          .eq('user_id', data.user.id)
          .order('started_at', { ascending: true })

        setSessions((s ?? []) as unknown as FullSession[])
      } catch {
        /* renders zeros */
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/setup')
  }

  const handleExport = () => {
    const csv = generateCSV(sessions)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `focus-sessions-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return null

  const totalMinutes = sessions.reduce((sum, s) => sum + s.actual_duration_minutes, 0)
  const streak = calcDayStreak(sessions.map((s) => s.started_at))
  const dayMap = buildHeatmapDays(sessions)

  return (
    <main className="min-h-screen bg-cream px-6 pt-12 pb-10 max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="font-sans text-sm text-text-muted">
            ← Back
          </button>
          <h1 className="font-sans text-xl font-medium text-text-primary">Profile</h1>
        </div>
        <button
          onClick={() => router.push('/settings')}
          aria-label="Settings"
          className="text-text-muted"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      {/* Account row */}
      {email && (
        <div className="flex items-center justify-between mb-8 pb-6 border-b border-border-warm">
          <p className="font-sans text-sm text-text-primary">{email}</p>
          <button onClick={handleSignOut} className="font-sans text-sm text-coral">
            Sign out
          </button>
        </div>
      )}

      {/* Lifetime stats */}
      <div className="flex gap-6 mb-10">
        <div>
          <p className="font-numbers text-2xl font-semibold text-text-primary">
            {formatDuration(totalMinutes)}
          </p>
          <p className="font-sans text-xs text-text-muted mt-0.5">all time</p>
        </div>
        <div>
          <p className="font-numbers text-2xl font-semibold text-text-primary">
            {sessions.length}
          </p>
          <p className="font-sans text-xs text-text-muted mt-0.5">sessions</p>
        </div>
        <div>
          <p className="font-numbers text-2xl font-semibold text-text-primary">{streak}</p>
          <p className="font-sans text-xs text-text-muted mt-0.5">day streak</p>
        </div>
      </div>

      {/* Rating line chart */}
      <div className="mb-10">
        <p className="font-sans text-xs text-text-muted uppercase tracking-wide mb-4">
          Rating over time
        </p>
        <RatingLineChart
          sessions={sessions}
          onNavigateToSession={(id) => router.push(`/sessions/${id}`)}
        />
      </div>

      {/* Consistency heatmap */}
      <div className="mb-10">
        <p className="font-sans text-xs text-text-muted uppercase tracking-wide mb-4">
          Consistency
        </p>
        <ConsistencyHeatmap dayMap={dayMap} sessions={sessions} />
      </div>

      {/* CSV export */}
      <button
        onClick={handleExport}
        className="w-full flex items-center justify-center gap-2 border-[1.5px] border-border-warm text-text-muted font-sans text-sm py-3 rounded-pill"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Export all data as CSV
      </button>
    </main>
  )
}
