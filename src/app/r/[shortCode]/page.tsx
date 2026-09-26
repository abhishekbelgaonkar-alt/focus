'use client'
import { useState, useEffect, use, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatDuration, todayWeekday } from '@/lib/format'
import {
  elapsedMinutes,
  elapsedSeconds,
  remainingMinutes,
  isInOvertime,
  formatParticipantStatus,
  participantTargetEndIso,
  plannedMinutesFor,
} from '@/lib/rooms'
import { saveSession } from '@/lib/session-state'
import { createGoal } from '@/lib/goals'
import { TaskCheck } from '@/components/TaskCheck'
import type { Room, RoomParticipantView } from '@/lib/types'

/*
  Room page. Shared focus space where everyone brings their own work:
    * Each participant has their own task list + goal (public tasks,
      private check-offs, private goal).
    * The room owns a "suggested setup" (host's) which seeds joiners'
      lists when the host opted to propagate.
    * Any home-page entry point (quick-start, today's schedule, continue
      in-progress, new goal) is reachable from inside the room.
    * A heartbeat every minute keeps you in the room. Go quiet for five
      minutes (closed tab, sleeping laptop) and you drop out of the list;
      come back and you're revived with your clock intact.
*/

type PageStatus =
  | 'loading'
  | 'not_found'
  | 'ended'
  | 'joining'
  | 'not_joined'
  | 'full'
  | 'in_room'
  | 'error'

interface Props {
  params: Promise<{ shortCode: string }>
}

// What anyone holding the link can see about the room (get_room_preview).
interface RoomPreview {
  room_id: string
  host_handle: string | null
  session_name: string | null
  planned_duration_minutes: number
  goal_label: string | null
  is_member: boolean
}

interface Template {
  id: string
  name: string
  planned_duration_minutes: number
  tasks: Array<{ name: string }>
  goal_id: string | null
}

interface GoalRow {
  id: string
  name: string
  schedule: string[] | null
}

interface InProgressRow {
  id: string
  session_name: string | null
  goal_id: string | null
  elapsed_seconds: number | null
}

type CheckedTasks = Map<number, { completedAt: string; elapsedSecondsAtCompletion: number }>

const HEARTBEAT_MS = 60_000

// Check-offs are private, so they live in this tab rather than the database.
// Keyed per room so a refresh doesn't lose them.
const checksKey = (roomId: string) => `room_checks:${roomId}`

function loadChecks(roomId: string): CheckedTasks {
  try {
    const raw = sessionStorage.getItem(checksKey(roomId))
    return raw ? new Map(JSON.parse(raw)) : new Map()
  } catch {
    return new Map()
  }
}

export default function RoomPage({ params }: Props) {
  const { shortCode } = use(params)
  const router = useRouter()
  const supabase = createClient()

  const [status, setStatus] = useState<PageStatus>('loading')
  const [preview, setPreview] = useState<RoomPreview | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [participants, setParticipants] = useState<RoomParticipantView[]>([])
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [myJoinedAt, setMyJoinedAt] = useState<string | null>(null)
  const [myGoal, setMyGoal] = useState<{ goal_id: string | null; goal_label: string | null }>({
    goal_id: null,
    goal_label: null,
  })

  // Minute-resolution tick: every display on this page is in whole minutes.
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 15_000)
    return () => window.clearInterval(interval)
  }, [])

  // Handle edit + stay-prompt + private check-offs.
  const [editingHandle, setEditingHandle] = useState(false)
  const [handleDraft, setHandleDraft] = useState('')
  const [handleError, setHandleError] = useState<string | null>(null)
  const [stayDismissed, setStayDismissed] = useState(false)
  const [checkedTasks, setCheckedTasks] = useState<CheckedTasks>(new Map())

  // Load-setup source data. Fetched once after join.
  const [myGoals, setMyGoals] = useState<GoalRow[]>([])
  const [myTemplates, setMyTemplates] = useState<Template[]>([])
  const [myInProgress, setMyInProgress] = useState<InProgressRow[]>([])

  // Inline UI state
  const [addTaskDraft, setAddTaskDraft] = useState('')
  const [editingTaskIndex, setEditingTaskIndex] = useState<number | null>(null)
  const [taskEditDraft, setTaskEditDraft] = useState('')
  const [newGoalDraft, setNewGoalDraft] = useState('')
  const [showGoalPicker, setShowGoalPicker] = useState(false)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [showInProgressPicker, setShowInProgressPicker] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  // A saved-for-later session being continued in this room.
  const [continuing, setContinuing] = useState<{ id: string; priorMinutes: number } | null>(null)

  const reloadParticipants = useCallback(async (roomId: string, currentUserId: string) => {
    const { data: raw } = await supabase
      .from('room_participants')
      .select('user_id, joined_at, left_at, tasks, target_end_at')
      .eq('room_id', roomId)
      .is('left_at', null)
      .order('joined_at', { ascending: true })

    const activeRows = (raw ?? []) as Array<{
      user_id: string
      joined_at: string
      left_at: string | null
      tasks: Array<{ name: string }> | null
      target_end_at: string | null
    }>
    if (activeRows.length === 0) {
      setParticipants([])
      return
    }

    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('user_id, handle')
      .in('user_id', activeRows.map((r) => r.user_id))
    const handleByUser = new Map<string, string>()
    for (const p of (profiles ?? []) as Array<{ user_id: string; handle: string }>) {
      handleByUser.set(p.user_id, p.handle)
    }

    setParticipants(
      activeRows.map((r) => ({
        user_id: r.user_id,
        handle: handleByUser.get(r.user_id) ?? 'unknown',
        joined_at: r.joined_at,
        left_at: r.left_at,
        is_you: r.user_id === currentUserId,
        tasks: r.tasks ?? [],
        target_end_at: r.target_end_at,
      }))
    )
  }, [supabase])

  // Load user's goals, templates, in-progress sessions once (for the
  // "load setup" chips + goal picker). Called after join.
  const loadUserData = useCallback(async (userId: string) => {
    const [{ data: g }, { data: t }, { data: ip }] = await Promise.all([
      supabase
        .from('goals')
        .select('id, name, schedule')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('name'),
      supabase
        .from('session_templates')
        .select('id, name, planned_duration_minutes, tasks, goal_id')
        .eq('user_id', userId)
        .order('last_used_at', { ascending: false, nullsFirst: false }),
      supabase
        .from('sessions')
        .select('id, session_name, goal_id, elapsed_seconds')
        .eq('user_id', userId)
        .eq('status', 'in_progress')
        .order('started_at', { ascending: false }),
    ])
    setMyGoals((g ?? []) as GoalRow[])
    setMyTemplates((t ?? []) as Template[])
    setMyInProgress((ip ?? []) as InProgressRow[])
  }, [supabase])

  // Check in, then load everything a participant sees.
  const enterRoom = useCallback(async (roomId: string, userId: string) => {
    const { data: beat } = await supabase.rpc('room_heartbeat', { p_room_id: roomId })
    if (beat === 'ended') { setStatus('ended'); return }
    if (beat !== 'active') { setStatus('not_joined'); return }

    const [{ data: roomRow }, { data: myPart }, { data: goalRow }] = await Promise.all([
      supabase.from('rooms').select('*').eq('id', roomId).single(),
      supabase.from('room_participants').select('joined_at')
        .eq('room_id', roomId).eq('user_id', userId).single(),
      supabase.from('room_participant_goals').select('goal_id, goal_label')
        .eq('room_id', roomId).eq('user_id', userId).maybeSingle(),
    ])
    if (!roomRow || !myPart) { setStatus('error'); return }

    setRoom(roomRow as Room)
    setMyJoinedAt(myPart.joined_at)
    setMyGoal({ goal_id: goalRow?.goal_id ?? null, goal_label: goalRow?.goal_label ?? null })
    setCheckedTasks(loadChecks(roomId))
    await Promise.all([reloadParticipants(roomId, userId), loadUserData(userId)])
    setStatus('in_room')
  }, [supabase, reloadParticipants, loadUserData])

  // Initial load.
  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData?.user) { setStatus('error'); return }
      setMyUserId(userData.user.id)

      const { data, error } = await supabase.rpc('get_room_preview', { p_code: shortCode })
      if (error) { setStatus('error'); return }
      const result = data as { status: string } & RoomPreview
      if (result.status === 'not_found') { setStatus('not_found'); return }
      if (result.status === 'ended') { setStatus('ended'); return }
      setPreview(result)

      if (result.is_member) await enterRoom(result.room_id, userData.user.id)
      else setStatus('not_joined')
    })()
  }, [shortCode, supabase, enterRoom])

  // Realtime: participant rows (tasks, joins, leaves, stay-with).
  useEffect(() => {
    if (status !== 'in_room' || !room || !myUserId) return
    const channel = supabase
      .channel(`room:${room.short_code}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_participants', filter: `room_id=eq.${room.id}` },
        () => reloadParticipants(room.id, myUserId)
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [status, room, myUserId, supabase, reloadParticipants])

  // Heartbeat: every minute, and straight away when the tab comes back.
  useEffect(() => {
    if (status !== 'in_room' || !room) return
    const beat = async () => {
      const { data } = await supabase.rpc('room_heartbeat', { p_room_id: room.id })
      if (data === 'ended') setStatus('ended')
      else if (data === 'left') setStatus('not_joined')
    }
    const onVisible = () => { if (document.visibilityState === 'visible') beat() }
    const interval = window.setInterval(beat, HEARTBEAT_MS)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [status, room, supabase])

  // Persist private check-offs for this tab.
  useEffect(() => {
    if (!room) return
    try {
      sessionStorage.setItem(checksKey(room.id), JSON.stringify([...checkedTasks]))
    } catch { /* storage unavailable: check-offs just won't survive a refresh */ }
  }, [room, checkedTasks])

  const join = async () => {
    if (!myUserId) return
    setStatus('joining')
    const { data, error } = await supabase.rpc('join_room_by_code', { p_code: shortCode })
    if (error) { setStatus('error'); return }
    const result = data as { status: string; room_id?: string }
    if (result.status === 'not_found') { setStatus('not_found'); return }
    if (result.status === 'ended') { setStatus('ended'); return }
    if (result.status === 'full') { setStatus('full'); return }
    await enterRoom(result.room_id!, myUserId)
  }

  // My current setup.
  const me = participants.find((p) => p.is_you)
  const myTasks = me?.tasks ?? []
  const myGoalId = myGoal.goal_id
  const myGoalLabel = myGoal.goal_label
  const myGoalName = myGoalId
    ? (myGoals.find((g) => g.id === myGoalId)?.name ?? myGoalLabel)
    : myGoalLabel

  const saveMySetup = async (
    tasks: Array<{ name: string }>,
    goal_id: string | null,
    goal_label: string | null
  ) => {
    if (!room) return
    await supabase.rpc('update_participant_setup', {
      p_room_id: room.id,
      p_tasks: tasks,
      p_goal_id: goal_id,
      p_goal_label: goal_label,
    })
    // Realtime will trigger reloadParticipants; also optimistic-update:
    setParticipants((prev) => prev.map((p) => (p.is_you ? { ...p, tasks } : p)))
    setMyGoal({ goal_id, goal_label })
  }

  const addTask = async () => {
    const name = addTaskDraft.trim()
    if (!name) return
    const next = [...myTasks, { name }]
    setAddTaskDraft('')
    await saveMySetup(next, myGoalId, myGoalLabel)
  }

  const removeTask = async (index: number) => {
    const next = myTasks.filter((_, i) => i !== index)
    // Also drop the check-off if it was ticked.
    setCheckedTasks((prev) => {
      const nextMap = new Map<number, { completedAt: string; elapsedSecondsAtCompletion: number }>()
      prev.forEach((v, k) => {
        if (k === index) return
        nextMap.set(k > index ? k - 1 : k, v)
      })
      return nextMap
    })
    await saveMySetup(next, myGoalId, myGoalLabel)
  }

  const renameTask = async (index: number, newName: string) => {
    const trimmed = newName.trim()
    if (!trimmed) return
    const next = myTasks.map((t, i) => (i === index ? { name: trimmed } : t))
    await saveMySetup(next, myGoalId, myGoalLabel)
  }

  const copyTaskFrom = async (otherUserId: string, taskIndex: number) => {
    const other = participants.find((p) => p.user_id === otherUserId)
    if (!other) return
    const source = other.tasks[taskIndex]
    if (!source) return
    // Don't add duplicates by name.
    if (myTasks.some((t) => t.name === source.name)) return
    const next = [...myTasks, { name: source.name }]
    await saveMySetup(next, myGoalId, myGoalLabel)
  }

  const pickExistingGoal = async (goalId: string) => {
    const g = myGoals.find((x) => x.id === goalId)
    await saveMySetup(myTasks, goalId, g?.name ?? null)
    setShowGoalPicker(false)
  }

  const clearGoal = async () => {
    await saveMySetup(myTasks, null, null)
    setShowGoalPicker(false)
  }

  const createAndPickGoal = async () => {
    const newGoal = await createGoal(supabase, newGoalDraft)
    if (newGoal) {
      setMyGoals((prev) => [...prev, { ...newGoal, schedule: null }])
      await saveMySetup(myTasks, newGoal.id, newGoal.name)
    }
    setNewGoalDraft('')
    setShowGoalPicker(false)
  }

  const loadTemplate = async (templateId: string) => {
    const t = myTemplates.find((x) => x.id === templateId)
    if (!t) return
    const goalName = t.goal_id ? (myGoals.find((g) => g.id === t.goal_id)?.name ?? null) : null
    await saveMySetup(t.tasks, t.goal_id, goalName)
    // A new task list: old check-offs pointed at different tasks.
    setCheckedTasks(new Map())
    setContinuing(null)
    setShowTemplatePicker(false)
    // Mark last_used_at for future ordering.
    supabase.from('session_templates').update({ last_used_at: new Date().toISOString() }).eq('id', t.id).then(() => {})
  }

  const loadInProgress = async (sessionId: string) => {
    const s = myInProgress.find((x) => x.id === sessionId)
    if (!s) return
    const goalName = s.goal_id ? (myGoals.find((g) => g.id === s.goal_id)?.name ?? null) : null
    // Fetch its tasks
    const { data: taskRows } = await supabase
      .from('session_tasks').select('name, position').eq('session_id', sessionId).order('position')
    const tasks = ((taskRows ?? []) as Array<{ name: string; position: number }>).map((t) => ({ name: t.name }))
    await saveMySetup(tasks, s.goal_id, goalName)
    setCheckedTasks(new Map())
    // Ending the room session completes this saved session instead of
    // leaving it in progress next to a new one.
    setContinuing({ id: s.id, priorMinutes: Math.round((s.elapsed_seconds ?? 0) / 60) })
    setShowInProgressPicker(false)
  }

  // Schedule check for "today: X" chip. Only surface a chip if it's not
  // already the current goal (would just be duplicative clutter).
  const todayKey = todayWeekday()
  const scheduledTodayNotCurrent = myGoals.filter(
    (g) => g.schedule?.includes(todayKey) && g.id !== myGoalId
  )

  const endSession = async () => {
    if (!room || !myJoinedAt || !myUserId) return
    // Click handler, not render: the tick-based nowMs can be 15s stale here.
    // eslint-disable-next-line react-hooks/purity
    const roomMinutes = Math.max(1, elapsedMinutes(myJoinedAt, Date.now()))

    saveSession({
      plannedDurationMinutes: plannedMinutesFor(myJoinedAt, room.planned_duration_minutes, me?.target_end_at ?? null),
      startedAt: myJoinedAt,
      setupFocusText: room.session_name,
      goalId: myGoalId,
      endReason: null,
      actualDurationMinutes: roomMinutes + (continuing?.priorMinutes ?? 0),
      isExpired: false,
      tasks: myTasks.map((t, i) => {
        const checked = checkedTasks.get(i)
        return {
          id: `${myJoinedAt}-${i}`,
          name: t.name,
          position: i,
          completedAt: checked?.completedAt ?? null,
          elapsedSecondsAtCompletion: checked?.elapsedSecondsAtCompletion ?? null,
        }
      }),
      existingSessionId: continuing?.id ?? null,
      roomId: room.id,
    })

    await supabase.rpc('leave_room', { p_room_id: room.id })
    try { sessionStorage.removeItem(checksKey(room.id)) } catch { /* ignore */ }
    router.push('/rate')
  }

  const toggleRoomTask = (index: number) => {
    if (!myJoinedAt) return
    setCheckedTasks((prev) => {
      const next = new Map(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.set(index, {
          completedAt: new Date().toISOString(),
          elapsedSecondsAtCompletion: elapsedSeconds(myJoinedAt, Date.now()),
        })
      }
      return next
    })
  }

  const startEditingHandle = () => {
    setHandleDraft(me?.handle ?? '')
    setHandleError(null)
    setEditingHandle(true)
  }

  const saveHandle = async () => {
    const trimmed = handleDraft.trim()
    if (!trimmed || trimmed === me?.handle) { setEditingHandle(false); return }
    const { data } = await supabase.rpc('update_handle', { p_new_handle: trimmed })
    const result = data as { status: string; handle?: string } | null
    if (result?.status === 'taken') { setHandleError('That handle is taken'); return }
    if (result?.status === 'too_long') { setHandleError('Too long'); return }
    if (result?.status !== 'ok') { setHandleError("Couldn't save that handle"); return }
    setEditingHandle(false)
    setHandleError(null)
    if (room && myUserId) reloadParticipants(room.id, myUserId)
  }

  // "Stay with": move my end time to theirs. Saved on my participant row
  // so everyone sees my real time left.
  const syncWith = async (participant: RoomParticipantView) => {
    if (!room) return
    const targetEndIso = participantTargetEndIso(
      participant.joined_at,
      plannedMinutesFor(participant.joined_at, room.planned_duration_minutes, participant.target_end_at)
    )
    setParticipants((prev) => prev.map((p) => (p.is_you ? { ...p, target_end_at: targetEndIso } : p)))
    await supabase.rpc('set_room_target_end', { p_room_id: room.id, p_target_end: targetEndIso })
  }

  const copyShareLink = async () => {
    if (!room) return
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/r/${room.short_code}`)
      setShareCopied(true)
      window.setTimeout(() => setShareCopied(false), 2000)
    } catch { /* clipboard blocked: the code is shown next to the button */ }
  }

  // ── Render ────────────────────────────────────────────────────────────

  if (status === 'loading' || status === 'joining') {
    return (
      <main className="min-h-screen bg-cream px-6 pt-16 pb-10 max-w-md mx-auto">
        <p className="font-sans text-sm text-text-light text-center">Loading…</p>
      </main>
    )
  }

  if (status === 'not_found') {
    return (
      <main className="min-h-screen bg-cream px-6 pt-16 pb-10 max-w-md mx-auto">
        <p className="font-sans text-sm text-text-primary mb-4">This room doesn&apos;t exist.</p>
        <button onClick={() => router.push('/')} className="font-sans text-sm text-coral">Go home</button>
      </main>
    )
  }

  if (status === 'ended') {
    return (
      <main className="min-h-screen bg-cream px-6 pt-16 pb-10 max-w-md mx-auto">
        <p className="font-sans text-sm text-text-primary mb-4">This room has ended.</p>
        <button onClick={() => router.push('/')} className="font-sans text-sm text-coral">Go home</button>
      </main>
    )
  }

  if (status === 'full') {
    return (
      <main className="min-h-screen bg-cream px-6 pt-16 pb-10 max-w-md mx-auto">
        <p className="font-sans text-sm text-text-primary mb-4">This room is full (8 people).</p>
        <button onClick={() => router.push('/')} className="font-sans text-sm text-coral">Go home</button>
      </main>
    )
  }

  if (status === 'not_joined') {
    return (
      <main className="min-h-screen bg-cream px-6 pt-16 pb-10 max-w-md mx-auto">
        <p className="font-sans text-2xl font-medium text-text-primary mb-2">
          {preview?.host_handle ?? 'Someone'}
        </p>
        <p className="font-sans text-sm text-text-muted mb-8">invited you to focus together.</p>
        {preview?.session_name && (
          <p className="font-sans text-sm text-text-muted mb-2">
            Working on: <span className="text-text-primary">{preview.session_name}</span>
          </p>
        )}
        {preview?.goal_label && (
          <p className="font-sans text-sm text-text-muted mb-2">
            Under goal: <span className="text-text-primary">{preview.goal_label}</span>
          </p>
        )}
        <p className="font-sans text-sm text-text-muted mb-8">
          {preview?.planned_duration_minutes} minute session
        </p>
        <button
          onClick={join}
          className="w-full bg-coral text-white font-sans font-medium py-3 rounded-pill"
        >Join</button>
        <button
          onClick={() => router.push('/')}
          className="w-full font-sans text-sm text-text-muted mt-4"
        >Not now</button>
      </main>
    )
  }

  if (status === 'error' || !room || !myJoinedAt || !myUserId) {
    return (
      <main className="min-h-screen bg-cream px-6 pt-16 pb-10 max-w-md mx-auto">
        <p className="font-sans text-sm text-text-primary mb-4">Something went wrong.</p>
        <button onClick={() => router.push('/')} className="font-sans text-sm text-coral">Go home</button>
      </main>
    )
  }

  // ── in_room render ────────────────────────────────────────────────────
  const effectivePlanned = plannedMinutesFor(myJoinedAt, room.planned_duration_minutes, me?.target_end_at ?? null)
  const myElapsed = elapsedMinutes(myJoinedAt, nowMs)
  const myRemaining = remainingMinutes(myJoinedAt, effectivePlanned, nowMs)
  const myOvertime = isInOvertime(myJoinedAt, effectivePlanned, nowMs)

  const others = participants.filter((p) => !p.is_you)
  const roomStartedElapsed = elapsedMinutes(room.started_at, nowMs)

  const showStayPrompt =
    !stayDismissed && !myOvertime && myRemaining <= 2 && myRemaining >= 0 && others.length > 0

  return (
    <main className="min-h-screen bg-cream px-6 pt-8 pb-10 max-w-md mx-auto flex flex-col">
      {/* Ambient header */}
      <p className="font-sans text-xs text-text-light text-center mb-6">
        {room.session_name ? room.session_name : 'a room'} · started {roomStartedElapsed}m ago
      </p>

      {/* Big personal timer */}
      <div className="flex flex-col items-center mb-8">
        <p className="font-numbers text-6xl font-semibold text-text-primary leading-none">
          {myOvertime
            ? `+${formatDuration(-myRemaining)}`
            : formatDuration(Math.max(0, myRemaining))}
        </p>
        <p className="font-sans text-sm text-text-muted mt-2">
          {myOvertime ? 'past your target' : 'time remaining'}
        </p>
      </div>

      {/* Stay-prompt */}
      {showStayPrompt && (
        <div className="mb-6 p-3 border border-border-warm rounded-xl bg-white">
          <p className="font-sans text-sm text-text-primary mb-2">
            Others are still here. Keep going?
          </p>
          <div className="flex gap-3">
            <button onClick={() => setStayDismissed(true)} className="font-sans text-xs text-coral">
              Yes, stay
            </button>
            <span className="font-sans text-xs text-text-light">·</span>
            <button onClick={endSession} className="font-sans text-xs text-text-muted">
              End now
            </button>
          </div>
        </div>
      )}

      {/* You + handle edit */}
      {me && (
        <div className="mb-3">
          {editingHandle ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={handleDraft}
                onChange={(e) => setHandleDraft(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveHandle()
                  if (e.key === 'Escape') setEditingHandle(false)
                }}
                className="flex-1 bg-transparent border-b border-border-warm pb-1 text-sm text-text-primary focus:outline-none focus:border-coral font-sans"
              />
              <button onClick={saveHandle} className="font-sans text-xs text-coral">Save</button>
              <button onClick={() => setEditingHandle(false)} className="font-sans text-xs text-text-muted">Cancel</button>
            </div>
          ) : (
            <div className="flex items-baseline gap-2">
              <p className="font-sans text-sm text-text-primary">
                you · <span className="font-medium">{me.handle}</span>
              </p>
              <button onClick={startEditingHandle} className="font-sans text-xs text-text-muted underline">
                edit
              </button>
            </div>
          )}
          {handleError && <p className="font-sans text-xs text-coral mt-1">{handleError}</p>}
        </div>
      )}

      {/* Your goal */}
      <div className="mb-3">
        {showGoalPicker ? (
          <div className="p-3 border border-border-warm rounded-xl">
            <p className="font-sans text-xs text-text-muted mb-2">Pick a goal</p>
            <div className="flex flex-col gap-1 mb-3 max-h-40 overflow-y-auto">
              {myGoals.map((g) => (
                <button
                  key={g.id}
                  onClick={() => pickExistingGoal(g.id)}
                  className={`text-left font-sans text-sm px-2 py-1 rounded ${
                    myGoalId === g.id ? 'bg-coral-light text-tag-text' : 'text-text-primary hover:bg-cream'
                  }`}
                >
                  {g.name}
                </button>
              ))}
              {myGoals.length === 0 && (
                <p className="font-sans text-xs text-text-light">No goals yet.</p>
              )}
            </div>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={newGoalDraft}
                onChange={(e) => setNewGoalDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') createAndPickGoal() }}
                placeholder="Or type a new goal name"
                className="flex-1 bg-transparent border-b border-border-warm pb-1 text-sm text-text-primary focus:outline-none focus:border-coral font-sans"
              />
              <button onClick={createAndPickGoal} className="font-sans text-xs text-coral">Add</button>
            </div>
            <div className="flex justify-between">
              <button onClick={clearGoal} className="font-sans text-xs text-text-muted">
                No goal for this session
              </button>
              <button onClick={() => setShowGoalPicker(false)} className="font-sans text-xs text-text-muted">
                Close
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-baseline gap-2">
            <p className="font-sans text-sm text-text-muted">
              goal:{' '}
              {myGoalName ? (
                <span className="text-text-primary">{myGoalName}</span>
              ) : (
                <span className="text-text-light italic">none</span>
              )}
            </p>
            <button onClick={() => setShowGoalPicker(true)} className="font-sans text-xs text-coral underline">
              {myGoalName ? 'change' : 'pick one'}
            </button>
          </div>
        )}
      </div>

      {/* Your tasks */}
      <div className="mb-4">
        {myTasks.length > 0 && (
          <ul className="flex flex-col">
            {myTasks.map((t, i) => {
              const done = checkedTasks.has(i)
              const isEditing = editingTaskIndex === i
              return (
                <li key={i} className="flex items-center gap-3 py-2 border-b border-border-warm">
                  <TaskCheck done={done} taskName={t.name} onToggle={() => toggleRoomTask(i)} />
                  {isEditing ? (
                    <input
                      type="text"
                      value={taskEditDraft}
                      onChange={(e) => setTaskEditDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { renameTask(i, taskEditDraft); setEditingTaskIndex(null) }
                        if (e.key === 'Escape') setEditingTaskIndex(null)
                      }}
                      onBlur={() => { renameTask(i, taskEditDraft); setEditingTaskIndex(null) }}
                      autoFocus
                      className="flex-1 bg-transparent border-b border-coral pb-0.5 text-sm text-text-primary focus:outline-none font-sans"
                    />
                  ) : (
                    <button
                      onClick={() => { setEditingTaskIndex(i); setTaskEditDraft(t.name) }}
                      className={`flex-1 text-left font-sans text-sm ${
                        done ? 'text-text-muted line-through' : 'text-text-primary'
                      }`}
                    >
                      {t.name}
                    </button>
                  )}
                  <button
                    onClick={() => removeTask(i)}
                    aria-label={`Remove ${t.name}`}
                    className="font-sans text-xs text-text-light shrink-0"
                  >
                    ×
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <div className="flex items-center gap-2 py-2">
          <span className="w-5 h-5 rounded-full border-[1.5px] border-border-warm shrink-0" aria-hidden="true" />
          <input
            type="text"
            value={addTaskDraft}
            onChange={(e) => setAddTaskDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addTask() }}
            placeholder="add a task"
            className="flex-1 bg-transparent border-b border-transparent pb-0.5 text-sm text-text-primary focus:outline-none focus:border-coral font-sans placeholder:text-text-light"
          />
        </div>
      </div>

      {/* Load setup: chips for templates, scheduled goals, in-progress */}
      {(myTemplates.length > 0 || scheduledTodayNotCurrent.length > 0 || myInProgress.length > 0) && (
        <div className="mb-6">
          <p className="font-sans text-xs text-text-light mb-2">load setup:</p>
          <div className="flex flex-wrap gap-2">
            {myTemplates.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowTemplatePicker((v) => !v)}
                  className="font-sans text-xs px-3 py-1 rounded-pill border border-border-warm text-text-muted"
                >
                  quick-start ▾
                </button>
                {showTemplatePicker && (
                  <div className="absolute z-10 mt-1 bg-cream border border-border-warm rounded-xl p-2 min-w-48 shadow-sm">
                    {myTemplates.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => loadTemplate(t.id)}
                        className="block w-full text-left font-sans text-sm px-2 py-1 text-text-primary hover:bg-cream"
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {scheduledTodayNotCurrent.map((g) => (
              <button
                key={g.id}
                onClick={() => pickExistingGoal(g.id)}
                className="font-sans text-xs px-3 py-1 rounded-pill border border-border-warm text-text-muted"
              >
                today: {g.name}
              </button>
            ))}
            {myInProgress.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowInProgressPicker((v) => !v)}
                  className="font-sans text-xs px-3 py-1 rounded-pill border border-border-warm text-text-muted"
                >
                  continue ▾
                </button>
                {showInProgressPicker && (
                  <div className="absolute z-10 mt-1 bg-cream border border-border-warm rounded-xl p-2 min-w-48 shadow-sm">
                    {myInProgress.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => loadInProgress(s.id)}
                        className="block w-full text-left font-sans text-sm px-2 py-1 text-text-primary hover:bg-cream"
                      >
                        {s.session_name ?? 'Untitled session'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Focusing with */}
      {others.length > 0 && (
        <div className="mb-8">
          <p className="font-sans text-xs text-text-muted mb-3">focusing with</p>
          <div className="flex flex-col gap-4">
            {others.map((p) => {
              const otherPlanned = plannedMinutesFor(p.joined_at, room.planned_duration_minutes, p.target_end_at)
              const otherRemaining = remainingMinutes(p.joined_at, otherPlanned, nowMs)
              const canSync = otherRemaining > myRemaining
              return (
                <div key={p.user_id} className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-2">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0 translate-y-[-2px]"
                      style={{ backgroundColor: 'var(--color-check-green)' }}
                      aria-hidden="true"
                    />
                    <p className="font-sans text-sm text-text-primary flex-1">
                      {p.handle}
                    </p>
                    <p className="font-sans text-xs text-text-light">
                      {formatParticipantStatus(p.joined_at, otherPlanned, nowMs)}
                    </p>
                    {canSync && (
                      <button onClick={() => syncWith(p)} className="font-sans text-xs text-coral">
                        stay with
                      </button>
                    )}
                  </div>
                  {p.tasks.length > 0 && (
                    <ul className="ml-4 flex flex-col gap-0.5">
                      {p.tasks.map((t, i) => {
                        const alreadyHave = myTasks.some((mt) => mt.name === t.name)
                        return (
                          <li key={i} className="flex items-center gap-2">
                            <span className="font-sans text-xs text-text-muted">· {t.name}</span>
                            {!alreadyHave && (
                              <button
                                onClick={() => copyTaskFrom(p.user_id, i)}
                                className="font-sans text-xs text-coral"
                              >
                                + copy
                              </button>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {others.length === 0 && (
        <p className="font-sans text-xs text-text-light text-center mb-8">
          You&apos;re the only one here so far. Share the link below.
        </p>
      )}

      <div className="mt-auto flex flex-col gap-3">
        <button
          onClick={endSession}
          className="w-full bg-coral text-white font-sans font-medium py-3 rounded-pill"
        >
          End session
        </button>
        <div className="flex items-baseline gap-2 justify-center">
          <p className="font-sans text-xs text-text-light">
            room {room.short_code} · {myElapsed}m in
          </p>
          <button onClick={copyShareLink} className="font-sans text-xs text-coral">
            {shareCopied ? 'copied' : 'copy link'}
          </button>
        </div>
      </div>
    </main>
  )
}
