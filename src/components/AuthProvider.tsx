'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// /signin exists so the user can adopt an existing identity, and
// /reset-password receives a recovery link. Creating an anonymous session
// underneath either would race it.
const SKIP_ANON_ROUTES = ['/signin', '/reset-password']

/*
  Pages query Supabase as soon as they mount, and RLS returns nothing to a
  visitor without a session. So pages render only once a session exists:
  a returning visitor's stored session, or a fresh anonymous one. Without
  this gate, a first-time visitor opening a shared link queries before
  sign-in finishes and sees "not found".
*/
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const skipAnon = SKIP_ANON_ROUTES.some((r) => pathname?.startsWith(r))
  // null = not known yet (waiting for Supabase's initial session event).
  const [hasSession, setHasSession] = useState<boolean | null>(null)
  const [failed, setFailed] = useState<'rate_limited' | 'other' | null>(null)
  const [attempt, setAttempt] = useState(0)
  const signingIn = useRef(false)
  const ensuredFor = useRef<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(session !== null)
      // The sign-up trigger creates the profile and invite link but can't
      // report a failure; fill in anything missing once per user.
      const uid = session?.user.id
      if (uid && ensuredFor.current !== uid) {
        ensuredFor.current = uid
        // Deferred: Supabase calls must not run inside this callback.
        setTimeout(() => {
          supabase.rpc('ensure_my_profile').then(({ error }) => {
            if (error) console.error('[auth] ensure_my_profile failed', error)
          })
        }, 0)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // No session (first visit, or just signed out) → create an anonymous one.
  useEffect(() => {
    if (hasSession !== false || skipAnon || signingIn.current) return
    signingIn.current = true
    createClient()
      .auth.signInAnonymously()
      .then(({ error }) => {
        if (error) {
          console.error('[auth] signInAnonymously failed', error)
          setFailed(error.status === 429 ? 'rate_limited' : 'other')
        }
      })
      .finally(() => { signingIn.current = false })
  }, [hasSession, skipAnon, attempt])

  if (failed && !hasSession && !skipAnon) {
    return (
      <main className="min-h-screen bg-cream px-6 pt-16 pb-10 max-w-md mx-auto">
        <p className="font-sans text-sm text-text-primary mb-2">
          {failed === 'rate_limited'
            ? 'Lots of people on your network are opening Tokiroom right now.'
            : "Couldn't start your session."}
        </p>
        <p className="font-sans text-sm text-text-muted mb-6">
          {failed === 'rate_limited'
            ? 'Wait a few minutes, then try again.'
            : 'Check your connection and try again.'}
        </p>
        <button
          onClick={() => { setFailed(null); setAttempt((n) => n + 1) }}
          className="w-full bg-coral text-white font-sans font-medium py-3 rounded-pill"
        >
          Try again
        </button>
      </main>
    )
  }

  return <>{(hasSession || skipAnon) && children}</>
}
