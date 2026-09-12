'use client'
import { useState, useEffect } from 'react'

interface DurationPickerProps {
  value: number
  onChange: (minutes: number) => void
  min?: number
  max?: number
}

const SLIDER_HEIGHT = 28   // must match .focus-slider height in globals.css

export function DurationPicker({ value, onChange, min = 1, max = 90 }: DurationPickerProps) {
  const range = max - min
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  // Tick tiers — keep the fine per-minute texture at every scale so the
  // ruler always reads like a ruler. Only the label spacing gets sparser
  // for larger ranges so the numbers don't overlap.
  const compact = range > 90
  const largeStep = compact ? 30 : 15
  const mediumStep = 5

  const startEdit = () => {
    setDraft(String(value))
    setEditing(true)
  }

  const commitEdit = () => {
    const n = parseInt(draft, 10)
    if (!isNaN(n)) onChange(Math.min(max, Math.max(min, n)))
    setEditing(false)
  }

  const cancelEdit = () => setEditing(false)

  // Keep draft in sync when parent updates value while not editing
  useEffect(() => {
    if (!editing) setDraft(String(value))
  }, [value, editing])

  // Build tick + label positions — three visual tiers.
  const ticks: { pos: number; tier: 'tiny' | 'medium' | 'large' }[] = []
  for (let m = min; m <= max; m++) {
    const isLarge = m % largeStep === 0
    const isMedium = !isLarge && m % mediumStep === 0
    if (isLarge) ticks.push({ pos: m, tier: 'large' })
    else if (isMedium) ticks.push({ pos: m, tier: 'medium' })
    else ticks.push({ pos: m, tier: 'tiny' })
  }
  const labels = ticks.filter((t) => t.tier === 'large').map((t) => t.pos)

  return (
    <div className="w-full">
      {/* Number display — click to edit inline. Centered above the scale
          so the numeric readout sits over the middle of the ruler. */}
      <div className="flex items-baseline justify-center gap-2 mb-6">
        {editing ? (
          <input
            autoFocus
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
            onFocus={(e) => e.target.select()}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEdit()
              if (e.key === 'Escape') cancelEdit()
            }}
            aria-label="Duration in minutes"
            className="font-numbers text-7xl font-semibold text-text-primary leading-none bg-transparent outline-none w-40 pb-0.5 border-b-2 border-coral"
          />
        ) : (
          <span
            onClick={startEdit}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startEdit() }
            }}
            className="font-numbers text-7xl font-semibold text-text-primary leading-none cursor-text select-none"
            aria-label={`Duration ${value} minutes — click to edit`}
          >
            {value}
          </span>
        )}
        <span className="font-sans text-xl text-text-muted select-none">min</span>
      </div>

      {/* Label row */}
      <div className="relative w-full h-5 mb-1">
        {labels.map((m) => (
          <span
            key={m}
            className="absolute text-xs text-text-light font-sans -translate-x-1/2"
            style={{ left: `${((m - min) / range) * 100}%` }}
          >
            {m}
          </span>
        ))}
      </div>

      {/* Slider + tick marks OVERLAID */}
      <div className="relative w-full" style={{ height: SLIDER_HEIGHT }}>
        <svg
          className="absolute inset-0 w-full pointer-events-none"
          width="100%"
          height={SLIDER_HEIGHT}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {ticks.map(({ pos, tier }) => {
            // Compact-scale tinies shrink slightly + lighten so 180 of them
            // form a fine texture rather than a wall of lines.
            const halfHeight =
              tier === 'large' ? 12
              : tier === 'medium' ? 7
              : compact ? 3 : 4
            const x = `${((pos - min) / range) * 100}%`
            const cy = SLIDER_HEIGHT / 2
            const stroke =
              tier === 'large' ? '#b08c6a'
              : tier === 'medium' ? '#b08c6a'
              : compact ? '#dcc9ae' : '#c9b79c'
            const width = tier === 'large' ? 1.5 : 1
            return (
              <line
                key={pos}
                x1={x}
                x2={x}
                y1={cy - halfHeight}
                y2={cy + halfHeight}
                stroke={stroke}
                strokeWidth={width}
              />
            )
          })}
        </svg>

        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="focus-slider relative"
          aria-label="Duration slider"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
        />
      </div>
    </div>
  )
}
