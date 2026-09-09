// Palette of goal colors — each goal gets one, picked by the user or
// derived deterministically from the goal id. Tuned to stay legible as
// text on the cream #fdf6ee background.
export const GOAL_PALETTE = [
  '#16a34a', // green
  '#d9642e', // coral
  '#0284c7', // sky
  '#7c3aed', // violet
  '#db2777', // pink
  '#0d9488', // teal
  '#a16207', // amber
  '#475569', // slate
] as const

/**
 * Pick a color for a goal. The user's chosen value wins if set; otherwise
 * we hash the goal id to a palette slot. This is only a fallback — the
 * backfill migration + auto-assignment on create should mean color is
 * populated in practice.
 */
export function getGoalColor(goal: { id: string; color?: string | null }): string {
  if (goal.color) return goal.color
  // djb2-style hash for a slightly better distribution than string sum.
  let h = 5381
  for (let i = 0; i < goal.id.length; i++) {
    h = ((h << 5) + h + goal.id.charCodeAt(i)) >>> 0
  }
  return GOAL_PALETTE[h % GOAL_PALETTE.length]
}
