'use client'
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { SessionRow } from '@/components/SessionRow'
import { formatDuration, timeAgo } from '@/lib/format'
import { getGoalColor } from '@/lib/goal-color'
import { streakFromDays, fetchDailyTotals, type DailyTotal } from '@/lib/stats'
import { ErrorToast } from '@/components/ErrorToast'

const PAGE_SIZE = 50

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
  const [days, setDays] = useState<DailyTotal[]>([])
  const [taskCounts, setTaskCounts] = useState({ total: 0, done: 0 })
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // One page of this goal's sessions, newest first.
  const fetchSessions = (from: number) =>
    supabase
      .from('sessions')
      .select('id, session_name, started_at, actual_duration_minutes, rating, session_tasks(id, completed_at)')
      .eq('goal_id', goalId)
      .eq('status', 'completed')
      .order('started_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)

  // Tasks in this goal's completed sessions; only the count is fetched.
  const countTasks = (doneOnly: boolean) => {
    let q = supabase
      .from('session_tasks')
      .select('id, sessions!inner(goal_id, status)', { count: 'exact', head: true })
      .eq('sessions.goal_id', goalId)
      .eq('sessions.status', 'completed')
    if (doneOnly) q = q.not('completed_at', 'is', null)
    return q
  }

  const load = async () => {
    // Totals and streaks come from per-day sums computed in the database, so
    // they cover every session; the list below loads a page at a time.
    const [{ data: g }, { data: s }, daily, { count: taskTotal }, { count: taskDone }] = await Promise.all([
      supabase
        .from('goals')
        .select('id, name, color, status, created_at, link_group_id, user_id')
        .eq('id', goalId)
        .single(),
      fetchSessions(0),
      fetchDailyTotals(supabase, goalId).catch(() => [] as DailyTotal[]),
      countTasks(false),
      countTasks(true),
    ])
    if (g) setGoal(g as GoalData)
    const rows = (s ?? []) as unknown as SessionItem[]
    setSessions(rows)
    setHasMore(rows.length === PAGE_SIZE)
    setDays(daily)
    setTaskCounts({ total: taskTotal ?? 0, done: taskDone ?? 0 })

    // This goal's share link, if one was made earlier.
    const { data: invite } = await supabase
      .from('goal_share_invites')
      .select('short_code')
      .eq('goal_id', goalId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setShareLink(invite ? `${window.location.origin}/goal-invite/${invite.short_code}` : null)

    // Other people holding a linked copy of this goal. Their goals aren't
    // readable directly, so the server looks them up.
    if ((g as GoalData | null)?.link_group_id) {
      const { data: handles } = await supabase.rpc('get_linked_goal_handles', { p_goal_id: goalId })
      setLinkedWith((handles ?? []) as string[])
    }
  }

  const shareGoal = async () => {
    const { data } = await supabase.rpc('generate_goal_share_code', { p_goal_id: goalId })
    const code = typeof data === 'string' ? data : null
    if (!code) { setActionError("Couldn't create a share link. Try again."); return }
    setShareLink(`${window.location.origin}/goal-invite/${code}`)
    setShareCopied(false)
  }

  const stopSharing = async () => {
    const { error } = await supabase.from('goal_share_invites').delete().eq('goal_id', goalId)
    if (error) { setActionError("Couldn't turn off the link. Try again."); return }
    setShareLink(null)
  }

  // Leaves the linked group: this copy of the goal becomes a plain goal.
  const unlink = async () => {
    const { error } = await supabase.from('goals').update({ link_group_id: null }).eq('id', goalId)
    if (error) { setActionError("Couldn't unlink this goal. Try again."); return }
    setGoal((prev) => (prev ? { ...prev, link_group_id: null } : prev))
    setLinkedWith([])
  }

  const loadMore = async () => {
    setLoadingMore(true)
    const { data, error } = await fetchSessions(sessions.length)
    setLoadingMore(false)
    if (error) { setActionError("Couldn't load more sessions."); return }
    const rows = (data ?? []) as unknown as SessionItem[]
    setSessions((prev) => [...prev, ...rows])
    setHasMore(rows.length === PAGE_SIZE)
  }

  const copyShare = async () => {
    if (!shareLink) return
    try {
      await navigator.clipboard.writeText(shareLink)
      setShareCopied(true)
    } catch { /* clipboard blocked: the link is selectable in the field */ }
  }

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [goalId])

  const setStatus = async (status: GoalData['status']) => {
    const { error } = await supabase.from('goals').update({ status }).eq('id', goalId)
    if (error) { setActionError("Couldn't update the goal. Try again."); return }
    setGoal((prev) => (prev ? { ...prev, status } : prev))
  }

  if (loading) return null
  if (!goal) return <p className="p-6 font-sans text-text-muted">Goal not found.</p>

  const color = getGoalColor({ id: goal.id, color: goal.color })

  // Aggregate stats
  const totalMinutes = days.reduce((sum, d) => sum + d.minutes, 0)
  const sessionCount = days.reduce((sum, d) => sum + d.sessions, 0)
  const rated = days.reduce((sum, d) => sum + d.rated, 0)
  const avgRating = rated > 0 ? days.reduce((sum, d) => sum + d.rating_sum, 0) / rated : null
  const uniqueDays = days.length
  const streak = streakFromDays(days.map((d) => d.date))
  const { total: taskTotal, done: taskDone } = taskCounts
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
          {' · '}
          <button onClick={unlink} className="underline">unlink</button>
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
            <button onClick={stopSharing} className="font-sans text-xs text-text-muted mt-2 underline">
              Stop sharing (the link stops working)
            </button>
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
            {sessionCount}
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
          stroke="currentColor"
          className="text-text-muted"
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
          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full font-sans text-xs text-coral py-3 disabled:opacity-50"
            >
              {loadingMore ? 'Loading…' : 'Show more'}
            </button>
          )}
        </div>
      )}
      {actionError && <ErrorToast message={actionError} onDismiss={() => setActionError(null)} />}
    </main>
  )
}
