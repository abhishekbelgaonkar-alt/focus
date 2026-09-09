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

/** Pick a color for a goal — user's chosen value wins, else a stable derived one. */
export function getGoalColor(goal: { id: string; color?: string | null }): string {
  if (goal.color) return goal.color
  // Simple hash of the UUID so a given goal always maps to the same color.
  let hash = 0
  for (let i = 0; i < goal.id.length; i++) {
    hash = (hash * 31 + goal.id.charCodeAt(i)) >>> 0
  }
  return GOAL_PALETTE[hash % GOAL_PALETTE.length]
}
