'use client'
import { useState } from 'react'
import { RatingSlider } from '@/components/RatingSlider'
import { DistractionTags } from '@/components/DistractionTags'
import { getNotePlaceholder } from '@/lib/timer'
import type { DistractionTag } from '@/lib/types'

export interface RatingFormData {
  rating: number
  notes: string
  sessionName: string
  selectedTagIds: string[]
  goalText: string
}

interface RatingFormProps {
  initialRating?: number
  initialNotes?: string
  initialSessionName?: string
  initialSelectedTagIds?: string[]
  initialGoalText?: string
  focusText?: string | null
  tags: DistractionTag[]
  onAddTag: (name: string) => Promise<void>
  onSave: (data: RatingFormData) => Promise<void>
  saving: boolean
  showGoalPrompt?: boolean
}

export function RatingForm({
  initialRating = 3.0,
  initialNotes = '',
  initialSessionName = '',
  initialSelectedTagIds = [],
  initialGoalText = '',
  focusText,
  tags,
  onAddTag,
  onSave,
  saving,
  showGoalPrompt = false,
}: RatingFormProps) {
  const [rating, setRating] = useState(initialRating)
  const [notes, setNotes] = useState(initialNotes)
  const [sessionName, setSessionName] = useState(initialSessionName)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(initialSelectedTagIds)
  const [goalText, setGoalText] = useState(initialGoalText)

  const handleToggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    )
  }

  const handleSave = () =>
    onSave({ rating, notes, sessionName, selectedTagIds, goalText })

  return (
    <main className="min-h-screen bg-cream px-6 pt-12 pb-24 max-w-md mx-auto">
      {focusText && (
        <p className="font-sans text-base text-text-muted mb-8">{focusText}</p>
      )}

      <div className="mb-10">
        <RatingSlider value={rating} onChange={setRating} />
      </div>

      <div className="mb-10">
        <DistractionTags
          tags={tags}
          selected={selectedTagIds}
          onToggle={handleToggleTag}
          onAdd={onAddTag}
        />
      </div>

      <div className="mb-8">
        <p className="font-sans text-sm text-text-muted mb-2">
          Notes — write whatever you want
        </p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={getNotePlaceholder(rating)}
          rows={4}
          className="w-full bg-transparent border border-border-warm rounded-xl px-3 py-2 font-sans text-sm text-text-primary placeholder:text-text-light focus:outline-none focus:border-coral resize-none"
        />
      </div>

      <div className="mb-6">
        <label className="block font-sans text-sm text-text-muted mb-1">
          Give this session a name{' '}
          <span className="text-text-light">(optional)</span>
        </label>
        <input
          type="text"
          value={sessionName}
          onChange={(e) => setSessionName(e.target.value)}
          placeholder="e.g. Fix login bug"
          className="w-full bg-transparent border-b border-border-warm pb-1 font-sans text-sm text-text-primary placeholder:text-text-light focus:outline-none focus:border-coral"
        />
      </div>

      {showGoalPrompt && (
        <div className="mb-8 border border-border-warm rounded-xl p-4">
          <label className="block font-sans text-sm text-text-muted mb-1">
            What was this session for?{' '}
            <span className="text-text-light">(optional)</span>
          </label>
          <input
            type="text"
            value={goalText}
            onChange={(e) => setGoalText(e.target.value)}
            placeholder="Name a goal or category"
            className="w-full bg-transparent border-b border-border-warm pb-1 font-sans text-sm text-text-primary placeholder:text-text-light focus:outline-none focus:border-coral"
          />
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-coral text-white font-sans font-medium py-3 rounded-pill disabled:opacity-50 transition-opacity"
      >
        {saving ? 'Saving…' : 'Save session'}
      </button>
    </main>
  )
}
