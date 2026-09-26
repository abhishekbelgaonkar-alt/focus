'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useDismiss } from '@/lib/use-dismiss'

// The internal key stays 'cream' so persisted user preferences don't
// migrate (a user who picked "Cream" last week gets the new Paper default
// without needing to re-pick). The user-facing label reflects the real
// aesthetic.
export type Theme = 'cream' | 'dark' | 'cherry'

const THEMES: { key: Theme; label: string; swatch: string }[] = [
  { key: 'cream',  label: 'Paper',          swatch: '#f2ede1' },
  { key: 'dark',   label: 'Ink',            swatch: '#1a1614' },
  { key: 'cherry', label: 'Cherry blossom', swatch: '#fbcfe8' },
]

/** Apply a theme to <html> and persist the choice. */
function applyTheme(theme: Theme) {
  const html = document.documentElement
  if (theme === 'cream') {
    html.removeAttribute('data-theme')
  } else {
    html.setAttribute('data-theme', theme)
  }
  try { localStorage.setItem('theme', theme) } catch { /* ignore */ }
}

export function ThemeToggle() {
  const [current, setCurrent] = useState<Theme>('cream')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Hydrate current theme state from the data-theme attribute already on
  // <html> (the pre-hydration script in layout.tsx set it before we mounted).
  useEffect(() => {
    const attr = document.documentElement.getAttribute('data-theme')
    if (attr === 'dark') setCurrent('dark')
    else if (attr === 'cherry') setCurrent('cherry')
    else setCurrent('cream')
  }, [])

  const close = useCallback(() => setOpen(false), [])
  useDismiss(containerRef, open, close)

  const pick = (t: Theme) => {
    setCurrent(t)
    applyTheme(t)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="font-sans text-sm text-text-muted whitespace-nowrap"
        aria-label="Choose theme"
      >
        Theme
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 bg-cream border border-border-warm rounded-xl p-1.5 z-50 min-w-[180px] shadow-sm">
          {THEMES.map((t) => {
            const isCurrent = current === t.key
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => pick(t.key)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left font-sans text-sm hover:bg-coral-light cursor-pointer ${
                  isCurrent ? 'text-coral' : 'text-text-primary'
                }`}
              >
                {/* Children get inline pointer-events:none so the button is
                    always the event target across the full row — no matter
                    where inside the row the mouse lands. */}
                <span
                  className="w-3 h-3 rounded-full border border-border-warm shrink-0"
                  style={{ backgroundColor: t.swatch, pointerEvents: 'none' }}
                />
                <span className="flex-1" style={{ pointerEvents: 'none' }}>
                  {t.label}
                </span>
                {isCurrent && (
                  <span style={{ pointerEvents: 'none' }}>✓</span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
