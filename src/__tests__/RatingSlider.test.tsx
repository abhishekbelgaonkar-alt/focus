import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RatingSlider } from '@/components/RatingSlider'

describe('RatingSlider', () => {
  it('renders the current rating as a number', () => {
    render(<RatingSlider value={3.5} onChange={() => {}} />)
    expect(screen.getByText('3.5')).toBeInTheDocument()
  })

  it('shows the word label for the current rating', () => {
    render(<RatingSlider value={4.0} onChange={() => {}} />)
    expect(screen.getByText('Focused')).toBeInTheDocument()
  })

  it('shows Rough for 1.0', () => {
    render(<RatingSlider value={1.0} onChange={() => {}} />)
    expect(screen.getByText('Rough')).toBeInTheDocument()
  })

  it('shows Locked in for 5.0', () => {
    render(<RatingSlider value={5.0} onChange={() => {}} />)
    expect(screen.getByText('Locked in')).toBeInTheDocument()
  })

  it('shows Rough for 1.5 (half-point shares nearest whole label)', () => {
    render(<RatingSlider value={1.5} onChange={() => {}} />)
    expect(screen.getByText('Rough')).toBeInTheDocument()
  })

  it('calls onChange with a float when slider moves', () => {
    const onChange = vi.fn()
    render(<RatingSlider value={3.0} onChange={onChange} />)
    const slider = screen.getByRole('slider', { name: /rating slider/i })
    fireEvent.change(slider, { target: { value: '4.5' } })
    expect(onChange).toHaveBeenCalledWith(4.5)
  })
})
