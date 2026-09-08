'use client'
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { RatingForm } from '@/components/RatingForm'
import type { RatingFormData } from '@/components/RatingForm'
import type { DistractionTag } from '@/lib/types'

interface TagRow {
  distraction_tags: { id: string; name: string }
}

interface EditableSession {
  id: string
  session_name: string | null
  rating: number | null
  notes: string | null
  goals: { name: string } | null
  categories: { name: string } | null
  session_distraction_tags: TagRow[]
}

export default function EditSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = use(params)
  const router = useRouter()
  const supabase = createClient()

  const [session, setSession] = useState<EditableSession | null>(null)
  const [tags, setTags] = useState<DistractionTag[]>([])
  const [initialTagIds, setInitialTagIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase
        .from('sessions')
        .select(`
          id,
          session_name,
          rating,
          notes,
          goals(name),
          categories(name),
          session_distraction_tags(distraction_tags(id, name))
        `)
        .eq('id', sessionId)
        .single(),
      supabase.from('distraction_tags').select('*').order('created_at'),
    ]).then(([{ data: s }, { data: t }]) => {
      if (s) {
        const typed = s as unknown as EditableSession
        setSession(typed)
        setInitialTagIds(typed.session_distraction_tags.map((row) => row.distraction_tags.id))
      }
      setTags((t ?? []) as DistractionTag[])
      setLoading(false)
    })
  }, [sessionId])

  const handleAddTag = async (name: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: newTag } = await supabase
      .from('distraction_tags')
      .insert({ user_id: user.id, name })
      .select()
      .single()
    if (newTag) setTags((prev) => [...prev, newTag as DistractionTag])
  }

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

    // Replace distraction tags: delete old, insert new
    await supabase.from('session_distraction_tags').delete().eq('session_id', sessionId)

    if (form.selectedTagIds.length > 0) {
      await supabase.from('session_distraction_tags').insert(
        form.selectedTagIds.map((tag_id) => ({ session_id: sessionId, tag_id }))
      )
    }

    setSaving(false)
    router.push(`/sessions/${sessionId}`)
  }

  if (loading) return null
  if (!session) return <p className="p-6 font-sans text-text-muted">Session not found.</p>

  const contextName = session.goals?.name ?? session.categories?.name ?? null

  return (
    <RatingForm
      initialRating={session.rating ?? 3.0}
      initialNotes={session.notes ?? ''}
      initialSessionName={session.session_name ?? ''}
      initialSelectedTagIds={initialTagIds}
      focusText={contextName}
      tags={tags}
      onAddTag={handleAddTag}
      onSave={handleSave}
      saving={saving}
      showGoalPrompt={false}
    />
  )
}
