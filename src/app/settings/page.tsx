'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const NUDGE_KEY = 'focus_nudge_enabled'

export default function SettingsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [isAnonymous, setIsAnonymous] = useState(true)
  const [scheduleCount, setScheduleCount] = useState(0)
  const [nudgeEnabled, setNudgeEnabled] = useState(true)
  const [newPassword, setNewPassword] = useState('')
  const [passwordMsg, setPasswordMsg] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [signOutConfirm, setSignOutConfirm] = useState(false)
  // Attach-email flow — for anon users who want to keep their data reachable
  // from other devices. Same operation as AccountNudge, just always-available
  // instead of nudge-timed.
  const [attachEmail, setAttachEmail] = useState('')
  const [attachPassword, setAttachPassword] = useState('')
  const [attachError, setAttachError] = useState('')
  const [attaching, setAttaching] = useState(false)
  const [attachSuccess, setAttachSuccess] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setNudgeEnabled(localStorage.getItem(NUDGE_KEY) !== 'false')

    ;(async () => {
      try {
        const { data } = await supabase.auth.getUser()
        if (!data.user) return
        setEmail(data.user.email ?? '')
        setIsAnonymous(!data.user.email)

        const { count: sc } = await supabase
          .from('goals')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', data.user.id)
          .not('schedule', 'is', null)
        setScheduleCount(sc ?? 0)
      } catch {
        /* page still usable */
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const handleNudgeToggle = () => {
    const next = !nudgeEnabled
    setNudgeEnabled(next)
    localStorage.setItem(NUDGE_KEY, String(next))
  }

  const handleChangePassword = async () => {
    setSavingPassword(true)
    setPasswordMsg('')
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) setPasswordMsg(error.message)
    else { setPasswordMsg('Password updated.'); setNewPassword('') }
    setSavingPassword(false)
  }

  const handleAttachEmail = async () => {
    setAttaching(true)
    setAttachError('')
    // updateUser on an anon session promotes it in place — same user_id,
    // so RLS-scoped data (goals, sessions, templates) stays reachable.
    const { error } = await supabase.auth.updateUser({
      email: attachEmail,
      password: attachPassword,
    })
    if (error) {
      setAttachError(error.message)
      setAttaching(false)
      return
    }
    setEmail(attachEmail)
    setIsAnonymous(false)
    setAttachSuccess(true)
    setAttaching(false)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const handleDeleteAccount = async () => {
    setDeleting(true)
    await supabase.rpc('delete_user')
    await supabase.auth.signOut()
    localStorage.clear()
    router.push('/')
  }

  if (loading) return null

  return (
    <main className="min-h-screen bg-cream px-6 pt-12 pb-10 max-w-md mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => router.back()} className="font-sans text-sm text-text-muted">
          ← Back
        </button>
        <h1 className="font-sans text-xl font-medium text-text-primary">Settings</h1>
      </div>

      {/* ── ACCOUNT ─────────────────────────────────────────────────────────── */}
      <p className="font-sans text-xs text-text-light uppercase tracking-widest mb-3">Account</p>
      <div className="mb-8 border-b border-border-warm">
        {email && (
          <div className="py-3 border-t border-border-warm">
            <p className="font-sans text-sm text-text-primary">{email}</p>
          </div>
        )}

        {/* Attach-email — always available to anonymous users. Preserves the
            existing user_id so all sessions/goals remain reachable. */}
        {isAnonymous && (
          <div className="py-3 border-t border-border-warm">
            <p className="font-sans text-sm font-medium text-text-primary mb-1">
              Save your data with an email
            </p>
            <p className="font-sans text-xs text-text-muted mb-3 leading-relaxed">
              Right now everything you&apos;ve logged only exists in this
              browser. Attach an email and password to keep this data
              reachable from other devices.
            </p>
            {attachSuccess ? (
              <p className="font-sans text-sm text-coral font-medium">
                Attached. Your data is now saved to {email}.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <input
                  type="email"
                  value={attachEmail}
                  onChange={(e) => setAttachEmail(e.target.value)}
                  placeholder="Email"
                  autoComplete="email"
                  className="w-full bg-transparent border-b border-border-warm pb-1 font-sans text-sm text-text-primary placeholder:text-text-light focus:outline-none focus:border-coral"
                />
                <input
                  type="password"
                  value={attachPassword}
                  onChange={(e) => setAttachPassword(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === 'Enter' &&
                    attachEmail &&
                    attachPassword &&
                    handleAttachEmail()
                  }
                  placeholder="Password"
                  autoComplete="new-password"
                  className="w-full bg-transparent border-b border-border-warm pb-1 font-sans text-sm text-text-primary placeholder:text-text-light focus:outline-none focus:border-coral"
                />
                {attachError && (
                  <p className="font-sans text-xs text-red-500">{attachError}</p>
                )}
                <button
                  onClick={handleAttachEmail}
                  disabled={!attachEmail || !attachPassword || attaching}
                  className="self-start bg-coral text-white font-sans text-sm font-medium px-4 py-2 rounded-pill disabled:opacity-50 mt-1"
                >
                  {attaching ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
          </div>
        )}

        {!isAnonymous && (
          <div className="py-3 border-t border-border-warm">
            <p className="font-sans text-sm font-medium text-text-primary mb-2">Change password</p>
            <div className="flex gap-2 items-end">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && newPassword && handleChangePassword()}
                placeholder="New password"
                className="flex-1 bg-transparent border-b border-border-warm pb-1 font-sans text-sm text-text-primary placeholder:text-text-light focus:outline-none focus:border-coral"
              />
              <button
                onClick={handleChangePassword}
                disabled={!newPassword || savingPassword}
                className="font-sans text-sm text-coral disabled:opacity-40 shrink-0"
              >
                {savingPassword ? 'Saving…' : 'Save'}
              </button>
            </div>
            {passwordMsg && (
              <p className="font-sans text-xs text-text-muted mt-1">{passwordMsg}</p>
            )}
          </div>
        )}

        {/* Sign out. For anonymous accounts (no email attached) this is
            destructive — the session token is the only handle on the data.
            Guard with a confirm step and a link to add an email first. */}
        {isAnonymous ? (
          !signOutConfirm ? (
            <button
              onClick={() => setSignOutConfirm(true)}
              className="w-full text-left py-3 border-t border-border-warm font-sans text-sm text-coral"
            >
              Sign out
            </button>
          ) : (
            <div className="py-3 border-t border-border-warm">
              <p className="font-sans text-sm text-text-primary mb-1">
                Sign out will delete this data.
              </p>
              <p className="font-sans text-xs text-text-muted mb-3 leading-relaxed">
                You haven&apos;t added an email, so this browser session is
                the only place your goals and sessions exist. Add an email
                first if you want to keep them.
              </p>
              <div className="flex items-center gap-4">
                <button
                  onClick={handleSignOut}
                  className="font-sans text-sm text-red-600"
                >
                  Sign out anyway
                </button>
                <button
                  onClick={() => setSignOutConfirm(false)}
                  className="font-sans text-sm text-text-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          )
        ) : (
          <button
            onClick={handleSignOut}
            className="w-full text-left py-3 border-t border-border-warm font-sans text-sm text-coral"
          >
            Sign out
          </button>
        )}

        {/* Sign-in affordance — only meaningful for anon users who might have
            an account on another device. */}
        {isAnonymous && (
          <button
            onClick={() => router.push('/signin')}
            className="w-full text-left py-3 border-t border-border-warm font-sans text-sm text-text-primary"
          >
            Sign in on this browser
            <span className="block font-sans text-xs text-text-muted mt-0.5">
              Already have an account on another device? Sign in here.
            </span>
          </button>
        )}
      </div>

      {/* ── SCHEDULING ──────────────────────────────────────────────────────── */}
      <p className="font-sans text-xs text-text-light uppercase tracking-widest mb-3">
        Scheduling
      </p>
      <div className="mb-8 border-b border-border-warm">
        <button
          onClick={() => router.push('/settings/scheduled-goals')}
          className="w-full flex items-center justify-between py-3 border-t border-border-warm"
        >
          <span className="font-sans text-sm text-text-primary">Scheduled goals</span>
          <span className="font-sans text-sm text-text-muted">{scheduleCount} active ›</span>
        </button>
      </div>

      {/* ── NOTIFICATIONS ───────────────────────────────────────────────────── */}
      <p className="font-sans text-xs text-text-light uppercase tracking-widest mb-3">
        Notifications
      </p>
      <div className="mb-10 border-b border-border-warm">
        <div className="flex items-center justify-between py-3 border-t border-border-warm">
          <span className="font-sans text-sm text-text-primary">
            Remind me to save my progress
          </span>
          <button
            onClick={handleNudgeToggle}
            role="switch"
            aria-checked={nudgeEnabled}
            className={`relative w-10 h-6 rounded-full transition-colors ${
              nudgeEnabled ? 'bg-coral' : 'bg-border-warm'
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                nudgeEnabled ? 'translate-x-5' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* ── DANGER ZONE ─────────────────────────────────────────────────────── */}
      <p className="font-sans text-xs uppercase tracking-widest mb-3" style={{ color: '#b91c1c' }}>
        Danger zone
      </p>
      <div className="rounded-xl p-4" style={{ border: '1.5px solid #fecaca' }}>
        {!deleteConfirm ? (
          <button
            onClick={() => setDeleteConfirm(true)}
            className="font-sans text-sm w-full text-left"
            style={{ color: '#b91c1c' }}
          >
            Delete account and all data
          </button>
        ) : (
          <div>
            <p className="font-sans text-sm text-text-primary mb-4">
              This permanently deletes all your sessions, goals, and data. There is no undo.
            </p>
            <div className="flex gap-3 items-center">
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="font-sans text-sm font-medium px-4 py-2 rounded-pill text-white disabled:opacity-50"
                style={{ backgroundColor: '#b91c1c' }}
              >
                {deleting ? 'Deleting…' : 'Yes, delete everything'}
              </button>
              <button
                onClick={() => setDeleteConfirm(false)}
                className="font-sans text-sm text-text-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
