'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { HighlightedText } from '@/components/HighlightedText'
import { formatDate, getSnippet } from '@/lib/format'

interface SearchResult {
  id: string
  session_name: string | null
  notes: string | null
  rating: number | null
  started_at: string
  goals: { name: string } | null
  categories: { name: string } | null
}

export default function SearchPage() {
  const router = useRouter()
  const supabase = createClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) { setResults([]); setSearched(false); return }

    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('sessions')
        .select('id, session_name, notes, rating, started_at, goals(name), categories(name)')
        .or(`session_name.ilike.%${trimmed}%,notes.ilike.%${trimmed}%`)
        .order('started_at', { ascending: false })
        .limit(20)

      setResults((data ?? []) as unknown as SearchResult[])
      setSearched(true)
    }, 300)

    return () => clearTimeout(timer)
  }, [query])

  return (
    <main className="min-h-screen bg-cream px-6 pt-12 pb-10 max-w-md mx-auto">
      {/* Search bar */}
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => router.back()} className="font-sans text-sm text-text-muted shrink-0">
          ← Back
        </button>
        <div className="flex-1 flex items-center gap-2 border-b border-border-warm pb-1">
          <svg
            className="w-4 h-4 text-text-light shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sessions…"
            className="flex-1 bg-transparent font-sans text-sm text-text-primary placeholder:text-text-light focus:outline-none"
          />
        </div>
      </div>

      {searched && results.length === 0 && (
        <p className="font-sans text-sm text-text-muted">No results for "{query}".</p>
      )}

      <div className="flex flex-col">
        {results.map((r) => {
          const contextName = r.goals?.name ?? r.categories?.name ?? null
          const trimmed = query.trim()
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
              onClick={() => router.push(`/sessions/${r.id}`)}
              className="text-left py-4 border-b border-border-warm last:border-0"
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
    </main>
  )
}
