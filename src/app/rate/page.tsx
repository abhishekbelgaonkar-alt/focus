'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { loadSession, clearSession } from '@/lib/session-state'
import { createClient } from '@/lib/supabase/client'
import { RatingForm } from '@/components/RatingForm'
import { AccountNudge } from '@/components/AccountNudge'
import type { InProgressSession } from '@/lib/session-state'
import type { DistractionTag } from '@/lib/types'
import type { RatingFormData } from '@/components/RatingForm'

export default function RatePage() {
  const router = useRouter()
  const supabase = createClient()
  const [session, setSession] = useState<InProgressSession | null>(null)
  const [tags, setTags] = useState<DistractionTag[]>([])
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState<number | null>(null)

  useEffect(() => {
    const s = loadSession()
    if (!s) { router.replace('/setup'); return }
    setSession(s)

    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return
      supabase
        .from('distraction_tags')
        .select('*')
        .order('created_at')
        .then(({ data: t }) => setTags(t ?? []))
    })
  }, [])

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
    if (!session) return
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    let goalId = session.goalId
    let categoryId = session.categoryId
    if (!goalId && !categoryId && form.goalText.trim()) {
      const { data: newGoal } = await supabase
        .from('goals')
        .insert({ user_id: user.id, name: form.goalText.trim() })
        .select()
        .single()
      goalId = newGoal?.id ?? null
    }

    const { data: saved, error } = await supabase
      .from('sessions')
      .insert({
        user_id: user.id,
        goal_id: goalId,
        category_id: categoryId,
        session_name: form.sessionName.trim() || null,
        planned_duration_minutes: session.plannedDurationMinutes,
        actual_duration_minutes: session.actualDurationMinutes ?? session.plannedDurationMinutes,
        started_at: session.startedAt,
        ended_at: new Date().toISOString(),
        rating: form.rating,
        notes: form.notes.trim() || null,
        end_reason: session.endReason,
      })
      .select()
      .single()

    if (error || !saved) { setSaving(false); return }

    if (form.selectedTagIds.length > 0) {
      await supabase.from('session_distraction_tags').insert(
        form.selectedTagIds.map((tag_id) => ({ session_id: saved.id, tag_id }))
      )
    }

    if (goalId) {
      await supabase
        .from('goals')
        .update({ last_used_duration_minutes: session.plannedDurationMinutes })
        .eq('id', goalId)
    }

    const { count } = await supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    clearSession()

    const c = count ?? 0
    if (c === 1 || c % 5 === 0) {
      setSavedCount(c)
    } else {
      router.push('/')
    }
  }

  if (!session) return null

  return (
    <>
      <RatingForm
        initialSessionName={session.setupFocusText ?? ''}
        focusText={session.setupFocusText}
        tags={tags}
        onAddTag={handleAddTag}
        onSave={handleSave}
        saving={saving}
        showGoalPrompt={!session.goalId && !session.categoryId}
      />
      {savedCount !== null && (
        <AccountNudge
          sessionCount={savedCount}
          onDismiss={() => router.push('/')}
        />
      )}
    </>
  )
}
