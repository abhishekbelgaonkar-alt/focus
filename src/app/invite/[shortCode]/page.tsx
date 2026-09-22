'use client'
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/*
  Invite landing page. Someone (User B) opens a link like /invite/abc123.
  We look up who the invite belongs to, show their handle, and offer to
  send them a friend request.

  Anonymous auth applies transparently: if the visitor has never been to
  Tokiroom before, AuthProvider auto-creates an anonymous account for them
  before this page runs its RPC call.
*/

type Status = 'loading' | 'ready' | 'not_found' | 'self' | 'sent' | 'already_friends' | 'already_requested' | 'error'

interface Props {
  params: Promise<{ shortCode: string }>
}

export default function InvitePage({ params }: Props) {
  const { shortCode } = use(params)
  const router = useRouter()
  const supabase = createClient()

  const [status, setStatus] = useState<Status>('loading')
  const [ownerHandle, setOwnerHandle] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    (async () => {
      // Look up the owner of this invite so we can show their handle.
      // Note: read policy on friend_invites lets any signed-in user read by
      // short_code, so this works even when the visitor doesn't know the
      // owner's user_id yet.
      const { data: invite } = await supabase
        .from('friend_invites')
        .select('user_id')
        .eq('short_code', shortCode)
        .maybeSingle()

      if (!invite) {
        setStatus('not_found')
        return
      }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('handle')
        .eq('user_id', invite.user_id)
        .maybeSingle()

      setOwnerHandle(profile?.handle ?? 'someone')

      // Self-invite guard: if the visitor is the invite owner, no request.
      const { data: userData } = await supabase.auth.getUser()
      if (userData?.user?.id === invite.user_id) {
        setStatus('self')
      } else {
        setStatus('ready')
      }
    })()
  }, [shortCode, supabase])

  const sendRequest = async () => {
    setSending(true)
    const { data, error } = await supabase.rpc('send_friend_request_by_code', {
      invite_code: shortCode,
    })
    setSending(false)

    if (error) {
      setStatus('error')
      return
    }

    switch (data) {
      case 'sent':
        setStatus('sent')
        break
      case 'already_friends':
        setStatus('already_friends')
        break
      case 'already_requested':
        setStatus('already_requested')
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
            This invite is no longer active.
          </p>
          <button
            onClick={() => router.push('/')}
            className="font-sans text-sm text-coral"
          >
            Go home
          </button>
        </>
      )}

      {status === 'self' && (
        <>
          <p className="font-sans text-sm text-text-primary mb-4">
            This is your own invite link. Share it with someone else.
          </p>
          <button
            onClick={() => router.push('/')}
            className="font-sans text-sm text-coral"
          >
            Go home
          </button>
        </>
      )}

      {status === 'ready' && (
        <>
          <p className="font-sans text-2xl font-medium text-text-primary mb-2">
            {ownerHandle}
          </p>
          <p className="font-sans text-sm text-text-muted mb-8">
            invited you to connect on Tokiroom.
          </p>
          <button
            onClick={sendRequest}
            disabled={sending}
            className="w-full bg-coral text-white font-sans font-medium py-3 rounded-pill disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send friend request'}
          </button>
          <button
            onClick={() => router.push('/')}
            className="w-full font-sans text-sm text-text-muted mt-4"
          >
            Not now
          </button>
        </>
      )}

      {status === 'sent' && (
        <>
          <p className="font-sans text-sm text-text-primary mb-2">
            Request sent.
          </p>
          <p className="font-sans text-sm text-text-muted mb-6">
            {ownerHandle} will see it next time they open Tokiroom.
          </p>
          <button
            onClick={() => router.push('/')}
            className="font-sans text-sm text-coral"
          >
            Go home
          </button>
        </>
      )}

      {status === 'already_friends' && (
        <>
          <p className="font-sans text-sm text-text-primary mb-4">
            You&apos;re already friends with {ownerHandle}.
          </p>
          <button
            onClick={() => router.push('/')}
            className="font-sans text-sm text-coral"
          >
            Go home
          </button>
        </>
      )}

      {status === 'already_requested' && (
        <>
          <p className="font-sans text-sm text-text-primary mb-4">
            A request between you and {ownerHandle} is already pending.
          </p>
          <button
            onClick={() => router.push('/')}
            className="font-sans text-sm text-coral"
          >
            Go home
          </button>
        </>
      )}

      {status === 'error' && (
        <>
          <p className="font-sans text-sm text-text-primary mb-4">
            Something went wrong. Try again in a moment.
          </p>
          <button
            onClick={() => router.push('/')}
            className="font-sans text-sm text-coral"
          >
            Go home
          </button>
        </>
      )}
    </main>
  )
}
