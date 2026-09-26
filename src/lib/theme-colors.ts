'use client'
import { useEffect, useState } from 'react'

// Recharts (and other SVG-emitting libs) don't reliably resolve `var(--x)`
// strings in all render paths — some values get measured/computed by the
// library at render time and need real colours. This hook reads the resolved
// values off the document root and re-reads them when the `data-theme`
// attribute changes (that's how themes flip in this app).
//
// Keep the list of tokens tight: only what charts and inline-style consumers
// need. Everything else in the app should keep using CSS variables directly
// via Tailwind / inline `var(...)` — no reason to route through this hook.

export interface ThemeColors {
  coral: string
  coralSoft: string
  coralLight: string
  borderWarm: string
  textMuted: string
  textLight: string
  heatmapNone: string
  heatmapLow: string
  heatmapMid: string
  heatmapHigh: string
  heatmapPeak: string
}

// Paper theme values, used only until the real ones are read after mount.
const FALLBACK: ThemeColors = {
  coral: '#2e3d5a',
  coralSoft: '#4a5c7d',
  coralLight: '#e0e4ee',
  borderWarm: '#e2ddd1',
  textMuted: '#6b6560',
  textLight: '#a19b8f',
  heatmapNone: '#e8e2d3',
  heatmapLow: '#d4c3a8',
  heatmapMid: '#b89675',
  heatmapHigh: '#8a6547',
  heatmapPeak: '#5c3a26',
}

const TOKENS: Record<keyof ThemeColors, string> = {
  coral: '--color-coral',
  coralSoft: '--color-coral-soft',
  coralLight: '--color-coral-light',
  borderWarm: '--color-border-warm',
  textMuted: '--color-text-muted',
  textLight: '--color-text-light',
  heatmapNone: '--color-heatmap-none',
  heatmapLow: '--color-heatmap-low',
  heatmapMid: '--color-heatmap-mid',
  heatmapHigh: '--color-heatmap-high',
  heatmapPeak: '--color-heatmap-peak',
}

function read(): ThemeColors {
  if (typeof window === 'undefined') return FALLBACK
  const styles = getComputedStyle(document.documentElement)
  const out = {} as ThemeColors
  ;(Object.keys(TOKENS) as (keyof ThemeColors)[]).forEach((k) => {
    const v = styles.getPropertyValue(TOKENS[k]).trim()
    out[k] = v || FALLBACK[k]
  })
  return out
}

export function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState<ThemeColors>(FALLBACK)

  useEffect(() => {
    setColors(read())
    // Re-read when the theme attribute changes on <html>.
    const obs = new MutationObserver(() => setColors(read()))
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => obs.disconnect()
  }, [])

  return colors
}
