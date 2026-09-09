'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CyclingPlaceholder } from '@/components/CyclingPlaceholder'
import type { PeriodType } from '@/lib/types'

const NOTE_PLACEHOLDERS = [
  'Write anything — mood, context, distractions…',
  'Any mood, energy, or context worth remembering',
  'Notes for your future self',
  'What was different about this period?',
]

interface PeriodNoteBoxProps {
  periodType: PeriodType
  periodDate: string   // YYYY-MM-DD
  title: string
  onClose: () => void
}

export function PeriodNoteBox({ periodType, periodDate, title, onClose }: PeriodNoteBoxProps) {
  const supabase = createClient()
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    supabase
      .from('period_notes')
      .select('note')
      .eq('period_type', periodType)
      .eq('period_date', periodDate)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.note) setNote(data.note)
        textareaRef.current?.focus()
      })
  }, [periodDate, periodType])

  const handleSave = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    if (note.trim()) {
      await supabase.from('period_notes').upsert(
        {
          user_id: user.id,
          period_type: periodType,
          period_date: periodDate,
          note: note.trim(),
        },
        { onConflict: 'user_id,period_type,period_date' }
      )
    } else {
      await supabase
        .from('period_notes')
        .delete()
        .eq('user_id', user.id)
        .eq('period_type', periodType)
        .eq('period_date', periodDate)
    }
    setSaving(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSave()
  }

  return (
    <div className="mt-4 p-4 border border-border-warm rounded-xl">
      <div className="flex items-center justify-between mb-2">
        <p className="font-sans text-xs font-medium text-text-muted">{title}</p>
        <button onClick={onClose} className="text-text-light text-xl leading-none">×</button>
      </div>
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          placeholder=""
          rows={3}
          className="w-full bg-transparent font-sans text-sm text-text-primary focus:outline-none resize-none"
        />
        <CyclingPlaceholder
          active={note === ''}
          placeholders={NOTE_PLACEHOLDERS}
          className="font-sans text-sm"
          alignTop
        />
      </div>
      {saving && <p className="font-sans text-xs text-text-muted mt-1">Saving…</p>}
    </div>
  )
}
