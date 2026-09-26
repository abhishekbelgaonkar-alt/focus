'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DurationPicker } from '@/components/DurationPicker'
import { WeekdayPicker } from '@/components/WeekdayPicker'
import type { Weekday } from '@/lib/types'

interface GoalOption { id: string; name: string; color: string | null }

export default function NewTemplatePage() {
  const router = useRouter()
  const supabase = createClient()

  const [name, setName] = useState('')
  const [duration, setDuration] = useState(25)
  const [goalId, setGoalId] = useState<string | null>(null)
  const [goals, setGoals] = useState<GoalOption[]>([])
  const [taskInput, setTaskInput] = useState('')
  const [tasks, setTasks] = useState<string[]>([])
  const [schedule, setSchedule] = useState<Weekday[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData?.user) return
      const { data } = await supabase
        .from('goals')
        .select('id, name, color')
        .eq('user_id', userData.user.id)
        .order('name')
      setGoals((data ?? []) as GoalOption[])
    })()
  }, [])

  const addTask = () => {
    const n = taskInput.trim()
    if (!n) return
    setTasks((prev) => [...prev, n])
    setTaskInput('')
  }
  const removeTask = (i: number) => setTasks((prev) => prev.filter((_, idx) => idx !== i))

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) { setSaving(false); return }
    const { error } = await supabase.from('session_templates').insert({
      user_id: userData.user.id,
      goal_id: goalId,
      name: name.trim(),
      planned_duration_minutes: duration,
      tasks: tasks.map((n) => ({ name: n })),
      schedule: schedule.length > 0 ? schedule : null,
    })
    if (error) {
      console.error('[templates] insert failed', error)
      setSaving(false)
      return
    }
    router.push('/')
  }

  return (
    <main className="min-h-screen bg-cream px-6 pt-12 pb-10 max-w-md mx-auto">
      <button onClick={() => router.back()} className="font-sans text-sm text-text-muted mb-6 block">
        ← Back
      </button>
      <h1 className="font-sans text-xl font-medium text-text-primary mb-2">
        New quick start
      </h1>
      <p className="font-sans text-sm text-text-muted mb-8">
        A saved session recipe. Fill it in once and tap it from the home page to run it again.
      </p>

      {/* Name */}
      <div className="mb-8">
        <label className="block font-sans text-sm text-text-muted mb-2">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Anki daily"
          className="w-full bg-transparent border-b border-border-warm pb-1 text-text-primary placeholder:text-text-light focus:outline-none focus:border-coral font-sans text-base"
        />
      </div>

      {/* Goal picker */}
      <div className="mb-8">
        <label className="block font-sans text-sm text-text-muted mb-3">
          Goal <span className="text-text-light">(optional)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setGoalId(null)}
            className={`px-3 py-1.5 rounded-pill text-sm font-sans border-[1.5px] ${
              goalId === null ? 'bg-coral-light border-coral text-tag-text' : 'bg-transparent border-border-warm text-text-muted'
            }`}
          >
            None
          </button>
          {goals.map((g) => (
            <button
              key={g.id}
              onClick={() => setGoalId(g.id)}
              className={`px-3 py-1.5 rounded-pill text-sm font-sans border-[1.5px] ${
                goalId === g.id ? 'bg-coral-light border-coral text-tag-text' : 'bg-transparent border-border-warm text-text-muted'
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>
      </div>

      {/* Tasks */}
      <div className="mb-8">
        <label className="block font-sans text-sm text-text-muted mb-2">
          Tasks <span className="text-text-light">(optional)</span>
        </label>
        <p className="font-sans text-xs text-text-light mb-3">
          The tasks below will pre-fill each time you run this. Editable when you start a session.
        </p>
        {tasks.length > 0 && (
          <ol className="flex flex-col mb-3">
            {tasks.map((t, i) => (
              <li
                key={i}
                className="flex items-center gap-3 py-1.5 border-b border-border-warm last:border-0"
              >
                <span className="font-numbers text-xs text-text-light w-4">{i + 1}</span>
                <span className="flex-1 font-sans text-sm text-text-primary">{t}</span>
                <button
                  onClick={() => removeTask(i)}
                  className="font-sans text-lg text-text-light leading-none"
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
        )}
        <input
          value={taskInput}
          onChange={(e) => setTaskInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTask())}
          placeholder="e.g. Antibiotics deck"
          className="w-full bg-transparent border-b border-border-warm pb-1 text-text-primary placeholder:text-text-light focus:outline-none focus:border-coral font-sans text-sm"
        />
      </div>

      {/* Duration */}
      <div className="mb-8">
        <label className="block font-sans text-sm text-text-muted mb-3">Duration</label>
        <DurationPicker value={duration} onChange={setDuration} max={180} />
      </div>

      {/* Schedule */}
      <div className="mb-10">
        <label className="block font-sans text-sm text-text-muted">Schedule <span className="text-text-light">(optional)</span></label>
        <p className="font-sans text-xs text-text-light mb-3 mt-0.5">
          If you pick days, this quick start also shows up in Today&apos;s plan on those days.
        </p>
        <WeekdayPicker selected={schedule} onChange={setSchedule} />
      </div>

      <button
        onClick={handleSave}
        disabled={saving || !name.trim()}
        className="w-full bg-coral text-white font-sans font-medium text-base py-3 rounded-pill disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save quick start'}
      </button>
    </main>
  )
}
