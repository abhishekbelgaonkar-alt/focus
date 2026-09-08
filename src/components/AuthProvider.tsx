'use client'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        supabase.auth.signInAnonymously()
      }
    })
  }, [])

  return <>{children}</>
}
