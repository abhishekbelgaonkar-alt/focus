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
            How Tokiroom works
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
            Tokiroom is a room for focused work. Walk in, do the work,
            walk out. Any amount of time you spend here counts, no matter
            how much.
          </p>
          <p>
            A <strong>session</strong> is one block of time. Set a duration,
            work on whatever you want, save it when you&apos;re done. Add
            tasks or notes if you feel like it, or don&apos;t. It&apos;s
            all optional.
          </p>
          <p>
            A <strong>goal</strong> groups sessions on something you keep
            coming back to, like studying for an exam or building a
            project. Assign one on the save screen and your hours pile up
            in <strong>All goals</strong>.
          </p>
          <p>
            Give a goal a <strong>schedule</strong> (Mon, Wed, Fri, or
            whichever days) and it&apos;ll show up in{' '}
            <em>Today&apos;s plan</em> on those days. It won&apos;t fuss
            if you skip.
          </p>
          <p>
            Tap <strong>Focus with someone</strong> to open a room and
            share the link. Everyone runs their own timer, sees who else
            is in, and leaves whenever they&apos;re done. If a friend is
            still going when your time&apos;s up, you can stay with them.
          </p>
          <p>
            Add <strong>friends</strong> from your Friends menu using an
            invite link, or after a shared session on the save screen.
            You can also <strong>share a goal</strong> from its page to
            keep a linked copy on a friend&apos;s account. Your sessions
            stay yours; the goal stays linked.
          </p>
          <p>
            No account required. Your data is yours. Attach an email
            whenever you want to keep it across devices.
          </p>
        </div>
      </div>
    </>
  )
}
