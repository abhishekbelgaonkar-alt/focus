'use client'
import { useEffect, type RefObject } from 'react'

/**
 * Close a popover on outside click or Escape while it's open. The click
 * listener attaches on the next tick so the click that opened the popover
 * doesn't immediately close it.
 */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onDismiss: () => void
) {
  useEffect(() => {
    if (!open) return
    let handler: ((e: MouseEvent) => void) | null = null
    const attachTimer = window.setTimeout(() => {
      handler = (e: MouseEvent) => {
        if (ref.current && !ref.current.contains(e.target as Node)) onDismiss()
      }
      window.addEventListener('click', handler)
    }, 0)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss() }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(attachTimer)
      if (handler) window.removeEventListener('click', handler)
      window.removeEventListener('keydown', onKey)
    }
  }, [ref, open, onDismiss])
}
