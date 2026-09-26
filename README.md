# Tokiroom

A quiet space for focused work. Set a timer, do the work, leave. Sessions can
be grouped under goals, broken into tasks, and shared with friends in rooms.
Accounts are anonymous by default; attaching an email is optional.

Built with Next.js (App Router) and Supabase (Postgres, anonymous auth, RLS,
Realtime). Everything runs client-side against Supabase; there is no custom
backend.

## Quick start

Prereqs: Node 20+, a Supabase project.

```bash
git clone https://github.com/abhishekbelgaonkar-alt/focus.git
cd focus
npm install --legacy-peer-deps
cp .env.example .env.local
```

Fill in `.env.local` from **Supabase Dashboard → Settings → API**:

```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

## Supabase setup

1. **Apply every file in `supabase/migrations/`** in filename order
   (Dashboard → SQL Editor). Each file builds on the previous ones.
2. **Enable anonymous sign-ins**: Dashboard → Authentication → Providers →
   Anonymous Sign-ins.

## Run

```bash
npm run dev        # http://localhost:3000
npm run test:run   # Vitest
npx tsc --noEmit   # type check
npm run build      # production build
```

Rooms and friends need two separate users to test. Use a regular window plus
an incognito window; tabs in the same browser share one account.

## Structure

```
src/
├── app/          # routes: home, timer, rate, rooms (/r/[code]), goals,
│                 # sessions, history, profile, settings, invites
├── components/   # shared UI
├── lib/          # timer/room/task math, formatting, stats, Supabase client, types
└── __tests__/    # Vitest suites
supabase/migrations/   # schema, RLS policies, RPC functions
docs/design/           # design notes
```

## Deploy

```bash
vercel
```

Set the two `NEXT_PUBLIC_SUPABASE_*` env vars in the Vercel project settings.
