'use client'
import { useState } from 'react'
import { RatingSlider } from '@/components/RatingSlider'
import { DistractionTags } from '@/components/DistractionTags'
import { getNotePlaceholder } from '@/lib/timer'
import type { DistractionTag } from '@/lib/types'

export interface GoalOption {
  id: string
  name: string
  type: 'goal' | 'category'
}

export interface RatingFormData {
  rating: number
  notes: string
  sessionName: string
  selectedTagIds: string[]
  goalText: string          // used when creating a new goal
  existingGoalId: string | null
  existingCategoryId: string | null
}

interface RatingFormProps {
  initialRating?: number
  initialNotes?: string
  initialSessionName?: string
  initialSelectedTagIds?: string[]
  focusText?: string | null
  tags: DistractionTag[]
  onAddTag: (name: string) => Promise<void>
  onSave: (data: RatingFormData) => Promise<void>
  saving: boolean
  showGoalPrompt?: boolean
  goalOptions?: GoalOption[]
  header?: React.ReactNode         // renders below focusText, above rating
  saveDisabled?: boolean           // gate save until required upstream state is set
  hideSessionRating?: boolean      // suppress the session rating slider (e.g. when tasks are being rated)
}

type GoalMode = 'skip' | 'existing' | 'create'

export function RatingForm({
  initialRating = 3.0,
  initialNotes = '',
  initialSessionName = '',
  initialSelectedTagIds = [],
  focusText,
  tags,
  onAddTag,
  onSave,
  saving,
  showGoalPrompt = false,
  goalOptions = [],
  header,
  saveDisabled = false,
  hideSessionRating = false,
}: RatingFormProps) {
  const [rating, setRating] = useState(initialRating)
  const [notes, setNotes] = useState(initialNotes)
  const [sessionName, setSessionName] = useState(initialSessionName)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(initialSelectedTagIds)

  // Goal-assignment state (only relevant when showGoalPrompt=true)
  const [goalMode, setGoalMode] = useState<GoalMode>('skip')
  const [selectedOptionKey, setSelectedOptionKey] = useState<string>('')  // "goal:<id>" or "category:<id>"
  const [goalText, setGoalText] = useState('')

  const handleToggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    )
  }

  const handleSave = () => {
    let existingGoalId: string | null = null
    let existingCategoryId: string | null = null
    let finalGoalText = ''

    if (showGoalPrompt && goalMode === 'existing' && selectedOptionKey) {
      const [kind, id] = selectedOptionKey.split(':')
      if (kind === 'goal') existingGoalId = id
      else if (kind === 'category') existingCategoryId = id
    } else if (showGoalPrompt && goalMode === 'create') {
      finalGoalText = goalText
    }

    onSave({
      rating,
      notes,
      sessionName,
      selectedTagIds,
      goalText: finalGoalText,
      existingGoalId,
      existingCategoryId,
    })
  }

  return (
    <main className="min-h-screen bg-cream px-6 pt-12 pb-24 max-w-md mx-auto">
      {focusText && (
        <p className="font-sans text-base text-text-muted mb-2">{focusText}</p>
      )}

      {header && <div className="mb-8">{header}</div>}

      {!hideSessionRating && (
        <div className="mb-10">
          <RatingSlider value={rating} onChange={setRating} />
        </div>
      )}

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
          <label className="block font-sans text-sm font-medium text-text-primary mb-1">
            Group with a goal{' '}
            <span className="text-text-light font-normal">(optional)</span>
          </label>
          <p className="font-sans text-xs text-text-muted mb-4 leading-relaxed">
            A goal is a project or theme you&apos;ll come back to — e.g.{' '}
            <em>&ldquo;Finals prep&rdquo;</em> or <em>&ldquo;Learn guitar&rdquo;</em>.
            Sessions grouped by goal roll up in <strong>All goals</strong> with running totals.
          </p>

          {/* When existing goals exist, offer picker + Create switch. Otherwise
              just show a single input — nothing to pick from anyway. */}
          {goalOptions.length > 0 ? (
            <>
              <div className="flex gap-2 mb-3 flex-wrap">
                {([
                  { key: 'skip', label: 'Skip' },
                  { key: 'existing' as const, label: 'Pick existing' },
                  { key: 'create', label: 'Create new' },
                ] as { key: GoalMode; label: string }[]).map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setGoalMode(opt.key)}
                    className={`px-3 py-1.5 rounded-pill text-xs font-sans border-[1.5px] ${
                      goalMode === opt.key
                        ? 'bg-coral-light border-coral text-tag-text'
                        : 'bg-transparent border-border-warm text-text-muted'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {goalMode === 'existing' && (
                <select
                  value={selectedOptionKey}
                  onChange={(e) => setSelectedOptionKey(e.target.value)}
                  className="w-full bg-transparent border-b border-border-warm pb-1 font-sans text-sm text-text-primary focus:outline-none focus:border-coral"
                >
                  <option value="">Choose one…</option>
                  {goalOptions
                    .filter((o) => o.type === 'goal')
                    .map((o) => (
                      <option key={`goal:${o.id}`} value={`goal:${o.id}`}>
                        {o.name}
                      </option>
                    ))}
                  {goalOptions
                    .filter((o) => o.type === 'category')
                    .map((o) => (
                      <option key={`category:${o.id}`} value={`category:${o.id}`}>
                        {o.name} (category)
                      </option>
                    ))}
                </select>
              )}

              {goalMode === 'create' && (
                <input
                  type="text"
                  value={goalText}
                  onChange={(e) => setGoalText(e.target.value)}
                  placeholder="e.g. Finals prep"
                  className="w-full bg-transparent border-b border-border-warm pb-1 font-sans text-sm text-text-primary placeholder:text-text-light focus:outline-none focus:border-coral"
                />
              )}
            </>
          ) : (
            <input
              type="text"
              value={goalText}
              onChange={(e) => {
                setGoalText(e.target.value)
                // First-time users: implicitly "create" mode once they type
                if (e.target.value && goalMode !== 'create') setGoalMode('create')
                if (!e.target.value) setGoalMode('skip')
              }}
              placeholder="e.g. Finals prep"
              className="w-full bg-transparent border-b border-border-warm pb-1 font-sans text-sm text-text-primary placeholder:text-text-light focus:outline-none focus:border-coral"
            />
          )}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving || saveDisabled}
        className="w-full bg-coral text-white font-sans font-medium py-3 rounded-pill disabled:opacity-50 transition-opacity"
      >
        {saving ? 'Saving…' : 'Save session'}
      </button>
    </main>
  )
}
