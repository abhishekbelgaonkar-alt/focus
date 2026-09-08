'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { loadSession, saveSession } from '@/lib/session-state'
import type { InProgressSession } from '@/lib/session-state'
import type { EndReason } from '@/lib/types'

interface EndOption {
  reason: EndReason
  label: string
}

const END_OPTIONS: EndOption[] = [
  { reason: 'still_focused',  label: "I was still deep in focus — didn't notice" },
  { reason: 'distracted',     label: 'I got distracted and lost track of time' },
  { reason: 'forgot_to_end',  label: 'I finished early and forgot to end it' },
  { reason: 'other',          label: 'Something else' },
]

export default function EndPage() {
  const router = useRouter()
  const [session, setSession] = useState<InProgressSession | null>(null)
  const [selected, setSelected] = useState<EndReason | null>(null)
  const [extraMinutes, setExtraMinutes] = useState('')

  useEffect(() => {
    const s = loadSession()
    if (!s) { router.replace('/setup'); return }
    setSession(s)
  }, [])

  const handleContinue = () => {
    if (!selected || !session) return

    const actualDurationMinutes =
      selected === 'still_focused' && extraMinutes.trim()
        ? Math.max(1, parseInt(extraMinutes))
        : session.plannedDurationMinutes

    saveSession({ ...session, endReason: selected, actualDurationMinutes })
    router.push('/rate')
  }

  if (!session) return null

  return (
    <main className="min-h-screen bg-cream px-6 pt-16 pb-10 max-w-md mx-auto">
      <h1 className="font-sans text-2xl font-medium text-text-primary mb-2">
        Your timer ended a while ago.
      </h1>
      <p className="font-sans text-base text-text-muted mb-8">What happened?</p>

      <div className="flex flex-col gap-3 mb-8">
        {END_OPTIONS.map((opt) => (
          <button
            key={opt.reason}
            onClick={() => setSelected(opt.reason)}
            className={`w-full text-left px-5 py-3.5 rounded-pill border-[1.5px] font-sans text-base transition-colors ${
              selected === opt.reason
                ? 'bg-coral-light border-coral text-tag-text'
                : 'bg-transparent border-border-warm text-text-primary'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {selected === 'still_focused' && (
        <div className="mb-8">
          <label className="block font-sans text-sm text-text-muted mb-3">
            How long do you think you actually focused for?
          </label>
          <div className="flex items-baseline gap-2">
            <input
              type="number"
              value={extraMinutes}
              onChange={(e) => setExtraMinutes(e.target.value)}
              placeholder={String(session.plannedDurationMinutes)}
              min={1}
              max={600}
              className="w-24 bg-transparent border-b border-border-warm pb-1 font-numbers text-3xl text-text-primary focus:outline-none focus:border-coral"
            />
            <span className="font-sans text-text-muted">min</span>
          </div>
        </div>
      )}

      <button
        onClick={handleContinue}
        disabled={!selected}
        className="w-full bg-coral text-white font-sans font-medium py-3 rounded-pill disabled:opacity-40 transition-opacity"
      >
        Continue
      </button>
    </main>
  )
}
