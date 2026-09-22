import { formatDuration, formatDateTime } from '@/lib/format'
import { getRatingTierColor } from '@/lib/stats'

interface SessionRowProps {
  id: string
  sessionName: string | null
  startedAt: string
  actualDurationMinutes: number
  rating: number | null
  goalName?: string | null
  goalColor?: string | null   // if provided, goal name renders in this color
  taskCount?: number
  onClick: () => void
}

export function SessionRow({
  sessionName,
  startedAt,
  actualDurationMinutes,
  rating,
  goalName,
  goalColor,
  taskCount,
  onClick,
}: SessionRowProps) {
  // Meta line: date + task count. Duration is hoisted out to the trailing
  // slot so time is the eye-catch on every row.
  const meta = [
    formatDateTime(startedAt),
    taskCount && taskCount > 0
      ? `${taskCount} ${taskCount === 1 ? 'task' : 'tasks'}`
      : null,
  ].filter(Boolean) as string[]

  return (
    <button
      onClick={onClick}
      className="w-full text-left py-3.5 border-b border-border-warm last:border-0 flex items-center justify-between gap-4"
    >
      <div className="min-w-0">
        <p className="font-sans text-sm font-medium text-text-primary truncate">
          {sessionName ?? 'Session'}
        </p>
        <p className="font-sans text-xs text-text-muted mt-0.5 truncate">
          {goalName && (
            <>
              <span style={goalColor ? { color: goalColor } : undefined} className={goalColor ? '' : 'text-goal-green'}>
                {goalName}
              </span>
              {' · '}
            </>
          )}
          {meta.join(' · ')}
        </p>
      </div>
      {/* Trailing: duration as the number, rating as a small colored dot. */}
      <div className="flex items-center gap-2 shrink-0">
        {rating !== null && (
          <span
            aria-label={`rating ${rating.toFixed(1)}`}
            title={`Rating ${rating.toFixed(1)}`}
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: getRatingTierColor(rating) }}
          />
        )}
        <span className="font-numbers text-sm font-semibold text-text-primary">
          {formatDuration(actualDurationMinutes)}
        </span>
      </div>
    </button>
  )
}
