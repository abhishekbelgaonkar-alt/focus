# Focus Tracker — Profile + Analytics (Plan 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Profile page (spec screen 11): lifetime stats, rating-over-time line chart with Day/Week/Month toggle, GitHub-style consistency heatmap with period notes, and CSV export.

**Architecture:** All session data is fetched once on mount and aggregated client-side — no additional SQL functions needed. The line chart uses Recharts (`LineChart`, `Line`, `XAxis`, `YAxis`, `ResponsiveContainer`) for clean rendering. The heatmap is a custom CSS Grid component: the Day view uses `grid-auto-flow: column` inside 7 rows to produce the GitHub contribution-graph layout; Week and Month views use simpler block grids. Period notes read/write to the existing `period_notes` Supabase table.

**Tech Stack:** Recharts, custom CSS Grid, Next.js 16, Supabase JS v2, Vitest (existing)

> **Prerequisites:** Plans 1 and 2 complete. Supabase anonymous auth and migration still need to be applied before manual testing — see saved reminder.

---

## File Structure

```
src/
├── app/
│   └── profile/
│       └── page.tsx              CREATE — full profile page
├── components/
│   ├── RatingLineChart.tsx        CREATE — Recharts wrapper with Day/Week/Month toggle + click card
│   ├── ConsistencyHeatmap.tsx     CREATE — Day/Week/Month heatmap with period-note tap
│   └── PeriodNoteBox.tsx         CREATE — inline note editor (saves to period_notes table)
└── lib/
    └── stats.ts                  CREATE — streak, chart aggregation, heatmap map, CSV generator
src/app/page.tsx                  MODIFY — add "Profile" link to bottom nav
src/__tests__/
    └── stats.test.ts             CREATE — tests for all pure functions in stats.ts
```

---

### Task 1: Install Recharts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install**

```bash
npm install recharts
```

- [ ] **Step 2: Verify it resolves**

```bash
node -e "require('recharts')" && echo "OK"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add recharts dependency for rating line chart"
```

---

### Task 2: Stats utilities + tests

**Files:**
- Create: `src/lib/stats.ts`
- Create: `src/__tests__/stats.test.ts`

Pure functions only — no Supabase calls, no React.

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/stats.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  calcDayStreak,
  getDayViewPoints,
  getWeekViewPoints,
  getMonthViewPoints,
  getRatingTierColor,
  buildHeatmapDays,
  getMonthGridDays,
  generateCSV,
} from '@/lib/stats'

const today = new Date().toISOString().slice(0, 10)
const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10)

describe('calcDayStreak', () => {
  it('returns 0 when no sessions', () => {
    expect(calcDayStreak([])).toBe(0)
  })

  it('returns 1 when only today has a session', () => {
    expect(calcDayStreak([today])).toBe(1)
  })

  it('counts consecutive days ending today', () => {
    expect(calcDayStreak([twoDaysAgo, yesterday, today])).toBe(3)
  })

  it('breaks at a gap', () => {
    expect(calcDayStreak([twoDaysAgo, today])).toBe(1)
  })

  it('deduplicates dates (multiple sessions same day)', () => {
    expect(calcDayStreak([today, today, yesterday])).toBe(2)
  })
})

describe('getRatingTierColor', () => {
  it('returns the pale color for null (no session)', () => {
    expect(getRatingTierColor(null)).toBe('#f0ece2')
  })

  it.each([
    [1.0, '#f3d9bd'],
    [1.5, '#f3d9bd'],
    [2.0, '#f3d9bd'],
    [2.1, '#f0b587'],
    [3.0, '#f0b587'],
    [3.1, '#e8905a'],
    [4.0, '#e8905a'],
    [4.1, '#d9642e'],
    [5.0, '#d9642e'],
  ])('rating %f → %s', (rating, expected) => {
    expect(getRatingTierColor(rating)).toBe(expected)
  })
})

const SESSIONS = [
  { id: 'a', started_at: '2026-09-01T10:00:00Z', rating: 4.0, goals: { name: 'Study' }, session_name: 'Ch. 1' },
  { id: 'b', started_at: '2026-09-01T14:00:00Z', rating: 3.0, goals: { name: 'Study' }, session_name: null },
  { id: 'c', started_at: '2026-09-08T09:00:00Z', rating: 5.0, goals: null, session_name: 'Deep work' },
]

describe('getDayViewPoints', () => {
  it('returns one point per rated session, sorted by date', () => {
    const pts = getDayViewPoints(SESSIONS)
    expect(pts).toHaveLength(3)
    expect(pts[0].sessionId).toBe('a')
    expect(pts[0].rating).toBe(4.0)
  })

  it('skips sessions with null rating', () => {
    const pts = getDayViewPoints([...SESSIONS, { id: 'd', started_at: '2026-09-09T10:00:00Z', rating: null, goals: null, session_name: null }])
    expect(pts).toHaveLength(3)
  })
})

describe('getWeekViewPoints', () => {
  it('averages multiple sessions on the same day into one point', () => {
    const pts = getWeekViewPoints(SESSIONS)
    const sep1 = pts.find(p => p.date === '2026-09-01')
    expect(sep1).toBeDefined()
    expect(sep1!.rating).toBe(3.5) // (4.0 + 3.0) / 2
  })

  it('produces one point per unique day', () => {
    const pts = getWeekViewPoints(SESSIONS)
    expect(pts).toHaveLength(2) // Sep 1 and Sep 8
  })
})

describe('getMonthViewPoints', () => {
  it('groups sessions by ISO week (Monday start) and averages', () => {
    const pts = getMonthViewPoints(SESSIONS)
    // Sep 1 and Sep 8 are in different weeks
    expect(pts).toHaveLength(2)
  })
})

describe('buildHeatmapDays', () => {
  it('maps each date to its average rating and count', () => {
    const map = buildHeatmapDays(SESSIONS)
    const sep1 = map.get('2026-09-01')
    expect(sep1).toBeDefined()
    expect(sep1!.count).toBe(2)
    expect(sep1!.avgRating).toBeCloseTo(3.5)
  })
})

describe('getMonthGridDays', () => {
  it('returns 7 × n array for a full month grid', () => {
    const days = getMonthGridDays(2026, 8) // September 2026 (month is 0-indexed)
    // Sep 1 2026 is a Tuesday, so Mon before it is null
    expect(days[0]).toBeNull()   // Monday before Sep 1
    expect(days[1]).toBe('2026-09-01') // Tuesday Sep 1
    expect(days).toContain('2026-09-30')
  })

  it('total cells is divisible by 7', () => {
    const days = getMonthGridDays(2026, 8)
    expect(days.length % 7).toBe(0)
  })
})

describe('generateCSV', () => {
  const SESSION = {
    id: 'abc',
    session_name: 'Fix bug',
    planned_duration_minutes: 25,
    actual_duration_minutes: 25,
    started_at: '2026-09-01T10:00:00Z',
    ended_at: '2026-09-01T10:25:00Z',
    rating: 4.0,
    notes: 'It went well',
    end_reason: 'on_time' as const,
    goals: { name: 'Work' },
    categories: null,
    session_distraction_tags: [{ distraction_tags: { name: 'Phone' } }],
  }

  it('produces a CSV string with a header row', () => {
    const csv = generateCSV([SESSION])
    const lines = csv.split('\n')
    expect(lines[0]).toContain('id')
    expect(lines[0]).toContain('goal')
    expect(lines[0]).toContain('rating')
    expect(lines).toHaveLength(2)
  })

  it('includes tag names in the tags column', () => {
    const csv = generateCSV([SESSION])
    expect(csv).toContain('Phone')
  })

  it('escapes double-quotes inside cell values', () => {
    const csv = generateCSV([{ ...SESSION, notes: 'She said "hello"' }])
    expect(csv).toContain('She said ""hello""')
  })
})
```

- [ ] **Step 2: Run — verify they fail**

```bash
npm run test:run -- src/__tests__/stats.test.ts 2>&1 | tail -4
```

Expected: FAIL with "Cannot find module '@/lib/stats'"

- [ ] **Step 3: Create `src/lib/stats.ts`**

```typescript
export interface ChartPoint {
  date: string
  rating: number
  sessionId?: string
  label?: string
}

export interface HeatmapEntry {
  date: string
  avgRating: number
  count: number
}

// ── Color scale ────────────────────────────────────────────────────────────────

export function getRatingTierColor(avgRating: number | null): string {
  if (avgRating === null) return '#f0ece2'
  if (avgRating <= 2.0) return '#f3d9bd'
  if (avgRating <= 3.0) return '#f0b587'
  if (avgRating <= 4.0) return '#e8905a'
  return '#d9642e'
}

// ── Streak ─────────────────────────────────────────────────────────────────────

export function calcDayStreak(sessionDates: string[]): number {
  if (sessionDates.length === 0) return 0
  const days = new Set(sessionDates.map((d) => d.slice(0, 10)))
  let streak = 0
  const today = new Date()
  for (let i = 0; i < 365; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    if (days.has(key)) streak++
    else break
  }
  return streak
}

// ── Chart aggregation ──────────────────────────────────────────────────────────

type RawSession = {
  id: string
  started_at: string
  rating: number | null
  goals: { name: string } | null
  session_name: string | null
}

export function getDayViewPoints(sessions: RawSession[]): ChartPoint[] {
  return sessions
    .filter((s) => s.rating !== null)
    .map((s) => ({
      date: s.started_at,
      rating: s.rating!,
      sessionId: s.id,
      label:
        [s.goals?.name, s.session_name].filter(Boolean).join(' — ') || 'Session',
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function getWeekViewPoints(
  sessions: Pick<RawSession, 'started_at' | 'rating'>[]
): ChartPoint[] {
  const byDay = new Map<string, number[]>()
  sessions.filter((s) => s.rating !== null).forEach((s) => {
    const day = s.started_at.slice(0, 10)
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day)!.push(s.rating!)
  })
  return Array.from(byDay.entries())
    .map(([date, ratings]) => ({
      date,
      rating:
        Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) /
        10,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function getMonthViewPoints(
  sessions: Pick<RawSession, 'started_at' | 'rating'>[]
): ChartPoint[] {
  const byWeek = new Map<string, number[]>()
  sessions.filter((s) => s.rating !== null).forEach((s) => {
    const d = new Date(s.started_at)
    const dow = d.getDay()
    // Roll back to Monday (ISO week start)
    const diff = d.getDate() - dow + (dow === 0 ? -6 : 1)
    const mon = new Date(d)
    mon.setDate(diff)
    const weekKey = mon.toISOString().slice(0, 10)
    if (!byWeek.has(weekKey)) byWeek.set(weekKey, [])
    byWeek.get(weekKey)!.push(s.rating!)
  })
  return Array.from(byWeek.entries())
    .map(([date, ratings]) => ({
      date,
      rating:
        Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) /
        10,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ── Heatmap ────────────────────────────────────────────────────────────────────

export function buildHeatmapDays(
  sessions: Pick<RawSession, 'started_at' | 'rating'>[]
): Map<string, HeatmapEntry> {
  const map = new Map<string, HeatmapEntry>()
  sessions.filter((s) => s.rating !== null).forEach((s) => {
    const date = s.started_at.slice(0, 10)
    if (!map.has(date)) map.set(date, { date, avgRating: 0, count: 0 })
    const entry = map.get(date)!
    const prevSum = entry.avgRating * entry.count
    entry.count++
    entry.avgRating = (prevSum + s.rating!) / entry.count
  })
  return map
}

// Returns a flat array of YYYY-MM-DD strings (or null for padding) filling
// complete Mon–Sun weeks for the given month. Length is always a multiple of 7.
// month is 0-indexed (0 = January).
export function getMonthGridDays(year: number, month: number): (string | null)[] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  // (getDay()+6)%7 maps Sun=0→6, Mon=1→0, …, Sat=6→5  (Mon-first)
  const leadPad = (firstDay.getDay() + 6) % 7
  const trailPad = 6 - ((lastDay.getDay() + 6) % 7)

  const days: (string | null)[] = Array(leadPad).fill(null)
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(
      `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    )
  }
  days.push(...Array(trailPad).fill(null))
  return days
}

// ── CSV export ─────────────────────────────────────────────────────────────────

type FullSession = {
  id: string
  session_name: string | null
  planned_duration_minutes: number
  actual_duration_minutes: number
  started_at: string
  ended_at: string
  rating: number | null
  notes: string | null
  end_reason: string | null
  goals: { name: string } | null
  categories: { name: string } | null
  session_distraction_tags: { distraction_tags: { name: string } }[]
}

export function generateCSV(sessions: FullSession[]): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const headers = [
    'id', 'goal', 'category', 'session_name', 'planned_minutes',
    'actual_minutes', 'started_at', 'ended_at', 'rating', 'notes',
    'end_reason', 'tags',
  ]
  const rows = sessions.map((s) => [
    s.id,
    s.goals?.name ?? '',
    s.categories?.name ?? '',
    s.session_name ?? '',
    s.planned_duration_minutes,
    s.actual_duration_minutes,
    s.started_at,
    s.ended_at,
    s.rating ?? '',
    s.notes ?? '',
    s.end_reason ?? '',
    s.session_distraction_tags.map((t) => t.distraction_tags.name).join(';'),
  ])
  return [headers.map(esc), ...rows.map((r) => r.map(esc))]
    .map((r) => r.join(','))
    .join('\n')
}
```

- [ ] **Step 4: Run — verify all pass**

```bash
npm run test:run -- src/__tests__/stats.test.ts 2>&1 | tail -4
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats.ts src/__tests__/stats.test.ts
git commit -m "feat: stats utilities — streak, chart aggregation, heatmap grid, CSV"
```

---

### Task 3: RatingLineChart component

**Files:**
- Create: `src/components/RatingLineChart.tsx`

- [ ] **Step 1: Create `src/components/RatingLineChart.tsx`**

```tsx
'use client'
import { useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'
import { getDayViewPoints, getWeekViewPoints, getMonthViewPoints } from '@/lib/stats'
import { formatDate, formatDateTime } from '@/lib/format'
import type { ChartPoint } from '@/lib/stats'

type Mode = 'day' | 'week' | 'month'

interface RatingLineChartProps {
  sessions: Array<{
    id: string
    started_at: string
    rating: number | null
    goals: { name: string } | null
    session_name: string | null
  }>
  onNavigateToSession?: (sessionId: string) => void
}

export function RatingLineChart({ sessions, onNavigateToSession }: RatingLineChartProps) {
  const [mode, setMode] = useState<Mode>('day')
  const [selected, setSelected] = useState<ChartPoint | null>(null)

  const data = mode === 'day'
    ? getDayViewPoints(sessions)
    : mode === 'week'
    ? getWeekViewPoints(sessions)
    : getMonthViewPoints(sessions)

  const formatXTick = (v: string) => {
    const d = new Date(v)
    if (mode === 'month') return d.toLocaleString('en-US', { month: 'short' })
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  const handleClick = (payload: unknown) => {
    if (mode !== 'day') return
    const pt = (payload as { activePayload?: { payload: ChartPoint }[] })?.activePayload?.[0]?.payload
    if (pt) setSelected(pt)
  }

  return (
    <div>
      {/* Mode toggle */}
      <div className="flex gap-2 mb-4">
        {(['day', 'week', 'month'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setSelected(null) }}
            className={`font-sans text-xs px-3 py-1 rounded-pill capitalize ${
              mode === m
                ? 'bg-coral text-white'
                : 'border-[1.5px] border-border-warm text-text-muted'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {data.length === 0 ? (
        <p className="font-sans text-sm text-text-muted py-8 text-center">
          No rated sessions yet.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart
            data={data}
            margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
            onClick={handleClick}
            style={{ cursor: mode === 'day' ? 'pointer' : 'default' }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#ecdcc9" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatXTick}
              tick={{ fontFamily: 'var(--font-outfit)', fontSize: 10, fill: '#b08c6a' }}
              tickLine={false}
              axisLine={{ stroke: '#ecdcc9' }}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[1, 5]}
              ticks={[1, 2, 3, 4, 5]}
              tick={{ fontFamily: 'var(--font-quicksand)', fontSize: 10, fill: '#b08c6a' }}
              tickLine={false}
              axisLine={false}
            />
            <Line
              type="monotone"
              dataKey="rating"
              stroke="#d9642e"
              strokeWidth={1.5}
              dot={{ r: 3, fill: '#fbe6d4', stroke: '#d9642e', strokeWidth: 1.5 }}
              activeDot={{ r: 5, fill: '#d9642e', stroke: '#d9642e' }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}

      {/* Click card — Day view only */}
      {selected && mode === 'day' && (
        <div className="mt-3 p-3 border border-border-warm rounded-xl">
          <p className="font-sans text-xs text-text-muted">{formatDateTime(selected.date)}</p>
          <p className="font-sans text-sm font-medium text-text-primary mt-0.5">
            {selected.label}
          </p>
          <div className="flex items-center gap-3 mt-1">
            <span className="font-numbers text-xl font-semibold text-coral">
              {selected.rating.toFixed(1)}/5
            </span>
            {selected.sessionId && onNavigateToSession && (
              <button
                onClick={() => onNavigateToSession(selected.sessionId!)}
                className="font-sans text-xs text-coral underline"
              >
                View session →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/RatingLineChart.tsx
git commit -m "feat: add RatingLineChart — Recharts line chart with Day/Week/Month toggle"
```

---

### Task 4: PeriodNoteBox component

**Files:**
- Create: `src/components/PeriodNoteBox.tsx`

Appears below the heatmap when a cell is tapped. Loads existing note from Supabase on mount, saves on blur or Enter (Ctrl+Enter for textarea).

- [ ] **Step 1: Create `src/components/PeriodNoteBox.tsx`**

```tsx
'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PeriodType } from '@/lib/types'

interface PeriodNoteBoxProps {
  periodType: PeriodType
  periodDate: string   // YYYY-MM-DD
  title: string        // human-readable label shown above textarea
  onClose: () => void
}

export function PeriodNoteBox({ periodType, periodDate, title, onClose }: PeriodNoteBoxProps) {
  const supabase = createClient()
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    supabase
      .from('period_notes')
      .select('note')
      .eq('period_type', periodType)
      .eq('period_date', periodDate)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.note) setNote(data.note)
        textareaRef.current?.focus()
      })
  }, [periodDate, periodType])

  const handleSave = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    if (note.trim()) {
      await supabase
        .from('period_notes')
        .upsert(
          { user_id: user.id, period_type: periodType, period_date: periodDate, note: note.trim() },
          { onConflict: 'user_id,period_type,period_date' }
        )
    } else {
      // Empty note = delete
      await supabase
        .from('period_notes')
        .delete()
        .eq('user_id', user.id)
        .eq('period_type', periodType)
        .eq('period_date', periodDate)
    }
    setSaving(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSave()
  }

  return (
    <div className="mt-4 p-4 border border-border-warm rounded-xl">
      <div className="flex items-center justify-between mb-2">
        <p className="font-sans text-xs font-medium text-text-muted">{title}</p>
        <button onClick={onClose} className="text-text-light text-lg leading-none">×</button>
      </div>
      <textarea
        ref={textareaRef}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleSave}
        placeholder="Write anything — mood, context, distractions…"
        rows={3}
        className="w-full bg-transparent font-sans text-sm text-text-primary placeholder:text-text-light focus:outline-none resize-none"
      />
      {saving && <p className="font-sans text-xs text-text-muted mt-1">Saving…</p>}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/PeriodNoteBox.tsx
git commit -m "feat: add PeriodNoteBox — inline note editor for heatmap cells"
```

---

### Task 5: ConsistencyHeatmap component

**Files:**
- Create: `src/components/ConsistencyHeatmap.tsx`

Three views via a toggle. Day view = GitHub contribution grid. Week/Month views = simpler block grids. Tapping any cell opens PeriodNoteBox below the grid.

- [ ] **Step 1: Create `src/components/ConsistencyHeatmap.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { getRatingTierColor, getMonthGridDays } from '@/lib/stats'
import { PeriodNoteBox } from '@/components/PeriodNoteBox'
import type { HeatmapEntry } from '@/lib/stats'
import type { PeriodType } from '@/lib/types'

type HeatmapMode = 'day' | 'week' | 'month'

interface ConsistencyHeatmapProps {
  dayMap: Map<string, HeatmapEntry>   // keyed by YYYY-MM-DD
  sessions: Array<{ started_at: string; rating: number | null }>
}

const CELL = 18  // px — wide enough to display a 2-digit number
const GAP = 3    // px

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function isoWeekMonday(date: Date): string {
  const d = new Date(date)
  const dow = d.getDay()
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
  return d.toISOString().slice(0, 10)
}

export function ConsistencyHeatmap({ dayMap, sessions }: ConsistencyHeatmapProps) {
  const now = new Date()
  const [mode, setMode] = useState<HeatmapMode>('day')
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [selectedPeriod, setSelectedPeriod] = useState<{
    type: PeriodType; date: string; title: string
  } | null>(null)

  // ── Day view ─────────────────────────────────────────────────────────────────

  function renderDayView() {
    const days = getMonthGridDays(viewYear, viewMonth)
    const monthLabel = `${MONTH_NAMES[viewMonth]} ${viewYear}`

    return (
      <div className="flex flex-col items-center">
        {/* Month nav */}
        <div className="flex items-center gap-4 mb-3">
          <button
            onClick={() => {
              if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
              else setViewMonth(m => m - 1)
            }}
            className="font-sans text-sm text-text-muted"
          >
            ‹
          </button>
          <span className="font-sans text-sm font-medium text-text-primary w-32 text-center">
            {monthLabel}
          </span>
          <button
            onClick={() => {
              if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
              else setViewMonth(m => m + 1)
            }}
            className="font-sans text-sm text-text-muted"
          >
            ›
          </button>
        </div>

        {/* Grid + weekday labels */}
        <div className="flex gap-1.5">
          {/* Weekday label column */}
          <div className="flex flex-col gap-0.5" style={{ gap: GAP }}>
            {WEEKDAY_LABELS.map((d) => (
              <div
                key={d}
                style={{ height: CELL, lineHeight: `${CELL}px`, width: 22 }}
                className="font-sans text-right"
                style={{ fontSize: 9, color: '#c9b79c', height: CELL, lineHeight: `${CELL}px`, width: 22 }}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Day grid — grid-auto-flow: column fills weeks left-to-right */}
          <div
            style={{
              display: 'grid',
              gridTemplateRows: `repeat(7, ${CELL}px)`,
              gridAutoFlow: 'column',
              gridAutoColumns: CELL,
              gap: GAP,
            }}
          >
            {days.map((date, i) => {
              if (!date) {
                return <div key={i} style={{ width: CELL, height: CELL }} />
              }
              const entry = dayMap.get(date)
              const dayNum = parseInt(date.split('-')[2])
              const isSelected = selectedPeriod?.date === date
              return (
                <div
                  key={date}
                  onClick={() =>
                    setSelectedPeriod(
                      isSelected
                        ? null
                        : {
                            type: 'day',
                            date,
                            title: new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
                              weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
                            }),
                          }
                    )
                  }
                  style={{
                    width: CELL,
                    height: CELL,
                    backgroundColor: getRatingTierColor(entry?.avgRating ?? null),
                    borderRadius: 3,
                    cursor: 'pointer',
                    outline: isSelected ? '2px solid #d9642e' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span style={{ fontSize: 7, color: 'rgba(61,49,38,0.55)', lineHeight: 1 }}>
                    {dayNum}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Color legend */}
        <div className="flex items-center gap-1.5 mt-3">
          <span style={{ fontSize: 9 }} className="text-text-light font-sans">Rough</span>
          {['#f3d9bd','#f0b587','#e8905a','#d9642e'].map((c) => (
            <div key={c} style={{ width: CELL, height: CELL, backgroundColor: c, borderRadius: 3 }} />
          ))}
          <span style={{ fontSize: 9 }} className="text-text-light font-sans">Locked in</span>
        </div>
      </div>
    )
  }

  // ── Week view ────────────────────────────────────────────────────────────────

  function renderWeekView() {
    // Build week buckets for the last 52 weeks
    const weekMap = new Map<string, number[]>()
    sessions.filter(s => s.rating !== null).forEach(s => {
      const weekKey = isoWeekMonday(new Date(s.started_at))
      if (!weekMap.has(weekKey)) weekMap.set(weekKey, [])
      weekMap.get(weekKey)!.push(s.rating!)
    })

    // Last 52 weeks in order
    const weeks: string[] = []
    for (let i = 51; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i * 7)
      weeks.unshift(isoWeekMonday(d))
    }
    const uniqueWeeks = [...new Set(weeks)].sort()

    return (
      <div className="flex flex-col items-center">
        <div className="flex flex-wrap gap-1.5 justify-center max-w-sm">
          {uniqueWeeks.map((week) => {
            const ratings = weekMap.get(week) ?? []
            const avg = ratings.length > 0
              ? ratings.reduce((a, b) => a + b, 0) / ratings.length
              : null
            const isSelected = selectedPeriod?.date === week
            const label = new Date(week + 'T12:00:00').toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric'
            })
            return (
              <div
                key={week}
                onClick={() =>
                  setSelectedPeriod(
                    isSelected ? null : { type: 'week', date: week, title: `Week of ${label}` }
                  )
                }
                style={{
                  width: CELL * 1.5,
                  height: CELL * 1.5,
                  backgroundColor: getRatingTierColor(avg),
                  borderRadius: 3,
                  cursor: 'pointer',
                  outline: isSelected ? '2px solid #d9642e' : 'none',
                }}
              />
            )
          })}
        </div>
      </div>
    )
  }

  // ── Month view ────────────────────────────────────────────────────────────────

  function renderMonthView() {
    const monthMap = new Map<string, number[]>()
    sessions.filter(s => s.rating !== null).forEach(s => {
      const monthKey = s.started_at.slice(0, 7) // YYYY-MM
      if (!monthMap.has(monthKey)) monthMap.set(monthKey, [])
      monthMap.get(monthKey)!.push(s.rating!)
    })

    // Last 12 months
    const months: string[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      months.push(d.toISOString().slice(0, 7))
    }

    return (
      <div className="flex flex-col items-center">
        <div className="flex flex-wrap gap-1.5 justify-center">
          {months.map((monthKey) => {
            const ratings = monthMap.get(monthKey) ?? []
            const avg = ratings.length > 0
              ? ratings.reduce((a, b) => a + b, 0) / ratings.length
              : null
            const [y, m] = monthKey.split('-').map(Number)
            // period_date = first day of month
            const periodDate = `${monthKey}-01`
            const isSelected = selectedPeriod?.date === periodDate
            const label = new Date(y, m - 1, 1).toLocaleDateString('en-US', {
              month: 'long', year: 'numeric'
            })
            return (
              <div key={monthKey} className="flex flex-col items-center gap-1">
                <div
                  onClick={() =>
                    setSelectedPeriod(
                      isSelected ? null : { type: 'month', date: periodDate, title: label }
                    )
                  }
                  style={{
                    width: CELL * 2,
                    height: CELL * 2,
                    backgroundColor: getRatingTierColor(avg),
                    borderRadius: 4,
                    cursor: 'pointer',
                    outline: isSelected ? '2px solid #d9642e' : 'none',
                  }}
                />
                <span style={{ fontSize: 9 }} className="text-text-light font-sans">
                  {MONTH_NAMES[m - 1]}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Heatmap toggle — independent from line chart toggle */}
      <div className="flex gap-2 mb-4">
        {(['day', 'week', 'month'] as HeatmapMode[]).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setSelectedPeriod(null) }}
            className={`font-sans text-xs px-3 py-1 rounded-pill capitalize ${
              mode === m
                ? 'bg-coral text-white'
                : 'border-[1.5px] border-border-warm text-text-muted'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {mode === 'day' && renderDayView()}
      {mode === 'week' && renderWeekView()}
      {mode === 'month' && renderMonthView()}

      {/* Period note box */}
      {selectedPeriod && (
        <PeriodNoteBox
          periodType={selectedPeriod.type}
          periodDate={selectedPeriod.date}
          title={selectedPeriod.title}
          onClose={() => setSelectedPeriod(null)}
        />
      )}
    </div>
  )
}
```

There is a JSX issue in the weekday label div (two `style` props). Fix it:

The weekday label `<div>` block in `renderDayView` has two `style` props (one from Tailwind className and one inline). Remove the className ones and keep only the inline style:

```tsx
              <div
                key={d}
                style={{ fontSize: 9, color: '#c9b79c', height: CELL, lineHeight: `${CELL}px`, width: 22, textAlign: 'right' }}
              >
                {d}
              </div>
```

- [ ] **Step 2: Fix the duplicate style prop in the weekday label**

Open `src/components/ConsistencyHeatmap.tsx`. Find the weekday label block that looks like:

```tsx
          <div
            key={d}
            style={{ height: CELL, lineHeight: `${CELL}px`, width: 22 }}
            className="font-sans text-right"
            style={{ fontSize: 9, color: '#c9b79c', height: CELL, lineHeight: `${CELL}px`, width: 22 }}
          >
```

Replace the entire weekday label `<div>` (inside the `WEEKDAY_LABELS.map`) with:

```tsx
              <div
                key={d}
                style={{ fontSize: 9, color: '#c9b79c', height: CELL, lineHeight: `${CELL}px`, width: 22, textAlign: 'right' }}
              >
                {d}
              </div>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -5
```

Expected: no output (clean).

- [ ] **Step 4: Commit**

```bash
git add src/components/ConsistencyHeatmap.tsx
git commit -m "feat: add ConsistencyHeatmap — Day/Week/Month views with period note tap"
```

---

### Task 6: Profile page

**Files:**
- Create: `src/app/profile/page.tsx`

Fetches all sessions on mount (with tags for CSV), computes lifetime stats, and composes all components.

- [ ] **Step 1: Create directory**

```bash
mkdir -p src/app/profile
```

- [ ] **Step 2: Create `src/app/profile/page.tsx`**

```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { RatingLineChart } from '@/components/RatingLineChart'
import { ConsistencyHeatmap } from '@/components/ConsistencyHeatmap'
import { calcDayStreak, buildHeatmapDays, generateCSV } from '@/lib/stats'
import { formatDuration } from '@/lib/format'

interface FullSession {
  id: string
  session_name: string | null
  planned_duration_minutes: number
  actual_duration_minutes: number
  started_at: string
  ended_at: string
  rating: number | null
  notes: string | null
  end_reason: string | null
  goals: { name: string } | null
  categories: { name: string } | null
  session_distraction_tags: { distraction_tags: { name: string } }[]
}

export default function ProfilePage() {
  const router = useRouter()
  const supabase = createClient()

  const [sessions, setSessions] = useState<FullSession[]>([])
  const [email, setEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setLoading(false); return }
      setEmail(data.user.email ?? null)

      const { data: s } = await supabase
        .from('sessions')
        .select(`
          id, session_name, planned_duration_minutes, actual_duration_minutes,
          started_at, ended_at, rating, notes, end_reason,
          goals(name), categories(name),
          session_distraction_tags(distraction_tags(name))
        `)
        .eq('user_id', data.user.id)
        .order('started_at', { ascending: true })

      setSessions((s ?? []) as unknown as FullSession[])
      setLoading(false)
    })
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/setup')
  }

  const handleExport = () => {
    const csv = generateCSV(sessions)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `focus-sessions-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return null

  const totalMinutes = sessions.reduce((sum, s) => sum + s.actual_duration_minutes, 0)
  const streak = calcDayStreak(sessions.map((s) => s.started_at))
  const dayMap = buildHeatmapDays(sessions)

  return (
    <main className="min-h-screen bg-cream px-6 pt-12 pb-10 max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="font-sans text-sm text-text-muted">
            ← Back
          </button>
          <h1 className="font-sans text-xl font-medium text-text-primary">Profile</h1>
        </div>
        <button
          onClick={() => router.push('/settings')}
          aria-label="Settings"
          className="text-text-muted"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </div>

      {/* Account row */}
      {email && (
        <div className="flex items-center justify-between mb-8 pb-6 border-b border-border-warm">
          <p className="font-sans text-sm text-text-primary">{email}</p>
          <button onClick={handleSignOut} className="font-sans text-sm text-coral">
            Sign out
          </button>
        </div>
      )}

      {/* Lifetime stats */}
      <div className="flex gap-6 mb-10">
        <div>
          <p className="font-numbers text-2xl font-semibold text-text-primary">
            {formatDuration(totalMinutes)}
          </p>
          <p className="font-sans text-xs text-text-muted mt-0.5">all time</p>
        </div>
        <div>
          <p className="font-numbers text-2xl font-semibold text-text-primary">
            {sessions.length}
          </p>
          <p className="font-sans text-xs text-text-muted mt-0.5">sessions</p>
        </div>
        <div>
          <p className="font-numbers text-2xl font-semibold text-text-primary">
            {streak}
          </p>
          <p className="font-sans text-xs text-text-muted mt-0.5">day streak</p>
        </div>
      </div>

      {/* Rating line chart */}
      <div className="mb-10">
        <p className="font-sans text-xs text-text-muted uppercase tracking-wide mb-4">
          Rating over time
        </p>
        <RatingLineChart
          sessions={sessions}
          onNavigateToSession={(id) => router.push(`/sessions/${id}`)}
        />
      </div>

      {/* Consistency heatmap */}
      <div className="mb-10">
        <p className="font-sans text-xs text-text-muted uppercase tracking-wide mb-4">
          Consistency
        </p>
        <ConsistencyHeatmap dayMap={dayMap} sessions={sessions} />
      </div>

      {/* CSV export */}
      <button
        onClick={handleExport}
        className="w-full flex items-center justify-center gap-2 border-[1.5px] border-border-warm text-text-muted font-sans text-sm py-3 rounded-pill"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Export all data as CSV
      </button>
    </main>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/profile/
git commit -m "feat: add profile page — lifetime stats, line chart, heatmap, CSV export"
```

---

### Task 7: Add Profile link to home screen nav

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Read the nav section of `src/app/page.tsx`**

The file ends with:
```tsx
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
```

- [ ] **Step 2: Add Profile button to the nav div**

```tsx
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
        <button
          onClick={() => router.push('/profile')}
          className="font-sans text-sm text-text-muted"
        >
          Profile
        </button>
      </div>
```

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add Profile link to home screen nav"
```

---

### Task 8: Full verification

**Files:** none new

- [ ] **Step 1: Run full test suite**

```bash
npm run test:run 2>&1 | tail -6
```

Expected: all tests pass. Count ≥ 85 (63 previous + ~22 new in stats.test.ts).

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -5
```

Expected: no output.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete Plan 3 — profile page with stats, line chart, heatmap, CSV export"
```

---

## Self-Review

**Spec coverage (screen 11):**
- Header: "Profile" title ✓, settings gear icon → /settings ✓ (settings page itself is Plan 4)
- Account row: email ✓, Sign out ✓
- Lifetime stats: total hours ✓, session count ✓, day streak ✓
- Line chart: Day/Week/Month toggle ✓, X-axis dates ✓, Y-axis 1–5 ✓, points per session in Day view ✓, aggregated in Week/Month ✓, clickable points → card below ✓, navigate to session detail ✓
- Heatmap: separate toggle ✓, Day GitHub-style grid ✓, weekday labels ✓, month nav prev/next ✓, date numbers inside squares ✓, 5-tier coral scale ✓, horizontally centered ✓, cell tap → period note ✓, same for Week/Month ✓
- CSV export: download button ✓, exports all session fields + tags ✓

**Placeholder scan:** None found — all code blocks are complete.

**Type consistency:**
- `HeatmapEntry` defined in `stats.ts`, imported in `ConsistencyHeatmap.tsx` ✓
- `ChartPoint` defined in `stats.ts`, used in `RatingLineChart.tsx` ✓
- `FullSession` defined locally in `profile/page.tsx`, matches `generateCSV` parameter type ✓
- `PeriodType` imported from existing `lib/types.ts` ✓
