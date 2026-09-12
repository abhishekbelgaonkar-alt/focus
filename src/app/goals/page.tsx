'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatDuration, timeAgo } from '@/lib/format'
import { getGoalColor, GOAL_PALETTE } from '@/lib/goal-color'
import { SearchBar } from '@/components/SearchBar'

interface GoalStat {
  goal_id: string
  name: string
  status: 'active' | 'completed' | 'abandoned'
  color: string | null
  session_count: number
  total_minutes: number
  avg_rating: number | null
  last_session_at: string | null
}

type SortKey = 'recent' | 'time' | 'alpha'
type FilterKey = 'active' | 'completed' | 'abandoned' | 'all'

export default function AllGoalsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [goals, setGoals] = useState<GoalStat[]>([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState<SortKey>('recent')
  const [filter, setFilter] = useState<FilterKey>('active')

  // Row-level edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [colorPickerId, setColorPickerId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // "New goal" form
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const load = async () => {
    const { data } = await supabase.rpc('get_goal_stats')
    setGoals((data ?? []) as GoalStat[])
  }

  useEffect(() => {
    (async () => {
      try { await load() } catch { /* empty state */ }
      finally { setLoading(false) }
    })()
  }, [])

  const visibleGoals = useMemo(() => {
    let list = filter === 'all' ? goals : goals.filter((g) => g.status === filter)
    if (sort === 'recent') {
      list = [...list].sort((a, b) => {
        const at = a.last_session_at ? new Date(a.last_session_at).getTime() : 0
        const bt = b.last_session_at ? new Date(b.last_session_at).getTime() : 0
        return bt - at
      })
    } else if (sort === 'time') {
      list = [...list].sort((a, b) => b.total_minutes - a.total_minutes)
    } else {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name))
    }
    return list
  }, [goals, filter, sort])

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) return
    // Assign a color from the palette based on the current goal count so
    // consecutive new goals cycle through colors.
    const color = GOAL_PALETTE[goals.length % GOAL_PALETTE.length]
    await supabase.from('goals').insert({
      user_id: userData.user.id,
      name,
      color,
    })
    setNewName('')
    setCreating(false)
    await load()
  }

  const handleRename = async (id: string) => {
    const name = editText.trim()
    if (!name) { setEditingId(null); return }
    await supabase.from('goals').update({ name }).eq('id', id)
    setGoals((prev) => prev.map((g) => (g.goal_id === id ? { ...g, name } : g)))
    setEditingId(null)
  }

  const handleDelete = async (id: string) => {
    await supabase.from('goals').delete().eq('id', id)
    setGoals((prev) => prev.filter((g) => g.goal_id !== id))
    setDeletingId(null)
  }

  const handleColorChange = async (id: string, color: string) => {
    await supabase.from('goals').update({ color }).eq('id', id)
    setGoals((prev) => prev.map((g) => (g.goal_id === id ? { ...g, color } : g)))
    setColorPickerId(null)
  }

  if (loading) return null

  return (
    <main className="min-h-screen bg-cream px-6 pt-12 pb-10 max-w-md mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="font-sans text-sm text-text-muted">
            ← Back
          </button>
          <h1 className="font-sans text-xl font-medium text-text-primary">All goals</h1>
        </div>
        <button
          onClick={() => { setCreating(true); setNewName('') }}
          className="font-sans text-sm text-coral"
        >
          + New goal
        </button>
      </div>

      {/* Search — available on this page too so users don't have to jump home */}
      <div className="mb-6">
        <SearchBar />
      </div>

      {/* New goal input — expands inline */}
      {creating && (
        <div className="mb-6 border-b border-border-warm pb-4">
          <input
            autoFocus
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') setCreating(false)
            }}
            placeholder="Name your new goal — e.g. Ship v1"
            className="w-full bg-transparent border-b border-coral pb-1 font-sans text-sm text-text-primary placeholder:text-text-light focus:outline-none"
          />
          <div className="flex gap-3 mt-3">
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="font-sans text-xs text-coral disabled:opacity-40"
            >
              Save
            </button>
            <button
              onClick={() => setCreating(false)}
              className="font-sans text-xs text-text-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {([
          { key: 'active', label: 'Active' },
          { key: 'completed', label: 'Completed' },
          { key: 'abandoned', label: 'Abandoned' },
          { key: 'all', label: 'All' },
        ] as { key: FilterKey; label: string }[]).map((opt) => (
          <button
            key={opt.key}
            onClick={() => setFilter(opt.key)}
            className={`px-3 py-1.5 rounded-pill text-xs font-sans border-[1.5px] ${
              filter === opt.key
                ? 'bg-coral-light border-coral text-tag-text'
                : 'bg-transparent border-border-warm text-text-muted'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Sort selector */}
      <div className="flex items-center gap-3 mb-2 text-xs font-sans text-text-light">
        <span>Sort:</span>
        {([
          { key: 'recent', label: 'Recent' },
          { key: 'time', label: 'Most time' },
          { key: 'alpha', label: 'A–Z' },
        ] as { key: SortKey; label: string }[]).map((opt) => (
          <button
            key={opt.key}
            onClick={() => setSort(opt.key)}
            className={sort === opt.key ? 'text-coral' : 'text-text-muted'}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Goal list */}
      {visibleGoals.length === 0 ? (
        <div className="mt-6 border border-border-warm rounded-xl p-5">
          <p className="font-sans text-sm text-text-primary mb-2">
            {filter === 'active' ? 'No active goals.' : `No ${filter} goals.`}
          </p>
          <p className="font-sans text-sm text-text-muted">
            {filter === 'active'
              ? 'Add one to group sessions on a project you’ll come back to.'
              : `Switch to Active to see your current goals.`}
          </p>
        </div>
      ) : (
        <div>
          {visibleGoals.map((g) => {
            const color = getGoalColor({ id: g.goal_id, color: g.color })
            const isEditing = editingId === g.goal_id
            const isPickingColor = colorPickerId === g.goal_id
            const isConfirmingDelete = deletingId === g.goal_id
            const metaBits = [
              `${formatDuration(g.total_minutes)}`,
              `${g.session_count} ${g.session_count === 1 ? 'session' : 'sessions'}`,
              g.avg_rating !== null ? `${g.avg_rating.toFixed(1)}/5` : null,
              g.last_session_at ? `last ${timeAgo(g.last_session_at)}` : 'no sessions yet',
            ].filter(Boolean)

            return (
              <div
                key={g.goal_id}
                className="py-3.5 border-b border-border-warm last:border-0"
              >
                <div className="flex items-center gap-3">
                  {/* Color dot — tap to open picker */}
                  <button
                    onClick={() =>
                      setColorPickerId((prev) => (prev === g.goal_id ? null : g.goal_id))
                    }
                    aria-label="Change color"
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />

                  {/* Name — either display or edit */}
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename(g.goal_id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      onBlur={() => handleRename(g.goal_id)}
                      className="flex-1 bg-transparent border-b border-coral pb-0.5 font-sans text-sm text-text-primary focus:outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => router.push(`/goals/${g.goal_id}`)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p
                        className="font-sans text-sm font-medium truncate"
                        style={{ color }}
                      >
                        {g.name}
                      </p>
                    </button>
                  )}

                  {/* Row actions */}
                  {!isEditing && (
                    <>
                      <button
                        onClick={() => { setEditingId(g.goal_id); setEditText(g.name) }}
                        className="font-sans text-xs text-text-muted"
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => setDeletingId(g.goal_id)}
                        aria-label={`Delete ${g.name}`}
                        className="font-sans text-lg text-text-light leading-none"
                      >
                        ×
                      </button>
                    </>
                  )}
                </div>

                {!isEditing && (
                  <p className="font-sans text-xs text-text-muted mt-1 truncate">
                    {metaBits.join(' · ')}
                  </p>
                )}

                {/* Color picker popover */}
                {isPickingColor && (
                  <div className="mt-3 flex gap-2 flex-wrap">
                    {GOAL_PALETTE.map((c) => (
                      <button
                        key={c}
                        onClick={() => handleColorChange(g.goal_id, c)}
                        aria-label={`Color ${c}`}
                        className={`w-6 h-6 rounded-full ${
                          c === color ? 'ring-2 ring-text-primary ring-offset-2 ring-offset-cream' : ''
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                )}

                {/* Delete confirm */}
                {isConfirmingDelete && (
                  <div className="mt-3 p-3 rounded-xl border border-red-300 bg-red-50">
                    <p className="font-sans text-xs text-text-primary mb-3">
                      Delete <strong>{g.name}</strong>? Its sessions stay in your
                      history but become uncategorized.
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleDelete(g.goal_id)}
                        className="font-sans text-xs px-3 py-1 rounded-pill text-white"
                        style={{ backgroundColor: '#b91c1c' }}
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setDeletingId(null)}
                        className="font-sans text-xs text-text-muted"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
