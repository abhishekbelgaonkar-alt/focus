'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { clearSession, clearTimerState } from '@/lib/session-state'

/*
  Landing page for the "reset your password" email. The link signs the
  visitor into their account in one of two ways:
    * ?code=…            (default email template). The Supabase client
                          exchanges it on load; only works in the browser
                          that asked for the reset.
    * ?token_hash=…      (if the email template is changed to send one).
                          Verified here; works on any device.
  Then they choose a new password.
*/

type Status = 'checking' | 'ready' | 'invalid' | 'saving' | 'done'

export default function ResetPasswordPage() {
  const router = useRouter()
  const supabase = createClient()
  const [status, setStatus] = useState<Status>('checking')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      const query = new URLSearchParams(window.location.search)
      const hash = new URLSearchParams(window.location.hash.slice(1))
      if (query.get('error') || hash.get('error')) { setStatus('invalid'); return }

      const tokenHash = query.get('token_hash')
      if (tokenHash) {
        const { error: err } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
        if (err) { setStatus('invalid'); return }
      }
      // getSession waits for the client to finish exchanging a ?code=.
      const { data } = await supabase.auth.getSession()
      const user = data.session?.user
      setStatus(user && !user.is_anonymous ? 'ready' : 'invalid')
    })()
  }, [supabase])

  const save = async () => {
    setStatus('saving')
    setError('')
    const { error: err } = await supabase.auth.updateUser({ password })
    if (err) { setError(err.message); setStatus('ready'); return }
    // A session in progress belonged to whoever used this browser before.
    clearSession()
    clearTimerState()
    setStatus('done')
  }

  return (
    <main className="min-h-screen bg-cream px-6 pt-16 pb-10 max-w-md mx-auto">
      <h1 className="font-sans text-2xl font-medium text-text-primary mb-6">Reset password</h1>

      {status === 'checking' && (
        <p className="font-sans text-sm text-text-light">Checking your link…</p>
      )}

      {status === 'invalid' && (
        <>
          <p className="font-sans text-sm text-text-primary mb-2">
            This reset link has expired or was opened in a different browser.
          </p>
          <p className="font-sans text-sm text-text-muted mb-6">
            Ask for a new one, and open it on the device you asked from.
          </p>
          <button
            onClick={() => router.push('/signin')}
            className="w-full bg-coral text-white font-sans font-medium py-3 rounded-pill"
          >
            Back to sign in
          </button>
        </>
      )}

      {(status === 'ready' || status === 'saving') && (
        <>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && password && save()}
            placeholder="New password"
            autoComplete="new-password"
            autoFocus
            className="w-full bg-transparent border-b border-border-warm pb-1 font-sans text-base text-text-primary placeholder:text-text-light focus:outline-none focus:border-coral mb-6"
          />
          {error && <p className="font-sans text-sm text-red-600 mb-4">{error}</p>}
          <button
            onClick={save}
            disabled={!password || status === 'saving'}
            className="w-full bg-coral text-white font-sans font-medium py-3 rounded-pill disabled:opacity-50"
          >
            {status === 'saving' ? 'Saving…' : 'Save new password'}
          </button>
        </>
      )}

      {status === 'done' && (
        <>
          <p className="font-sans text-sm text-text-primary mb-6">Password updated. You&apos;re signed in.</p>
          <button
            onClick={() => router.push('/')}
            className="w-full bg-coral text-white font-sans font-medium py-3 rounded-pill"
          >
            Go home
          </button>
        </>
      )}
    </main>
  )
}
