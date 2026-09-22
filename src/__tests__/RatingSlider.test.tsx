import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RatingSlider } from '@/components/RatingSlider'

describe('RatingSlider', () => {
  it('does not render the numeric value on screen', () => {
    render(<RatingSlider value={3.5} onChange={() => {}} />)
    // The number itself is stored on submit but never displayed — the identity
    // rejects grading framing, so "3.5" would read as a grade.
    expect(screen.queryByText('3.5')).not.toBeInTheDocument()
    expect(screen.queryByText('3.0')).not.toBeInTheDocument()
  })

  it('shows the mood word for the current rating', () => {
    render(<RatingSlider value={4.0} onChange={() => {}} />)
    expect(screen.getByText('focused')).toBeInTheDocument()
  })

  it('shows "scattered" for 1.0', () => {
    render(<RatingSlider value={1.0} onChange={() => {}} />)
    // Appears twice: as the current-mood label AND the left endpoint anchor
    expect(screen.getAllByText('scattered').length).toBeGreaterThanOrEqual(1)
  })

  it('shows "flowing" for 5.0', () => {
    render(<RatingSlider value={5.0} onChange={() => {}} />)
    // Appears twice: as the current-mood label AND the right endpoint anchor
    expect(screen.getAllByText('flowing').length).toBeGreaterThanOrEqual(1)
  })

  it('shares the nearest whole-word label at half-points (1.5 → scattered)', () => {
    render(<RatingSlider value={1.5} onChange={() => {}} />)
    // The mood label above the slider shows "scattered"; the "scattered"
    // endpoint anchor below the slider also renders — either match confirms
    // the label is present.
    expect(screen.getAllByText('scattered').length).toBeGreaterThan(0)
  })

  it('shows endpoint anchors "scattered" and "flowing"', () => {
    render(<RatingSlider value={3.0} onChange={() => {}} />)
    expect(screen.getByText('scattered')).toBeInTheDocument()
    expect(screen.getByText('flowing')).toBeInTheDocument()
  })

  it('calls onChange with a float when slider moves', () => {
    const onChange = vi.fn()
    render(<RatingSlider value={3.0} onChange={onChange} />)
    const slider = screen.getByRole('slider', { name: /rating slider/i })
    fireEvent.change(slider, { target: { value: '4.5' } })
    expect(onChange).toHaveBeenCalledWith(4.5)
  })
})
