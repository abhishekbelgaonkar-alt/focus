'use client'
import { getRatingLabel } from '@/lib/timer'

interface RatingSliderProps {
  value: number
  onChange: (v: number) => void
}

const RATING_TICKS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]
const MIN = 1
const MAX = 5
const RANGE = MAX - MIN

export function RatingSlider({ value, onChange }: RatingSliderProps) {
  return (
    <div className="w-full">
      {/* Word label + numeric value */}
      <div className="mb-4">
        <p className="font-sans text-sm text-text-muted mb-1">{getRatingLabel(value)}</p>
        <span className="font-numbers text-5xl font-semibold text-text-primary">
          {value.toFixed(1)}
        </span>
      </div>

      {/* Tick marks above slider track */}
      <svg className="w-full mb-2" height="12" preserveAspectRatio="none" aria-hidden="true">
        {RATING_TICKS.map((t) => {
          const isWhole = Number.isInteger(t)
          const height = isWhole ? 10 : 6
          const x = `${((t - MIN) / RANGE) * 100}%`
          return (
            <line
              key={t}
              x1={x}
              x2={x}
              y1={12 - height}
              y2="12"
              stroke={isWhole ? '#b08c6a' : '#c9b79c'}
              strokeWidth={isWhole ? '1.5' : '1'}
            />
          )
        })}
      </svg>

      <input
        type="range"
        min={MIN}
        max={MAX}
        step={0.5}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="focus-slider"
        aria-label="Rating slider"
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        aria-valuenow={value}
      />
    </div>
  )
}
