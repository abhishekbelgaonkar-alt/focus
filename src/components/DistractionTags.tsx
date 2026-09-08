'use client'
import { useState } from 'react'
import type { DistractionTag } from '@/lib/types'

interface DistractionTagsProps {
  tags: DistractionTag[]
  selected: string[]
  onToggle: (tagId: string) => void
  onAdd: (name: string) => void
}

export function DistractionTags({ tags, selected, onToggle, onAdd }: DistractionTagsProps) {
  const [adding, setAdding] = useState(false)
  const [newTag, setNewTag] = useState('')

  const commitAdd = () => {
    const name = newTag.trim()
    if (name) onAdd(name)
    setNewTag('')
    setAdding(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitAdd()
    if (e.key === 'Escape') { setNewTag(''); setAdding(false) }
  }

  return (
    <div>
      <p className="font-sans text-sm text-text-muted mb-3">What pulled your focus</p>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => {
          const isSelected = selected.includes(tag.id)
          return (
            <button
              key={tag.id}
              onClick={() => onToggle(tag.id)}
              className={`px-3 py-1.5 rounded-pill text-sm font-sans border-[1.5px] transition-colors ${
                isSelected
                  ? 'bg-coral-light border-coral text-tag-text'
                  : 'bg-transparent border-border-warm text-text-muted'
              }`}
            >
              {tag.name}
            </button>
          )
        })}

        {adding ? (
          <input
            autoFocus
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commitAdd}
            placeholder="Add a tag"
            className="px-3 py-1.5 rounded-pill text-sm font-sans border-[1.5px] border-coral bg-transparent text-text-primary placeholder:text-text-light focus:outline-none w-28"
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="px-3 py-1.5 rounded-pill text-sm font-sans border-[1.5px] border-dashed border-border-warm text-text-muted"
          >
            + add
          </button>
        )}
      </div>
    </div>
  )
}
