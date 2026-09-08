# Focus Tracker — Home Screen + History (Plan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the home screen (returning users), goal detail, session detail + edit, all-goals list, and search — spec screens 2, 6, 7, 8, 9.

**Architecture:** All screens are client components that fetch from Supabase after auth resolves. Goal stats (aggregated session counts + durations) are computed via a Postgres `get_goal_stats()` RPC function added in a new migration, called with `supabase.rpc('get_goal_stats')`. The rating form UI is extracted into a shared `RatingForm` component reused by both the new-session `/rate` page and the edit-session page. The entry point `page.tsx` replaces its redirect with a check: zero sessions → redirect to `/setup`, else render the home screen.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind v4, Supabase JS v2, Vitest + React Testing Library (existing setup)

> **Prerequisites:** Plan 1 must be complete (`dashboardchanges` branch). Supabase setup (migration + anonymous auth) still needs to be done before manual testing — see saved reminder.

---

## File Structure

```
src/
├── app/
│   ├── page.tsx                         MODIFY — home screen client component (replaces redirect)
│   ├── setup/page.tsx                   MODIFY — handle ?goalId param for "Continue" flow
│   ├── rate/page.tsx                    MODIFY — refactor to use shared RatingForm
│   ├── goals/
│   │   ├── page.tsx                     CREATE — all goals overview
│   │   └── [id]/
│   │       └── page.tsx                 CREATE — goal detail + session history
│   ├── sessions/
│   │   └── [id]/
│   │       ├── page.tsx                 CREATE — session detail (read-only)
│   │       └── edit/
│   │           └── page.tsx             CREATE — edit session (RatingForm pre-filled)
│   └── search/
│       └── page.tsx                     CREATE — search across session names + notes
├── components/
│   ├── RatingForm.tsx                   CREATE — extracted from rate/page.tsx
│   ├── SessionRow.tsx                   CREATE — reusable session list row
│   └── HighlightedText.tsx             CREATE — search snippet with matched term in <mark>
└── lib/
    └── format.ts                        CREATE — formatDuration, formatDate, formatDateTime, getSnippet

supabase/migrations/
    └── 20260908000000_goal_stats_fn.sql CREATE — get_goal_stats() RPC function
```

---

### Task 1: DB migration — `get_goal_stats()` RPC function

**Files:**
- Create: `supabase/migrations/20260908000000_goal_stats_fn.sql`

The Supabase JS client can't do `GROUP BY` natively. This Postgres function is called via `supabase.rpc('get_goal_stats')` and returns one row per goal with computed stats. Used by both the home screen (recent 3) and the all-goals page (all).

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260908000000_goal_stats_fn.sql`:

```sql
-- Returns one row per goal for the currently-authenticated user,
-- with aggregated session stats. SECURITY INVOKER means the caller's
-- RLS policies apply — only the user's own goals are returned.
CREATE OR REPLACE FUNCTION get_goal_stats()
RETURNS TABLE (
  goal_id        uuid,
  name           text,
  status         text,
  schedule       text[],
  created_at     timestamptz,
  session_count  integer,
  total_minutes  integer,
  avg_rating     numeric,
  last_session_at timestamptz
) LANGUAGE sql SECURITY INVOKER AS $$
  SELECT
    g.id,
    g.name,
    g.status,
    g.schedule,
    g.created_at,
    COUNT(s.id)::integer                              AS session_count,
    COALESCE(SUM(s.actual_duration_minutes), 0)::integer AS total_minutes,
    ROUND(AVG(s.rating)::numeric, 1)                  AS avg_rating,
    MAX(s.started_at)                                 AS last_session_at
  FROM goals g
  LEFT JOIN sessions s ON s.goal_id = g.id
  WHERE g.user_id = auth.uid()
  GROUP BY g.id
  ORDER BY MAX(s.started_at) DESC NULLS LAST;
$$;
```

- [ ] **Step 2: Apply to Supabase**

In Supabase Dashboard → SQL Editor, paste the file contents and click Run. You should see "Success. No rows returned."

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260908000000_goal_stats_fn.sql
git commit -m "feat: add get_goal_stats() RPC for aggregated goal stats"
```

---

### Task 2: Format utilities + tests

**Files:**
- Create: `src/lib/format.ts`
- Create: `src/__tests__/format.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/format.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { formatDuration, formatDate, formatDateTime, getSnippet } from '@/lib/format'

describe('formatDuration', () => {
  it('shows minutes only when under 60', () => {
    expect(formatDuration(25)).toBe('25m')
    expect(formatDuration(1)).toBe('1m')
    expect(formatDuration(59)).toBe('59m')
  })

  it('shows hours only when evenly divisible', () => {
    expect(formatDuration(60)).toBe('1h')
    expect(formatDuration(120)).toBe('2h')
  })

  it('shows hours and minutes together', () => {
    expect(formatDuration(90)).toBe('1h 30m')
    expect(formatDuration(252)).toBe('4h 12m')
  })

  it('handles 0 minutes', () => {
    expect(formatDuration(0)).toBe('0m')
  })
})

describe('formatDate', () => {
  it('formats an ISO string to short date', () => {
    // Months are locale-dependent; just verify shape
    const result = formatDate('2026-09-07T14:30:00Z')
    expect(result).toMatch(/Sep/)
    expect(result).toMatch(/2026/)
  })
})

describe('formatDateTime', () => {
  it('includes both date and time', () => {
    const result = formatDateTime('2026-09-07T14:30:00Z')
    expect(result).toMatch(/Sep/)
    expect(result).toMatch(/:/)
  })
})

describe('getSnippet', () => {
  it('returns a short excerpt when match is near the start', () => {
    const text = 'Phone kept buzzing and I lost focus completely'
    const result = getSnippet(text, 'Phone')
    expect(result).toContain('Phone')
  })

  it('adds ellipsis when the match is deep inside the text', () => {
    const long = 'a'.repeat(80) + 'match' + 'b'.repeat(80)
    const result = getSnippet(long, 'match')
    expect(result).toContain('match')
    expect(result.startsWith('…')).toBe(true)
    expect(result.endsWith('…')).toBe(true)
  })

  it('falls back to first 120 chars when query is not found', () => {
    const text = 'x'.repeat(200)
    const result = getSnippet(text, 'notfound')
    expect(result.length).toBeLessThanOrEqual(124) // 120 + possible ellipsis
  })

  it('is case-insensitive', () => {
    const result = getSnippet('Started feeling tired', 'TIRED')
    expect(result).toContain('tired')
  })
})
```

- [ ] **Step 2: Run — verify they fail**

```bash
npm run test:run -- src/__tests__/format.test.ts 2>&1 | tail -4
```

Expected: FAIL with "Cannot find module '@/lib/format'"

- [ ] **Step 3: Create `src/lib/format.ts`**

```typescript
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function getSnippet(text: string, query: string, radius = 60): string {
  const lower = text.toLowerCase()
  const idx = lower.indexOf(query.toLowerCase())
  if (idx === -1) {
    const clip = text.slice(0, 120)
    return clip + (text.length > 120 ? '…' : '')
  }
  const start = Math.max(0, idx - radius)
  const end = Math.min(text.length, idx + query.length + radius)
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
}
```

- [ ] **Step 4: Run — verify all pass**

```bash
npm run test:run -- src/__tests__/format.test.ts 2>&1 | tail -4
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/__tests__/format.test.ts
git commit -m "feat: add format utilities — formatDuration, formatDate, formatDateTime, getSnippet"
```

---

### Task 3: HighlightedText component + tests

**Files:**
- Create: `src/components/HighlightedText.tsx`
- Create: `src/__tests__/HighlightedText.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/HighlightedText.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HighlightedText } from '@/components/HighlightedText'

describe('HighlightedText', () => {
  it('renders plain text when query is empty', () => {
    render(<HighlightedText text="Phone kept buzzing" query="" />)
    expect(screen.getByText('Phone kept buzzing')).toBeInTheDocument()
    expect(document.querySelector('mark')).toBeNull()
  })

  it('wraps the matched portion in a <mark>', () => {
    render(<HighlightedText text="Phone kept buzzing" query="Phone" />)
    expect(document.querySelector('mark')).not.toBeNull()
    expect(document.querySelector('mark')!.textContent).toBe('Phone')
  })

  it('renders plain text when no match', () => {
    render(<HighlightedText text="Nothing here" query="xyz" />)
    expect(document.querySelector('mark')).toBeNull()
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
  })

  it('is case-insensitive — matches regardless of case', () => {
    render(<HighlightedText text="Started feeling tired" query="TIRED" />)
    expect(document.querySelector('mark')!.textContent!.toLowerCase()).toBe('tired')
  })

  it('preserves surrounding text around the match', () => {
    const { container } = render(<HighlightedText text="got distracted again" query="distracted" />)
    expect(container.textContent).toBe('got distracted again')
  })
})
```

- [ ] **Step 2: Run — verify they fail**

```bash
npm run test:run -- src/__tests__/HighlightedText.test.tsx 2>&1 | tail -4
```

Expected: FAIL with "Cannot find module '@/components/HighlightedText'"

- [ ] **Step 3: Create `src/components/HighlightedText.tsx`**

```tsx
interface HighlightedTextProps {
  text: string
  query: string
}

export function HighlightedText({ text, query }: HighlightedTextProps) {
  if (!query || !text) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  const before = text.slice(0, idx)
  const match = text.slice(idx, idx + query.length)
  const after = text.slice(idx + query.length)
  return (
    <>
      {before}
      <mark className="bg-coral-light text-tag-text not-italic">{match}</mark>
      {after}
    </>
  )
}
```

- [ ] **Step 4: Run — verify all pass**

```bash
npm run test:run -- src/__tests__/HighlightedText.test.tsx 2>&1 | tail -4
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/HighlightedText.tsx src/__tests__/HighlightedText.test.tsx
git commit -m "feat: add HighlightedText — wraps matched search term in <mark>"
```

---

### Task 4: SessionRow component

**Files:**
- Create: `src/components/SessionRow.tsx`

No dedicated tests — it's a pure display component with no logic; its rendering is verified as part of the goal detail and search pages.

- [ ] **Step 1: Create `src/components/SessionRow.tsx`**

```tsx
import { formatDuration, formatDateTime } from '@/lib/format'

interface SessionRowProps {
  id: string
  sessionName: string | null
  startedAt: string
  actualDurationMinutes: number
  rating: number | null
  onClick: () => void
}

export function SessionRow({
  sessionName,
  startedAt,
  actualDurationMinutes,
  rating,
  onClick,
}: SessionRowProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left py-3.5 border-b border-border-warm last:border-0 flex items-center justify-between gap-4"
    >
      <div className="min-w-0">
        <p className="font-sans text-sm font-medium text-text-primary truncate">
          {sessionName ?? 'Session'}
        </p>
        <p className="font-sans text-xs text-text-muted mt-0.5">
          {formatDateTime(startedAt)} · {formatDuration(actualDurationMinutes)}
        </p>
      </div>
      {rating !== null && (
        <span className="font-numbers text-sm font-semibold text-text-muted shrink-0">
          {rating.toFixed(1)}
        </span>
      )}
    </button>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/SessionRow.tsx
git commit -m "feat: add SessionRow — reusable session list row with name, date, duration, rating"
```

---

### Task 5: Extract RatingForm + update rate/page.tsx

**Files:**
- Create: `src/components/RatingForm.tsx`
- Modify: `src/app/rate/page.tsx`

The form UI lives in `RatingForm.tsx`. The page (`rate/page.tsx`) becomes an orchestrator: loads session state, fetches tags, wires `onSave` to the Supabase insert.

- [ ] **Step 1: Create `src/components/RatingForm.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { RatingSlider } from '@/components/RatingSlider'
import { DistractionTags } from '@/components/DistractionTags'
import { getNotePlaceholder } from '@/lib/timer'
import type { DistractionTag } from '@/lib/types'

export interface RatingFormData {
  rating: number
  notes: string
  sessionName: string
  selectedTagIds: string[]
  goalText: string
}

interface RatingFormProps {
  initialRating?: number
  initialNotes?: string
  initialSessionName?: string
  initialSelectedTagIds?: string[]
  initialGoalText?: string
  focusText?: string | null
  tags: DistractionTag[]
  onAddTag: (name: string) => Promise<void>
  onSave: (data: RatingFormData) => Promise<void>
  saving: boolean
  showGoalPrompt?: boolean
}

export function RatingForm({
  initialRating = 3.0,
  initialNotes = '',
  initialSessionName = '',
  initialSelectedTagIds = [],
  initialGoalText = '',
  focusText,
  tags,
  onAddTag,
  onSave,
  saving,
  showGoalPrompt = false,
}: RatingFormProps) {
  const [rating, setRating] = useState(initialRating)
  const [notes, setNotes] = useState(initialNotes)
  const [sessionName, setSessionName] = useState(initialSessionName)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(initialSelectedTagIds)
  const [goalText, setGoalText] = useState(initialGoalText)

  const handleToggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    )
  }

  const handleAddTag = async (name: string) => {
    await onAddTag(name)
  }

  const handleSave = () =>
    onSave({ rating, notes, sessionName, selectedTagIds, goalText })

  return (
    <main className="min-h-screen bg-cream px-6 pt-12 pb-24 max-w-md mx-auto">
      {focusText && (
        <p className="font-sans text-base text-text-muted mb-8">{focusText}</p>
      )}

      <div className="mb-10">
        <RatingSlider value={rating} onChange={setRating} />
      </div>

      <div className="mb-10">
        <DistractionTags
          tags={tags}
          selected={selectedTagIds}
          onToggle={handleToggleTag}
          onAdd={handleAddTag}
        />
      </div>

      <div className="mb-8">
        <p className="font-sans text-sm text-text-muted mb-2">
          Notes — write whatever you want
        </p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={getNotePlaceholder(rating)}
          rows={4}
          className="w-full bg-transparent border border-border-warm rounded-xl px-3 py-2 font-sans text-sm text-text-primary placeholder:text-text-light focus:outline-none focus:border-coral resize-none"
        />
      </div>

      <div className="mb-6">
        <label className="block font-sans text-sm text-text-muted mb-1">
          Give this session a name{' '}
          <span className="text-text-light">(optional)</span>
        </label>
        <input
          type="text"
          value={sessionName}
          onChange={(e) => setSessionName(e.target.value)}
          placeholder="e.g. Fix login bug"
          className="w-full bg-transparent border-b border-border-warm pb-1 font-sans text-sm text-text-primary placeholder:text-text-light focus:outline-none focus:border-coral"
        />
      </div>

      {showGoalPrompt && (
        <div className="mb-8 border border-border-warm rounded-xl p-4">
          <label className="block font-sans text-sm text-text-muted mb-1">
            What was this session for?{' '}
            <span className="text-text-light">(optional)</span>
          </label>
          <input
            type="text"
            value={goalText}
            onChange={(e) => setGoalText(e.target.value)}
            placeholder="Name a goal or category"
            className="w-full bg-transparent border-b border-border-warm pb-1 font-sans text-sm text-text-primary placeholder:text-text-light focus:outline-none focus:border-coral"
          />
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-coral text-white font-sans font-medium py-3 rounded-pill disabled:opacity-50 transition-opacity"
      >
        {saving ? 'Saving…' : 'Save session'}
      </button>
    </main>
  )
}
```

- [ ] **Step 2: Replace `src/app/rate/page.tsx`** with the orchestrator that uses RatingForm

```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { loadSession, clearSession } from '@/lib/session-state'
import { createClient } from '@/lib/supabase/client'
import { RatingForm } from '@/components/RatingForm'
import { AccountNudge } from '@/components/AccountNudge'
import type { InProgressSession } from '@/lib/session-state'
import type { DistractionTag } from '@/lib/types'
import type { RatingFormData } from '@/components/RatingForm'

export default function RatePage() {
  const router = useRouter()
  const supabase = createClient()
  const [session, setSession] = useState<InProgressSession | null>(null)
  const [tags, setTags] = useState<DistractionTag[]>([])
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState<number | null>(null)

  useEffect(() => {
    const s = loadSession()
    if (!s) { router.replace('/setup'); return }
    setSession(s)

    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return
      supabase
        .from('distraction_tags')
        .select('*')
        .order('created_at')
        .then(({ data: t }) => setTags(t ?? []))
    })
  }, [])

  const handleAddTag = async (name: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: newTag } = await supabase
      .from('distraction_tags')
      .insert({ user_id: user.id, name })
      .select()
      .single()
    if (newTag) setTags((prev) => [...prev, newTag])
  }

  const handleSave = async (form: RatingFormData) => {
    if (!session) return
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    let goalId = session.goalId
    let categoryId = session.categoryId
    if (!goalId && !categoryId && form.goalText.trim()) {
      const { data: newGoal } = await supabase
        .from('goals')
        .insert({ user_id: user.id, name: form.goalText.trim() })
        .select()
        .single()
      goalId = newGoal?.id ?? null
    }

    const { data: saved, error } = await supabase
      .from('sessions')
      .insert({
        user_id: user.id,
        goal_id: goalId,
        category_id: categoryId,
        session_name: form.sessionName.trim() || null,
        planned_duration_minutes: session.plannedDurationMinutes,
        actual_duration_minutes: session.actualDurationMinutes ?? session.plannedDurationMinutes,
        started_at: session.startedAt,
        ended_at: new Date().toISOString(),
        rating: form.rating,
        notes: form.notes.trim() || null,
        end_reason: session.endReason,
      })
      .select()
      .single()

    if (error || !saved) { setSaving(false); return }

    if (form.selectedTagIds.length > 0) {
      await supabase.from('session_distraction_tags').insert(
        form.selectedTagIds.map((tag_id) => ({ session_id: saved.id, tag_id }))
      )
    }

    if (goalId) {
      await supabase
        .from('goals')
        .update({ last_used_duration_minutes: session.plannedDurationMinutes })
        .eq('id', goalId)
    }

    const { count } = await supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    clearSession()

    const c = count ?? 0
    if (c === 1 || c % 5 === 0) {
      setSavedCount(c)
    } else {
      router.push('/')
    }
  }

  if (!session) return null

  return (
    <>
      <RatingForm
        initialSessionName={session.setupFocusText ?? ''}
        focusText={session.setupFocusText}
        tags={tags}
        onAddTag={handleAddTag}
        onSave={handleSave}
        saving={saving}
        showGoalPrompt={!session.goalId && !session.categoryId}
      />
      {savedCount !== null && (
        <AccountNudge
          sessionCount={savedCount}
          onDismiss={() => router.push('/')}
        />
      )}
    </>
  )
}
```

Note: after save, successful sessions now navigate to `/` instead of `/setup`, so the home screen is the default landing point for returning users.

- [ ] **Step 3: Run existing tests to confirm refactor didn't break anything**

```bash
npm run test:run 2>&1 | tail -4
```

Expected: all 48+ tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/RatingForm.tsx src/app/rate/page.tsx
git commit -m "feat: extract RatingForm component, wire rate/page.tsx to use it"
```

---

### Task 6: Update setup page to handle `?goalId` param

**Files:**
- Modify: `src/app/setup/page.tsx`

When a user clicks "Continue" on a recent goal (home screen), they land on `/setup?goalId=xxx`. The setup page pre-fills the goal name and loads that goal's `last_used_duration_minutes`.

- [ ] **Step 1: Read current `src/app/setup/page.tsx`**

Open `src/app/setup/page.tsx` and verify the current content — it has `useState(DEFAULT_DURATION)` and no URL param handling.

- [ ] **Step 2: Replace `src/app/setup/page.tsx`**

```tsx
'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DurationPicker } from '@/components/DurationPicker'
import { saveSession } from '@/lib/session-state'
import { createClient } from '@/lib/supabase/client'

const DEFAULT_DURATION = 3

function SetupPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const goalId = searchParams.get('goalId')
  const supabase = createClient()

  const [duration, setDuration] = useState(DEFAULT_DURATION)
  const [focusText, setFocusText] = useState('')
  const [resolvedGoalId, setResolvedGoalId] = useState<string | null>(null)

  useEffect(() => {
    if (!goalId) return
    supabase
      .from('goals')
      .select('name, last_used_duration_minutes')
      .eq('id', goalId)
      .single()
      .then(({ data }) => {
        if (!data) return
        setResolvedGoalId(goalId)
        setFocusText(data.name)
        if (data.last_used_duration_minutes) {
          setDuration(data.last_used_duration_minutes)
        }
      })
  }, [goalId])

  const handleStart = () => {
    saveSession({
      plannedDurationMinutes: duration,
      startedAt: new Date().toISOString(),
      setupFocusText: focusText.trim() || null,
      goalId: resolvedGoalId,
      categoryId: null,
      endReason: null,
      actualDurationMinutes: null,
    })
    router.push('/timer')
  }

  return (
    <main className="min-h-screen bg-cream px-6 pt-16 pb-10 max-w-md mx-auto">
      <div className="mb-10">
        <label className="block font-sans text-lg font-medium text-text-primary mb-1">
          What are you focusing on?
        </label>
        <p className="text-sm text-text-muted mb-4">
          Optional — you can skip this and add it after
        </p>
        <input
          type="text"
          value={focusText}
          onChange={(e) => setFocusText(e.target.value)}
          placeholder="e.g. Finish thermodynamics ch. 1"
          className="w-full bg-transparent border-b border-border-warm pb-2 text-text-primary placeholder:text-text-light focus:outline-none focus:border-coral font-sans text-base"
        />
      </div>

      <div className="mb-12">
        <DurationPicker value={duration} onChange={setDuration} />
      </div>

      <button
        onClick={handleStart}
        className="w-full bg-coral text-white font-sans font-medium text-base py-3 rounded-pill"
      >
        Start focus session
      </button>
    </main>
  )
}

export default function SetupPage() {
  return (
    <Suspense>
      <SetupPageInner />
    </Suspense>
  )
}
```

`useSearchParams()` requires a Suspense boundary in Next.js App Router — the `Suspense` wrapper handles that.

- [ ] **Step 3: Verify no type errors**

```bash
npx tsc --noEmit 2>&1 | head -5
```

Expected: no output (clean).

- [ ] **Step 4: Commit**

```bash
git add src/app/setup/page.tsx
git commit -m "feat: setup page handles ?goalId param — pre-fills goal name and last-used duration"
```

---

### Task 7: Home screen

**Files:**
- Modify: `src/app/page.tsx`

The home screen checks whether the authenticated user has any sessions. If none → redirect to `/setup`. If sessions exist → render today's plan (if applicable), recent goals with stats, and "Start something new."

- [ ] **Step 1: Replace `src/app/page.tsx`**

```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatDuration } from '@/lib/format'
import type { Weekday } from '@/lib/types'

interface GoalStat {
  goal_id: string
  name: string
  status: string
  schedule: string[] | null
  created_at: string
  session_count: number
  total_minutes: number
  avg_rating: number | null
  last_session_at: string | null
}

const WEEKDAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export default function HomePage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [goalStats, setGoalStats] = useState<GoalStat[]>([])
  const [todayGoals, setTodayGoals] = useState<GoalStat[]>([])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setLoading(false); return }

      const { count } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', data.user.id)

      if (!count) {
        router.replace('/setup')
        return
      }

      const { data: stats } = await supabase.rpc('get_goal_stats')
      const all = (stats ?? []) as GoalStat[]
      setGoalStats(all)

      const today = WEEKDAYS[new Date().getDay()]
      setTodayGoals(all.filter((g) => g.schedule?.includes(today) ?? false))
      setLoading(false)
    })
  }, [])

  if (loading) return null

  const recentGoals = goalStats.filter((g) => g.last_session_at !== null).slice(0, 3)
  const todayDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  const handleContinue = (goalId: string) => {
    router.push(`/setup?goalId=${goalId}`)
  }

  return (
    <main className="min-h-screen bg-cream px-6 pt-12 pb-10 max-w-md mx-auto">
      {/* Date header */}
      <p className="font-sans text-sm text-text-muted mb-8">{todayDate}</p>

      {/* Today's plan */}
      {todayGoals.length > 0 && (
        <div className="bg-coral-light rounded-xl p-4 mb-8">
          <p className="font-sans text-xs font-medium text-tag-text uppercase tracking-wide mb-3">
            Today's plan
          </p>
          <div className="flex flex-col gap-2">
            {todayGoals.map((g) => (
              <button
                key={g.goal_id}
                onClick={() => handleContinue(g.goal_id)}
                className="text-left font-sans text-sm font-medium text-text-primary"
              >
                {g.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Pick up where you left off */}
      {recentGoals.length > 0 && (
        <div className="mb-8">
          <p className="font-sans text-xs text-text-muted uppercase tracking-wide mb-4">
            Or pick up where you left off
          </p>
          <div className="flex flex-col gap-4">
            {recentGoals.map((g, i) => (
              <div key={g.goal_id} className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-sans text-sm font-medium text-text-primary truncate">
                    {g.name}
                  </p>
                  <p className="font-sans text-xs text-text-muted mt-0.5">
                    {formatDuration(g.total_minutes)} across {g.session_count}{' '}
                    {g.session_count === 1 ? 'session' : 'sessions'}
                  </p>
                </div>
                <button
                  onClick={() => handleContinue(g.goal_id)}
                  className={`shrink-0 px-4 py-2 rounded-pill font-sans text-sm font-medium transition-colors ${
                    i === 0
                      ? 'bg-coral text-white'
                      : 'border-[1.5px] border-coral text-coral'
                  }`}
                >
                  Continue
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Start something new */}
      <button
        onClick={() => router.push('/setup')}
        className="w-full border-[1.5px] border-dashed border-border-warm text-text-muted font-sans text-sm py-3 rounded-pill"
      >
        Start something new
      </button>

      {/* Nav links */}
      <div className="flex gap-6 mt-8 pt-6 border-t border-border-warm">
        <button
          onClick={() => router.push('/goals')}
          className="font-sans text-sm text-text-muted"
        >
          All goals
        </button>
        <button
          onClick={() => router.push('/search')}
          className="font-sans text-sm text-text-muted"
        >
          Search
        </button>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: home screen — today's plan callout, recent goals with stats, start new"
```

---

### Task 8: All goals page

**Files:**
- Create: `src/app/goals/page.tsx`

- [ ] **Step 1: Create `src/app/goals/page.tsx`**

```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatDuration } from '@/lib/format'

interface GoalStat {
  goal_id: string
  name: string
  status: string
  session_count: number
  total_minutes: number
  avg_rating: number | null
  last_session_at: string | null
}

export default function AllGoalsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [goals, setGoals] = useState<GoalStat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.rpc('get_goal_stats').then(({ data }) => {
      setGoals((data ?? []) as GoalStat[])
      setLoading(false)
    })
  }, [])

  if (loading) return null

  return (
    <main className="min-h-screen bg-cream px-6 pt-12 pb-10 max-w-md mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => router.back()}
          className="font-sans text-sm text-text-muted"
        >
          ← Back
        </button>
        <h1 className="font-sans text-xl font-medium text-text-primary">All goals</h1>
      </div>

      {goals.length === 0 ? (
        <p className="font-sans text-sm text-text-muted">No goals yet.</p>
      ) : (
        <div className="flex flex-col">
          {goals.map((g) => (
            <button
              key={g.goal_id}
              onClick={() => router.push(`/goals/${g.goal_id}`)}
              className="flex items-center justify-between py-4 border-b border-border-warm last:border-0 text-left gap-4"
            >
              <div className="min-w-0">
                <p className="font-sans text-sm font-medium text-text-primary truncate">
                  {g.name}
                </p>
                <p className="font-sans text-xs text-text-muted mt-0.5">
                  {formatDuration(g.total_minutes)} · {g.session_count}{' '}
                  {g.session_count === 1 ? 'session' : 'sessions'}
                  {g.avg_rating !== null ? ` · ${g.avg_rating.toFixed(1)}/5` : ''}
                </p>
              </div>
              <span className="text-text-light shrink-0">›</span>
            </button>
          ))}
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/goals/
git commit -m "feat: add all goals overview with stats from get_goal_stats() RPC"
```

---

### Task 9: Goal detail page

**Files:**
- Create: `src/app/goals/[id]/page.tsx`

- [ ] **Step 1: Create `src/app/goals/[id]/page.tsx`**

```tsx
'use client'
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { SessionRow } from '@/components/SessionRow'
import { formatDuration } from '@/lib/format'

interface SessionRow {
  id: string
  session_name: string | null
  started_at: string
  actual_duration_minutes: number
  rating: number | null
}

interface GoalData {
  id: string
  name: string
}

export default function GoalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: goalId } = use(params)
  const router = useRouter()
  const supabase = createClient()

  const [goal, setGoal] = useState<GoalData | null>(null)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('goals').select('id, name').eq('id', goalId).single(),
      supabase
        .from('sessions')
        .select('id, session_name, started_at, actual_duration_minutes, rating')
        .eq('goal_id', goalId)
        .order('started_at', { ascending: false }),
    ]).then(([{ data: g }, { data: s }]) => {
      if (g) setGoal(g)
      setSessions((s ?? []) as SessionRow[])
      setLoading(false)
    })
  }, [goalId])

  if (loading) return null
  if (!goal) return <p className="p-6 font-sans text-text-muted">Goal not found.</p>

  const totalMinutes = sessions.reduce((sum, s) => sum + s.actual_duration_minutes, 0)
  const ratings = sessions.map((s) => s.rating).filter((r): r is number => r !== null)
  const avgRating = ratings.length > 0
    ? ratings.reduce((a, b) => a + b, 0) / ratings.length
    : null

  return (
    <main className="min-h-screen bg-cream px-6 pt-12 pb-10 max-w-md mx-auto">
      <button
        onClick={() => router.back()}
        className="font-sans text-sm text-text-muted mb-6 block"
      >
        ← Back
      </button>

      <h1 className="font-sans text-2xl font-medium text-text-primary mb-6">{goal.name}</h1>

      {/* Three stats */}
      <div className="flex gap-6 mb-10">
        <div>
          <p className="font-numbers text-2xl font-semibold text-text-primary">
            {formatDuration(totalMinutes)}
          </p>
          <p className="font-sans text-xs text-text-muted mt-0.5">total time</p>
        </div>
        <div>
          <p className="font-numbers text-2xl font-semibold text-text-primary">
            {sessions.length}
          </p>
          <p className="font-sans text-xs text-text-muted mt-0.5">sessions</p>
        </div>
        <div>
          <p className="font-numbers text-2xl font-semibold text-text-primary">
            {avgRating !== null ? `${avgRating.toFixed(1)}/5` : '—'}
          </p>
          <p className="font-sans text-xs text-text-muted mt-0.5">avg rating</p>
        </div>
      </div>

      <p className="font-sans text-xs text-text-muted uppercase tracking-wide mb-2">
        Session history
      </p>

      {sessions.length === 0 ? (
        <p className="font-sans text-sm text-text-muted py-4">No sessions yet.</p>
      ) : (
        <div>
          {sessions.map((s) => (
            <SessionRow
              key={s.id}
              id={s.id}
              sessionName={s.session_name}
              startedAt={s.started_at}
              actualDurationMinutes={s.actual_duration_minutes}
              rating={s.rating}
              onClick={() => router.push(`/sessions/${s.id}`)}
            />
          ))}
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/goals/
git commit -m "feat: add goal detail page — stats and session history list"
```

---

### Task 10: Session detail page

**Files:**
- Create: `src/app/sessions/[id]/page.tsx`

- [ ] **Step 1: Create `src/app/sessions/[id]/page.tsx`**

```tsx
'use client'
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getRatingLabel } from '@/lib/timer'
import { formatDuration, formatDateTime } from '@/lib/format'

interface SessionDetail {
  id: string
  session_name: string | null
  started_at: string
  actual_duration_minutes: number
  rating: number | null
  notes: string | null
  goals: { name: string } | null
  categories: { name: string } | null
  session_distraction_tags: { distraction_tags: { id: string; name: string } }[]
}

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = use(params)
  const router = useRouter()
  const supabase = createClient()
  const [session, setSession] = useState<SessionDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('sessions')
      .select(`
        id,
        session_name,
        started_at,
        actual_duration_minutes,
        rating,
        notes,
        goals(name),
        categories(name),
        session_distraction_tags(distraction_tags(id, name))
      `)
      .eq('id', sessionId)
      .single()
      .then(({ data }) => {
        setSession(data as SessionDetail | null)
        setLoading(false)
      })
  }, [sessionId])

  if (loading) return null
  if (!session) return <p className="p-6 font-sans text-text-muted">Session not found.</p>

  const contextName = session.goals?.name ?? session.categories?.name ?? null
  const tags = session.session_distraction_tags.map((t) => t.distraction_tags)

  return (
    <main className="min-h-screen bg-cream px-6 pt-12 pb-10 max-w-md mx-auto">
      {/* Header row */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => router.back()} className="font-sans text-sm text-text-muted">
          ← Back
        </button>
        <button
          onClick={() => router.push(`/sessions/${sessionId}/edit`)}
          className="font-sans text-sm text-coral"
        >
          Edit
        </button>
      </div>

      {contextName && (
        <p className="font-sans text-sm text-text-muted mb-1">{contextName}</p>
      )}
      <h1 className="font-sans text-xl font-medium text-text-primary mb-1">
        {session.session_name ?? 'Session'}
      </h1>
      <p className="font-sans text-xs text-text-muted mb-8">
        {formatDateTime(session.started_at)} · {formatDuration(session.actual_duration_minutes)}
      </p>

      {session.rating !== null && (
        <div className="mb-8">
          <p className="font-numbers text-4xl font-semibold text-text-primary">
            {session.rating.toFixed(1)}/5
          </p>
          <p className="font-sans text-sm text-text-muted mt-1">
            {getRatingLabel(session.rating)}
          </p>
        </div>
      )}

      {tags.length > 0 && (
        <div className="mb-8">
          <p className="font-sans text-xs text-text-muted uppercase tracking-wide mb-3">
            Distractions
          </p>
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <span
                key={t.id}
                className="px-3 py-1.5 rounded-pill text-sm font-sans bg-coral-light border-[1.5px] border-coral text-tag-text"
              >
                {t.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {session.notes && (
        <div className="mb-8">
          <p className="font-sans text-xs text-text-muted uppercase tracking-wide mb-2">Notes</p>
          <p className="font-sans text-sm text-text-primary whitespace-pre-wrap">
            {session.notes}
          </p>
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/sessions/
git commit -m "feat: add session detail page — rating, tags, notes, edit link"
```

---

### Task 11: Edit session page

**Files:**
- Create: `src/app/sessions/[id]/edit/page.tsx`

On save, this page UPDATEs the session row and replaces its distraction tag rows (delete then insert).

- [ ] **Step 1: Create `src/app/sessions/[id]/edit/page.tsx`**

```tsx
'use client'
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { RatingForm } from '@/components/RatingForm'
import type { RatingFormData } from '@/components/RatingForm'
import type { DistractionTag } from '@/lib/types'

interface EditableSession {
  id: string
  session_name: string | null
  rating: number | null
  notes: string | null
  goals: { name: string } | null
  categories: { name: string } | null
  session_distraction_tags: { distraction_tags: { id: string; name: string } }[]
}

export default function EditSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = use(params)
  const router = useRouter()
  const supabase = createClient()

  const [session, setSession] = useState<EditableSession | null>(null)
  const [tags, setTags] = useState<DistractionTag[]>([])
  const [initialTagIds, setInitialTagIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase
        .from('sessions')
        .select(`
          id,
          session_name,
          rating,
          notes,
          goals(name),
          categories(name),
          session_distraction_tags(distraction_tags(id, name))
        `)
        .eq('id', sessionId)
        .single(),
      supabase
        .from('distraction_tags')
        .select('*')
        .order('created_at'),
    ]).then(([{ data: s }, { data: t }]) => {
      if (s) {
        setSession(s as EditableSession)
        setInitialTagIds(
          (s as EditableSession).session_distraction_tags.map(
            (row) => row.distraction_tags.id
          )
        )
      }
      setTags((t ?? []) as DistractionTag[])
      setLoading(false)
    })
  }, [sessionId])

  const handleAddTag = async (name: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: newTag } = await supabase
      .from('distraction_tags')
      .insert({ user_id: user.id, name })
      .select()
      .single()
    if (newTag) setTags((prev) => [...prev, newTag])
  }

  const handleSave = async (form: RatingFormData) => {
    setSaving(true)

    await supabase.from('sessions').update({
      rating: form.rating,
      notes: form.notes.trim() || null,
      session_name: form.sessionName.trim() || null,
    }).eq('id', sessionId)

    // Replace distraction tags: delete old, insert new
    await supabase
      .from('session_distraction_tags')
      .delete()
      .eq('session_id', sessionId)

    if (form.selectedTagIds.length > 0) {
      await supabase.from('session_distraction_tags').insert(
        form.selectedTagIds.map((tag_id) => ({ session_id: sessionId, tag_id }))
      )
    }

    setSaving(false)
    router.push(`/sessions/${sessionId}`)
  }

  if (loading) return null
  if (!session) return <p className="p-6 font-sans text-text-muted">Session not found.</p>

  const contextName = session.goals?.name ?? session.categories?.name ?? null

  return (
    <RatingForm
      initialRating={session.rating ?? 3.0}
      initialNotes={session.notes ?? ''}
      initialSessionName={session.session_name ?? ''}
      initialSelectedTagIds={initialTagIds}
      focusText={contextName}
      tags={tags}
      onAddTag={handleAddTag}
      onSave={handleSave}
      saving={saving}
      showGoalPrompt={false}
    />
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/sessions/
git commit -m "feat: add edit session page — pre-filled RatingForm, updates session and tags"
```

---

### Task 12: Search page

**Files:**
- Create: `src/app/search/page.tsx`

- [ ] **Step 1: Create `src/app/search/page.tsx`**

```tsx
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

      setResults((data ?? []) as SearchResult[])
      setSearched(true)
    }, 300) // debounce

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

      {/* Results */}
      {searched && results.length === 0 && (
        <p className="font-sans text-sm text-text-muted">No results for "{query}".</p>
      )}

      <div className="flex flex-col">
        {results.map((r) => {
          const contextName = r.goals?.name ?? r.categories?.name ?? null
          const matchField = (() => {
            const q = query.trim().toLowerCase()
            if (r.notes?.toLowerCase().includes(q)) return r.notes
            if (r.session_name?.toLowerCase().includes(q)) return r.session_name
            return r.notes ?? r.session_name ?? ''
          })()
          const snippet = getSnippet(matchField, query.trim())

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
                <HighlightedText text={snippet} query={query.trim()} />
              </p>
            </button>
          )
        })}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/search/
git commit -m "feat: add search page — debounced ilike query, highlighted snippets"
```

---

### Task 13: Full test suite verification

**Files:** none new

- [ ] **Step 1: Run full test suite**

```bash
npm run test:run 2>&1 | tail -6
```

Expected: all tests PASS. Count should be ≥ 58 (48 from Plan 1 + 10 new: format × 9 + HighlightedText × 5 - minor overlap).

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -5
```

Expected: no output.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete Plan 2 — home screen, goal/session detail, search, all goals"
```

---

## Self-Review

**Spec coverage:**
- Screen 2 (Home): date header ✓, today's plan callout ✓, recent goals with stats + Continue ✓, Start something new ✓
- Screen 6 (Goal detail): back nav ✓, goal name ✓, three stats ✓, session list with tap-to-detail ✓
- Screen 7 (Session detail): back nav ✓, Edit link ✓, context name + date + duration ✓, rating + word ✓, tags read-only ✓, notes ✓, Edit → pre-filled RatingForm ✓
- Screen 8 (Search): search bar with icon ✓, searches name + notes ✓, results show goal name + rating + date + highlighted snippet ✓, tap → session detail ✓
- Screen 9 (All goals): full list ✓, name + total time + count + avg rating ✓, chevron → goal detail ✓

**Spec note not in any task:** "Clicking 'Edit' drops into the same Rating-screen UI, pre-filled with existing values, editable and re-saveable at any time (no restriction on editing old sessions)" — covered by Task 11 (no date restriction enforced, always editable ✓).

**No placeholders found** — all code blocks contain complete implementations.

**Type consistency check:**
- `GoalStat.goal_id` (not `id`) used consistently across home screen and all goals page ✓
- `RatingFormData` defined once in `RatingForm.tsx`, imported in both `rate/page.tsx` and `sessions/[id]/edit/page.tsx` ✓
- `SessionRow` props: `id`, `sessionName`, `startedAt`, `actualDurationMinutes`, `rating`, `onClick` — used consistently ✓
- `formatDuration`, `formatDate`, `formatDateTime`, `getSnippet` — names used in all referencing files match `format.ts` exports ✓
