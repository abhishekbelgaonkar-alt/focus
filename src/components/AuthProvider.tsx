'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ErrorToast } from '@/components/ErrorToast'

// Routes where we shouldn't auto-create an anonymous session — they exist
// specifically so the user can adopt an identity (or arrive from one on
// another device). Auto-creating anon underneath would either overwrite an
// in-progress sign-in or hide the "sign in" affordance behind fresh data.
const SKIP_ANON_ROUTES = ['/signin', '/auth/callback']

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (SKIP_ANON_ROUTES.some((r) => pathname?.startsWith(r))) return
    const supabase = createClient()
    ;(async () => {
      const { data, error: getErr } = await supabase.auth.getUser()
      if (getErr) console.error('[auth] getUser failed', getErr)
      if (!data?.user) {
        const { error: signInErr } = await supabase.auth.signInAnonymously()
        if (signInErr) {
          console.error('[auth] signInAnonymously failed', signInErr)
          setError(signInErr.message)
        }
      }
    })()
  }, [pathname])

  return (
    <>
      {children}
      {error && (
        <ErrorToast message={`Sign-in failed: ${error}`} />
      )}
    </>
  )
}
