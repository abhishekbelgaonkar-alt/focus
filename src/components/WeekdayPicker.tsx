'use client'
import type { Weekday } from '@/lib/types'

const DAYS: { key: Weekday; label: string }[] = [
  { key: 'mon', label: 'M' },
  { key: 'tue', label: 'T' },
  { key: 'wed', label: 'W' },
  { key: 'thu', label: 'T' },
  { key: 'fri', label: 'F' },
  { key: 'sat', label: 'S' },
  { key: 'sun', label: 'S' },
]

interface WeekdayPickerProps {
  selected: Weekday[]
  onChange: (days: Weekday[]) => void
}

export function WeekdayPicker({ selected, onChange }: WeekdayPickerProps) {
  const toggle = (day: Weekday) => {
    onChange(
      selected.includes(day)
        ? selected.filter((d) => d !== day)
        : [...selected, day]
    )
  }

  return (
    <div className="flex gap-2">
      {DAYS.map(({ key, label }) => {
        const isSelected = selected.includes(key)
        return (
          <button
            key={key}
            onClick={() => toggle(key)}
            className={`w-9 h-9 rounded-full font-sans text-sm font-medium transition-colors ${
              isSelected
                ? 'bg-coral text-white'
                : 'border-[1.5px] border-border-warm text-text-muted'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
