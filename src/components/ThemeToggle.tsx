'use client'
import { useState, useEffect, useRef } from 'react'

export type Theme = 'cream' | 'dark' | 'cherry'

const THEMES: { key: Theme; label: string; swatch: string }[] = [
  { key: 'cream',  label: 'Cream',           swatch: '#fdf6ee' },
  { key: 'dark',   label: 'Dark',            swatch: '#1a1512' },
  { key: 'cherry', label: 'Cherry blossom',  swatch: '#fbcfe8' },
]

/** Apply a theme to <html> and persist the choice. */
function applyTheme(theme: Theme) {
  const html = document.documentElement
  html.classList.remove('theme-dark', 'theme-cherry')
  if (theme === 'dark' || theme === 'cherry') {
    html.classList.add(`theme-${theme}`)
  }
  try { localStorage.setItem('theme', theme) } catch { /* ignore */ }
}

export function ThemeToggle() {
  const [current, setCurrent] = useState<Theme>('cream')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Hydrate current theme state from the class already on <html>
  // (the pre-hydration script in layout.tsx set it before we mounted).
  useEffect(() => {
    const cls = document.documentElement.classList
    if (cls.contains('theme-dark')) setCurrent('dark')
    else if (cls.contains('theme-cherry')) setCurrent('cherry')
    else setCurrent('cream')
  }, [])

  // Close popover on outside click / Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
    }
  }, [open])

  const pick = (t: Theme) => {
    setCurrent(t)
    applyTheme(t)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="font-sans text-sm text-text-muted whitespace-nowrap"
        aria-label="Choose theme"
      >
        Theme
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 bg-cream border border-border-warm rounded-xl p-1.5 z-50 min-w-[160px] shadow-sm">
          {THEMES.map((t) => {
            const isCurrent = current === t.key
            return (
              <button
                key={t.key}
                onClick={() => pick(t.key)}
                className={`flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-lg text-left font-sans text-sm ${
                  isCurrent ? 'text-coral' : 'text-text-primary'
                }`}
              >
                <span
                  className="w-3 h-3 rounded-full border border-border-warm shrink-0"
                  style={{ backgroundColor: t.swatch }}
                />
                <span className="flex-1">{t.label}</span>
                {isCurrent && <span className="text-coral">✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
