'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { FriendRequest, FriendView, UserProfile } from '@/lib/types'

/*
  Friends dropdown, opened from the "Friends" button in the home nav.
  Contains three sections, top to bottom:

    1. Requests (only rendered when there are pending inbound requests)
    2. Your friends (with a small dot showing who's currently focusing)
    3. Your invite link (copyable, regeneratable)

  Plus a subtle line for anonymous users nudging them to attach an email so
  their friends persist across devices.

  Data-loading pattern: the dropdown is a passive UI. It refetches whenever
  it opens, and it does not poll continuously. Active-friend status refreshes
  every 30s only while the dropdown is open, since it isn't information the
  user needs while doing anything else in the app.
*/

interface FriendsDropdownProps {
  open: boolean
  onClose: () => void
  isAnonymous: boolean
}

export function FriendsDropdown({ open, onClose, isAnonymous }: FriendsDropdownProps) {
  const supabase = createClient()
  const containerRef = useRef<HTMLDivElement>(null)

  const [requests, setRequests] = useState<FriendRequest[]>([])
  const [friends, setFriends] = useState<FriendView[]>([])
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: userData } = await supabase.auth.getUser()
    const uid = userData?.user?.id
    if (!uid) { setLoading(false); return }

    const [reqRes, friendsRes, inviteRes] = await Promise.all([
      // Inbound requests, joined with the sender's profile for display.
      supabase
        .from('friend_requests')
        .select('id, from_user_id, to_user_id, created_at, from_profile:user_profiles!from_user_id(user_id, handle, created_at)')
        .eq('to_user_id', uid),
      // All friendships this user is part of. Handles + active status filled below.
      supabase
        .from('friendships')
        .select('user_a_id, user_b_id')
        .or(`user_a_id.eq.${uid},user_b_id.eq.${uid}`),
      // The user's own invite code.
      supabase
        .from('friend_invites')
        .select('short_code')
        .eq('user_id', uid)
        .maybeSingle(),
    ])

    setRequests((reqRes.data ?? []) as unknown as FriendRequest[])

    // For each friendship, resolve the *other* user's handle + active status.
    const otherIds = ((friendsRes.data ?? []) as { user_a_id: string; user_b_id: string }[])
      .map((f) => (f.user_a_id === uid ? f.user_b_id : f.user_a_id))

    if (otherIds.length > 0) {
      const [profilesRes, activeRes] = await Promise.all([
        supabase
          .from('user_profiles')
          .select('user_id, handle')
          .in('user_id', otherIds),
        supabase
          .from('sessions')
          .select('user_id')
          .in('user_id', otherIds)
          .is('ended_at', null),
      ])

      const handleByUser = new Map<string, string>()
      for (const p of (profilesRes.data ?? []) as UserProfile[]) {
        handleByUser.set(p.user_id, p.handle)
      }
      const activeSet = new Set<string>(
        ((activeRes.data ?? []) as { user_id: string }[]).map((s) => s.user_id)
      )

      setFriends(
        otherIds.map((id) => ({
          user_id: id,
          handle: handleByUser.get(id) ?? 'unknown',
          is_focusing: activeSet.has(id),
        })).sort((a, b) => {
          // Focusing friends surface at the top; then alphabetical.
          if (a.is_focusing !== b.is_focusing) return a.is_focusing ? -1 : 1
          return a.handle.localeCompare(b.handle)
        })
      )
    } else {
      setFriends([])
    }

    setInviteCode(inviteRes.data?.short_code ?? null)
    setLoading(false)
  }, [supabase])

  // Fetch on open + poll active status every 30s while open.
  useEffect(() => {
    if (!open) return
    load()
    const interval = window.setInterval(load, 30_000)
    return () => window.clearInterval(interval)
  }, [open, load])

  // Close on outside click + Escape. Attach on next tick so the click that
  // opened the dropdown doesn't immediately close it.
  useEffect(() => {
    if (!open) return
    let handler: ((e: MouseEvent) => void) | null = null
    const attachTimer = window.setTimeout(() => {
      handler = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          onClose()
        }
      }
      window.addEventListener('click', handler)
    }, 0)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(attachTimer)
      if (handler) window.removeEventListener('click', handler)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  const acceptRequest = async (requestId: string) => {
    await supabase.rpc('accept_friend_request', { request_id: requestId })
    load()
  }

  const declineRequest = async (requestId: string) => {
    await supabase.from('friend_requests').delete().eq('id', requestId)
    load()
  }

  const unfriend = async (otherUserId: string) => {
    const { data: userData } = await supabase.auth.getUser()
    const uid = userData?.user?.id
    if (!uid) return
    const [a, b] = uid < otherUserId ? [uid, otherUserId] : [otherUserId, uid]
    await supabase.from('friendships').delete().eq('user_a_id', a).eq('user_b_id', b)
    load()
  }

  const regenerateCode = async () => {
    const { data } = await supabase.rpc('regenerate_invite_code')
    if (typeof data === 'string') setInviteCode(data)
  }

  const inviteUrl = inviteCode
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/invite/${inviteCode}`
    : ''

  const copyInvite = async () => {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard denied */
    }
  }

  if (!open) return null

  return (
    <div
      ref={containerRef}
      className="absolute left-0 top-full mt-2 bg-cream border border-border-warm rounded-xl p-4 z-50 min-w-[280px] max-w-[340px] shadow-sm"
    >
      {loading && requests.length === 0 && friends.length === 0 && !inviteCode ? (
        <p className="font-sans text-xs text-text-light">Loading…</p>
      ) : (
        <>
          {/* Requests */}
          {requests.length > 0 && (
            <div className="mb-4">
              <p className="font-sans text-xs text-text-muted uppercase tracking-wide mb-2">
                Requests ({requests.length})
              </p>
              <div className="flex flex-col gap-2">
                {requests.map((r) => (
                  <div key={r.id} className="flex items-center gap-2">
                    <span className="font-sans text-sm text-text-primary flex-1 truncate">
                      {r.from_profile?.handle ?? 'someone'}
                    </span>
                    <button
                      onClick={() => acceptRequest(r.id)}
                      className="font-sans text-xs text-coral"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => declineRequest(r.id)}
                      className="font-sans text-xs text-text-light"
                    >
                      Decline
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Friends list */}
          <div className="mb-4">
            <p className="font-sans text-xs text-text-muted uppercase tracking-wide mb-2">
              Your friends
            </p>
            {friends.length === 0 ? (
              <p className="font-sans text-xs text-text-light">
                No friends yet. Share your link below.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {friends.map((f) => (
                  <div key={f.user_id} className="flex items-center gap-2">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{
                        backgroundColor: f.is_focusing
                          ? 'var(--color-check-green)'
                          : 'var(--color-border-warm)',
                      }}
                      aria-hidden="true"
                    />
                    <span className="font-sans text-sm text-text-primary flex-1 truncate">
                      {f.handle}
                    </span>
                    {f.is_focusing && (
                      <span className="font-sans text-xs text-text-light">
                        focusing
                      </span>
                    )}
                    <button
                      onClick={() => unfriend(f.user_id)}
                      className="font-sans text-xs text-text-light"
                      aria-label={`Remove ${f.handle}`}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Invite link */}
          <div>
            <p className="font-sans text-xs text-text-muted uppercase tracking-wide mb-2">
              Your invite link
            </p>
            {inviteCode ? (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    readOnly
                    value={inviteUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 min-w-0 bg-transparent border-b border-border-warm pb-1 font-sans text-xs text-text-primary focus:outline-none"
                  />
                  <button
                    onClick={copyInvite}
                    className="font-sans text-xs text-coral shrink-0"
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-sans text-[11px] text-text-light flex-1 leading-relaxed">
                    Anyone with this link can send you a friend request.
                  </p>
                  <button
                    onClick={regenerateCode}
                    className="font-sans text-[11px] text-text-light underline shrink-0"
                  >
                    Regenerate
                  </button>
                </div>
              </>
            ) : (
              <p className="font-sans text-xs text-text-light">
                Your invite link is being set up. Refresh in a moment.
              </p>
            )}

            {isAnonymous && (
              <p className="font-sans text-[11px] text-text-light mt-3 pt-3 border-t border-border-warm leading-relaxed">
                Add an email in Settings to keep your friends across devices.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
