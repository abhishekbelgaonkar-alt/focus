'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ErrorToast } from '@/components/ErrorToast'

// /signin exists so the user can adopt an existing identity. Creating an
// anonymous session underneath would race the password sign-in.
const SKIP_ANON_ROUTES = ['/signin']

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
  const [error, setError] = useState<string | null>(null)
  const signingIn = useRef(false)

  useEffect(() => {
    const supabase = createClient()
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(session !== null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // No session (first visit, or just signed out) → create an anonymous one.
  useEffect(() => {
    if (hasSession !== false || skipAnon || signingIn.current) return
    signingIn.current = true
    createClient()
      .auth.signInAnonymously()
      .then(({ error: signInErr }) => {
        if (signInErr) {
          console.error('[auth] signInAnonymously failed', signInErr)
          setError(signInErr.message)
        }
      })
      .finally(() => { signingIn.current = false })
  }, [hasSession, skipAnon])

  return (
    <>
      {(hasSession || skipAnon) && children}
      {error && <ErrorToast message={`Sign-in failed: ${error}`} />}
    </>
  )
}
