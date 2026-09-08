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
    (async () => {
      try {
        const { data } = await supabase
          .from('distraction_tags')
          .select('*')
          .order('created_at')
        setTags((data ?? []) as DistractionTag[])
      } catch {
        /* renders empty list */
      } finally {
        setLoading(false)
      }
    })()
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
