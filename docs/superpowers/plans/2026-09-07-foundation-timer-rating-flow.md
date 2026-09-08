# Focus Tracker — Foundation + Core Timer Flow

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold a Next.js + Supabase Focus Session Tracker with anonymous auth and the complete timer → rating flow (setup screen → running timer → end-reason branch → rating/save screen).

**Architecture:** Next.js App Router with client components driving the timer UI; session-in-progress state persisted to `sessionStorage` between route transitions so no state is lost on navigation; Supabase Postgres with RLS for data persistence; anonymous auth on first visit, upgradeable to a real account later without data migration.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS v4, Supabase (auth + Postgres), @supabase/ssr, Vitest + React Testing Library

> **Scope note:** This spec has four independent subsystems. This plan covers only Plan 1 (Foundation + Core Timer Flow, spec screens 1–5). Separate plans should be written for Plan 2 (Home + History: screens 2, 6, 7, 8, 9), Plan 3 (Profile + Analytics: screen 11), and Plan 4 (Account + Settings: screens 10, 12, 13).

---

## File Structure

```
focus/
├── supabase/
│   └── migrations/
│       └── 20260907000000_initial_schema.sql
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                  # entry: redirects to /setup
│   │   ├── globals.css
│   │   ├── setup/
│   │   │   └── page.tsx              # screen 1: timer setup
│   │   ├── timer/
│   │   │   └── page.tsx              # screen 3: countdown
│   │   ├── end/
│   │   │   └── page.tsx              # screen 4: end-reason branch
│   │   └── rate/
│   │       └── page.tsx              # screen 5: rating + save
│   ├── components/
│   │   ├── AuthProvider.tsx          # anonymous sign-in on mount
│   │   ├── DurationPicker.tsx        # custom ruler slider + synced number span
│   │   ├── RatingSlider.tsx          # same slider pattern, 1.0–5.0
│   │   ├── DistractionTags.tsx       # pill multi-selector with custom add
│   │   └── AccountNudge.tsx          # inline save-your-data card
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts             # browser client (createBrowserClient)
│   │   │   └── server.ts             # server-component client (cookie-based)
│   │   ├── types.ts                  # TypeScript interfaces for all DB tables
│   │   ├── timer.ts                  # pure functions: countdown math, labels
│   │   └── session-state.ts          # sessionStorage helpers for in-progress session
│   └── hooks/
│       └── useAuth.ts                # (used by AuthProvider internally)
├── src/__tests__/
│   ├── setup.ts                      # jest-dom import
│   ├── timer.test.ts
│   ├── DurationPicker.test.tsx
│   ├── RatingSlider.test.tsx
│   └── DistractionTags.test.tsx
├── middleware.ts                      # Supabase session refresh
├── .env.example
├── tailwind.config.ts
└── vitest.config.ts
```

---

### Task 1: Scaffold the Next.js project

**Files:**
- Create: `package.json` (via create-next-app)
- Create: `.env.example`
- Create: `vitest.config.ts`
- Create: `src/__tests__/setup.ts`

- [ ] **Step 1: Run create-next-app inside the focus/ directory**

```bash
cd /Users/home/focus
npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*" --no-git
```

When prompted, accept all defaults. For "Would you like to use Turbopack?" choose **No** — Vitest config is simpler without it.

- [ ] **Step 2: Install Supabase + test dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

- [ ] **Step 3: Create `.env.example`**

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

- [ ] **Step 4: Create `.env.local`** — fill in real values from Supabase Dashboard → Settings → API

```bash
cp .env.example .env.local
# open .env.local and paste your SUPABASE_URL and ANON_KEY
```

- [ ] **Step 5: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 6: Create `src/__tests__/setup.ts`**

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 7: Add test scripts to `package.json`**

Open `package.json` and add to the `"scripts"` object:
```json
"test": "vitest",
"test:run": "vitest run"
```

- [ ] **Step 8: Verify test runner works**

```bash
npm run test:run
```

Expected output: "No test files found" or exit code 1 with a "no files" message — the runner started, which is what we need.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json .env.example vitest.config.ts src/__tests__/setup.ts next.config.ts tsconfig.json tailwind.config.ts postcss.config.mjs .gitignore
git commit -m "feat: scaffold Next.js + Supabase project with Vitest"
```

---

### Task 2: Design system — Tailwind config + global CSS + fonts

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Replace `tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        cream: '#fdf6ee',
        'text-primary': '#3d3126',
        'text-muted': '#b08c6a',
        'text-light': '#c9b79c',
        'border-warm': '#ecdcc9',
        coral: '#d9642e',
        'coral-light': '#fbe6d4',
        'tag-text': '#a05a1f',
        heatmap: {
          none: '#f0ece2',
          low: '#f3d9bd',
          mid: '#f0b587',
          high: '#e8905a',
          peak: '#d9642e',
        },
      },
      fontFamily: {
        sans: ['Outfit', 'sans-serif'],
        numbers: ['Quicksand', 'sans-serif'],
      },
      borderRadius: {
        pill: '24px',
      },
    },
  },
  plugins: [],
}
export default config
```

- [ ] **Step 2: Replace `src/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/*
  Custom slider — shared by DurationPicker and RatingSlider.
  We must reset -webkit-appearance, -moz-appearance, border, and box-shadow
  because browsers apply them inconsistently even after appearance: none.
*/
.focus-slider {
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  width: 100%;
  height: 2px;
  background: #ecdcc9;
  cursor: pointer;
  outline: none;
  border: none;
  box-shadow: none;
  border-radius: 0;
  display: block;
}

.focus-slider::-webkit-slider-runnable-track {
  height: 2px;
  background: #ecdcc9;
  border: none;
  box-shadow: none;
}

.focus-slider::-moz-range-track {
  height: 2px;
  background: #ecdcc9;
  border: none;
  box-shadow: none;
}

/* Thin vertical coral line thumb — NOT a circular dot */
.focus-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 4px;
  height: 26px;
  background: #d9642e;
  border: none;
  box-shadow: none;
  cursor: pointer;
  border-radius: 2px;
  margin-top: -12px;
}

.focus-slider::-moz-range-thumb {
  width: 4px;
  height: 26px;
  background: #d9642e;
  border: none;
  box-shadow: none;
  cursor: pointer;
  border-radius: 2px;
}

body {
  background-color: #fdf6ee;
  color: #3d3126;
}
```

- [ ] **Step 3: Replace `src/app/layout.tsx`**

```tsx
import type { Metadata } from 'next'
import { Outfit, Quicksand } from 'next/font/google'
import { AuthProvider } from '@/components/AuthProvider'
import './globals.css'

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-outfit',
  display: 'swap',
})

const quicksand = Quicksand({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-quicksand',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Focus',
  description: 'Track your focus sessions',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${quicksand.variable}`}>
      <body className="font-sans bg-cream text-text-primary min-h-screen">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 4: Verify styles render**

```bash
npm run dev
```

Open http://localhost:3000. Background should be warm cream (`#fdf6ee`), not white. No console errors.

- [ ] **Step 5: Commit**

```bash
git add tailwind.config.ts src/app/globals.css src/app/layout.tsx
git commit -m "feat: add design system — custom colors, Outfit/Quicksand fonts, slider CSS"
```

---

### Task 3: Database schema

**Files:**
- Create: `supabase/migrations/20260907000000_initial_schema.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260907000000_initial_schema.sql`:

```sql
-- goals
CREATE TABLE goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'abandoned')),
  schedule text[],
  last_used_duration_minutes integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- categories (for goal-less sessions)
CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- sessions
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id uuid REFERENCES goals(id) ON DELETE SET NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  session_name text,
  planned_duration_minutes integer NOT NULL,
  actual_duration_minutes integer NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  rating numeric(3,1) CHECK (rating >= 1.0 AND rating <= 5.0),
  notes text,
  end_reason text CHECK (
    end_reason IN ('on_time', 'still_focused', 'distracted', 'forgot_to_end', 'other')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- prevents linking both goal and category on one session
  CONSTRAINT not_both_goal_and_category CHECK (
    NOT (goal_id IS NOT NULL AND category_id IS NOT NULL)
  )
);

-- distraction tags (per user, seeded with defaults on signup via trigger below)
CREATE TABLE distraction_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- session ↔ tag join table
CREATE TABLE session_distraction_tags (
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES distraction_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, tag_id)
);

-- freeform notes per day / week / month (heatmap tap target)
CREATE TABLE period_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_type text NOT NULL CHECK (period_type IN ('day', 'week', 'month')),
  period_date date NOT NULL,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, period_type, period_date)
);

-- Row-Level Security
ALTER TABLE goals                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories             ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE distraction_tags       ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_distraction_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE period_notes           ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_goals" ON goals
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_categories" ON categories
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_sessions" ON sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_tags" ON distraction_tags
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_session_tags" ON session_distraction_tags
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_id AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "own_period_notes" ON period_notes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Seed default distraction tags when any new user is created (including anonymous)
CREATE OR REPLACE FUNCTION seed_distraction_tags()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO distraction_tags (user_id, name) VALUES
    (NEW.id, 'Phone'),
    (NEW.id, 'Social media'),
    (NEW.id, 'Noise'),
    (NEW.id, 'Hunger'),
    (NEW.id, 'Tiredness'),
    (NEW.id, 'Intrusive thoughts'),
    (NEW.id, 'Other people'),
    (NEW.id, 'Procrastination'),
    (NEW.id, 'Physical discomfort'),
    (NEW.id, 'Task felt too hard'),
    (NEW.id, 'Unclear what to do next');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION seed_distraction_tags();
```

- [ ] **Step 2: Apply to Supabase**

**Option A — Supabase Studio (recommended for now):**
1. Open your Supabase project → SQL Editor
2. Paste the entire file contents above
3. Click Run

**Option B — Supabase CLI:**
```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

- [ ] **Step 3: Enable anonymous auth in Dashboard**

Supabase Dashboard → Authentication → Providers → scroll to "Anonymous Sign-ins" → Enable → Save.

- [ ] **Step 4: Verify in Table Editor**

Go to Supabase Dashboard → Table Editor. You should see: `goals`, `categories`, `sessions`, `distraction_tags`, `session_distraction_tags`, `period_notes`.

- [ ] **Step 5: Commit**

```bash
git add supabase/
git commit -m "feat: add Postgres schema with RLS and distraction-tag seeding trigger"
```

---

### Task 4: Supabase clients, TypeScript types, and session middleware

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/types.ts`
- Create: `middleware.ts`

- [ ] **Step 1: Create `src/lib/supabase/client.ts`**

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 2: Create `src/lib/supabase/server.ts`**

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component context — mutations are ignored, which is fine
          }
        },
      },
    }
  )
}
```

- [ ] **Step 3: Create `src/lib/types.ts`**

```typescript
export type GoalStatus = 'active' | 'completed' | 'abandoned'
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export type EndReason = 'on_time' | 'still_focused' | 'distracted' | 'forgot_to_end' | 'other'
export type PeriodType = 'day' | 'week' | 'month'

export interface Goal {
  id: string
  user_id: string
  name: string
  status: GoalStatus
  schedule: Weekday[] | null
  last_used_duration_minutes: number | null
  created_at: string
}

export interface Category {
  id: string
  user_id: string
  name: string
  created_at: string
}

export interface Session {
  id: string
  user_id: string
  goal_id: string | null
  category_id: string | null
  session_name: string | null
  planned_duration_minutes: number
  actual_duration_minutes: number
  started_at: string
  ended_at: string
  rating: number | null
  notes: string | null
  end_reason: EndReason | null
  created_at: string
}

export interface DistractionTag {
  id: string
  user_id: string
  name: string
  created_at: string
}

export interface PeriodNote {
  id: string
  user_id: string
  period_type: PeriodType
  period_date: string
  note: string
  created_at: string
}
```

- [ ] **Step 4: Create `middleware.ts`** (at project root, not inside src/)

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh the session token so it doesn't expire mid-session
  await supabase.auth.getUser()

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/ middleware.ts
git commit -m "feat: add Supabase clients, shared TypeScript types, and session middleware"
```

---

### Task 5: Anonymous auth

**Files:**
- Create: `src/components/AuthProvider.tsx`

(layout.tsx already references AuthProvider from Task 2 Step 3 — we're just creating the file it imports.)

- [ ] **Step 1: Create `src/components/AuthProvider.tsx`**

```tsx
'use client'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        supabase.auth.signInAnonymously()
      }
    })
  }, [])

  return <>{children}</>
}
```

- [ ] **Step 2: Start dev server and verify anonymous user is created**

```bash
npm run dev
```

Open http://localhost:3000. Wait 2–3 seconds. In Supabase Dashboard → Authentication → Users, a new row with `is_anonymous: true` should appear. Refreshing the page should NOT create a second user (the session persists in localStorage).

- [ ] **Step 3: Commit**

```bash
git add src/components/AuthProvider.tsx
git commit -m "feat: add AuthProvider — signs in anonymously on first visit, session persists"
```

---

### Task 6: Pure utility functions + tests

**Files:**
- Create: `src/lib/timer.ts`
- Create: `src/lib/session-state.ts`
- Create: `src/__tests__/timer.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/timer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  getRemainingMs,
  formatTime,
  isTimerExpired,
  getRatingLabel,
  getNotePlaceholder,
} from '@/lib/timer'

describe('getRemainingMs', () => {
  it('returns approximately full duration when timer just started', () => {
    const now = Date.now()
    const remaining = getRemainingMs(now, 25 * 60 * 1000, null, 0)
    expect(remaining).toBeGreaterThan(25 * 60 * 1000 - 100)
    expect(remaining).toBeLessThanOrEqual(25 * 60 * 1000)
  })

  it('decreases as time passes', () => {
    const startedAt = Date.now() - 60_000 // started 1 minute ago
    const remaining = getRemainingMs(startedAt, 25 * 60 * 1000, null, 0)
    expect(remaining).toBeGreaterThan(23 * 60 * 1000)
    expect(remaining).toBeLessThan(25 * 60 * 1000)
  })

  it('accounts for total paused time', () => {
    const startedAt = Date.now() - 120_000 // started 2 min ago
    const withPause = getRemainingMs(startedAt, 25 * 60 * 1000, null, 60_000)
    const withoutPause = getRemainingMs(startedAt, 25 * 60 * 1000, null, 0)
    expect(withPause).toBeGreaterThan(withoutPause)
  })

  it('uses pausedAt snapshot instead of Date.now() when paused', () => {
    const startedAt = Date.now() - 120_000
    const pausedAt = Date.now() - 60_000 // paused 1 min ago
    const paused = getRemainingMs(startedAt, 25 * 60 * 1000, pausedAt, 0)
    // remaining = 25min - (120s - 0 - 60s) = 25min - 1min = 24min
    expect(paused).toBeGreaterThan(23.5 * 60 * 1000)
    expect(paused).toBeLessThan(24.5 * 60 * 1000)
  })

  it('never returns negative', () => {
    const startedAt = Date.now() - 30 * 60 * 1000 // 30 min ago
    expect(getRemainingMs(startedAt, 25 * 60 * 1000, null, 0)).toBe(0)
  })
})

describe('formatTime', () => {
  it('formats 0ms as 0:00', () => {
    expect(formatTime(0)).toBe('0:00')
  })

  it('formats 90 000ms as 1:30', () => {
    expect(formatTime(90_000)).toBe('1:30')
  })

  it('formats 25 minutes exactly', () => {
    expect(formatTime(25 * 60 * 1000)).toBe('25:00')
  })

  it('pads seconds below 10 with a leading zero', () => {
    expect(formatTime(65_000)).toBe('1:05')
  })
})

describe('isTimerExpired', () => {
  it('returns false when time remains', () => {
    const startedAt = Date.now() - 10_000 // 10 sec ago
    expect(isTimerExpired(startedAt, 25 * 60 * 1000, 0)).toBe(false)
  })

  it('returns true when past planned duration', () => {
    const startedAt = Date.now() - 26 * 60 * 1000 // 26 min ago, planned 25
    expect(isTimerExpired(startedAt, 25 * 60 * 1000, 0)).toBe(true)
  })

  it('accounts for paused time — does not count pause toward elapsed', () => {
    // Started 26 min ago but 5 min of that was paused → 21 min actual elapsed
    expect(isTimerExpired(Date.now() - 26 * 60 * 1000, 25 * 60 * 1000, 5 * 60 * 1000)).toBe(false)
  })
})

describe('getRatingLabel', () => {
  it.each([
    [1.0, 'Rough'],
    [1.5, 'Rough'],
    [2.0, 'Distracted'],
    [2.5, 'Distracted'],
    [3.0, 'Okay'],
    [3.5, 'Okay'],
    [4.0, 'Focused'],
    [4.5, 'Focused'],
    [5.0, 'Locked in'],
  ])('rating %f → "%s"', (rating, expected) => {
    expect(getRatingLabel(rating)).toBe(expected)
  })
})

describe('getNotePlaceholder', () => {
  it.each([
    [1.0, 'What made it hard to focus at all'],
    [1.5, 'What made it hard to focus at all'],
    [2.0, 'What kept pulling your attention away'],
    [2.5, 'What kept pulling your attention away'],
    [3.0, 'What would have made this session better'],
    [3.5, 'What would have made this session better'],
    [4.0, 'What made this focused'],
    [4.5, 'What made this focused'],
    [5.0, 'What made this session click'],
  ])('rating %f → correct placeholder', (rating, expected) => {
    expect(getNotePlaceholder(rating)).toBe(expected)
  })
})
```

- [ ] **Step 2: Run — verify they fail**

```bash
npm run test:run -- src/__tests__/timer.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/timer'"

- [ ] **Step 3: Create `src/lib/timer.ts`**

```typescript
export function getRemainingMs(
  startedAt: number,
  plannedMs: number,
  pausedAt: number | null,
  totalPausedMs: number
): number {
  const effectiveNow = pausedAt ?? Date.now()
  const elapsed = effectiveNow - startedAt - totalPausedMs
  return Math.max(0, plannedMs - elapsed)
}

export function formatTime(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function isTimerExpired(
  startedAt: number,
  plannedMs: number,
  totalPausedMs: number
): boolean {
  return Date.now() - startedAt - totalPausedMs >= plannedMs
}

export function getRatingLabel(rating: number): string {
  const labels: Record<number, string> = {
    1: 'Rough',
    2: 'Distracted',
    3: 'Okay',
    4: 'Focused',
    5: 'Locked in',
  }
  return labels[Math.floor(rating)] ?? ''
}

export function getNotePlaceholder(rating: number): string {
  if (rating <= 1.5) return 'What made it hard to focus at all'
  if (rating <= 2.5) return 'What kept pulling your attention away'
  if (rating <= 3.5) return 'What would have made this session better'
  if (rating <= 4.5) return 'What made this focused'
  return 'What made this session click'
}
```

- [ ] **Step 4: Run — verify all pass**

```bash
npm run test:run -- src/__tests__/timer.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Create `src/lib/session-state.ts`**

```typescript
import type { EndReason } from './types'

export interface InProgressSession {
  plannedDurationMinutes: number
  startedAt: string           // ISO timestamp set when "Start" is clicked
  setupFocusText: string | null
  goalId: string | null
  categoryId: string | null
  endReason: EndReason | null  // set by /end screen
  actualDurationMinutes: number | null // set by /end screen (still_focused path)
}

const KEY = 'focus_in_progress'

export function saveSession(s: InProgressSession): void {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(KEY, JSON.stringify(s))
}

export function loadSession(): InProgressSession | null {
  if (typeof window === 'undefined') return null
  const raw = sessionStorage.getItem(KEY)
  return raw ? (JSON.parse(raw) as InProgressSession) : null
}

export function clearSession(): void {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(KEY)
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/timer.ts src/lib/session-state.ts src/__tests__/timer.test.ts
git commit -m "feat: timer utilities and session-state helpers — fully tested"
```

---

### Task 7: DurationPicker component

**Files:**
- Create: `src/components/DurationPicker.tsx`
- Create: `src/__tests__/DurationPicker.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/DurationPicker.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DurationPicker } from '@/components/DurationPicker'

describe('DurationPicker', () => {
  it('renders the current value as a large visible span', () => {
    render(<DurationPicker value={25} onChange={() => {}} />)
    expect(screen.getByText('25')).toBeInTheDocument()
  })

  it('renders a range slider', () => {
    render(<DurationPicker value={25} onChange={() => {}} />)
    expect(screen.getByRole('slider', { name: /duration slider/i })).toBeInTheDocument()
  })

  it('calls onChange when the slider is moved', () => {
    const onChange = vi.fn()
    render(<DurationPicker value={25} onChange={onChange} />)
    const slider = screen.getByRole('slider', { name: /duration slider/i })
    fireEvent.change(slider, { target: { value: '30' } })
    expect(onChange).toHaveBeenCalledWith(30)
  })

  it('clicking the number span calls focus on the hidden input', async () => {
    render(<DurationPicker value={25} onChange={() => {}} />)
    const span = screen.getByText('25')
    const input = screen.getByLabelText(/duration in minutes/i)
    const focusSpy = vi.spyOn(input, 'focus')
    await userEvent.click(span)
    expect(focusSpy).toHaveBeenCalled()
  })

  it('clamps typed values above max to max', () => {
    const onChange = vi.fn()
    render(<DurationPicker value={25} onChange={onChange} min={1} max={90} />)
    const input = screen.getByLabelText(/duration in minutes/i)
    fireEvent.change(input, { target: { value: '200' } })
    expect(onChange).toHaveBeenCalledWith(90)
  })

  it('clamps typed values below min to min', () => {
    const onChange = vi.fn()
    render(<DurationPicker value={25} onChange={onChange} min={1} max={90} />)
    const input = screen.getByLabelText(/duration in minutes/i)
    fireEvent.change(input, { target: { value: '0' } })
    expect(onChange).toHaveBeenCalledWith(1)
  })

  it('renders 15-minute interval labels', () => {
    render(<DurationPicker value={25} onChange={() => {}} />)
    ;['15', '30', '45', '60', '75', '90'].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run — verify they fail**

```bash
npm run test:run -- src/__tests__/DurationPicker.test.tsx
```

Expected: FAIL with "Cannot find module '@/components/DurationPicker'"

- [ ] **Step 3: Create `src/components/DurationPicker.tsx`**

```tsx
'use client'
import { useRef } from 'react'

interface DurationPickerProps {
  value: number
  onChange: (minutes: number) => void
  min?: number
  max?: number
}

const LABEL_INTERVAL = 15

export function DurationPicker({ value, onChange, min = 1, max = 90 }: DurationPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const range = max - min

  const handleSpanClick = () => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value)
    if (!isNaN(v)) {
      onChange(Math.min(max, Math.max(min, v)))
    }
  }

  // The tick marks are SVG lines drawn above the slider track.
  // Three tiers: tiny (every 1 min), medium (every 5 min), tall (every 15 min).
  const ticks = Array.from({ length: range + 1 }, (_, i) => min + i)
  const labels = ticks.filter((m) => m % LABEL_INTERVAL === 0)

  return (
    <div className="w-full">
      {/* Clickable number display — large span + invisible input behind it */}
      <div
        className="inline-flex items-baseline gap-2 mb-6 cursor-text"
        onClick={handleSpanClick}
      >
        <span className="font-numbers text-7xl font-semibold text-text-primary leading-none select-none">
          {value}
        </span>
        <span className="font-sans text-xl text-text-muted select-none">min</span>
        <input
          ref={inputRef}
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={handleNumberChange}
          aria-label="Duration in minutes"
          className="absolute opacity-0 w-0 h-0 pointer-events-none"
          tabIndex={-1}
        />
      </div>

      {/* 15-min labels above the tick SVG */}
      <div className="relative w-full h-5 mb-0.5">
        {labels.map((m) => (
          <span
            key={m}
            className="absolute text-xs text-text-light font-sans -translate-x-1/2"
            style={{ left: `${((m - min) / range) * 100}%` }}
          >
            {m}
          </span>
        ))}
      </div>

      {/* SVG tick marks */}
      <svg className="w-full mb-2" height="16" preserveAspectRatio="none" aria-hidden="true">
        {ticks.map((m) => {
          const isLarge = m % 15 === 0
          const isMedium = m % 5 === 0 && !isLarge
          const height = isLarge ? 12 : isMedium ? 7 : 4
          const x = `${((m - min) / range) * 100}%`
          return (
            <line
              key={m}
              x1={x}
              x2={x}
              y1={16 - height}
              y2="16"
              stroke={isLarge ? '#b08c6a' : '#c9b79c'}
              strokeWidth={isLarge ? '1.5' : '1'}
            />
          )
        })}
      </svg>

      {/* Slider */}
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="focus-slider"
        aria-label="Duration slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
      />
    </div>
  )
}
```

- [ ] **Step 4: Run — verify all pass**

```bash
npm run test:run -- src/__tests__/DurationPicker.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/DurationPicker.tsx src/__tests__/DurationPicker.test.tsx
git commit -m "feat: add DurationPicker — custom tick marks, synced number span + hidden input"
```

---

### Task 8: Setup screen

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/app/setup/page.tsx`

- [ ] **Step 1: Replace `src/app/page.tsx`** with a simple redirect

```tsx
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/setup')
}
```

- [ ] **Step 2: Create `src/app/setup/page.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DurationPicker } from '@/components/DurationPicker'
import { saveSession } from '@/lib/session-state'

const DEFAULT_DURATION = 3  // intentionally low-intimidation for first-time users

export default function SetupPage() {
  const router = useRouter()
  const [duration, setDuration] = useState(DEFAULT_DURATION)
  const [focusText, setFocusText] = useState('')

  const handleStart = () => {
    saveSession({
      plannedDurationMinutes: duration,
      startedAt: new Date().toISOString(),
      setupFocusText: focusText.trim() || null,
      goalId: null,
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
```

- [ ] **Step 3: Smoke test in browser**

```bash
npm run dev
```

Open http://localhost:3000 — should redirect to /setup. The page should show: focus text input, large "3 min" number, ruler slider with tick marks, and "Start focus session" button. Drag the slider; the number should update. Click the number; you should be able to type a new value, which also moves the slider.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx src/app/setup/page.tsx
git commit -m "feat: add setup screen — duration picker, optional focus text, start action"
```

---

### Task 9: Timer running screen

**Files:**
- Create: `src/app/timer/page.tsx`

- [ ] **Step 1: Create `src/app/timer/page.tsx`**

```tsx
'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { loadSession, saveSession } from '@/lib/session-state'
import { getRemainingMs, formatTime, isTimerExpired } from '@/lib/timer'
import type { InProgressSession } from '@/lib/session-state'

interface TimerState {
  startedAt: number
  plannedMs: number
  pausedAt: number | null
  totalPausedMs: number
}

const TIMER_KEY = 'focus_timer_state'

function loadTimerState(): TimerState | null {
  const raw = sessionStorage.getItem(TIMER_KEY)
  return raw ? (JSON.parse(raw) as TimerState) : null
}

function saveTimerState(s: TimerState): void {
  sessionStorage.setItem(TIMER_KEY, JSON.stringify(s))
}

function clearTimerState(): void {
  sessionStorage.removeItem(TIMER_KEY)
}

export default function TimerPage() {
  const router = useRouter()
  const [session, setSession] = useState<InProgressSession | null>(null)
  const [timer, setTimer] = useState<TimerState | null>(null)
  const [displayMs, setDisplayMs] = useState(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const s = loadSession()
    if (!s) { router.replace('/setup'); return }
    setSession(s)

    let t = loadTimerState()
    if (!t) {
      t = {
        startedAt: new Date(s.startedAt).getTime(),
        plannedMs: s.plannedDurationMinutes * 60 * 1000,
        pausedAt: null,
        totalPausedMs: 0,
      }
      saveTimerState(t)
    }
    setTimer(t)
    setDisplayMs(getRemainingMs(t.startedAt, t.plannedMs, t.pausedAt, t.totalPausedMs))
  }, [])

  // rAF loop — runs continuously, only updates display when running (not paused)
  const tick = useCallback(() => {
    setTimer((prev) => {
      if (!prev) return prev
      if (prev.pausedAt === null) {
        const remaining = getRemainingMs(prev.startedAt, prev.plannedMs, null, prev.totalPausedMs)
        setDisplayMs(remaining)
      }
      return prev
    })
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current) }
  }, [tick])

  const handlePause = () => {
    setTimer((prev) => {
      if (!prev || prev.pausedAt !== null) return prev
      const next = { ...prev, pausedAt: Date.now() }
      saveTimerState(next)
      return next
    })
  }

  const handleResume = () => {
    setTimer((prev) => {
      if (!prev || prev.pausedAt === null) return prev
      const next = {
        ...prev,
        pausedAt: null,
        totalPausedMs: prev.totalPausedMs + (Date.now() - prev.pausedAt),
      }
      saveTimerState(next)
      return next
    })
  }

  const handleDone = () => {
    if (!timer || !session) return
    const expired = isTimerExpired(timer.startedAt, timer.plannedMs, timer.totalPausedMs)

    saveSession({
      ...session,
      endReason: expired ? null : 'on_time',
      actualDurationMinutes: expired ? null : session.plannedDurationMinutes,
    })
    clearTimerState()

    router.push(expired ? '/end' : '/rate')
  }

  if (!session || !timer) return null

  const isPaused = timer.pausedAt !== null

  return (
    <main className="min-h-screen bg-cream flex flex-col items-center justify-center px-6">
      {session.setupFocusText && (
        <>
          <p className="text-sm text-text-muted mb-2 font-sans">Today, you're working on</p>
          <h1 className="text-xl font-medium text-text-primary mb-12 text-center font-sans max-w-xs">
            {session.setupFocusText}
          </h1>
        </>
      )}

      <div className="font-numbers text-8xl font-semibold text-text-primary mb-16 tabular-nums">
        {formatTime(displayMs)}
      </div>

      <div className="flex gap-4 w-full max-w-xs">
        {isPaused ? (
          <button
            onClick={handleResume}
            className="flex-1 border-[1.5px] border-coral text-coral font-sans font-medium py-3 rounded-pill"
          >
            Resume
          </button>
        ) : (
          <button
            onClick={handlePause}
            className="flex-1 border-[1.5px] border-border-warm text-text-muted font-sans font-medium py-3 rounded-pill"
          >
            Pause
          </button>
        )}
        <button
          onClick={handleDone}
          className="flex-1 bg-coral text-white font-sans font-medium py-3 rounded-pill"
        >
          I'm done
        </button>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Test the timer in browser**

Set duration to 1 minute in /setup. Click Start. On /timer: watch countdown, click Pause (timer should freeze), click Resume (should continue from where it paused). Click "I'm done" before it hits 0:00 — should navigate to /rate (404 for now, that's fine).

- [ ] **Step 3: Test expired-timer path**

Set duration to 1 minute, start, then wait for the timer to reach 0:00. It will show "0:00". Click "I'm done" — should navigate to /end (also 404 for now).

- [ ] **Step 4: Commit**

```bash
git add src/app/timer/page.tsx
git commit -m "feat: add timer screen — rAF countdown, pause/resume, done routing"
```

---

### Task 10: End-reason screen

**Files:**
- Create: `src/app/end/page.tsx`

- [ ] **Step 1: Create `src/app/end/page.tsx`**

```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { loadSession, saveSession } from '@/lib/session-state'
import type { InProgressSession } from '@/lib/session-state'
import type { EndReason } from '@/lib/types'

interface EndOption {
  reason: EndReason
  label: string
}

const END_OPTIONS: EndOption[] = [
  { reason: 'still_focused',  label: "I was still deep in focus — didn't notice" },
  { reason: 'distracted',     label: 'I got distracted and lost track of time' },
  { reason: 'forgot_to_end',  label: 'I finished early and forgot to end it' },
  { reason: 'other',          label: 'Something else' },
]

export default function EndPage() {
  const router = useRouter()
  const [session, setSession] = useState<InProgressSession | null>(null)
  const [selected, setSelected] = useState<EndReason | null>(null)
  const [extraMinutes, setExtraMinutes] = useState('')

  useEffect(() => {
    const s = loadSession()
    if (!s) { router.replace('/setup'); return }
    setSession(s)
  }, [])

  const handleContinue = () => {
    if (!selected || !session) return

    const actualDurationMinutes =
      selected === 'still_focused' && extraMinutes.trim()
        ? Math.max(1, parseInt(extraMinutes))
        : session.plannedDurationMinutes

    saveSession({ ...session, endReason: selected, actualDurationMinutes })
    router.push('/rate')
  }

  if (!session) return null

  return (
    <main className="min-h-screen bg-cream px-6 pt-16 pb-10 max-w-md mx-auto">
      <h1 className="font-sans text-2xl font-medium text-text-primary mb-2">
        Your timer ended a while ago.
      </h1>
      <p className="font-sans text-base text-text-muted mb-8">What happened?</p>

      <div className="flex flex-col gap-3 mb-8">
        {END_OPTIONS.map((opt) => (
          <button
            key={opt.reason}
            onClick={() => setSelected(opt.reason)}
            className={`w-full text-left px-5 py-3.5 rounded-pill border-[1.5px] font-sans text-base transition-colors ${
              selected === opt.reason
                ? 'bg-coral-light border-coral text-tag-text'
                : 'bg-transparent border-border-warm text-text-primary'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {selected === 'still_focused' && (
        <div className="mb-8">
          <label className="block font-sans text-sm text-text-muted mb-3">
            How long do you think you actually focused for?
          </label>
          <div className="flex items-baseline gap-2">
            <input
              type="number"
              value={extraMinutes}
              onChange={(e) => setExtraMinutes(e.target.value)}
              placeholder={String(session.plannedDurationMinutes)}
              min={1}
              max={600}
              className="w-24 bg-transparent border-b border-border-warm pb-1 font-numbers text-3xl text-text-primary focus:outline-none focus:border-coral"
            />
            <span className="font-sans text-text-muted">min</span>
          </div>
        </div>
      )}

      <button
        onClick={handleContinue}
        disabled={!selected}
        className="w-full bg-coral text-white font-sans font-medium py-3 rounded-pill disabled:opacity-40 transition-opacity"
      >
        Continue
      </button>
    </main>
  )
}
```

- [ ] **Step 2: Test the expired-timer path end-to-end**

Set duration to 1 min in /setup. Start. Wait for 0:00. Click "I'm done". On /end: select an option, click Continue — should navigate to /rate (still 404, that's OK). For "still_focused", confirm the follow-up input appears.

- [ ] **Step 3: Commit**

```bash
git add src/app/end/page.tsx
git commit -m "feat: add end-reason screen for expired timers with still_focused follow-up"
```

---

### Task 11: RatingSlider component

**Files:**
- Create: `src/components/RatingSlider.tsx`
- Create: `src/__tests__/RatingSlider.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/RatingSlider.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RatingSlider } from '@/components/RatingSlider'

describe('RatingSlider', () => {
  it('renders the current rating as a number', () => {
    render(<RatingSlider value={3.5} onChange={() => {}} />)
    expect(screen.getByText('3.5')).toBeInTheDocument()
  })

  it('shows the word label for the current rating', () => {
    render(<RatingSlider value={4.0} onChange={() => {}} />)
    expect(screen.getByText('Focused')).toBeInTheDocument()
  })

  it('shows Rough for 1.0', () => {
    render(<RatingSlider value={1.0} onChange={() => {}} />)
    expect(screen.getByText('Rough')).toBeInTheDocument()
  })

  it('shows Locked in for 5.0', () => {
    render(<RatingSlider value={5.0} onChange={() => {}} />)
    expect(screen.getByText('Locked in')).toBeInTheDocument()
  })

  it('shows Rough for 1.5 (half-point shares nearest whole label)', () => {
    render(<RatingSlider value={1.5} onChange={() => {}} />)
    expect(screen.getByText('Rough')).toBeInTheDocument()
  })

  it('calls onChange with a float when slider moves', () => {
    const onChange = vi.fn()
    render(<RatingSlider value={3.0} onChange={onChange} />)
    const slider = screen.getByRole('slider', { name: /rating slider/i })
    fireEvent.change(slider, { target: { value: '4.5' } })
    expect(onChange).toHaveBeenCalledWith(4.5)
  })
})
```

- [ ] **Step 2: Run — verify they fail**

```bash
npm run test:run -- src/__tests__/RatingSlider.test.tsx
```

Expected: FAIL with "Cannot find module '@/components/RatingSlider'"

- [ ] **Step 3: Create `src/components/RatingSlider.tsx`**

```tsx
'use client'
import { getRatingLabel } from '@/lib/timer'

interface RatingSliderProps {
  value: number
  onChange: (v: number) => void
}

const RATING_TICKS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]
const MIN = 1
const MAX = 5
const RANGE = MAX - MIN

export function RatingSlider({ value, onChange }: RatingSliderProps) {
  return (
    <div className="w-full">
      {/* Word label + numeric value */}
      <div className="mb-4">
        <p className="font-sans text-sm text-text-muted mb-1">{getRatingLabel(value)}</p>
        <span className="font-numbers text-5xl font-semibold text-text-primary">
          {value.toFixed(1)}
        </span>
      </div>

      {/* Tick marks above slider track */}
      <svg className="w-full mb-2" height="12" preserveAspectRatio="none" aria-hidden="true">
        {RATING_TICKS.map((t) => {
          const isWhole = Number.isInteger(t)
          const height = isWhole ? 10 : 6
          const x = `${((t - MIN) / RANGE) * 100}%`
          return (
            <line
              key={t}
              x1={x}
              x2={x}
              y1={12 - height}
              y2="12"
              stroke={isWhole ? '#b08c6a' : '#c9b79c'}
              strokeWidth={isWhole ? '1.5' : '1'}
            />
          )
        })}
      </svg>

      <input
        type="range"
        min={MIN}
        max={MAX}
        step={0.5}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="focus-slider"
        aria-label="Rating slider"
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        aria-valuenow={value}
      />
    </div>
  )
}
```

- [ ] **Step 4: Run — verify all pass**

```bash
npm run test:run -- src/__tests__/RatingSlider.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/RatingSlider.tsx src/__tests__/RatingSlider.test.tsx
git commit -m "feat: add RatingSlider with 0.5-step increments and word labels"
```

---

### Task 12: DistractionTags component

**Files:**
- Create: `src/components/DistractionTags.tsx`
- Create: `src/__tests__/DistractionTags.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/DistractionTags.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DistractionTags } from '@/components/DistractionTags'
import type { DistractionTag } from '@/lib/types'

const TAGS: DistractionTag[] = [
  { id: '1', user_id: 'u', name: 'Phone', created_at: '' },
  { id: '2', user_id: 'u', name: 'Noise', created_at: '' },
]

describe('DistractionTags', () => {
  it('renders all tags as buttons', () => {
    render(<DistractionTags tags={TAGS} selected={[]} onToggle={() => {}} onAdd={() => {}} />)
    expect(screen.getByText('Phone')).toBeInTheDocument()
    expect(screen.getByText('Noise')).toBeInTheDocument()
  })

  it('applies filled style to selected tags', () => {
    render(<DistractionTags tags={TAGS} selected={['1']} onToggle={() => {}} onAdd={() => {}} />)
    const phonePill = screen.getByText('Phone').closest('button')!
    expect(phonePill).toHaveClass('bg-coral-light')
    const noisePill = screen.getByText('Noise').closest('button')!
    expect(noisePill).not.toHaveClass('bg-coral-light')
  })

  it('calls onToggle with the tag id when a pill is clicked', async () => {
    const onToggle = vi.fn()
    render(<DistractionTags tags={TAGS} selected={[]} onToggle={onToggle} onAdd={() => {}} />)
    await userEvent.click(screen.getByText('Phone'))
    expect(onToggle).toHaveBeenCalledWith('1')
  })

  it('shows an add input when "+ add" is clicked', async () => {
    render(<DistractionTags tags={TAGS} selected={[]} onToggle={() => {}} onAdd={() => {}} />)
    await userEvent.click(screen.getByText('+ add'))
    expect(screen.getByPlaceholderText(/add a tag/i)).toBeInTheDocument()
  })

  it('calls onAdd with the typed name when Enter is pressed', async () => {
    const onAdd = vi.fn()
    render(<DistractionTags tags={TAGS} selected={[]} onToggle={() => {}} onAdd={onAdd} />)
    await userEvent.click(screen.getByText('+ add'))
    await userEvent.type(screen.getByPlaceholderText(/add a tag/i), 'Boredom{Enter}')
    expect(onAdd).toHaveBeenCalledWith('Boredom')
  })
})
```

- [ ] **Step 2: Run — verify they fail**

```bash
npm run test:run -- src/__tests__/DistractionTags.test.tsx
```

Expected: FAIL with "Cannot find module '@/components/DistractionTags'"

- [ ] **Step 3: Create `src/components/DistractionTags.tsx`**

```tsx
'use client'
import { useState } from 'react'
import type { DistractionTag } from '@/lib/types'

interface DistractionTagsProps {
  tags: DistractionTag[]
  selected: string[]
  onToggle: (tagId: string) => void
  onAdd: (name: string) => void
}

export function DistractionTags({ tags, selected, onToggle, onAdd }: DistractionTagsProps) {
  const [adding, setAdding] = useState(false)
  const [newTag, setNewTag] = useState('')

  const commitAdd = () => {
    const name = newTag.trim()
    if (name) onAdd(name)
    setNewTag('')
    setAdding(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitAdd()
    if (e.key === 'Escape') { setNewTag(''); setAdding(false) }
  }

  return (
    <div>
      <p className="font-sans text-sm text-text-muted mb-3">What pulled your focus</p>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => {
          const isSelected = selected.includes(tag.id)
          return (
            <button
              key={tag.id}
              onClick={() => onToggle(tag.id)}
              className={`px-3 py-1.5 rounded-pill text-sm font-sans border-[1.5px] transition-colors ${
                isSelected
                  ? 'bg-coral-light border-coral text-tag-text'
                  : 'bg-transparent border-border-warm text-text-muted'
              }`}
            >
              {tag.name}
            </button>
          )
        })}

        {adding ? (
          <input
            autoFocus
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commitAdd}
            placeholder="Add a tag"
            className="px-3 py-1.5 rounded-pill text-sm font-sans border-[1.5px] border-coral bg-transparent text-text-primary placeholder:text-text-light focus:outline-none w-28"
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="px-3 py-1.5 rounded-pill text-sm font-sans border-[1.5px] border-dashed border-border-warm text-text-muted"
          >
            + add
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run — verify all pass**

```bash
npm run test:run -- src/__tests__/DistractionTags.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/DistractionTags.tsx src/__tests__/DistractionTags.test.tsx
git commit -m "feat: add DistractionTags — pill multi-select with inline custom tag creation"
```

---

### Task 13: Rating screen + session save

**Files:**
- Create: `src/app/rate/page.tsx`

- [ ] **Step 1: Create `src/app/rate/page.tsx`**

```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { loadSession, clearSession } from '@/lib/session-state'
import { createClient } from '@/lib/supabase/client'
import { RatingSlider } from '@/components/RatingSlider'
import { DistractionTags } from '@/components/DistractionTags'
import { AccountNudge } from '@/components/AccountNudge'
import { getNotePlaceholder } from '@/lib/timer'
import type { InProgressSession } from '@/lib/session-state'
import type { DistractionTag } from '@/lib/types'

export default function RatePage() {
  const router = useRouter()
  const [session, setSession] = useState<InProgressSession | null>(null)
  const [rating, setRating] = useState(3.0)
  const [notes, setNotes] = useState('')
  const [sessionName, setSessionName] = useState('')
  const [goalText, setGoalText] = useState('')
  const [tags, setTags] = useState<DistractionTag[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [savedSessionCount, setSavedSessionCount] = useState<number | null>(null)

  const supabase = createClient()

  useEffect(() => {
    const s = loadSession()
    if (!s) { router.replace('/setup'); return }
    setSession(s)
    if (s.setupFocusText) setSessionName(s.setupFocusText)

    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return
      supabase
        .from('distraction_tags')
        .select('*')
        .order('created_at')
        .then(({ data: t }) => setTags(t ?? []))
    })
  }, [])

  const handleToggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    )
  }

  const handleAddTag = async (name: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: newTag } = await supabase
      .from('distraction_tags')
      .insert({ user_id: user.id, name })
      .select()
      .single()
    if (newTag) {
      setTags((prev) => [...prev, newTag])
      setSelectedTagIds((prev) => [...prev, newTag.id])
    }
  }

  const handleSave = async () => {
    if (!session) return
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    // If no goal/category was set at setup and user typed a name here, create a goal
    let goalId = session.goalId
    let categoryId = session.categoryId
    if (!goalId && !categoryId && goalText.trim()) {
      const { data: newGoal } = await supabase
        .from('goals')
        .insert({ user_id: user.id, name: goalText.trim() })
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
        session_name: sessionName.trim() || null,
        planned_duration_minutes: session.plannedDurationMinutes,
        actual_duration_minutes: session.actualDurationMinutes ?? session.plannedDurationMinutes,
        started_at: session.startedAt,
        ended_at: new Date().toISOString(),
        rating,
        notes: notes.trim() || null,
        end_reason: session.endReason,
      })
      .select()
      .single()

    if (error || !saved) { setSaving(false); return }

    if (selectedTagIds.length > 0) {
      await supabase.from('session_distraction_tags').insert(
        selectedTagIds.map((tag_id) => ({ session_id: saved.id, tag_id }))
      )
    }

    // Update per-goal last-used duration
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
      setSavedSessionCount(c)
    } else {
      router.push('/setup')
    }
  }

  if (!session) return null

  const needsGoal = !session.goalId && !session.categoryId

  return (
    <main className="min-h-screen bg-cream px-6 pt-12 pb-24 max-w-md mx-auto">
      {session.setupFocusText && (
        <p className="font-sans text-base text-text-muted mb-8">{session.setupFocusText}</p>
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

      {/* Notes — placeholder changes based on current rating */}
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

      {/* Optional session name */}
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

      {/* Goal assignment — only shown when session started without selecting a goal */}
      {needsGoal && (
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

      {savedSessionCount !== null && (
        <AccountNudge
          sessionCount={savedSessionCount}
          onDismiss={() => router.push('/setup')}
        />
      )}
    </main>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/rate/page.tsx
git commit -m "feat: add rating screen — slider, tags, notes, Supabase session save"
```

---

### Task 14: Account nudge component

**Files:**
- Create: `src/components/AccountNudge.tsx`

- [ ] **Step 1: Create `src/components/AccountNudge.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface AccountNudgeProps {
  sessionCount: number
  onDismiss: () => void
}

export function AccountNudge({ sessionCount, onDismiss }: AccountNudgeProps) {
  const router = useRouter()
  const supabase = createClient()
  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async () => {
    setSaving(true)
    setError('')
    const { error: err } = await supabase.auth.updateUser({ email, password })
    if (err) {
      setError(err.message)
      setSaving(false)
    } else {
      router.push('/setup')
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-cream border-t border-border-warm px-6 py-5 shadow-sm">
      <div className="max-w-md mx-auto relative">
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="absolute top-0 right-0 text-text-light text-2xl leading-none"
        >
          ×
        </button>

        <p className="font-sans text-sm text-text-primary mb-1">
          You've logged{' '}
          <strong>{sessionCount} session{sessionCount !== 1 ? 's' : ''}</strong> so far.
        </p>
        <p className="font-sans text-sm text-text-muted mb-4">
          Create an account so you don't lose this if you switch devices or clear your browser.
        </p>

        {!showForm ? (
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowForm(true)}
              className="flex-1 bg-coral text-white font-sans font-medium py-2.5 rounded-pill text-sm"
            >
              Create account
            </button>
            <button
              onClick={onDismiss}
              className="font-sans text-sm text-text-muted"
            >
              Not now
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full bg-transparent border-b border-border-warm pb-1 font-sans text-sm text-text-primary placeholder:text-text-light focus:outline-none focus:border-coral"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full bg-transparent border-b border-border-warm pb-1 font-sans text-sm text-text-primary placeholder:text-text-light focus:outline-none focus:border-coral"
            />
            {error && <p className="text-xs text-red-500 font-sans">{error}</p>}
            <button
              onClick={handleCreate}
              disabled={saving || !email || !password}
              className="bg-coral text-white font-sans font-medium py-2.5 rounded-pill text-sm disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Create account'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/AccountNudge.tsx
git commit -m "feat: add account-save nudge — appears after session 1 and every 5th session"
```

---

### Task 15: Full test suite + end-to-end smoke test

**Files:** none new — verification only

- [ ] **Step 1: Run the complete test suite**

```bash
npm run test:run
```

Expected output: all tests PASS. Count should be > 20 tests across timer, DurationPicker, RatingSlider, DistractionTags suites.

- [ ] **Step 2: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 3: Walk the happy path (Done clicked before timer ends)**

1. Open http://localhost:3000 — redirects to /setup
2. Type "Finish thermodynamics ch. 1" in the focus field
3. Set duration to 1 minute using the slider or by clicking the number and typing
4. Click "Start focus session" — /timer loads with countdown and your focus text
5. Click "I'm done" before 0:00 — /rate loads
6. Drag the rating slider — word label ("Rough", "Okay", etc.) updates; note placeholder changes
7. Toggle 2–3 distraction tags — they should fill with coral background
8. Add a custom tag: click "+ add", type "Boredom", press Enter — appears as selected
9. Type a note
10. Click "Save session"
11. Check Supabase Dashboard → Table Editor → sessions — a row should be there with rating, notes, and ended_at
12. After saving session #1, the account nudge should slide up from the bottom

- [ ] **Step 4: Walk the expired-timer path**

1. Go to /setup, set 1 minute, click Start
2. Wait for the countdown to reach 0:00
3. Wait an additional 10 seconds, then click "I'm done" — /end should load
4. Select "I was still deep in focus — didn't notice" — the follow-up input appears
5. Type a number (e.g. 3)
6. Click Continue — /rate loads
7. Save — check Supabase: `end_reason` should be "still_focused", `actual_duration_minutes` should be 3

- [ ] **Step 5: Verify distraction tag seeding**

In Supabase Dashboard → Table Editor → distraction_tags, filter by your user_id. You should see the 11 default tags (Phone, Social media, etc.) that were seeded by the trigger.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete Foundation + Core Timer Flow — all screens working end-to-end"
```

---

## Next Steps (separate plans)

- **Plan 2 — Home + History:** Home screen with "Today's plan" / "pick up where you left off", goal detail view, session detail + edit, search, all goals list
- **Plan 3 — Profile + Analytics:** Line chart (Day/Week/Month toggle, clickable points), heatmap (GitHub-style, 5-tier coral scale, tap to write period notes), CSV export
- **Plan 4 — Account + Settings:** Settings page, scheduled goals (recurring weekday picker), tag management, account upgrade flow, "delete account" danger zone
