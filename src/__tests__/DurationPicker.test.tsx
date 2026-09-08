import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DurationPicker } from '@/components/DurationPicker'

describe('DurationPicker', () => {
  it('renders the current value as a large visible span', () => {
    render(<DurationPicker value={25} onChange={() => {}} />)
    expect(screen.getByText('25')).toBeInTheDocument()
  })

  it('renders a range slider', () => {
    render(<DurationPicker value={25} onChange={() => {}} />)
    expect(screen.getByRole('slider', { name: /duration slider/i })).toBeInTheDocument()
  })

  it('calls onChange when the slider is moved', () => {
    const onChange = vi.fn()
    render(<DurationPicker value={25} onChange={onChange} />)
    const slider = screen.getByRole('slider', { name: /duration slider/i })
    fireEvent.change(slider, { target: { value: '30' } })
    expect(onChange).toHaveBeenCalledWith(30)
  })

  it('clicking the number span calls focus on the hidden input', async () => {
    render(<DurationPicker value={25} onChange={() => {}} />)
    const span = screen.getByText('25')
    const input = screen.getByLabelText(/duration in minutes/i)
    const focusSpy = vi.spyOn(input, 'focus')
    await userEvent.click(span)
    expect(focusSpy).toHaveBeenCalled()
  })

  it('clamps typed values above max to max', () => {
    const onChange = vi.fn()
    render(<DurationPicker value={25} onChange={onChange} min={1} max={90} />)
    const input = screen.getByLabelText(/duration in minutes/i)
    fireEvent.change(input, { target: { value: '200' } })
    expect(onChange).toHaveBeenCalledWith(90)
  })

  it('clamps typed values below min to min', () => {
    const onChange = vi.fn()
    render(<DurationPicker value={25} onChange={onChange} min={1} max={90} />)
    const input = screen.getByLabelText(/duration in minutes/i)
    fireEvent.change(input, { target: { value: '0' } })
    expect(onChange).toHaveBeenCalledWith(1)
  })

  it('renders 15-minute interval labels', () => {
    render(<DurationPicker value={25} onChange={() => {}} />)
    ;['15', '30', '45', '60', '75', '90'].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument()
    })
  })
})
