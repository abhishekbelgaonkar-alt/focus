# Focus Tracker — Account + Settings (Plan 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Settings page (spec screen 12) and full scheduling flow (spec screen 13): tag management, recurring weekday schedules per goal, scheduled goals overview, change password, notifications toggle, and account deletion.

**Architecture:** All settings screens are client components. The notifications toggle persists to `localStorage` (`focus_nudge_enabled`) — no server state needed, read in `rate/page.tsx` before showing the nudge. Account deletion calls a `SECURITY DEFINER` Postgres function (`delete_user()`) so the client can delete its own `auth.users` row without admin credentials. Goal schedules are stored in the existing `goals.schedule text[]` column; the scheduling editor saves `['mon','wed','fri']` style arrays.

**Tech Stack:** Next.js 16 App Router, Supabase JS v2, Tailwind v4, Vitest (existing)

> **Prerequisites:** Plans 1–3 complete. Supabase migration and anonymous auth still need to be applied before manual testing.

---

## File Structure

```
src/
├── app/
│   ├── settings/
│   │   ├── page.tsx                        CREATE — full settings page (all 5 sections)
│   │   ├── tags/
│   │   │   └── page.tsx                    CREATE — tag list with rename/delete/add
│   │   └── scheduled-goals/
│   │       └── page.tsx                    CREATE — all active schedules with X to remove
│   └── goals/
│       └── [id]/
│           └── schedule/
│               └── page.tsx                CREATE — weekday picker for one goal
├── components/
│   └── WeekdayPicker.tsx                   CREATE — 7 circular M/T/W/T/F/S/S toggles
src/app/goals/[id]/page.tsx                 MODIFY — add "Schedule this goal" row below stats
src/app/rate/page.tsx                       MODIFY — check localStorage before showing nudge
supabase/migrations/
    └── 20260908000001_delete_user_fn.sql   CREATE — delete_user() SECURITY DEFINER fn
src/__tests__/
    └── WeekdayPicker.test.tsx              CREATE
```

---

### Task 1: SQL migration — `delete_user()` RPC

**Files:**
- Create: `supabase/migrations/20260908000001_delete_user_fn.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Allows authenticated users to delete their own auth.users row.
-- SECURITY DEFINER runs as the function owner (postgres), which has
-- permission to delete from auth.users. The WHERE clause ensures each
-- user can only delete themselves.
CREATE OR REPLACE FUNCTION delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;
```

- [ ] **Step 2: Apply to Supabase**

In Supabase Dashboard → SQL Editor, paste the migration contents and click Run.
Expected: "Success. No rows returned."

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260908000001_delete_user_fn.sql
git commit -m "feat: add delete_user() RPC for client-side account self-deletion"
```

---

### Task 2: WeekdayPicker component + tests

**Files:**
- Create: `src/components/WeekdayPicker.tsx`
- Create: `src/__tests__/WeekdayPicker.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/WeekdayPicker.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WeekdayPicker } from '@/components/WeekdayPicker'

describe('WeekdayPicker', () => {
  it('renders 7 buttons', () => {
    render(<WeekdayPicker selected={[]} onChange={() => {}} />)
    expect(screen.getAllByRole('button')).toHaveLength(7)
  })

  it('applies filled coral style to selected days', () => {
    render(<WeekdayPicker selected={['mon']} onChange={() => {}} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons[0]).toHaveClass('bg-coral')    // Mon is index 0
    expect(buttons[1]).not.toHaveClass('bg-coral') // Tue is not selected
  })

  it('calls onChange adding the day when an unselected day is clicked', async () => {
    const onChange = vi.fn()
    render(<WeekdayPicker selected={[]} onChange={onChange} />)
    await userEvent.click(screen.getAllByRole('button')[0]) // Mon
    expect(onChange).toHaveBeenCalledWith(['mon'])
  })

  it('calls onChange removing the day when a selected day is clicked', async () => {
    const onChange = vi.fn()
    render(<WeekdayPicker selected={['mon', 'wed']} onChange={onChange} />)
    await userEvent.click(screen.getAllByRole('button')[0]) // Mon
    expect(onChange).toHaveBeenCalledWith(['wed'])
  })

  it('renders buttons in Mon→Sun order', () => {
    render(<WeekdayPicker selected={[]} onChange={() => {}} />)
    const buttons = screen.getAllByRole('button')
    // Last button should be S (Sun)
    expect(buttons[6].textContent).toBe('S')
    // First button should be M (Mon)
    expect(buttons[0].textContent).toBe('M')
  })
})
```

- [ ] **Step 2: Run — verify they fail**

```bash
npm run test:run -- src/__tests__/WeekdayPicker.test.tsx 2>&1 | tail -4
```

Expected: FAIL with "Cannot find module '@/components/WeekdayPicker'"

- [ ] **Step 3: Create `src/components/WeekdayPicker.tsx`**

```tsx
'use client'
import type { Weekday } from '@/lib/types'

const DAYS: { key: Weekday; label: string }[] = [
  { key: 'mon', label: 'M' },
  { key: 'tue', label: 'T' },
  { key: 'wed', label: 'W' },
  { key: 'thu', label: 'T' },
  { key: 'fri', label: 'F' },
  { key: 'sat', label: 'S' },
  { key: 'sun', label: 'S' },
]

interface WeekdayPickerProps {
  selected: Weekday[]
  onChange: (days: Weekday[]) => void
}

export function WeekdayPicker({ selected, onChange }: WeekdayPickerProps) {
  const toggle = (day: Weekday) => {
    onChange(
      selected.includes(day)
        ? selected.filter((d) => d !== day)
        : [...selected, day]
    )
  }

  return (
    <div className="flex gap-2">
      {DAYS.map(({ key, label }) => {
        const isSelected = selected.includes(key)
        return (
          <button
            key={key}
            onClick={() => toggle(key)}
            className={`w-9 h-9 rounded-full font-sans text-sm font-medium transition-colors ${
              isSelected
                ? 'bg-coral text-white'
                : 'border-[1.5px] border-border-warm text-text-muted'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Run — verify all pass**

```bash
npm run test:run -- src/__tests__/WeekdayPicker.test.tsx 2>&1 | tail -4
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/WeekdayPicker.tsx src/__tests__/WeekdayPicker.test.tsx
git commit -m "feat: add WeekdayPicker — 7 circular Mon–Sun toggle buttons"
```

---

### Task 3: Settings page

**Files:**
- Create: `src/app/settings/page.tsx`

- [ ] **Step 1: Create `src/app/settings/page.tsx`**

```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const NUDGE_KEY = 'focus_nudge_enabled'

export default function SettingsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [isAnonymous, setIsAnonymous] = useState(true)
  const [tagCount, setTagCount] = useState(0)
  const [scheduleCount, setScheduleCount] = useState(0)
  const [nudgeEnabled, setNudgeEnabled] = useState(true)
  const [newPassword, setNewPassword] = useState('')
  const [passwordMsg, setPasswordMsg] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setNudgeEnabled(localStorage.getItem(NUDGE_KEY) !== 'false')

    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setLoading(false); return }
      setEmail(data.user.email ?? '')
      setIsAnonymous(!data.user.email)

      const [{ count: tc }, { count: sc }] = await Promise.all([
        supabase
          .from('distraction_tags')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', data.user.id),
        supabase
          .from('goals')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', data.user.id)
          .not('schedule', 'is', null),
      ])
      setTagCount(tc ?? 0)
      setScheduleCount(sc ?? 0)
      setLoading(false)
    })
  }, [])

  const handleNudgeToggle = () => {
    const next = !nudgeEnabled
    setNudgeEnabled(next)
    localStorage.setItem(NUDGE_KEY, String(next))
  }

  const handleChangePassword = async () => {
    setSavingPassword(true)
    setPasswordMsg('')
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) setPasswordMsg(error.message)
    else { setPasswordMsg('Password updated.'); setNewPassword('') }
    setSavingPassword(false)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/setup')
  }

  const handleDeleteAccount = async () => {
    setDeleting(true)
    await supabase.rpc('delete_user')
    await supabase.auth.signOut()
    localStorage.clear()
    router.push('/setup')
  }

  if (loading) return null

  return (
    <main className="min-h-screen bg-cream px-6 pt-12 pb-10 max-w-md mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => router.back()} className="font-sans text-sm text-text-muted">
          ← Back
        </button>
        <h1 className="font-sans text-xl font-medium text-text-primary">Settings</h1>
      </div>

      {/* ── ACCOUNT ─────────────────────────────────────────────────────── */}
      <p className="font-sans text-xs text-text-light uppercase tracking-widest mb-3">Account</p>
      <div className="mb-8 border-b border-border-warm">
        {email && (
          <div className="py-3 border-t border-border-warm">
            <p className="font-sans text-sm text-text-primary">{email}</p>
          </div>
        )}

        {!isAnonymous && (
          <div className="py-3 border-t border-border-warm">
            <p className="font-sans text-sm font-medium text-text-primary mb-2">
              Change password
            </p>
            <div className="flex gap-2 items-end">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && newPassword && handleChangePassword()}
                placeholder="New password"
                className="flex-1 bg-transparent border-b border-border-warm pb-1 font-sans text-sm text-text-primary placeholder:text-text-light focus:outline-none focus:border-coral"
              />
              <button
                onClick={handleChangePassword}
                disabled={!newPassword || savingPassword}
                className="font-sans text-sm text-coral disabled:opacity-40 shrink-0"
              >
                {savingPassword ? 'Saving…' : 'Save'}
              </button>
            </div>
            {passwordMsg && (
              <p className="font-sans text-xs text-text-muted mt-1">{passwordMsg}</p>
            )}
          </div>
        )}

        <button
          onClick={handleSignOut}
          className="w-full text-left py-3 border-t border-border-warm font-sans text-sm text-coral"
        >
          Sign out
        </button>
      </div>

      {/* ── DISTRACTION TAGS ────────────────────────────────────────────── */}
      <p className="font-sans text-xs text-text-light uppercase tracking-widest mb-3">
        Distraction tags
      </p>
      <div className="mb-8 border-b border-border-warm">
        <button
          onClick={() => router.push('/settings/tags')}
          className="w-full flex items-center justify-between py-3 border-t border-border-warm"
        >
          <span className="font-sans text-sm text-text-primary">Manage tags</span>
          <span className="font-sans text-sm text-text-muted">{tagCount} tags ›</span>
        </button>
      </div>

      {/* ── SCHEDULING ──────────────────────────────────────────────────── */}
      <p className="font-sans text-xs text-text-light uppercase tracking-widest mb-3">
        Scheduling
      </p>
      <div className="mb-8 border-b border-border-warm">
        <button
          onClick={() => router.push('/settings/scheduled-goals')}
          className="w-full flex items-center justify-between py-3 border-t border-border-warm"
        >
          <span className="font-sans text-sm text-text-primary">Scheduled goals</span>
          <span className="font-sans text-sm text-text-muted">{scheduleCount} active ›</span>
        </button>
      </div>

      {/* ── NOTIFICATIONS ───────────────────────────────────────────────── */}
      <p className="font-sans text-xs text-text-light uppercase tracking-widest mb-3">
        Notifications
      </p>
      <div className="mb-10 border-b border-border-warm">
        <div className="flex items-center justify-between py-3 border-t border-border-warm">
          <span className="font-sans text-sm text-text-primary">
            Remind me to save my progress
          </span>
          {/* Pill toggle switch */}
          <button
            onClick={handleNudgeToggle}
            role="switch"
            aria-checked={nudgeEnabled}
            className={`relative w-10 h-6 rounded-full transition-colors ${
              nudgeEnabled ? 'bg-coral' : 'bg-border-warm'
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                nudgeEnabled ? 'translate-x-5' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* ── DANGER ZONE ─────────────────────────────────────────────────── */}
      <p
        className="font-sans text-xs uppercase tracking-widest mb-3"
        style={{ color: '#b91c1c' }}
      >
        Danger zone
      </p>
      <div
        className="rounded-xl p-4"
        style={{ border: '1.5px solid #fecaca' }}
      >
        {!deleteConfirm ? (
          <button
            onClick={() => setDeleteConfirm(true)}
            className="font-sans text-sm w-full text-left"
            style={{ color: '#b91c1c' }}
          >
            Delete account and all data
          </button>
        ) : (
          <div>
            <p className="font-sans text-sm text-text-primary mb-4">
              This permanently deletes all your sessions, goals, and data. There is no undo.
            </p>
            <div className="flex gap-3 items-center">
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="font-sans text-sm font-medium px-4 py-2 rounded-pill text-white disabled:opacity-50"
                style={{ backgroundColor: '#b91c1c' }}
              >
                {deleting ? 'Deleting…' : 'Yes, delete everything'}
              </button>
              <button
                onClick={() => setDeleteConfirm(false)}
                className="font-sans text-sm text-text-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/settings/page.tsx
git commit -m "feat: add settings page — account, tags, scheduling, notifications, danger zone"
```

---

### Task 4: Tag management page

**Files:**
- Create: `src/app/settings/tags/page.tsx`

- [ ] **Step 1: Create `src/app/settings/tags/page.tsx`**

```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { DistractionTag } from '@/lib/types'

export default function TagsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [tags, setTags] = useState<DistractionTag[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [newTag, setNewTag] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('distraction_tags')
      .select('*')
      .order('created_at')
      .then(({ data }) => {
        setTags((data ?? []) as DistractionTag[])
        setLoading(false)
      })
  }, [])

  const startEdit = (tag: DistractionTag) => {
    setEditingId(tag.id)
    setEditText(tag.name)
  }

  const handleRename = async (id: string) => {
    const name = editText.trim()
    if (!name) { setEditingId(null); return }
    await supabase.from('distraction_tags').update({ name }).eq('id', id)
    setTags((prev) => prev.map((t) => (t.id === id ? { ...t, name } : t)))
    setEditingId(null)
  }

  const handleDelete = async (id: string) => {
    await supabase.from('distraction_tags').delete().eq('id', id)
    setTags((prev) => prev.filter((t) => t.id !== id))
  }

  const handleAdd = async () => {
    const name = newTag.trim()
    if (!name) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('distraction_tags')
      .insert({ user_id: user.id, name })
      .select()
      .single()
    if (data) setTags((prev) => [...prev, data as DistractionTag])
    setNewTag('')
  }

  if (loading) return null

  return (
    <main className="min-h-screen bg-cream px-6 pt-12 pb-10 max-w-md mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => router.back()} className="font-sans text-sm text-text-muted">
          ← Back
        </button>
        <h1 className="font-sans text-xl font-medium text-text-primary">Distraction tags</h1>
      </div>

      {/* Add new */}
      <div className="flex gap-2 items-end mb-8 pb-6 border-b border-border-warm">
        <input
          type="text"
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Add a tag"
          className="flex-1 bg-transparent border-b border-border-warm pb-1 font-sans text-sm text-text-primary placeholder:text-text-light focus:outline-none focus:border-coral"
        />
        <button
          onClick={handleAdd}
          disabled={!newTag.trim()}
          className="font-sans text-sm text-coral disabled:opacity-40"
        >
          Add
        </button>
      </div>

      {/* Tag list */}
      <div className="flex flex-col">
        {tags.map((tag) => (
          <div
            key={tag.id}
            className="flex items-center gap-3 py-3 border-b border-border-warm last:border-0"
          >
            {editingId === tag.id ? (
              <>
                <input
                  autoFocus
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename(tag.id)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  onBlur={() => handleRename(tag.id)}
                  className="flex-1 bg-transparent border-b border-coral pb-0.5 font-sans text-sm text-text-primary focus:outline-none"
                />
                <button
                  onClick={() => setEditingId(null)}
                  className="font-sans text-xs text-text-muted"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 font-sans text-sm text-text-primary">{tag.name}</span>
                <button
                  onClick={() => startEdit(tag)}
                  className="font-sans text-xs text-text-muted"
                >
                  Rename
                </button>
                <button
                  onClick={() => handleDelete(tag.id)}
                  className="font-sans text-sm text-text-light leading-none"
                >
                  ×
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/settings/tags/
git commit -m "feat: add tag management page — rename inline, delete, add new"
```

---

### Task 5: Goal schedule editor + link from goal detail

**Files:**
- Create: `src/app/goals/[id]/schedule/page.tsx`
- Modify: `src/app/goals/[id]/page.tsx`

- [ ] **Step 1: Create `src/app/goals/[id]/schedule/page.tsx`**

```tsx
'use client'
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { WeekdayPicker } from '@/components/WeekdayPicker'
import type { Weekday } from '@/lib/types'

export default function GoalSchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: goalId } = use(params)
  const router = useRouter()
  const supabase = createClient()

  const [goalName, setGoalName] = useState('')
  const [selectedDays, setSelectedDays] = useState<Weekday[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('goals')
      .select('name, schedule')
      .eq('id', goalId)
      .single()
      .then(({ data }) => {
        if (data) {
          setGoalName(data.name)
          setSelectedDays((data.schedule ?? []) as Weekday[])
        }
        setLoading(false)
      })
  }, [goalId])

  const handleSave = async () => {
    setSaving(true)
    await supabase
      .from('goals')
      .update({ schedule: selectedDays.length > 0 ? selectedDays : null })
      .eq('id', goalId)
    setSaving(false)
    router.back()
  }

  if (loading) return null

  return (
    <main className="min-h-screen bg-cream px-6 pt-12 pb-10 max-w-md mx-auto">
      <button
        onClick={() => router.back()}
        className="font-sans text-sm text-text-muted mb-6 block"
      >
        ← Back
      </button>

      <h1 className="font-sans text-xl font-medium text-text-primary mb-1">{goalName}</h1>
      <p className="font-sans text-sm text-text-muted mb-10">Schedule this goal</p>

      <p className="font-sans text-xs text-text-muted uppercase tracking-wide mb-4">
        Repeats on
      </p>
      <WeekdayPicker selected={selectedDays} onChange={setSelectedDays} />

      {selectedDays.length === 0 && (
        <p className="font-sans text-xs text-text-muted mt-3">
          No days selected — schedule will be cleared.
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-coral text-white font-sans font-medium py-3 rounded-pill mt-12 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save schedule'}
      </button>
    </main>
  )
}
```

- [ ] **Step 2: Read the goal detail page to find where to add the schedule link**

Open `src/app/goals/[id]/page.tsx`. The stats block ends at the line with `<p className="font-sans text-xs text-text-muted uppercase tracking-wide mb-2">Session history</p>`.

Insert the schedule link between the stats block and the "Session history" label:

```tsx
      {/* Schedule link */}
      <button
        onClick={() => router.push(`/goals/${goalId}/schedule`)}
        className="flex items-center gap-2 py-3 mb-4 border-b border-border-warm w-full text-left"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#b08c6a"
          strokeWidth="2"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <line x1="12" y1="14" x2="12" y2="18" />
          <line x1="10" y1="16" x2="14" y2="16" />
        </svg>
        <span className="font-sans text-sm text-text-muted">Schedule this goal</span>
      </button>
```

- [ ] **Step 3: Edit `src/app/goals/[id]/page.tsx`** — add schedule link before session history label

The line to find is:
```tsx
      <p className="font-sans text-xs text-text-muted uppercase tracking-wide mb-2">
        Session history
      </p>
```

Replace with:
```tsx
      {/* Schedule link */}
      <button
        onClick={() => router.push(`/goals/${goalId}/schedule`)}
        className="flex items-center gap-2 py-3 mb-4 border-b border-border-warm w-full text-left"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#b08c6a"
          strokeWidth="2"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <line x1="12" y1="14" x2="12" y2="18" />
          <line x1="10" y1="16" x2="14" y2="16" />
        </svg>
        <span className="font-sans text-sm text-text-muted">Schedule this goal</span>
      </button>

      <p className="font-sans text-xs text-text-muted uppercase tracking-wide mb-2">
        Session history
      </p>
```

- [ ] **Step 4: Commit**

```bash
git add "src/app/goals/[id]/schedule/" "src/app/goals/[id]/page.tsx"
git commit -m "feat: add goal schedule editor (weekday picker) and link from goal detail"
```

---

### Task 6: Scheduled goals overview

**Files:**
- Create: `src/app/settings/scheduled-goals/page.tsx`

- [ ] **Step 1: Create `src/app/settings/scheduled-goals/page.tsx`**

```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const DAY_LABELS: Record<string, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu',
  fri: 'Fri', sat: 'Sat', sun: 'Sun',
}

interface ScheduledGoal {
  id: string
  name: string
  schedule: string[]
}

export default function ScheduledGoalsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [goals, setGoals] = useState<ScheduledGoal[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('goals')
      .select('id, name, schedule')
      .not('schedule', 'is', null)
      .order('name')
      .then(({ data }) => {
        setGoals(
          ((data ?? []) as ScheduledGoal[]).filter(
            (g) => g.schedule && g.schedule.length > 0
          )
        )
        setLoading(false)
      })
  }, [])

  const handleRemove = async (goalId: string) => {
    await supabase.from('goals').update({ schedule: null }).eq('id', goalId)
    setGoals((prev) => prev.filter((g) => g.id !== goalId))
  }

  if (loading) return null

  return (
    <main className="min-h-screen bg-cream px-6 pt-12 pb-10 max-w-md mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => router.back()} className="font-sans text-sm text-text-muted">
          ← Back
        </button>
        <h1 className="font-sans text-xl font-medium text-text-primary">Scheduled goals</h1>
      </div>

      {goals.length === 0 ? (
        <p className="font-sans text-sm text-text-muted">
          No goals with a schedule yet. Open a goal to set one.
        </p>
      ) : (
        <div className="flex flex-col">
          {goals.map((g) => (
            <div
              key={g.id}
              className="flex items-center justify-between py-4 border-b border-border-warm last:border-0 gap-4"
            >
              <div className="min-w-0">
                <p className="font-sans text-sm font-medium text-text-primary truncate">
                  {g.name}
                </p>
                <p className="font-sans text-xs text-text-muted mt-0.5">
                  {g.schedule.map((d) => DAY_LABELS[d] ?? d).join(', ')}
                </p>
              </div>
              <button
                onClick={() => handleRemove(g.id)}
                className="font-sans text-lg text-text-light leading-none shrink-0"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/settings/scheduled-goals/
git commit -m "feat: add scheduled goals overview — list active schedules with remove button"
```

---

### Task 7: Wire notifications toggle to AccountNudge

**Files:**
- Modify: `src/app/rate/page.tsx`

The nudge is currently shown whenever `c === 1 || c % 5 === 0`. Add a check for the `focus_nudge_enabled` localStorage key so the toggle in Settings takes effect.

- [ ] **Step 1: Read the relevant section of `src/app/rate/page.tsx`**

Find the block in `handleSave` that starts with:
```typescript
    const c = count ?? 0
    if (c === 1 || c % 5 === 0) {
      setSavedCount(c)
    } else {
      router.push('/')
    }
```

- [ ] **Step 2: Replace that block**

```typescript
    const c = count ?? 0
    const nudgeEnabled = localStorage.getItem('focus_nudge_enabled') !== 'false'
    if (nudgeEnabled && (c === 1 || c % 5 === 0)) {
      setSavedCount(c)
    } else {
      router.push('/')
    }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -5
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/app/rate/page.tsx
git commit -m "feat: wire focus_nudge_enabled localStorage key to suppress account nudge"
```

---

### Task 8: Full verification + push

**Files:** none new

- [ ] **Step 1: Run full test suite**

```bash
npm run test:run 2>&1 | tail -6
```

Expected: all tests pass. Count ≥ 95 (90 previous + 5 WeekdayPicker).

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -5
```

Expected: no output.

- [ ] **Step 3: Push to GitHub**

```bash
git push origin main 2>&1 | tail -3
```

Expected: `main -> main`

---

## Self-Review

**Spec coverage (screens 12 + 13):**

**Screen 12 — Settings:**
- Account section: email (display) ✓, Change password ✓ (hidden for anonymous users), Sign out ✓
- Distraction tags: "Manage tags" row with count ✓ → tag management page ✓
- Scheduling: "Scheduled goals" row with active count ✓ → scheduled goals overview ✓
- Notifications: toggle for "Remind me to save my progress" ✓, controls nudge ✓
- Danger zone: visually distinct red-toned ✓, "Delete account and all data" ✓, confirmation step ✓, calls `delete_user()` RPC ✓

**Screen 13 — Scheduling:**
- Entry point: "Schedule this goal" row in goal detail with calendar-plus icon ✓
- Day picker: 7 circular M/T/W/T/F/S/S toggle buttons ✓
- Recurring/weekly (not one-off calendar dates) — stored as `['mon','wed']` ✓
- "Save schedule" button ✓
- Scheduled Goals overview: list with days, X to remove ✓
- Powers "Today's plan" on home screen — `goals.schedule` was already read in Plan 2's home screen ✓

**No placeholders found.**

**Type consistency:**
- `Weekday` type imported from `lib/types.ts` in both `WeekdayPicker.tsx` and `goals/[id]/schedule/page.tsx` ✓
- `DAY_LABELS` in `scheduled-goals/page.tsx` matches keys in `Weekday` type ✓
- `delete_user()` called as `supabase.rpc('delete_user')` — no args, returns void ✓
- `NUDGE_KEY = 'focus_nudge_enabled'` used consistently in settings and rate page ✓
