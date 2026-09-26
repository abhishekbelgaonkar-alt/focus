import type { SupabaseClient } from '@supabase/supabase-js'
import { GOAL_PALETTE } from './goal-color'

/** Creates a goal for the signed-in user with a palette color. */
export async function createGoal(
  supabase: SupabaseClient,
  name: string
): Promise<{ id: string; name: string } | null> {
  const trimmed = name.trim()
  if (!trimmed) return null
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) return null
  const color = GOAL_PALETTE[Math.floor(Math.random() * GOAL_PALETTE.length)]
  const { data, error } = await supabase
    .from('goals')
    .insert({ user_id: userData.user.id, name: trimmed, color })
    .select('id, name')
    .single()
  if (error) {
    console.error('[goals] create failed', error)
    return null
  }
  return data
}
