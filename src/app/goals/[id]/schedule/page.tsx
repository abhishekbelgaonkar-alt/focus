'use client'
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { WeekdayPicker } from '@/components/WeekdayPicker'
import type { Weekday } from '@/lib/types'

export default function GoalSchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: goalId } = use(params)
  const router = useRouter()
  const supabase = createClient()

  const [goalName, setGoalName] = useState('')
  const [selectedDays, setSelectedDays] = useState<Weekday[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('goals')
      .select('name, schedule')
      .eq('id', goalId)
      .single()
      .then(({ data }) => {
        if (data) {
          setGoalName(data.name)
          setSelectedDays((data.schedule ?? []) as Weekday[])
        }
        setLoading(false)
      })
  }, [goalId])

  const handleSave = async () => {
    setSaving(true)
    await supabase
      .from('goals')
      .update({ schedule: selectedDays.length > 0 ? selectedDays : null })
      .eq('id', goalId)
    setSaving(false)
    router.back()
  }

  if (loading) return null

  return (
    <main className="min-h-screen bg-cream px-6 pt-12 pb-10 max-w-md mx-auto">
      <button
        onClick={() => router.back()}
        className="font-sans text-sm text-text-muted mb-6 block"
      >
        ← Back
      </button>

      <h1 className="font-sans text-xl font-medium text-text-primary mb-1">{goalName}</h1>
      <p className="font-sans text-sm text-text-muted mb-10">Schedule this goal</p>

      <p className="font-sans text-xs text-text-muted uppercase tracking-wide mb-4">Repeats on</p>
      <WeekdayPicker selected={selectedDays} onChange={setSelectedDays} />

      {selectedDays.length === 0 && (
        <p className="font-sans text-xs text-text-muted mt-3">
          No days selected — schedule will be cleared.
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-coral text-white font-sans font-medium py-3 rounded-pill mt-12 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save schedule'}
      </button>
    </main>
  )
}
