# Focus

Personal focus-session tracker with anonymous auth. Set a timer, work, rate the session, tag distractions, build a visual history over time. Nothing is ever mandatory — everything optional is gently encouraged.

Built with Next.js (App Router) + Supabase (Postgres + anonymous auth).

## Quick start

Prereqs: Node 20+, a Supabase project.

```bash
git clone https://github.com/abhishekbelgaonkar-alt/focus.git
cd focus
npm install --legacy-peer-deps
cp .env.example .env.local
```

Then fill in `.env.local` with values from **Supabase Dashboard → Settings → API**:

```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

## Supabase setup (one-time)

1. **Apply the migrations** — in Supabase Dashboard → SQL Editor, run each file in order:
   - `supabase/migrations/20260907000000_initial_schema.sql` — tables + RLS + tag-seeding trigger
   - `supabase/migrations/20260908000000_goal_stats_fn.sql` — aggregated goal stats RPC
   - `supabase/migrations/20260908000001_delete_user_fn.sql` — account self-deletion RPC

2. **Enable Anonymous Sign-ins** — Dashboard → Authentication → Providers → Anonymous Sign-ins → toggle **Enable**.

## Run

```bash
npm run dev        # http://localhost:3000
npm run test:run   # 95 tests
npm run build      # production build
```

## Structure

```
src/
├── app/          # Next.js routes (setup, timer, end, rate, goals, sessions, search, profile, settings)
├── components/   # RatingForm, DurationPicker, RatingSlider, DistractionTags, WeekdayPicker, charts, etc.
├── lib/          # timer math, session-state, format, stats, Supabase clients, types
└── __tests__/    # Vitest suites
docs/superpowers/plans/  # implementation plans (Plans 1–4)
supabase/migrations/     # Postgres schema and RPC functions
```

## Deploy

```bash
vercel
```

Set the two `NEXT_PUBLIC_SUPABASE_*` env vars in your Vercel project settings.

## Spec

See `spec.md` for the full product specification.
