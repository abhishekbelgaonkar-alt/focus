'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { clearSession, clearTimerState } from '@/lib/session-state'
import { RatingLineChart } from '@/components/RatingLineChart'
import { ConsistencyHeatmap } from '@/components/ConsistencyHeatmap'
import { streakFromDays, fetchDailyTotals, type DailyTotal } from '@/lib/stats'
import { formatDuration } from '@/lib/format'

// The day-view chart plots individual sessions; this many recent ones.
const RECENT_SESSIONS = 500

interface RecentSession {
  id: string
  session_name: string | null
  actual_duration_minutes: number
  started_at: string
  rating: number | null
  goals: { name: string } | null
}

export default function ProfilePage() {
  const router = useRouter()
  const supabase = createClient()

  const [recent, setRecent] = useState<RecentSession[]>([])
  const [days, setDays] = useState<DailyTotal[]>([])
  const [email, setEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser()
        if (!data.user) return
        setEmail(data.user.email ?? null)

        // Totals come from per-day sums computed in the database, so they
        // cover all time; only the day-view chart needs individual rows.
        const [daily, { data: s }] = await Promise.all([
          fetchDailyTotals(supabase),
          supabase
            .from('sessions')
            .select('id, session_name, actual_duration_minutes, started_at, rating, goals(name)')
            .eq('user_id', data.user.id)
            .eq('status', 'completed')
            .order('started_at', { ascending: false })
            .limit(RECENT_SESSIONS),
        ])
        setDays(daily)
        setRecent((s ?? []) as unknown as RecentSession[])
      } catch {
        /* renders zeros */
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    // A session in progress belongs to the account signing out.
    clearSession()
    clearTimerState()
    router.push('/')
  }

  if (loading) return null

  const totalMinutes = days.reduce((sum, d) => sum + d.minutes, 0)
  const sessionCount = days.reduce((sum, d) => sum + d.sessions, 0)
  const streak = streakFromDays(days.map((d) => d.date))

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

      {/* Account row — signed-in users see email + sign out; anon users see
          a sign-in prompt so they know it's an option. */}
      {email ? (
        <div className="flex items-center justify-between mb-8 pb-6 border-b border-border-warm">
          <p className="font-sans text-sm text-text-primary">{email}</p>
          <button onClick={handleSignOut} className="font-sans text-sm text-coral">
            Sign out
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between mb-8 pb-6 border-b border-border-warm">
          <p className="font-sans text-sm text-text-muted">No email attached</p>
          <button
            onClick={() => router.push('/signin')}
            className="font-sans text-sm text-coral"
          >
            Sign in
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
            {sessionCount}
          </p>
          <p className="font-sans text-xs text-text-muted mt-0.5">sessions</p>
        </div>
        <div>
          <p className="font-numbers text-2xl font-semibold text-text-primary">{streak}</p>
          <p className="font-sans text-xs text-text-muted mt-0.5">day streak</p>
        </div>
      </div>

      {/* Trend chart — time by default, rating available via toggle. */}
      <div className="mb-10">
        <p className="font-sans text-xs text-text-muted uppercase tracking-wide mb-4">
          Trend
        </p>
        <RatingLineChart
          sessions={recent}
          days={days}
          onNavigateToSession={(id) => router.push(`/sessions/${id}`)}
        />
      </div>

      {/* Consistency heatmap */}
      <div className="mb-10">
        <p className="font-sans text-xs text-text-muted uppercase tracking-wide mb-4">
          Consistency
        </p>
        <ConsistencyHeatmap days={days} />
      </div>
    </main>
  )
}
