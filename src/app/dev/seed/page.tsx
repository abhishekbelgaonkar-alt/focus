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
    name: 'Final-year research project',
    color: '#7c3aed',
    sessions: [
      {
        name: 'Lit review — antibiotic stewardship',
        durationMin: 60, rating: 4.0, daysAgo: 1, hour: 9,
        notes: 'Found two useful Cochrane reviews. Bibliography now ~40 sources — need to filter.',
        tasks: [
          { name: 'Skim Cochrane 2022 review', completed: true, rating: 4 },
          { name: 'Read Turner et al. NEJM', completed: true, rating: 4 },
          { name: 'Update Zotero collection', completed: false },
        ],
      },
      {
        name: 'Ethics application — draft',
        durationMin: 75, rating: 3.5, daysAgo: 2, hour: 14,
        notes: 'REC form is long. Confidentiality section done; still need consent form appendix.',
        tasks: [
          { name: 'Fill risk assessment', completed: true, rating: 4 },
          { name: 'Draft participant info sheet', completed: true, rating: 3 },
          { name: 'Consent form appendix', completed: false },
          { name: 'Send to supervisor for review', completed: false },
        ],
        distractions: ['Phone', 'Slack/chat'],
      },
      {
        name: 'Methodology section',
        durationMin: 80, rating: 4.5, daysAgo: 4, hour: 10,
        notes: 'Locked in. Got the study design flowchart drawn in Lucidchart — supervisor will love it.',
        tasks: [
          { name: 'Study design flowchart', completed: true, rating: 5 },
          { name: 'Sample size justification', completed: true, rating: 4 },
          { name: 'Statistical analysis plan', completed: true, rating: 4 },
        ],
      },
      { name: 'Zotero cleanup', durationMin: 30, rating: 3.0, daysAgo: 6, hour: 16, distractions: ['Email'] },
      {
        name: 'Supervisor meeting prep', durationMin: 25, rating: 4.0, daysAgo: 7, hour: 11,
        tasks: [
          { name: 'Print latest draft', completed: true, rating: 4 },
          { name: 'List of blockers', completed: true, rating: 5 },
          { name: 'Questions for Dr. Murphy', completed: true, rating: 4 },
        ],
      },
      { name: 'Data extraction template', durationMin: 45, rating: 3.5, daysAgo: 10, hour: 15 },
      {
        name: 'Intro chapter — first pass', durationMin: 65, rating: 2.5, daysAgo: 12, hour: 20,
        notes: 'Kept losing focus. Should not write chapters after 8pm — brain is fried after clinic.',
        distractions: ['Phone', 'Tiredness', 'Social media'],
      },
      { name: 'Read Prof. Kelly’s papers', durationMin: 50, rating: 4.0, daysAgo: 15, hour: 10 },
      { name: 'Discussion outline', durationMin: 40, rating: 3.5, daysAgo: 18 },
      { name: 'PICO framework brainstorm', durationMin: 35, rating: 4.5, daysAgo: 22 },
    ],
  },
  {
    name: 'OSCE prep',
    color: '#d9642e',
    schedule: ['mon', 'wed', 'fri'],
    sessions: [
      {
        name: 'Cardiovascular history-taking',
        durationMin: 45, rating: 5.0, daysAgo: 0, hour: 15,
        notes: 'Nailed the SOCRATES pain history. Confidence going up.',
        tasks: [
          { name: 'Presenting complaint', completed: true, rating: 5 },
          { name: 'SOCRATES pain history', completed: true, rating: 5 },
          { name: 'NYHA class questions', completed: true, rating: 4 },
          { name: 'ICE — ideas / concerns / expectations', completed: true, rating: 5 },
        ],
      },
      {
        name: 'Respiratory exam — practice partner',
        durationMin: 30, rating: 4.0, daysAgo: 1, hour: 17,
        tasks: [
          { name: 'Inspection', completed: true, rating: 4 },
          { name: 'Palpation + expansion', completed: true, rating: 4 },
          { name: 'Percussion sequence', completed: true, rating: 3 },
          { name: 'Auscultation — bases → apices', completed: false },
        ],
      },
      { name: 'Cranial nerves examination', durationMin: 60, rating: 3.5, daysAgo: 3, hour: 13, distractions: ['Slack/chat', 'Meeting'], notes: 'Kept forgetting to test corneal reflex. Anki cards created.' },
      { name: 'Breaking bad news scenario', durationMin: 40, rating: 4.0, daysAgo: 5 },
      {
        name: 'Neurological exam — lower limbs',
        durationMin: 35, rating: 3.0, daysAgo: 8, hour: 11,
        notes: 'Sensory testing is still shaky. Need to review dermatomes tonight.',
        distractions: ['Task felt too hard'],
      },
      { name: 'Abdominal exam drill', durationMin: 45, rating: 3.5, daysAgo: 11 },
      { name: 'Consultation skills — angry patient', durationMin: 30, rating: 4.5, daysAgo: 14, notes: 'The empathy framework really helped.' },
      { name: 'Peripheral vascular exam', durationMin: 40, rating: 4.0, daysAgo: 17 },
    ],
  },
  {
    name: 'Pharmacology revision',
    color: '#16a34a',
    schedule: ['tue', 'thu', 'sun'],
    sessions: [
      { name: 'Anki — antihypertensives', durationMin: 25, rating: 3.5, daysAgo: 0, hour: 8 },
      { name: 'Anki — antibiotics', durationMin: 30, rating: 4.0, daysAgo: 1, hour: 8 },
      { name: 'Anki — analgesics', durationMin: 20, rating: 3.0, daysAgo: 2, hour: 8, distractions: ['Tiredness'] },
      {
        name: 'BNF chapter 2 — CV drugs',
        durationMin: 45, rating: 4.5, daysAgo: 3, hour: 19,
        tasks: [
          { name: 'Beta blockers — MOA + SE', completed: true, rating: 5 },
          { name: 'ACE inhibitors — indications', completed: true, rating: 4 },
          { name: 'Diuretics — loops vs thiazides', completed: true, rating: 4 },
          { name: 'Calcium channel blockers', completed: false },
        ],
      },
      { name: 'Anki — antihypertensives', durationMin: 25, rating: 4.0, daysAgo: 4, hour: 8 },
      {
        name: 'Insulin regimens — group study',
        durationMin: 60, rating: 5.0, daysAgo: 7, hour: 18,
        notes: 'Explaining basal-bolus to Emma really solidified it for me. Feynman technique works.',
      },
      { name: 'Anki — endocrine drugs', durationMin: 25, rating: 3.5, daysAgo: 8, hour: 8 },
      { name: 'BNF — antipsychotics deep-dive', durationMin: 40, rating: 3.0, daysAgo: 10, hour: 20, distractions: ['Phone', 'Task felt too hard'] },
      { name: 'Anki — GI pharmacology', durationMin: 20, rating: 3.5, daysAgo: 12, hour: 8 },
      { name: 'Warfarin & INR — worked examples', durationMin: 35, rating: 4.0, daysAgo: 14, hour: 9 },
      { name: 'Anki reviews (mixed)', durationMin: 15, rating: 3.0, daysAgo: 16 },
      { name: 'Prescribing safety — MCQs', durationMin: 30, rating: 4.5, daysAgo: 20 },
    ],
  },
  {
    name: 'Surgery rotation — St James’s',
    color: '#0d9488',
    schedule: ['tue', 'thu', 'sat'],
    sessions: [
      {
        name: 'Ward round prep — Prof. O’Sullivan',
        durationMin: 30, rating: 3.5, daysAgo: 1, hour: 7,
        tasks: [
          { name: 'Read Mr. K’s notes (bed 4)', completed: true, rating: 4 },
          { name: 'Check morning bloods', completed: true, rating: 3 },
          { name: 'Prep short SBAR for each patient', completed: false },
        ],
      },
      { name: 'Case write-up: 72M post-cholecystectomy', durationMin: 55, rating: 4.0, daysAgo: 3, hour: 20, notes: 'Complicated post-op recovery. Good learning case.' },
      { name: 'Suturing skills lab', durationMin: 45, rating: 2.5, daysAgo: 5, hour: 14, distractions: ['Physical discomfort', 'Tiredness'], notes: 'Interrupted sutures are harder than they look. Fingers cramped by the end.' },
      {
        name: 'Reflective portfolio entry',
        durationMin: 40, rating: 4.5, daysAgo: 8,
        notes: 'Wrote up the difficult conversation on Tuesday. Gibbs reflective cycle format.',
        tasks: [
          { name: 'Describe the event', completed: true, rating: 5 },
          { name: 'Feelings', completed: true, rating: 4 },
          { name: 'Evaluation + analysis', completed: true, rating: 4 },
          { name: 'Action plan', completed: true, rating: 5 },
        ],
      },
      { name: 'Ward round prep', durationMin: 25, rating: 3.5, daysAgo: 11, distractions: ['Phone'] },
      { name: 'Theatre observation notes', durationMin: 35, rating: 4.0, daysAgo: 15 },
      { name: 'Surgical anatomy — abdomen', durationMin: 45, rating: 3.0, daysAgo: 19 },
    ],
  },
  {
    name: 'MCQ practice bank',
    color: '#db2777',
    status: 'completed',
    sessions: [
      {
        name: 'PassMed — Endocrinology 50Qs', durationMin: 60, rating: 5.0, daysAgo: 21, hour: 17,
        notes: 'Scored 42/50. Massive improvement from last month. Diabetes chapter clicked.',
        tasks: [
          { name: 'Do 50 questions timed', completed: true, rating: 5 },
          { name: 'Review all wrong answers', completed: true, rating: 5 },
          { name: 'Anki-ify the tricky ones', completed: true, rating: 4 },
        ],
      },
      { name: 'PassMed — Cardiology 40Qs', durationMin: 55, rating: 4.0, daysAgo: 23 },
      { name: 'PassMed — Respiratory 30Qs', durationMin: 35, rating: 3.5, daysAgo: 25 },
      { name: 'PassMed — Renal 40Qs', durationMin: 50, rating: 4.5, daysAgo: 28 },
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
    goalName: 'Final-year research project',
    name: 'Results chapter — first draft',
    plannedMin: 90,
    elapsedSec: 34 * 60,
    tasks: [
      { name: 'Import data tables', completed: true },
      { name: 'Write primary outcome section', completed: true },
      { name: 'Draft subgroup analysis', completed: false },
      { name: 'Add forest plot', completed: false },
    ],
  },
  {
    goalName: 'OSCE prep',
    name: 'GALS screen — timed practice',
    plannedMin: 30,
    elapsedSec: 11 * 60,
    tasks: [
      { name: 'Screening questions', completed: true },
      { name: 'Gait observation', completed: false },
      { name: 'Arms / legs / spine sequence', completed: false },
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
