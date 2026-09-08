import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WeekdayPicker } from '@/components/WeekdayPicker'

describe('WeekdayPicker', () => {
  it('renders 7 buttons', () => {
    render(<WeekdayPicker selected={[]} onChange={() => {}} />)
    expect(screen.getAllByRole('button')).toHaveLength(7)
  })

  it('applies filled coral style to selected days', () => {
    render(<WeekdayPicker selected={['mon']} onChange={() => {}} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons[0]).toHaveClass('bg-coral')     // Mon is index 0
    expect(buttons[1]).not.toHaveClass('bg-coral')  // Tue is not selected
  })

  it('calls onChange adding the day when an unselected day is clicked', async () => {
    const onChange = vi.fn()
    render(<WeekdayPicker selected={[]} onChange={onChange} />)
    await userEvent.click(screen.getAllByRole('button')[0]) // Mon
    expect(onChange).toHaveBeenCalledWith(['mon'])
  })

  it('calls onChange removing the day when a selected day is clicked', async () => {
    const onChange = vi.fn()
    render(<WeekdayPicker selected={['mon', 'wed']} onChange={onChange} />)
    await userEvent.click(screen.getAllByRole('button')[0]) // Mon
    expect(onChange).toHaveBeenCalledWith(['wed'])
  })

  it('renders buttons in Mon→Sun order (first M, last S)', () => {
    render(<WeekdayPicker selected={[]} onChange={() => {}} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons[0].textContent).toBe('M')
    expect(buttons[6].textContent).toBe('S')
  })
})
