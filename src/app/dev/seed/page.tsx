'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/*
  Seed a realistic-looking data set into the current user's account so the
  UI looks like a real person's history in screenshots / demos.

  Visit /dev/seed and hit "Wipe & seed" (nukes your existing goals + sessions
  first, then repopulates) or "Add demo data" (keeps your data, adds on top).
*/

interface DemoTask {
  name: string
  completed?: boolean            // default: probability-based
  rating?: number                // whole-number 0-5
}

interface DemoSession {
  name: string
  durationMin: number
  rating: number                 // 1.0 - 5.0 in 0.5 steps
  notes?: string
  daysAgo: number                // when it happened (days ago)
  hour?: number                  // 0-23 hour of day
  tasks?: DemoTask[]
  distractions?: string[]        // subset of the seeded default tag names
}

interface DemoGoal {
  name: string
  color: string
  status?: 'active' | 'completed' | 'abandoned'
  schedule?: ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[]
  sessions: DemoSession[]
}

const DEMO: DemoGoal[] = [
  {
    name: 'Master’s thesis',
    color: '#7c3aed',
    sessions: [
      {
        name: 'Chapter 1 outline',
        durationMin: 45, rating: 4.0, daysAgo: 1, hour: 9,
        notes: 'Got the intro flowing. Need to tighten the thesis statement in a second pass.',
        tasks: [
          { name: 'Draft outline', completed: true, rating: 4 },
          { name: 'Sketch section headers', completed: true, rating: 3 },
          { name: 'List open questions', completed: false },
        ],
      },
      {
        name: 'Lit review — section 2',
        durationMin: 60, rating: 3.5, daysAgo: 2, hour: 14,
        notes: 'Two new sources on the metric. Bibliography growing faster than I expected.',
        tasks: [
          { name: 'Read Smith 2023', completed: true, rating: 4 },
          { name: 'Read Patel 2022', completed: true, rating: 3 },
          { name: 'Update Zotero refs', completed: false },
        ],
        distractions: ['Phone', 'Slack/chat'],
      },
      {
        name: 'Chapter 2 draft',
        durationMin: 75, rating: 4.5, daysAgo: 4, hour: 10,
        notes: 'Really productive block. Framework section came together.',
        tasks: [
          { name: 'Draft framework section', completed: true, rating: 5 },
          { name: 'Draft methodology transitions', completed: true, rating: 4 },
        ],
      },
      { name: 'Reference cleanup', durationMin: 30, rating: 3.0, daysAgo: 6, hour: 16, distractions: ['Email'] },
      {
        name: 'Advisor prep', durationMin: 25, rating: 3.5, daysAgo: 7, hour: 11,
        tasks: [
          { name: 'Summarize progress', completed: true, rating: 4 },
          { name: 'List questions for advisor', completed: true, rating: 4 },
        ],
      },
      { name: 'Chapter 1 revisions', durationMin: 50, rating: 4.0, daysAgo: 10, hour: 9 },
      {
        name: 'Data analysis warm-up', durationMin: 40, rating: 2.5, daysAgo: 12, hour: 20,
        notes: 'Kept getting distracted. Should not do analysis in the evening.',
        distractions: ['Phone', 'Tiredness', 'Social media'],
      },
      { name: 'Chapter 2 outline', durationMin: 35, rating: 4.0, daysAgo: 15, hour: 10 },
      { name: 'Read committee papers', durationMin: 55, rating: 3.5, daysAgo: 18 },
      { name: 'Framework brainstorm', durationMin: 45, rating: 4.5, daysAgo: 22 },
    ],
  },
  {
    name: 'Ship v1',
    color: '#d9642e',
    schedule: ['mon', 'wed', 'fri'],
    sessions: [
      {
        name: 'Onboarding bug fix',
        durationMin: 45, rating: 5.0, daysAgo: 0, hour: 15,
        notes: 'Root-caused it in ten minutes, spent the rest testing edge cases. Locked in.',
        tasks: [
          { name: 'Reproduce locally', completed: true, rating: 5 },
          { name: 'Write test', completed: true, rating: 4 },
          { name: 'Push fix', completed: true, rating: 5 },
        ],
      },
      {
        name: 'Deploy checklist',
        durationMin: 30, rating: 4.0, daysAgo: 1, hour: 17,
        tasks: [
          { name: 'Update changelog', completed: true, rating: 4 },
          { name: 'Rotate secrets', completed: true, rating: 4 },
          { name: 'Announce in Slack', completed: false },
        ],
      },
      { name: 'Refactor auth guard', durationMin: 60, rating: 3.5, daysAgo: 3, hour: 13, distractions: ['Meeting', 'Slack/chat'] },
      { name: 'Error boundary polish', durationMin: 40, rating: 4.0, daysAgo: 5 },
      {
        name: 'Landing copy revisions',
        durationMin: 25, rating: 3.0, daysAgo: 8, hour: 11,
        notes: 'Rewrote the hero three times. None of them feel right yet.',
        distractions: ['Procrastination'],
      },
      { name: 'Pricing table markup', durationMin: 35, rating: 3.5, daysAgo: 11 },
      { name: 'Sentry setup', durationMin: 20, rating: 4.5, daysAgo: 14 },
      { name: 'Migration script review', durationMin: 50, rating: 4.0, daysAgo: 17 },
    ],
  },
  {
    name: 'Learn Spanish',
    color: '#16a34a',
    schedule: ['mon', 'tue', 'wed', 'thu', 'fri'],
    sessions: [
      { name: 'Duolingo daily', durationMin: 20, rating: 3.5, daysAgo: 0, hour: 8 },
      { name: 'Duolingo daily', durationMin: 25, rating: 4.0, daysAgo: 1, hour: 8 },
      { name: 'Duolingo daily', durationMin: 15, rating: 3.0, daysAgo: 2, hour: 8, distractions: ['Tiredness'] },
      { name: 'Vocab drill — food', durationMin: 30, rating: 4.5, daysAgo: 3, hour: 19, tasks: [
        { name: 'Kitchen nouns', completed: true, rating: 4 },
        { name: 'Cooking verbs', completed: true, rating: 5 },
        { name: 'Restaurant phrases', completed: false },
      ] },
      { name: 'Duolingo daily', durationMin: 25, rating: 4.0, daysAgo: 4, hour: 8 },
      { name: 'Conversation w/ tutor', durationMin: 45, rating: 5.0, daysAgo: 7, hour: 18, notes: 'Kept up with the whole session in Spanish. Small breakthrough.' },
      { name: 'Duolingo daily', durationMin: 20, rating: 3.5, daysAgo: 8, hour: 8 },
      { name: 'Grammar — preterite', durationMin: 35, rating: 3.0, daysAgo: 10, hour: 20, distractions: ['Phone', 'Task felt too hard'] },
      { name: 'Duolingo daily', durationMin: 20, rating: 3.5, daysAgo: 12, hour: 8 },
      { name: 'Podcast: Notes in Spanish', durationMin: 30, rating: 4.0, daysAgo: 14, hour: 9 },
      { name: 'Duolingo daily', durationMin: 15, rating: 3.0, daysAgo: 16 },
      { name: 'Vocab drill — travel', durationMin: 25, rating: 4.5, daysAgo: 20 },
    ],
  },
  {
    name: 'Practice guitar',
    color: '#0d9488',
    schedule: ['tue', 'thu', 'sat'],
    sessions: [
      {
        name: 'Chord changes — G/C/D',
        durationMin: 30, rating: 3.5, daysAgo: 1, hour: 21,
        tasks: [
          { name: 'Slow metronome', completed: true, rating: 4 },
          { name: 'Speed up 10bpm', completed: true, rating: 3 },
          { name: 'Play through Blackbird', completed: false },
        ],
      },
      { name: 'Fingerpicking pattern', durationMin: 40, rating: 4.0, daysAgo: 3, hour: 20, notes: 'Left hand is starting to feel less clumsy.' },
      { name: 'Scales warmup', durationMin: 15, rating: 2.5, daysAgo: 5, hour: 22, distractions: ['Tiredness', 'Physical discomfort'] },
      { name: 'Learn Landslide intro', durationMin: 45, rating: 4.5, daysAgo: 8 },
      { name: 'Chord changes drill', durationMin: 25, rating: 3.5, daysAgo: 11, distractions: ['Phone'] },
      { name: 'Metronome practice', durationMin: 20, rating: 3.0, daysAgo: 15 },
      { name: 'Full song — Blackbird', durationMin: 35, rating: 4.0, daysAgo: 19 },
    ],
  },
  {
    name: 'Portfolio site',
    color: '#db2777',
    status: 'completed',
    sessions: [
      {
        name: 'Deploy to Vercel', durationMin: 20, rating: 5.0, daysAgo: 21, hour: 17,
        notes: 'Live! Domain propagated within a few minutes.',
        tasks: [
          { name: 'Configure vercel.json', completed: true, rating: 5 },
          { name: 'Set env vars', completed: true, rating: 5 },
          { name: 'Test prod URL', completed: true, rating: 5 },
        ],
      },
      { name: 'Case study writing', durationMin: 55, rating: 4.0, daysAgo: 23 },
      { name: 'SEO audit', durationMin: 25, rating: 3.5, daysAgo: 25 },
      { name: 'Header component polish', durationMin: 45, rating: 4.5, daysAgo: 28 },
    ],
  },
]

// In-progress (saved-for-later) sessions the seed also creates.
const DEMO_IN_PROGRESS: {
  goalName: string
  name: string
  plannedMin: number
  elapsedSec: number
  tasks: { name: string; completed: boolean }[]
}[] = [
  {
    goalName: 'Master’s thesis',
    name: 'Chapter 3 methodology',
    plannedMin: 60,
    elapsedSec: 22 * 60,
    tasks: [
      { name: 'Draft methodology intro', completed: true },
      { name: 'Explain sample selection', completed: false },
      { name: 'Add stats table', completed: false },
    ],
  },
  {
    goalName: 'Ship v1',
    name: 'Rewrite pricing page',
    plannedMin: 45,
    elapsedSec: 12 * 60,
    tasks: [
      { name: 'Draft new copy', completed: true },
      { name: 'Update markup', completed: false },
    ],
  },
]

// ---------------------------------------------------------------------------

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function isoDaysAgo(days: number, hour = 10, minute = 15) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

export default function SeedDemoPage() {
  const router = useRouter()
  const supabase = createClient()
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [logLines, setLogLines] = useState<string[]>([])
  const log = (line: string) => setLogLines((prev) => [...prev, line])

  const runSeed = async (wipe: boolean) => {
    setBusy(true)
    setStatus('Starting…')
    setLogLines([])
    try {
      const { data: userData } = await supabase.auth.getUser()
      const user = userData?.user
      if (!user) { setStatus('Not signed in.'); return }

      if (wipe) {
        log('Wiping existing goals + sessions…')
        // ON DELETE CASCADE handles session_tasks + session_distraction_tags.
        // Sessions with no goal (uncategorized) also need deletion.
        await supabase.from('sessions').delete().eq('user_id', user.id)
        await supabase.from('goals').delete().eq('user_id', user.id)
        await supabase.from('period_notes').delete().eq('user_id', user.id)
      }

      // Fetch tags so we can map names → ids for distraction linkage.
      const { data: tags } = await supabase
        .from('distraction_tags')
        .select('id, name')
        .eq('user_id', user.id)
      const tagIdByName = new Map<string, string>()
      for (const t of (tags ?? []) as { id: string; name: string }[]) {
        tagIdByName.set(t.name, t.id)
      }

      // Create goals
      log(`Creating ${DEMO.length} goals…`)
      const goalIdByName = new Map<string, string>()
      for (const g of DEMO) {
        const { data: goalRow, error } = await supabase
          .from('goals')
          .insert({
            user_id: user.id,
            name: g.name,
            color: g.color,
            status: g.status ?? 'active',
            schedule: g.schedule ?? null,
          })
          .select('id')
          .single()
        if (error || !goalRow) throw new Error(`goal insert: ${error?.message}`)
        goalIdByName.set(g.name, goalRow.id)
      }

      // Create sessions + tasks + distractions
      let sessionCount = 0
      let taskCount = 0
      for (const g of DEMO) {
        const goalId = goalIdByName.get(g.name)!
        for (const s of g.sessions) {
          const startedAt = isoDaysAgo(s.daysAgo, s.hour ?? 10, 0)
          const endedAt = isoDaysAgo(s.daysAgo, s.hour ?? 10, s.durationMin)
          const { data: sessionRow, error } = await supabase
            .from('sessions')
            .insert({
              user_id: user.id,
              goal_id: goalId,
              category_id: null,
              session_name: s.name,
              planned_duration_minutes: s.durationMin,
              actual_duration_minutes: s.durationMin,
              started_at: startedAt,
              ended_at: endedAt,
              rating: s.rating,
              notes: s.notes ?? null,
              end_reason: 'on_time',
              status: 'completed',
              elapsed_seconds: null,
            })
            .select('id')
            .single()
          if (error || !sessionRow) throw new Error(`session insert: ${error?.message}`)
          sessionCount++

          if (s.tasks && s.tasks.length > 0) {
            let cumSec = 0
            const rows = s.tasks.map((t, i) => {
              const share = Math.round((s.durationMin * 60) / s.tasks!.length)
              cumSec += share
              return {
                session_id: sessionRow.id,
                name: t.name,
                position: i,
                completed_at: t.completed ? endedAt : null,
                duration_seconds: t.completed ? share : null,
                rating: t.rating ?? null,
              }
            })
            await supabase.from('session_tasks').insert(rows)
            taskCount += rows.length
          }

          if (s.distractions && s.distractions.length > 0) {
            const links = s.distractions
              .map((n) => tagIdByName.get(n))
              .filter((id): id is string => !!id)
              .map((id) => ({ session_id: sessionRow.id, tag_id: id }))
            if (links.length > 0) {
              await supabase.from('session_distraction_tags').insert(links)
            }
          }
        }
      }
      log(`Created ${sessionCount} sessions, ${taskCount} tasks.`)

      // In-progress sessions
      log(`Creating ${DEMO_IN_PROGRESS.length} in-progress sessions…`)
      for (const ip of DEMO_IN_PROGRESS) {
        const goalId = goalIdByName.get(ip.goalName)!
        const startedAt = isoDaysAgo(0, 8, 0)
        const { data: sRow } = await supabase
          .from('sessions')
          .insert({
            user_id: user.id,
            goal_id: goalId,
            category_id: null,
            session_name: ip.name,
            planned_duration_minutes: ip.plannedMin,
            actual_duration_minutes: null,
            started_at: startedAt,
            ended_at: null,
            rating: null,
            notes: null,
            end_reason: null,
            status: 'in_progress',
            elapsed_seconds: ip.elapsedSec,
          })
          .select('id')
          .single()
        if (sRow) {
          await supabase.from('session_tasks').insert(
            ip.tasks.map((t, i) => ({
              session_id: sRow.id,
              name: t.name,
              position: i,
              completed_at: t.completed ? new Date().toISOString() : null,
              duration_seconds: t.completed ? Math.round(ip.elapsedSec / ip.tasks.length) : null,
              rating: null,
            }))
          )
        }
      }

      await delay(200)
      setStatus('Seed complete. Head back to the home page and refresh.')
      log('Done.')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setStatus(`Failed: ${msg}`)
      log(`Error: ${msg}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-cream px-6 pt-12 pb-10 max-w-md mx-auto">
      <button
        onClick={() => router.push('/')}
        className="font-sans text-sm text-text-muted mb-6"
      >
        ← Back
      </button>
      <h1 className="font-sans text-xl font-medium text-text-primary mb-2">Seed demo data</h1>
      <p className="font-sans text-sm text-text-muted mb-8 leading-relaxed">
        Populates your account with a realistic set of goals, sessions, tasks
        and distractions so the UI looks like a real user&apos;s history.
        Use for screenshots and demos.
      </p>

      <div className="flex flex-col gap-3 mb-8">
        <button
          onClick={() => runSeed(true)}
          disabled={busy}
          className="w-full bg-coral text-white font-sans font-medium py-3 rounded-pill disabled:opacity-50"
        >
          {busy ? 'Working…' : 'Wipe & seed fresh'}
        </button>
        <button
          onClick={() => runSeed(false)}
          disabled={busy}
          className="w-full border-[1.5px] border-coral text-coral font-sans font-medium py-3 rounded-pill disabled:opacity-50"
        >
          {busy ? 'Working…' : 'Add on top of existing data'}
        </button>
      </div>

      {status && (
        <p className="font-sans text-sm text-text-primary mb-4">{status}</p>
      )}
      {logLines.length > 0 && (
        <div className="bg-coral-light/30 border border-border-warm rounded-xl p-3 font-mono text-xs text-text-muted space-y-1">
          {logLines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
    </main>
  )
}
