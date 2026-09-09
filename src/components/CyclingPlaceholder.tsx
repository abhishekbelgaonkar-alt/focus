'use client'
import { useState, useEffect } from 'react'

interface CyclingPlaceholderProps {
  active: boolean               // typically: value === ''
  placeholders: string[]
  intervalMs?: number           // ms between swaps
  fadeMs?: number               // fade duration
  className?: string            // must match the input's text styling (font-size, family)
  alignTop?: boolean            // for textareas; default is vertical-center
  paddingClass?: string         // padding to match the input's own padding
}

/**
 * Overlays an input with a placeholder text that cross-fades through a list
 * of alternatives every few seconds. Native `placeholder` should be left empty
 * on the input; this overlay replaces it.
 *
 * Usage:
 *   <div className="relative">
 *     <input value={x} onChange={...} placeholder="" className="…" />
 *     <CyclingPlaceholder
 *       active={x === ''}
 *       placeholders={['e.g. Foo', 'e.g. Bar']}
 *       className="font-sans text-base"
 *     />
 *   </div>
 */
export function CyclingPlaceholder({
  active,
  placeholders,
  intervalMs = 3500,
  fadeMs = 300,
  className = '',
  alignTop = false,
  paddingClass = '',
}: CyclingPlaceholderProps) {
  const [idx, setIdx] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (!active || placeholders.length <= 1) return
    const t = setInterval(() => {
      setVisible(false)
      const swap = setTimeout(() => {
        setIdx((i) => (i + 1) % placeholders.length)
        setVisible(true)
      }, fadeMs)
      return () => clearTimeout(swap)
    }, intervalMs)
    return () => clearInterval(t)
  }, [active, placeholders.length, intervalMs, fadeMs])

  if (!active || placeholders.length === 0) return null

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
