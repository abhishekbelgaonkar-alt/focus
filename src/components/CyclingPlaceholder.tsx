'use client'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

/*
 * All cycling placeholders across the app share one timer so they fade in and
 * out in lockstep. The provider must wrap the tree that contains any
 * <CyclingPlaceholder>s — safe to mount at the root layout.
 */

interface CyclingState {
  tick: number
  visible: boolean
  fadeMs: number
}

const CyclingContext = createContext<CyclingState>({
  tick: 0,
  visible: true,
  fadeMs: 500,
})

interface CyclingPlaceholderProviderProps {
  children: ReactNode
  intervalMs?: number
  fadeMs?: number
}

export function CyclingPlaceholderProvider({
  children,
  intervalMs = 4500,
  fadeMs = 500,
}: CyclingPlaceholderProviderProps) {
  const [state, setState] = useState<CyclingState>({ tick: 0, visible: true, fadeMs })

  useEffect(() => {
    // On each cycle: fade the CURRENT text out, wait fadeMs, swap index, fade in.
    const cycle = () => {
      setState((s) => ({ ...s, visible: false }))
      setTimeout(() => {
        setState((s) => ({ ...s, tick: s.tick + 1, visible: true }))
      }, fadeMs)
    }
    const t = setInterval(cycle, intervalMs)
    return () => clearInterval(t)
  }, [intervalMs, fadeMs])

  return <CyclingContext.Provider value={state}>{children}</CyclingContext.Provider>
}

interface CyclingPlaceholderProps {
  active: boolean               // typically: value === ''
  placeholders: string[]
  className?: string            // must match the input's text styling
  alignTop?: boolean            // for textareas; default is vertical-center
  paddingClass?: string         // padding to match the input's own padding
}

export function CyclingPlaceholder({
  active,
  placeholders,
  className = '',
  alignTop = false,
  paddingClass = '',
}: CyclingPlaceholderProps) {
  const { tick, visible, fadeMs } = useContext(CyclingContext)

  if (!active || placeholders.length === 0) return null

  const idx = tick % placeholders.length

  return (
    <span
      aria-hidden="true"
      className={`absolute inset-0 flex ${alignTop ? 'items-start' : 'items-center'} pointer-events-none text-text-light select-none ${paddingClass} ${className}`}
      style={{
        opacity: visible ? 1 : 0,
        transition: `opacity ${fadeMs}ms ease`,
      }}
    >
      {placeholders[idx]}
    </span>
  )
}
