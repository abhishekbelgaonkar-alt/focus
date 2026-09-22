'use client'
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/*
  Goal-invite landing. Alice tapped "Share this goal" on her goal page and
  sent the link to Bob. Bob lands here. We show whose goal it is + the goal
  name, then let Bob accept ("link this goal to my account") or decline.

  On accept, redeem_goal_share_invite creates a copy of the goal on Bob's
  account with the same link_group_id. Bob's copy is his own — his sessions,
  his ratings, his edits. The shared identity is the link, not the data.
*/

type Status =
  | 'loading'
  | 'ready'
  | 'not_found'
  | 'self'
  | 'already_linked'
  | 'linked'
  | 'error'

interface Props {
  params: Promise<{ shortCode: string }>
}

export default function GoalInvitePage({ params }: Props) {
  const { shortCode } = use(params)
  const router = useRouter()
  const supabase = createClient()

  const [status, setStatus] = useState<Status>('loading')
  const [goalName, setGoalName] = useState<string | null>(null)
  const [ownerHandle, setOwnerHandle] = useState<string | null>(null)
  const [newGoalId, setNewGoalId] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    ;(async () => {
      const { data: invite } = await supabase
        .from('goal_share_invites')
        .select('goal_id, created_by')
        .eq('short_code', shortCode)
        .maybeSingle()

      if (!invite) {
        setStatus('not_found')
        return
      }

      const [{ data: g }, { data: p }, { data: userData }] = await Promise.all([
        supabase.from('goals').select('name').eq('id', invite.goal_id).maybeSingle(),
        supabase.from('user_profiles').select('handle').eq('user_id', invite.created_by).maybeSingle(),
        supabase.auth.getUser(),
      ])
      setGoalName(g?.name ?? 'a goal')
      setOwnerHandle(p?.handle ?? 'someone')

      if (userData?.user?.id === invite.created_by) {
        setStatus('self')
      } else {
        setStatus('ready')
      }
    })()
  }, [shortCode, supabase])

  const accept = async () => {
    setAccepting(true)
    const { data, error } = await supabase.rpc('redeem_goal_share_invite', { p_code: shortCode })
    setAccepting(false)
    if (error) {
      setStatus('error')
      return
    }
    const result = data as { status: string; goal_id?: string } | null
    switch (result?.status) {
      case 'linked':
        setNewGoalId(result.goal_id ?? null)
        setStatus('linked')
        break
      case 'already_linked':
        setStatus('already_linked')
        break
      case 'self':
        setStatus('self')
        break
      case 'not_found':
        setStatus('not_found')
        break
      default:
        setStatus('error')
    }
  }

  return (
    <main className="min-h-screen bg-cream px-6 pt-20 pb-10 max-w-md mx-auto">
      {status === 'loading' && (
        <p className="font-sans text-sm text-text-light text-center">Loading…</p>
      )}

      {status === 'not_found' && (
        <>
          <p className="font-sans text-sm text-text-primary mb-4">
            This share link is no longer active.
          </p>
          <button onClick={() => router.push('/')} className="font-sans text-sm text-coral">
            Go home
          </button>
        </>
      )}

      {status === 'self' && (
        <>
          <p className="font-sans text-sm text-text-primary mb-4">
            This is your own goal. Share the link with someone else.
          </p>
          <button onClick={() => router.push('/')} className="font-sans text-sm text-coral">
            Go home
          </button>
        </>
      )}

      {status === 'ready' && (
        <>
          <p className="font-sans text-2xl font-medium text-text-primary mb-2">
            {ownerHandle}
          </p>
          <p className="font-sans text-sm text-text-muted mb-6">
            wants to link this goal with you:
          </p>
          <p className="font-sans text-lg font-medium text-text-primary mb-8">
            {goalName}
          </p>
          <p className="font-sans text-xs text-text-muted mb-8">
            You&apos;ll get your own copy on your account. Your sessions and ratings
            stay yours. The goal name and its link stay in sync between you.
          </p>
          <button
            onClick={accept}
            disabled={accepting}
            className="w-full bg-coral text-white font-sans font-medium py-3 rounded-pill disabled:opacity-50"
          >
            {accepting ? 'Linking…' : 'Link to my account'}
          </button>
          <button
            onClick={() => router.push('/')}
            className="w-full font-sans text-sm text-text-muted mt-4"
          >
            Not now
          </button>
        </>
      )}

      {status === 'linked' && (
        <>
          <p className="font-sans text-sm text-text-primary mb-2">
            Linked.
          </p>
          <p className="font-sans text-sm text-text-muted mb-6">
            <span className="text-text-primary">{goalName}</span> is on your
            account now, connected to {ownerHandle}.
          </p>
          {newGoalId ? (
            <button
              onClick={() => router.push(`/goals/${newGoalId}`)}
              className="font-sans text-sm text-coral"
            >
              Open goal
            </button>
          ) : (
            <button onClick={() => router.push('/')} className="font-sans text-sm text-coral">
              Go home
            </button>
          )}
        </>
      )}

      {status === 'already_linked' && (
        <>
          <p className="font-sans text-sm text-text-primary mb-4">
            You already have a copy of this goal.
          </p>
          <button onClick={() => router.push('/')} className="font-sans text-sm text-coral">
            Go home
          </button>
        </>
      )}

      {status === 'error' && (
        <>
          <p className="font-sans text-sm text-text-primary mb-4">
            Something went wrong. Try again in a moment.
          </p>
          <button onClick={() => router.push('/')} className="font-sans text-sm text-coral">
            Go home
          </button>
        </>
      )}
    </main>
  )
}
