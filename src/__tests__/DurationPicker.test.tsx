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

  it('does not render the numeric input until the number is clicked', () => {
    render(<DurationPicker value={25} onChange={() => {}} />)
    expect(screen.queryByLabelText(/duration in minutes/i)).toBeNull()
  })

  it('clicking the number reveals an editable input', async () => {
    render(<DurationPicker value={25} onChange={() => {}} />)
    await userEvent.click(screen.getByText('25'))
    expect(screen.getByLabelText(/duration in minutes/i)).toBeInTheDocument()
  })

  it('typing a value and pressing Enter calls onChange with the new value', async () => {
    const onChange = vi.fn()
    render(<DurationPicker value={25} onChange={onChange} />)
    await userEvent.click(screen.getByText('25'))
    const input = screen.getByLabelText(/duration in minutes/i)
    await userEvent.clear(input)
    await userEvent.type(input, '45{Enter}')
    expect(onChange).toHaveBeenCalledWith(45)
  })

  it('clamps typed values above max to max', async () => {
    const onChange = vi.fn()
    render(<DurationPicker value={25} onChange={onChange} min={1} max={90} />)
    await userEvent.click(screen.getByText('25'))
    const input = screen.getByLabelText(/duration in minutes/i)
    await userEvent.clear(input)
    await userEvent.type(input, '200{Enter}')
    expect(onChange).toHaveBeenCalledWith(90)
  })

  it('clamps typed values below min to min', async () => {
    const onChange = vi.fn()
    render(<DurationPicker value={25} onChange={onChange} min={1} max={90} />)
    await userEvent.click(screen.getByText('25'))
    const input = screen.getByLabelText(/duration in minutes/i)
    await userEvent.clear(input)
    await userEvent.type(input, '0{Enter}')
    expect(onChange).toHaveBeenCalledWith(1)
  })

  it('Escape cancels edit without calling onChange', async () => {
    const onChange = vi.fn()
    render(<DurationPicker value={25} onChange={onChange} />)
    await userEvent.click(screen.getByText('25'))
    const input = screen.getByLabelText(/duration in minutes/i)
    await userEvent.clear(input)
    await userEvent.type(input, '99{Escape}')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('renders 15-minute interval labels (default max=90)', () => {
    render(<DurationPicker value={25} onChange={() => {}} />)
    ;['15', '30', '45', '60', '75', '90'].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument()
    })
  })

  it('renders 30-minute interval labels when max > 90 (compact mode)', () => {
    // value 45 avoids clashing with a tick label
    render(<DurationPicker value={45} onChange={() => {}} max={180} />)
    ;['30', '60', '90', '120', '150', '180'].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument()
    })
  })
})
