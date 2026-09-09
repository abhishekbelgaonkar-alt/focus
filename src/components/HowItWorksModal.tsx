'use client'
import { useEffect } from 'react'

interface HowItWorksModalProps {
  open: boolean
  onClose: () => void
}

export function HowItWorksModal({ open, onClose }: HowItWorksModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      {/* Backdrop — blurs the page and closes on click */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-50 bg-cream/50 backdrop-blur-sm"
        aria-hidden="true"
      />

      {/* Modal card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-it-works-title"
        className="fixed inset-x-4 top-20 max-w-md mx-auto z-50 bg-cream border border-border-warm rounded-xl p-5 shadow-sm"
      >
        <div className="flex items-start justify-between mb-4">
          <p
            id="how-it-works-title"
            className="font-sans text-xs font-medium text-tag-text uppercase tracking-wide"
          >
            How Focus works
          </p>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-text-light text-xl leading-none -mt-1 -mr-1 px-2"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-3 font-sans text-sm text-text-primary leading-relaxed">
          <p>
            A <strong>session</strong> is one timed block of work — with tasks, a rating,
            and notes. You start one with the timer on the home screen.
          </p>
          <p>
            A <strong>goal</strong> groups sessions on a shared project — like{' '}
            <em>&ldquo;Ship v1&rdquo;</em> or <em>&ldquo;Learn Spanish&rdquo;</em>. Assign
            one on the Save screen and it&apos;ll show up in <strong>All goals</strong> with
            running totals.
          </p>
          <p>
            Give a goal a <strong>schedule</strong> (Mon / Wed / Fri, etc.) and it&apos;ll
            auto-appear as <em>Today&apos;s plan</em> on the days you set.
          </p>
        </div>
      </div>
    </>
  )
}
