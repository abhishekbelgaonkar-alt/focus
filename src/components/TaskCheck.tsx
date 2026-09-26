interface TaskCheckProps {
  done: boolean
  taskName: string
  onToggle?: () => void   // omit for a read-only indicator
}

// Round check-off circle used for session tasks. Interactive when onToggle
// is passed (timer, room); a smaller static indicator otherwise (history).
export function TaskCheck({ done, taskName, onToggle }: TaskCheckProps) {
  const tick = (
    <svg
      width={onToggle ? 10 : 8}
      height={onToggle ? 10 : 8}
      viewBox="0 0 10 10"
      aria-hidden="true"
      className={`transition-[opacity,transform] duration-300 ease-out ${
        done ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
      }`}
    >
      <path
        d="M1.5 5.5 L4 8 L8.5 2.5"
        stroke="white"
        strokeWidth="1.75"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )

  const fill = done ? 'bg-check-green border-check-green' : 'border-border-warm bg-transparent'

  if (!onToggle) {
    return (
      <span className={`w-4 h-4 rounded-full border-[1.5px] shrink-0 flex items-center justify-center ${fill}`}>
        {tick}
      </span>
    )
  }

  return (
    <button
      onClick={onToggle}
      aria-label={done ? `Uncheck ${taskName}` : `Check off ${taskName}`}
      className={`w-5 h-5 rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-[background-color,border-color,transform] duration-300 ease-out ${fill} ${
        done ? 'scale-105' : 'scale-100'
      }`}
    >
      {tick}
    </button>
  )
}
