'use client'
import { getRatingLabel } from '@/lib/timer'

interface RatingSliderProps {
  value: number
  onChange: (v: number) => void
}

const RATING_TICKS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]
const WHOLE_LABELS = [1, 2, 3, 4, 5]
const MIN = 1
const MAX = 5
const RANGE = MAX - MIN
const SLIDER_HEIGHT = 28   // must match .focus-slider height in globals.css

export function RatingSlider({ value, onChange }: RatingSliderProps) {
  return (
    <div className="w-full">
      {/* Word label + numeric value */}
      <div className="mb-6">
        <p className="font-sans text-sm text-text-muted mb-1">{getRatingLabel(value)}</p>
        <span className="font-numbers text-5xl font-semibold text-text-primary">
          {value.toFixed(1)}
        </span>
      </div>

      {/* Whole-number labels above the tick+slider stack */}
      <div className="relative w-full h-5 mb-1">
        {WHOLE_LABELS.map((n) => (
          <span
            key={n}
            className="absolute text-xs text-text-light font-sans -translate-x-1/2"
            style={{ left: `${((n - MIN) / RANGE) * 100}%` }}
          >
            {n}
          </span>
        ))}
      </div>

      {/* Slider + tick marks overlaid — same pattern as DurationPicker. */}
      <div className="relative w-full" style={{ height: SLIDER_HEIGHT }}>
        <svg
          className="absolute inset-0 w-full pointer-events-none"
          width="100%"
          height={SLIDER_HEIGHT}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {RATING_TICKS.map((t) => {
            const isWhole = Number.isInteger(t)
            const halfHeight = isWhole ? 12 : 6
            const x = `${((t - MIN) / RANGE) * 100}%`
            const cy = SLIDER_HEIGHT / 2
            return (
              <line
                key={t}
                x1={x}
                x2={x}
                y1={cy - halfHeight}
                y2={cy + halfHeight}
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
          className="focus-slider relative"
          aria-label="Rating slider"
          aria-valuemin={MIN}
          aria-valuemax={MAX}
          aria-valuenow={value}
        />
      </div>
    </div>
  )
}
