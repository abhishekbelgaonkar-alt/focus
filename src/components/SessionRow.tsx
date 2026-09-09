import { formatDuration, formatDateTime } from '@/lib/format'

interface SessionRowProps {
  id: string
  sessionName: string | null
  startedAt: string
  actualDurationMinutes: number
  rating: number | null
  goalName?: string | null
  taskCount?: number
  onClick: () => void
}

export function SessionRow({
  sessionName,
  startedAt,
  actualDurationMinutes,
  rating,
  goalName,
  taskCount,
  onClick,
}: SessionRowProps) {
  const rest = [
    formatDateTime(startedAt),
    formatDuration(actualDurationMinutes),
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
              <span className="text-goal-green">{goalName}</span>
              {' · '}
            </>
          )}
          {rest.join(' · ')}
        </p>
      </div>
      {rating !== null && (
        <span className="font-numbers text-sm font-semibold text-text-muted shrink-0">
          {rating.toFixed(1)}
        </span>
      )}
    </button>
  )
}
