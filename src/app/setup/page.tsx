'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DurationPicker } from '@/components/DurationPicker'
import { CyclingPlaceholder } from '@/components/CyclingPlaceholder'
import { saveSession } from '@/lib/session-state'
import { createClient } from '@/lib/supabase/client'

const FOCUS_PLACEHOLDERS = [
  'e.g. Finish thermodynamics ch. 1',
  'e.g. Refactor login component',
  'e.g. Practice guitar chord changes',
  'e.g. Write chapter 3 outline',
  'e.g. Draft cover letter',
]

const DEFAULT_DURATION = 3

function SetupPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const goalId = searchParams.get('goalId')
  const supabase = createClient()

  const [duration, setDuration] = useState(DEFAULT_DURATION)
  const [focusText, setFocusText] = useState('')
  const [resolvedGoalId, setResolvedGoalId] = useState<string | null>(null)

  useEffect(() => {
    if (!goalId) return
    supabase
      .from('goals')
      .select('name, last_used_duration_minutes')
      .eq('id', goalId)
      .single()
      .then(({ data }) => {
        if (!data) return
        setResolvedGoalId(goalId)
        setFocusText(data.name)
        if (data.last_used_duration_minutes) {
          setDuration(data.last_used_duration_minutes)
        }
      })
  }, [goalId])

  const handleStart = () => {
    saveSession({
      plannedDurationMinutes: duration,
      startedAt: new Date().toISOString(),
      setupFocusText: focusText.trim() || null,
      goalId: resolvedGoalId,
      categoryId: null,
      endReason: null,
      actualDurationMinutes: null,
      isExpired: false,
      tasks: [],
      existingSessionId: null,
    })
    router.push('/timer')
  }

  return (
    <main className="min-h-screen bg-cream px-6 pt-16 pb-10 max-w-md mx-auto">
      <div className="mb-10">
        <label className="block font-sans text-lg font-medium text-text-primary mb-1">
          What are you focusing on?
        </label>
        <p className="text-sm text-text-muted mb-4">
          Optional — you can skip this and add it after
        </p>
        <div className="relative">
          <input
            type="text"
            value={focusText}
            onChange={(e) => setFocusText(e.target.value)}
            placeholder=""
            className="w-full bg-transparent border-b border-border-warm pb-2 text-text-primary focus:outline-none focus:border-coral font-sans text-base"
          />
          <CyclingPlaceholder
            active={focusText === ''}
            placeholders={FOCUS_PLACEHOLDERS}
            className="font-sans text-base"
            paddingClass="pb-2"
          />
        </div>
      </div>

      <div className="mb-12">
        <DurationPicker value={duration} onChange={setDuration} max={180} />
      </div>

      <button
        onClick={handleStart}
        className="w-full bg-coral text-white font-sans font-medium text-base py-3 rounded-pill"
      >
        Start focus session
      </button>
    </main>
  )
}

export default function SetupPage() {
  return (
    <Suspense>
      <SetupPageInner />
    </Suspense>
  )
}
