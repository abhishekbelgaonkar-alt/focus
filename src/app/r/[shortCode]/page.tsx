'use client'
import { useState, useEffect, use, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatDuration } from '@/lib/format'
import {
  elapsedMinutes,
  remainingMinutes,
  isInOvertime,
  formatParticipantStatus,
  effectiveDurationForTarget,
  participantTargetEndIso,
} from '@/lib/rooms'
import { saveSession } from '@/lib/session-state'
import type { Room, RoomParticipantView } from '@/lib/types'

/*
  Room page. One route handles every state of a room from the user's
  perspective:
    * Loading: fetching the room
    * Not found / ended: friendly message + go home
    * Not yet joined: "Alice invited you" prompt with a Join button
    * Joined + focusing: the big personal timer + participant list + sync
      buttons + end button
    * Post-end: routes to the Rate page via saveSession()

  Each participant's clock is personal (starts at their joined_at). Sync
  ("Stay with X") is asymmetric: only appears next to participants with more
  time remaining than you. Tapping sync overrides your local target so your
  timer ends when theirs would.
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

export default function RoomPage({ params }: Props) {
  const { shortCode } = use(params)
  const router = useRouter()
  const supabase = createClient()

  const [status, setStatus] = useState<PageStatus>('loading')
  const [room, setRoom] = useState<Room | null>(null)
  const [participants, setParticipants] = useState<RoomParticipantView[]>([])
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [myJoinedAt, setMyJoinedAt] = useState<string | null>(null)
  const [hostHandle, setHostHandle] = useState<string | null>(null)

  // Client-side override of the effective planned duration for THIS user.
  // Used by the sync feature: after tapping "Stay with X", we bump this
  // upward so the timer's target end shifts to match X's target. Never
  // written to the server; purely a local view.
  const [personalDurationOverride, setPersonalDurationOverride] = useState<number | null>(null)

  // Tick state to force re-renders every second for the countdown.
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  // Reload the participant list (called on Realtime updates and on join)
  const reloadParticipants = useCallback(async (roomId: string, currentUserId: string) => {
    const { data: raw } = await supabase
      .from('room_participants')
      .select('user_id, joined_at, left_at')
      .eq('room_id', roomId)
      .is('left_at', null)
      .order('joined_at', { ascending: true })

    const activeRows = (raw ?? []) as { user_id: string; joined_at: string; left_at: string | null }[]
    if (activeRows.length === 0) {
      setParticipants([])
      return
    }

    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('user_id, handle')
      .in('user_id', activeRows.map((r) => r.user_id))

    const handleByUser = new Map<string, string>()
    for (const p of (profiles ?? []) as { user_id: string; handle: string }[]) {
      handleByUser.set(p.user_id, p.handle)
    }

    setParticipants(
      activeRows.map((r) => ({
        user_id: r.user_id,
        handle: handleByUser.get(r.user_id) ?? 'unknown',
        joined_at: r.joined_at,
        left_at: r.left_at,
        is_you: r.user_id === currentUserId,
      }))
    )
  }, [supabase])

  // Initial load: fetch the room, decide the user's state relative to it.
  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData?.user) {
        setStatus('error')
        return
      }
      setMyUserId(userData.user.id)

      const { data: roomRow } = await supabase
        .from('rooms')
        .select('*')
        .eq('short_code', shortCode)
        .maybeSingle()

      if (!roomRow) {
        setStatus('not_found')
        return
      }

      const r = roomRow as unknown as Room
      setRoom(r)

      if (r.ended_at) {
        setStatus('ended')
        return
      }

      // Fetch host's handle (for the "Alice invited you" screen)
      const { data: hostProfile } = await supabase
        .from('user_profiles')
        .select('handle')
        .eq('user_id', r.host_user_id)
        .maybeSingle()
      setHostHandle(hostProfile?.handle ?? 'someone')

      // Am I already a participant?
      const { data: myPart } = await supabase
        .from('room_participants')
        .select('joined_at, left_at')
        .eq('room_id', r.id)
        .eq('user_id', userData.user.id)
        .maybeSingle()

      if (myPart && !myPart.left_at) {
        setMyJoinedAt(myPart.joined_at)
        setStatus('in_room')
        await reloadParticipants(r.id, userData.user.id)
      } else {
        setStatus('not_joined')
      }
    })()
  }, [shortCode, supabase, reloadParticipants])

  // Realtime subscription: watch room_participants for this room so the
  // list updates when others join/leave/change handle.
  useEffect(() => {
    if (status !== 'in_room' || !room || !myUserId) return

    const channel = supabase
      .channel(`room:${room.short_code}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_participants', filter: `room_id=eq.${room.id}` },
        () => reloadParticipants(room.id, myUserId)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'user_profiles' },
        () => reloadParticipants(room.id, myUserId)
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [status, room, myUserId, supabase, reloadParticipants])

  const join = async () => {
    setStatus('joining')
    const { data, error } = await supabase.rpc('join_room_by_code', { p_code: shortCode })
    if (error) {
      setStatus('error')
      return
    }
    const result = data as { status: string; room_id?: string }
    if (result.status === 'not_found') {
      setStatus('not_found')
      return
    }
    if (result.status === 'ended') {
      setStatus('ended')
      return
    }
    if (result.status === 'full') {
      setStatus('full')
      return
    }
    // 'joined' or 'rejoined': reload participants and enter the room
    const { data: myPart } = await supabase
      .from('room_participants')
      .select('joined_at')
      .eq('room_id', result.room_id!)
      .eq('user_id', myUserId!)
      .maybeSingle()
    setMyJoinedAt(myPart?.joined_at ?? new Date().toISOString())
    await reloadParticipants(result.room_id!, myUserId!)
    setStatus('in_room')
  }

  // End your own session: save it with the room's setup + your elapsed time,
  // then hand off to the Rate page.
  //
  // Goal resolution: if the room's goal is part of a link_group and this user
  // has their own copy in that group, use their copy. Host case: the room's
  // goal_id already IS their own goal, so we use it directly. Non-collaborator
  // case: no goal_id gets set; the goal_label shows as informational context
  // on the Rate page instead.
  const endSession = async () => {
    if (!room || !myJoinedAt || !myUserId) return

    const elapsed = elapsedMinutes(myJoinedAt, nowMs)

    let resolvedGoalId: string | null = null
    if (room.goal_id && room.host_user_id === myUserId) {
      // Host: room's goal_id is their own goal.
      resolvedGoalId = room.goal_id
    } else if (room.goal_id) {
      // Joiner: check if the room's goal is linked and if this user has a copy.
      const { data: sourceGoal } = await supabase
        .from('goals')
        .select('link_group_id')
        .eq('id', room.goal_id)
        .maybeSingle()
      if (sourceGoal?.link_group_id) {
        const { data: myLinkedGoal } = await supabase
          .from('goals')
          .select('id')
          .eq('user_id', myUserId)
          .eq('link_group_id', sourceGoal.link_group_id)
          .maybeSingle()
        resolvedGoalId = myLinkedGoal?.id ?? null
      }
    }

    saveSession({
      plannedDurationMinutes: personalDurationOverride ?? room.planned_duration_minutes,
      startedAt: myJoinedAt,
      setupFocusText: room.session_name,
      goalId: resolvedGoalId,
      categoryId: null,
      endReason: null,
      actualDurationMinutes: elapsed,
      isExpired: false,
      tasks: (room.tasks ?? []).map((t, i) => ({
        id: `${myJoinedAt}-${i}`,
        name: t.name,
        position: i,
        completedAt: null,
        elapsedSecondsAtCompletion: null,
      })),
      existingSessionId: null,
      roomId: room.id,
    })

    // Mark participant as left; server will end the room if this was the last one.
    await supabase.rpc('leave_room', { p_room_id: room.id })

    router.push('/rate')
  }

  // Handle inline edit — updates the user's handle globally via RPC.
  const [editingHandle, setEditingHandle] = useState(false)
  const [handleDraft, setHandleDraft] = useState('')
  const [handleError, setHandleError] = useState<string | null>(null)

  // Stay-prompt dismissal — user tapped "Yes, stay" so we don't re-nag.
  // Declared here (before any early returns) to keep hook order stable.
  const [stayDismissed, setStayDismissed] = useState(false)

  const myHandle = participants.find((p) => p.is_you)?.handle ?? ''

  const startEditingHandle = () => {
    setHandleDraft(myHandle)
    setHandleError(null)
    setEditingHandle(true)
  }

  const saveHandle = async () => {
    const trimmed = handleDraft.trim()
    if (!trimmed || trimmed === myHandle) {
      setEditingHandle(false)
      return
    }
    const { data } = await supabase.rpc('update_handle', { p_new_handle: trimmed })
    const result = data as { status: string; handle?: string } | null
    if (result?.status === 'taken') {
      setHandleError('That handle is taken')
      return
    }
    if (result?.status === 'too_long') {
      setHandleError('Too long')
      return
    }
    setEditingHandle(false)
    setHandleError(null)
    // Realtime UPDATE on user_profiles will trigger reloadParticipants
  }

  const syncWith = (participant: RoomParticipantView) => {
    if (!room) return
    const targetEndIso = participantTargetEndIso(participant.joined_at, room.planned_duration_minutes)
    if (!myJoinedAt) return
    const newDuration = effectiveDurationForTarget(myJoinedAt, targetEndIso)
    setPersonalDurationOverride(newDuration)
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
        <p className="font-sans text-sm text-text-primary mb-4">
          This room doesn&apos;t exist or has ended.
        </p>
        <button onClick={() => router.push('/')} className="font-sans text-sm text-coral">
          Go home
        </button>
      </main>
    )
  }

  if (status === 'ended') {
    return (
      <main className="min-h-screen bg-cream px-6 pt-16 pb-10 max-w-md mx-auto">
        <p className="font-sans text-sm text-text-primary mb-4">
          This room has ended.
        </p>
        <button onClick={() => router.push('/')} className="font-sans text-sm text-coral">
          Go home
        </button>
      </main>
    )
  }

  if (status === 'full') {
    return (
      <main className="min-h-screen bg-cream px-6 pt-16 pb-10 max-w-md mx-auto">
        <p className="font-sans text-sm text-text-primary mb-4">
          This room is full (8 people).
        </p>
        <button onClick={() => router.push('/')} className="font-sans text-sm text-coral">
          Go home
        </button>
      </main>
    )
  }

  if (status === 'not_joined') {
    return (
      <main className="min-h-screen bg-cream px-6 pt-16 pb-10 max-w-md mx-auto">
        <p className="font-sans text-2xl font-medium text-text-primary mb-2">
          {hostHandle}
        </p>
        <p className="font-sans text-sm text-text-muted mb-8">
          invited you to focus together.
        </p>
        {room?.session_name && (
          <p className="font-sans text-sm text-text-muted mb-2">
            Working on: <span className="text-text-primary">{room.session_name}</span>
          </p>
        )}
        {room?.goal_label && (
          <p className="font-sans text-sm text-text-muted mb-2">
            Under goal: <span className="text-text-primary">{room.goal_label}</span>
          </p>
        )}
        <p className="font-sans text-sm text-text-muted mb-8">
          {room?.planned_duration_minutes} minute session
        </p>
        <button
          onClick={join}
          className="w-full bg-coral text-white font-sans font-medium py-3 rounded-pill"
        >
          Join
        </button>
        <button
          onClick={() => router.push('/')}
          className="w-full font-sans text-sm text-text-muted mt-4"
        >
          Not now
        </button>
      </main>
    )
  }

  if (status === 'error' || !room || !myJoinedAt || !myUserId) {
    return (
      <main className="min-h-screen bg-cream px-6 pt-16 pb-10 max-w-md mx-auto">
        <p className="font-sans text-sm text-text-primary mb-4">
          Something went wrong.
        </p>
        <button onClick={() => router.push('/')} className="font-sans text-sm text-coral">
          Go home
        </button>
      </main>
    )
  }

  // ── in_room render ────────────────────────────────────────────────────
  const effectivePlanned = personalDurationOverride ?? room.planned_duration_minutes
  const myElapsed = elapsedMinutes(myJoinedAt, nowMs)
  const myRemaining = remainingMinutes(myJoinedAt, effectivePlanned, nowMs)
  const myOvertime = isInOvertime(myJoinedAt, effectivePlanned, nowMs)

  const others = participants.filter((p) => !p.is_you)
  const you = participants.find((p) => p.is_you)
  const roomStartedElapsed = elapsedMinutes(room.started_at, nowMs)

  // Stay-prompt: within the last 2 minutes of your target and others are
  // still going. Non-blocking; user dismisses or acts.
  const showStayPrompt =
    !stayDismissed &&
    !myOvertime &&
    myRemaining <= 2 &&
    myRemaining >= 0 &&
    others.length > 0

  return (
    <main className="min-h-screen bg-cream px-6 pt-8 pb-10 max-w-md mx-auto flex flex-col">
      {/* Ambient header: room-time */}
      <p className="font-sans text-xs text-text-light text-center mb-8">
        Room started {roomStartedElapsed}m ago
      </p>

      {/* Big personal timer */}
      <div className="flex flex-col items-center mb-10">
        <p className="font-numbers text-6xl font-semibold text-text-primary leading-none">
          {myOvertime
            ? `+${formatDuration(-myRemaining)}`
            : formatDuration(Math.max(0, myRemaining))}
        </p>
        <p className="font-sans text-sm text-text-muted mt-2">
          {myOvertime ? 'past your target' : 'time remaining'}
        </p>
      </div>

      {/* Stay-prompt: near the end and others are still going */}
      {showStayPrompt && (
        <div className="mb-6 p-3 border border-border-warm rounded-xl bg-white">
          <p className="font-sans text-sm text-text-primary mb-2">
            Others are still here. Keep going?
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setStayDismissed(true)}
              className="font-sans text-xs text-coral"
            >
              Yes, stay
            </button>
            <span className="font-sans text-xs text-text-light">·</span>
            <button
              onClick={endSession}
              className="font-sans text-xs text-text-muted"
            >
              End now
            </button>
          </div>
        </div>
      )}

      {/* Your row: handle with inline edit */}
      {you && (
        <div className="mb-4">
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
              <button onClick={saveHandle} className="font-sans text-xs text-coral">
                Save
              </button>
              <button onClick={() => setEditingHandle(false)} className="font-sans text-xs text-text-muted">
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p className="font-sans text-sm text-text-primary">
                You are <span className="font-medium">{you.handle}</span>
              </p>
              <button
                onClick={startEditingHandle}
                className="font-sans text-xs text-text-muted underline"
              >
                edit
              </button>
            </div>
          )}
          {handleError && (
            <p className="font-sans text-xs text-coral mt-1">{handleError}</p>
          )}
        </div>
      )}

      {/* Participant list */}
      {others.length > 0 && (
        <div className="mb-8">
          <p className="font-sans text-xs text-text-muted uppercase tracking-wide mb-3">
            Focusing with
          </p>
          <div className="flex flex-col gap-2">
            {others.map((p) => {
              const otherRemaining = remainingMinutes(p.joined_at, room.planned_duration_minutes, nowMs)
              const canSync = otherRemaining > myRemaining
              return (
                <div key={p.user_id} className="flex items-center gap-3">
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: 'var(--color-check-green)' }}
                    aria-hidden="true"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-sans text-sm text-text-primary truncate">
                      {p.handle}
                    </p>
                    <p className="font-sans text-xs text-text-light">
                      {formatParticipantStatus(p.joined_at, room.planned_duration_minutes, nowMs)}
                    </p>
                  </div>
                  {canSync && (
                    <button
                      onClick={() => syncWith(p)}
                      className="font-sans text-xs text-coral shrink-0"
                    >
                      Stay with
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {others.length === 0 && (
        <p className="font-sans text-xs text-text-light text-center mb-8">
          You&apos;re the only one here so far. Share the link.
        </p>
      )}

      {/* Session-context reminders (from the room's setup) */}
      {(room.session_name || room.tasks?.length > 0) && (
        <div className="mb-8 p-3 border border-border-warm rounded-xl">
          {room.session_name && (
            <p className="font-sans text-sm text-text-primary mb-1">
              {room.session_name}
            </p>
          )}
          {room.goal_label && (
            <p className="font-sans text-xs text-text-muted">
              {room.goal_label}
            </p>
          )}
          {room.tasks?.length > 0 && (
            <ul className="mt-2">
              {(room.tasks as Array<{ name: string }>).map((t, i) => (
                <li key={i} className="font-sans text-xs text-text-muted">
                  · {t.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-auto flex flex-col gap-3">
        <button
          onClick={endSession}
          className="w-full bg-coral text-white font-sans font-medium py-3 rounded-pill"
        >
          End session
        </button>
        <p className="font-sans text-xs text-text-light text-center">
          {myElapsed}m in the room
        </p>
      </div>
    </main>
  )
}
