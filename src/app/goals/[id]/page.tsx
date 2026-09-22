'use client'
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { SessionRow } from '@/components/SessionRow'
import { formatDuration, timeAgo } from '@/lib/format'
import { getGoalColor } from '@/lib/goal-color'
import { calcDayStreak } from '@/lib/stats'

interface SessionItem {
  id: string
  session_name: string | null
  started_at: string
  actual_duration_minutes: number
  rating: number | null
  session_tasks: { id: string; completed_at: string | null }[]
}

interface GoalData {
  id: string
  name: string
  color: string | null
  status: 'active' | 'completed' | 'abandoned'
  created_at: string
  link_group_id: string | null
  user_id: string
}

export default function GoalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: goalId } = use(params)
  const router = useRouter()
  const supabase = createClient()

  const [goal, setGoal] = useState<GoalData | null>(null)
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [linkedWith, setLinkedWith] = useState<string[]>([])
  const [shareLink, setShareLink] = useState<string | null>(null)
  const [shareCopied, setShareCopied] = useState(false)

  const load = async () => {
    const [{ data: g }, { data: s }] = await Promise.all([
      supabase
        .from('goals')
        .select('id, name, color, status, created_at, link_group_id, user_id')
        .eq('id', goalId)
        .single(),
      supabase
        .from('sessions')
        .select('id, session_name, started_at, actual_duration_minutes, rating, session_tasks(id, completed_at)')
        .eq('goal_id', goalId)
        .eq('status', 'completed')
        .order('started_at', { ascending: false }),
    ])
    if (g) setGoal(g as GoalData)
    setSessions((s ?? []) as unknown as SessionItem[])

    // If this goal is part of a link_group, fetch the other collaborators'
    // handles. RLS on the friends system allows reading any user_profile,
    // so this shows a warm attribution without requiring extra permissions.
    const goalRow = g as GoalData | null
    if (goalRow?.link_group_id) {
      const { data: linked } = await supabase
        .from('goals')
        .select('user_id')
        .eq('link_group_id', goalRow.link_group_id)
        .neq('user_id', goalRow.user_id)
      const otherIds = ((linked ?? []) as Array<{ user_id: string }>).map((r) => r.user_id)
      if (otherIds.length > 0) {
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('handle')
          .in('user_id', otherIds)
        setLinkedWith(((profiles ?? []) as Array<{ handle: string }>).map((p) => p.handle))
      }
    }
  }

  const shareGoal = async () => {
    const { data } = await supabase.rpc('generate_goal_share_code', { p_goal_id: goalId })
    const code = typeof data === 'string' ? data : null
    if (code) {
      setShareLink(`${window.location.origin}/goal-invite/${code}`)
      setShareCopied(false)
    }
  }

  const copyShare = async () => {
    if (!shareLink) return
    await navigator.clipboard.writeText(shareLink)
    setShareCopied(true)
  }

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [goalId])

  const setStatus = async (status: GoalData['status']) => {
    await supabase.from('goals').update({ status }).eq('id', goalId)
    setGoal((prev) => (prev ? { ...prev, status } : prev))
  }

  if (loading) return null
  if (!goal) return <p className="p-6 font-sans text-text-muted">Goal not found.</p>

  const color = getGoalColor({ id: goal.id, color: goal.color })

  // Aggregate stats
  const totalMinutes = sessions.reduce((sum, s) => sum + s.actual_duration_minutes, 0)
  const ratings = sessions.map((s) => s.rating).filter((r): r is number => r !== null)
  const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null

  // Unique days worked
  const uniqueDays = new Set(sessions.map((s) => s.started_at.slice(0, 10))).size
  // Consecutive-day streak
  const streak = calcDayStreak(sessions.map((s) => s.started_at))
  // Task tallies
  const allTasks = sessions.flatMap((s) => s.session_tasks ?? [])
  const taskTotal = allTasks.length
  const taskDone = allTasks.filter((t) => t.completed_at !== null).length
  // Last session
  const lastAt = sessions[0]?.started_at ?? null

  return (
    <main className="min-h-screen bg-cream px-6 pt-12 pb-10 max-w-md mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => router.back()} className="font-sans text-sm text-text-muted">
          ← Back
        </button>
        <span
          className="font-sans text-xs uppercase tracking-wide"
          style={{ color: goal.status === 'completed' ? '#16a34a' : goal.status === 'abandoned' ? '#b91c1c' : color }}
        >
          {goal.status}
        </span>
      </div>

      <div className="flex items-center gap-3 mb-2">
        <span
          className="w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <h1 className="font-sans text-2xl font-medium" style={{ color }}>
          {goal.name}
        </h1>
      </div>
      <p className="font-sans text-xs text-text-muted mb-2">
        Created {timeAgo(goal.created_at)}
        {lastAt ? ` · last session ${timeAgo(lastAt)}` : ''}
      </p>
      {linkedWith.length > 0 && (
        <p className="font-sans text-xs text-text-muted mb-2">
          Linked with{' '}
          <span className="text-text-primary">{linkedWith.join(', ')}</span>
        </p>
      )}
      <div className="mb-8">
        {shareLink ? (
          <div className="mt-2 p-3 border border-border-warm rounded-xl">
            <p className="font-sans text-xs text-text-muted mb-2">
              Anyone with this link can link this goal to their account.
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={shareLink}
                className="flex-1 bg-transparent border-b border-border-warm pb-1 font-sans text-xs text-text-primary focus:outline-none"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button onClick={copyShare} className="font-sans text-xs text-coral shrink-0">
                {shareCopied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={shareGoal}
            className="font-sans text-xs text-coral"
          >
            Share this goal
          </button>
        )}
      </div>

      {/* Hero stat — total time. This is the thing that actually moves. */}
      <div className="mb-6">
        <p className="font-numbers text-4xl font-semibold text-text-primary leading-none">
          {formatDuration(totalMinutes)}
        </p>
        <p className="font-sans text-xs text-text-muted mt-1">total time</p>
      </div>

      {/* Supporting stats — sessions, streak, rating, tasks. */}
      <div className="grid grid-cols-4 gap-4 mb-10">
        <div>
          <p className="font-numbers text-lg font-semibold text-text-primary">
            {sessions.length}
          </p>
          <p className="font-sans text-xs text-text-muted mt-0.5">sessions</p>
        </div>
        <div>
          <p className="font-numbers text-lg font-semibold text-text-primary">{streak}</p>
          <p className="font-sans text-xs text-text-muted mt-0.5">day streak</p>
        </div>
        <div>
          <p className="font-numbers text-lg font-semibold text-text-primary">
            {avgRating !== null ? avgRating.toFixed(1) : '-'}
          </p>
          <p className="font-sans text-xs text-text-muted mt-0.5">avg rating</p>
        </div>
        <div>
          <p className="font-numbers text-lg font-semibold text-text-primary">
            {taskTotal === 0 ? '-' : `${taskDone}/${taskTotal}`}
          </p>
          <p className="font-sans text-xs text-text-muted mt-0.5">tasks done</p>
        </div>
      </div>

      {/* Days-worked meta */}
      <p className="font-sans text-xs text-text-muted mb-8 -mt-6">
        Across {uniqueDays} {uniqueDays === 1 ? 'day' : 'days'}.
      </p>

      {/* Status actions */}
      <div className="flex flex-wrap gap-3 mb-8">
        {goal.status !== 'completed' && (
          <button
            onClick={() => setStatus('completed')}
            className="font-sans text-xs px-3 py-1.5 rounded-pill border-[1.5px]"
            style={{ borderColor: '#16a34a', color: '#16a34a' }}
          >
            Mark completed
          </button>
        )}
        {goal.status !== 'abandoned' && (
          <button
            onClick={() => setStatus('abandoned')}
            className="font-sans text-xs px-3 py-1.5 rounded-pill border-[1.5px] border-border-warm text-text-muted"
          >
            Mark abandoned
          </button>
        )}
        {goal.status !== 'active' && (
          <button
            onClick={() => setStatus('active')}
            className="font-sans text-xs px-3 py-1.5 rounded-pill border-[1.5px] border-coral text-coral"
          >
            Reopen
          </button>
        )}
      </div>

      {/* Schedule link */}
      <button
        onClick={() => router.push(`/goals/${goalId}/schedule`)}
        className="flex items-center gap-2 py-3 mb-4 border-b border-border-warm w-full text-left"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#b08c6a"
          strokeWidth="2"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <line x1="12" y1="14" x2="12" y2="18" />
          <line x1="10" y1="16" x2="14" y2="16" />
        </svg>
        <span className="font-sans text-sm text-text-muted">Schedule this goal</span>
      </button>

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
              taskCount={s.session_tasks?.length ?? 0}
              onClick={() => router.push(`/sessions/${s.id}`)}
            />
          ))}
        </div>
      )}
    </main>
  )
}
