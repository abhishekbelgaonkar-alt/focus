'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface AccountNudgeProps {
  sessionCount: number
  onDismiss: () => void
}

export function AccountNudge({ sessionCount, onDismiss }: AccountNudgeProps) {
  const router = useRouter()
  const supabase = createClient()
  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async () => {
    setSaving(true)
    setError('')
    const { error: err } = await supabase.auth.updateUser({ email, password })
    if (err) {
      setError(err.message)
      setSaving(false)
    } else {
      router.push('/setup')
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-cream border-t border-border-warm px-6 py-5 shadow-sm">
      <div className="max-w-md mx-auto relative">
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="absolute top-0 right-0 text-text-light text-2xl leading-none"
        >
          ×
        </button>

        <p className="font-sans text-sm text-text-primary mb-1">
          You've logged{' '}
          <strong>{sessionCount} session{sessionCount !== 1 ? 's' : ''}</strong> so far.
        </p>
        <p className="font-sans text-sm text-text-muted mb-4">
          Create an account so you don't lose this if you switch devices or clear your browser.
        </p>

        {!showForm ? (
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowForm(true)}
              className="flex-1 bg-coral text-white font-sans font-medium py-2.5 rounded-pill text-sm"
            >
              Create account
            </button>
            <button
              onClick={onDismiss}
              className="font-sans text-sm text-text-muted"
            >
              Not now
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full bg-transparent border-b border-border-warm pb-1 font-sans text-sm text-text-primary placeholder:text-text-light focus:outline-none focus:border-coral"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full bg-transparent border-b border-border-warm pb-1 font-sans text-sm text-text-primary placeholder:text-text-light focus:outline-none focus:border-coral"
            />
            {error && <p className="text-xs text-red-500 font-sans">{error}</p>}
            <button
              onClick={handleCreate}
              disabled={saving || !email || !password}
              className="bg-coral text-white font-sans font-medium py-2.5 rounded-pill text-sm disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Create account'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
