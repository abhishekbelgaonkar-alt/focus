import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HighlightedText } from '@/components/HighlightedText'

describe('HighlightedText', () => {
  it('renders plain text when query is empty', () => {
    render(<HighlightedText text="Phone kept buzzing" query="" />)
    expect(screen.getByText('Phone kept buzzing')).toBeInTheDocument()
    expect(document.querySelector('mark')).toBeNull()
  })

  it('wraps the matched portion in a <mark>', () => {
    render(<HighlightedText text="Phone kept buzzing" query="Phone" />)
    expect(document.querySelector('mark')).not.toBeNull()
    expect(document.querySelector('mark')!.textContent).toBe('Phone')
  })

  it('renders plain text when no match', () => {
    render(<HighlightedText text="Nothing here" query="xyz" />)
    expect(document.querySelector('mark')).toBeNull()
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
  })

  it('is case-insensitive — matches regardless of case', () => {
    render(<HighlightedText text="Started feeling tired" query="TIRED" />)
    expect(document.querySelector('mark')!.textContent!.toLowerCase()).toBe('tired')
  })

  it('preserves surrounding text around the match', () => {
    const { container } = render(<HighlightedText text="got distracted again" query="distracted" />)
    expect(container.textContent).toBe('got distracted again')
  })
})
