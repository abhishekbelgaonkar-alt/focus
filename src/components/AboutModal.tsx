'use client'
import { useEffect } from 'react'

interface AboutModalProps {
  open: boolean
  onClose: () => void
}

export function AboutModal({ open, onClose }: AboutModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      {/* Backdrop, blurs the page and closes on click */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-50 bg-cream/50 backdrop-blur-sm"
        aria-hidden="true"
      />

      {/* Modal card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        className="fixed inset-x-4 top-12 max-w-md mx-auto z-50 bg-cream border border-border-warm rounded-xl p-5 shadow-sm max-h-[80vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between mb-4">
          <p
            id="about-title"
            className="font-sans text-xs font-medium text-tag-text uppercase tracking-wide"
          >
            About Tokiroom
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
            Tokiroom is a quiet space for focused work. You come in, do
            your work, leave. If you stayed 5 minutes, that counts. If
            you stayed 4 hours, that counts too. Any time you spend here
            is time worth spending.
          </p>
          <p>
            The tools are simple on purpose. A timer. A place to write
            notes. A way to group sessions by what you&apos;re working
            on. Come back whenever you want.
          </p>
          <p>
            You come and go on your own time. Look back at your hours
            whenever you want, and feel good about the time you gave.
          </p>
          <p>
            Sometimes you focus alone. Sometimes you open a room and a
            friend joins. Either way is the same shape: show up, do the
            work, leave when you&apos;re done.
          </p>
          <p>
            The name is a small nod to a place from{' '}
            <em>Dragon Ball Z</em> called the Hyperbolic Time Chamber. In
            Japanese it&apos;s <em>Seishin no Toki no Heya</em>. A room
            where a day of training inside is a year outside. A good
            session here can feel a little like that.
          </p>
          <p className="mt-2 text-text-muted">
            Thanks for being here.
          </p>
        </div>
      </div>
    </>
  )
}
