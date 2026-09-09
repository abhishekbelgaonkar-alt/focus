'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { HighlightedText } from '@/components/HighlightedText'
import { CyclingPlaceholder } from '@/components/CyclingPlaceholder'
import { formatDate, getSnippet } from '@/lib/format'

const SEARCH_PLACEHOLDERS = [
  'Search through your session names, notes, etc.',
  'Find a session by keyword',
  'Search a note or session name',
  'Look up past sessions',
]

interface SearchResult {
  id: string
  session_name: string | null
  notes: string | null
  rating: number | null
  started_at: string
  goals: { name: string } | null
  categories: { name: string } | null
}

interface SearchBarProps {
  onOpenChange?: (open: boolean) => void
}

export function SearchBar({ onOpenChange }: SearchBarProps) {
  const router = useRouter()
  const supabase = createClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [focused, setFocused] = useState(false)

  const isOpen = focused

  useEffect(() => {
    onOpenChange?.(isOpen)
  }, [isOpen, onOpenChange])

  // Debounced search — runs 300ms after user stops typing.
  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) { setResults([]); return }

    const t = setTimeout(async () => {
      try {
        const { data } = await supabase
          .from('sessions')
          .select('id, session_name, notes, rating, started_at, goals(name), categories(name)')
          .or(`session_name.ilike.%${trimmed}%,notes.ilike.%${trimmed}%`)
          .order('started_at', { ascending: false })
          .limit(20)
        setResults((data ?? []) as unknown as SearchResult[])
      } catch {
        setResults([])
      }
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  const handleClose = () => {
    setFocused(false)
    setQuery('')
    inputRef.current?.blur()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') handleClose()
  }

  const openResult = (id: string) => {
    handleClose()
    router.push(`/sessions/${id}`)
  }

  const trimmed = query.trim()

  return (
    <>
      {/* Backdrop — blurs whatever's behind it; clicking dismisses search */}
      {isOpen && (
        <div
          onClick={handleClose}
          className="fixed inset-0 z-30 bg-cream/40 backdrop-blur-sm"
          aria-hidden="true"
        />
      )}

      {/* Search input + results — must sit above the backdrop */}
      <div className="relative z-40 w-full">
        <div
          className={`flex items-center gap-2 border-b pb-1 transition-colors ${
            isOpen ? 'border-coral' : 'border-border-warm'
          }`}
        >
          <svg
            className={`w-4 h-4 shrink-0 transition-colors ${
              isOpen ? 'text-coral' : 'text-text-light'
            }`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onKeyDown={handleKeyDown}
              placeholder=""
              className="w-full bg-transparent font-sans text-sm text-text-primary focus:outline-none"
            />
            <CyclingPlaceholder
              active={query === ''}
              placeholders={SEARCH_PLACEHOLDERS}
              className="font-sans text-sm"
            />
          </div>
          {isOpen && (
            <button
              onClick={handleClose}
              className="text-text-light text-lg leading-none shrink-0"
              aria-label="Close search"
            >
              ×
            </button>
          )}
        </div>

        {/* Results dropdown */}
        {isOpen && (
          <div className="absolute inset-x-0 top-full mt-3 bg-cream border border-border-warm rounded-xl max-h-96 overflow-y-auto">
            {!trimmed && (
              <p className="font-sans text-sm text-text-muted p-4">
                Start typing to search across your sessions.
              </p>
            )}

            {trimmed && results.length === 0 && (
              <p className="font-sans text-sm text-text-muted p-4">
                No results for &ldquo;{trimmed}&rdquo;.
              </p>
            )}

            {results.map((r) => {
              const contextName = r.goals?.name ?? r.categories?.name ?? null
              const matchField = (() => {
                const q = trimmed.toLowerCase()
                if (r.notes?.toLowerCase().includes(q)) return r.notes
                if (r.session_name?.toLowerCase().includes(q)) return r.session_name
                return r.notes ?? r.session_name ?? ''
              })()
              const snippet = getSnippet(matchField, trimmed)

              return (
                <button
                  key={r.id}
                  onClick={() => openResult(r.id)}
                  className="text-left w-full px-4 py-3 border-b border-border-warm last:border-0 hover:bg-coral-light/40 transition-colors"
                >
                  {contextName && (
                    <p className="font-sans text-xs text-text-muted mb-0.5">{contextName}</p>
                  )}
                  <div className="flex items-baseline gap-3 mb-1">
                    <p className="font-sans text-sm font-medium text-text-primary">
                      {r.session_name ?? 'Session'}
                    </p>
                    {r.rating !== null && (
                      <span className="font-numbers text-xs text-text-muted">
                        {r.rating.toFixed(1)}/5
                      </span>
                    )}
                    <span className="font-sans text-xs text-text-light ml-auto">
                      {formatDate(r.started_at)}
                    </span>
                  </div>
                  <p className="font-sans text-xs text-text-muted leading-relaxed">
                    <HighlightedText text={snippet} query={trimmed} />
                  </p>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
