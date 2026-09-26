'use client'
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { RatingForm } from '@/components/RatingForm'
import type { RatingFormData } from '@/components/RatingForm'

interface EditableSession {
  id: string
  session_name: string | null
  rating: number | null
  notes: string | null
  goals: { name: string } | null
}

export default function EditSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = use(params)
  const router = useRouter()
  const supabase = createClient()

  const [session, setSession] = useState<EditableSession | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('sessions')
      .select(`
        id,
        session_name,
        rating,
        notes,
        goals(name)
      `)
      .eq('id', sessionId)
      .single()
      .then(({ data: s }) => {
        if (s) setSession(s as unknown as EditableSession)
        setLoading(false)
      })
  }, [sessionId])

  const handleSave = async (form: RatingFormData) => {
    setSaving(true)

    await supabase
      .from('sessions')
      .update({
        rating: form.rating,
        notes: form.notes.trim() || null,
        session_name: form.sessionName.trim() || null,
      })
      .eq('id', sessionId)

    setSaving(false)
    router.push(`/sessions/${sessionId}`)
  }

  if (loading) return null
  if (!session) return <p className="p-6 font-sans text-text-muted">Session not found.</p>

  const contextName = session.goals?.name ?? null

  return (
    <RatingForm
      initialRating={session.rating}
      initialNotes={session.notes ?? ''}
      initialSessionName={session.session_name ?? ''}
      focusText={contextName}
      onSave={handleSave}
      saving={saving}
      showGoalPrompt={false}
    />
  )
}
