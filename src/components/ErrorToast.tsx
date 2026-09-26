interface ErrorToastProps {
  message: string
  onDismiss?: () => void
}

// Fixed bottom banner for errors the user needs to see.
export function ErrorToast({ message, onDismiss }: ErrorToastProps) {
  return (
    <div className="fixed bottom-4 left-4 right-4 max-w-md mx-auto p-3 rounded-xl border border-red-300 bg-red-50 text-red-900 text-sm font-sans z-50 flex items-start gap-2">
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Dismiss" className="text-red-700 shrink-0 px-1">
          ×
        </button>
      )}
    </div>
  )
}
