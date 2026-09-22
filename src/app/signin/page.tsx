'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SignInPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // If the person landing here has an anon account with data in this browser,
  // signing into a different account will orphan that data (RLS makes it
  // unreachable, and there's no rescue path once we exchange sessions).
  const [anonHasData, setAnonHasData] = useState(false)
  const [checkedSession, setCheckedSession] = useState(false)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser()
      const isAnon = data?.user && !data.user.email
      if (isAnon) {
        const { count } = await supabase
          .from('sessions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', data.user.id)
        setAnonHasData((count ?? 0) > 0)
      }
      setCheckedSession(true)
    })()
  }, [])

  const handleSignIn = async () => {
    setSaving(true)
    setError('')
    // If we're currently anon, sign out first so signInWithPassword doesn't
    // race with the existing session — Supabase would replace it anyway, but
    // being explicit makes the state transition predictable.
    const { data: current } = await supabase.auth.getUser()
    if (current?.user && !current.user.email) {
      await supabase.auth.signOut()
    }
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      setError(err.message)
      setSaving(false)
      return
    }
    router.push('/')
  }

  if (!checkedSession) return null

  return (
    <main className="min-h-screen bg-cream px-6 pt-16 pb-10 max-w-md mx-auto">
      <button onClick={() => router.back()} className="font-sans text-sm text-text-muted mb-8 block">
        ← Back
      </button>

      <h1 className="font-sans text-2xl font-medium text-text-primary mb-2">
        Sign in
      </h1>
      <p className="font-sans text-sm text-text-muted mb-8">
        Access your sessions from another device or a fresh browser.
      </p>

      {anonHasData && (
        <div className="mb-8 border border-border-warm rounded-xl p-4 bg-coral-light/50">
          <p className="font-sans text-sm text-text-primary mb-2">
            Heads up. This browser already has data.
          </p>
          <p className="font-sans text-xs text-text-muted mb-3 leading-relaxed">
            Signing into a different account will make it unreachable. If
            you meant to save what&apos;s here, add an email to this account
            first from Settings.
          </p>
          <button
            onClick={() => router.push('/settings')}
            className="font-sans text-xs text-coral font-medium"
          >
            Go to Settings →
          </button>
        </div>
      )}

      <div className="flex flex-col gap-4 mb-6">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && email && password && handleSignIn()}
          placeholder="Email"
          autoComplete="email"
          className="w-full bg-transparent border-b border-border-warm pb-1 font-sans text-base text-text-primary placeholder:text-text-light focus:outline-none focus:border-coral"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && email && password && handleSignIn()}
          placeholder="Password"
          autoComplete="current-password"
          className="w-full bg-transparent border-b border-border-warm pb-1 font-sans text-base text-text-primary placeholder:text-text-light focus:outline-none focus:border-coral"
        />
      </div>

      {error && (
        <p className="font-sans text-sm text-red-600 mb-4">{error}</p>
      )}

      <button
        onClick={handleSignIn}
        disabled={!email || !password || saving}
        className="w-full bg-coral text-white font-sans font-medium py-3 rounded-pill disabled:opacity-50"
      >
        {saving ? 'Signing in…' : 'Sign in'}
      </button>

      <p className="font-sans text-xs text-text-muted mt-8 text-center">
        Don&apos;t have an account? Just start using the app.{' '}
        <button
          onClick={() => router.push('/')}
          className="text-coral underline"
        >
          go home
        </button>
        . You can add an email later.
      </p>
    </main>
  )
}
