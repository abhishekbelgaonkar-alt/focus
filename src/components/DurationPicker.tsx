'use client'
import { useRef } from 'react'

interface DurationPickerProps {
  value: number
  onChange: (minutes: number) => void
  min?: number
  max?: number
}

const LABEL_INTERVAL = 15
const SLIDER_HEIGHT = 28   // must match .focus-slider height in globals.css

export function DurationPicker({ value, onChange, min = 1, max = 90 }: DurationPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const range = max - min

  const handleSpanClick = () => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value)
    if (!isNaN(v)) {
      onChange(Math.min(max, Math.max(min, v)))
    }
  }

  const ticks = Array.from({ length: range + 1 }, (_, i) => min + i)
  const labels = ticks.filter((m) => m % LABEL_INTERVAL === 0)

  return (
    <div className="w-full">
      {/* Clickable number display — large span + invisible input behind it */}
      <div
        className="inline-flex items-baseline gap-2 mb-6 cursor-text"
        onClick={handleSpanClick}
      >
        <span className="font-numbers text-7xl font-semibold text-text-primary leading-none select-none">
          {value}
        </span>
        <span className="font-sans text-xl text-text-muted select-none">min</span>
        <input
          ref={inputRef}
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={handleNumberChange}
          aria-label="Duration in minutes"
          className="absolute opacity-0 w-0 h-0 pointer-events-none"
          tabIndex={-1}
        />
      </div>

      {/* 15-min labels above the tick+slider stack */}
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

      {/* Slider + tick marks OVERLAID — thumb slides directly on tick marks.
          Three tick tiers: tiny (1 min), medium (5 min), tall (15 min). */}
      <div className="relative w-full" style={{ height: SLIDER_HEIGHT }}>
        <svg
          className="absolute inset-0 w-full pointer-events-none"
          width="100%"
          height={SLIDER_HEIGHT}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {ticks.map((m) => {
            const isLarge = m % 15 === 0
            const isMedium = m % 5 === 0 && !isLarge
            const halfHeight = isLarge ? 12 : isMedium ? 7 : 4
            const x = `${((m - min) / range) * 100}%`
            const cy = SLIDER_HEIGHT / 2
            return (
              <line
                key={m}
                x1={x}
                x2={x}
                y1={cy - halfHeight}
                y2={cy + halfHeight}
                stroke={isLarge ? '#b08c6a' : '#c9b79c'}
                strokeWidth={isLarge ? '1.5' : '1'}
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
