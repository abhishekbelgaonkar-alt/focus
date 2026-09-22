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
const SLIDER_HEIGHT = 28   // must match .focus-slider height in globals.css

export function RatingSlider({ value, onChange }: RatingSliderProps) {
  return (
    <div className="w-full">
      {/* Mood word for the current position. The numeric value is stored on
          submit but never shown to the user — the identity rejects grading
          framing, and a visible "3.0" reads as a grade. Word-only. */}
      <div className="mb-6">
        <p className="font-sans text-2xl font-medium text-text-primary lowercase">
          {getRatingLabel(value)}
        </p>
      </div>

      {/* Slider + tick marks overlaid. Ticks are unlabeled — visual guides
          only, no numbers. Endpoint mood-words below give the user a sense
          of the span without turning positions into grades. */}
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

      {/* Endpoint word anchors — set the emotional span without labeling
          intermediate positions. Muted, small, non-competing. */}
      <div className="relative w-full h-4 mt-2">
        <span className="absolute left-0 font-sans text-xs text-text-light lowercase">
          scattered
        </span>
        <span className="absolute right-0 font-sans text-xs text-text-light lowercase">
          flowing
        </span>
      </div>
    </div>
  )
}
