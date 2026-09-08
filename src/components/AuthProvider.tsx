'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
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
  }, [])

  return (
    <>
      {children}
      {error && (
        <div className="fixed bottom-4 left-4 right-4 max-w-md mx-auto p-3 rounded-xl border border-red-300 bg-red-50 text-red-900 text-sm font-sans z-50">
          Sign-in failed: {error}
        </div>
      )}
    </>
  )
}
