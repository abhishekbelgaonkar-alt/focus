'use client'
import { useEffect, type ReactNode } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

// Centered card over a blurred backdrop. Closes on backdrop click, the ×
// button, or Escape.
export function Modal({ open, onClose, title, children }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-50 bg-cream/50 backdrop-blur-sm"
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="fixed inset-x-4 top-12 max-w-md mx-auto z-50 bg-cream border border-border-warm rounded-xl p-5 shadow-sm max-h-[80vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between mb-4">
          <p
            id="modal-title"
            className="font-sans text-xs font-medium text-tag-text uppercase tracking-wide"
          >
            {title}
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
          {children}
        </div>
      </div>
    </>
  )
}
