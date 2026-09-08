import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DistractionTags } from '@/components/DistractionTags'
import type { DistractionTag } from '@/lib/types'

const TAGS: DistractionTag[] = [
  { id: '1', user_id: 'u', name: 'Phone', created_at: '' },
  { id: '2', user_id: 'u', name: 'Noise', created_at: '' },
]

describe('DistractionTags', () => {
  it('renders all tags as buttons', () => {
    render(<DistractionTags tags={TAGS} selected={[]} onToggle={() => {}} onAdd={() => {}} />)
    expect(screen.getByText('Phone')).toBeInTheDocument()
    expect(screen.getByText('Noise')).toBeInTheDocument()
  })

  it('applies filled style to selected tags', () => {
    render(<DistractionTags tags={TAGS} selected={['1']} onToggle={() => {}} onAdd={() => {}} />)
    const phonePill = screen.getByText('Phone').closest('button')!
    expect(phonePill).toHaveClass('bg-coral-light')
    const noisePill = screen.getByText('Noise').closest('button')!
    expect(noisePill).not.toHaveClass('bg-coral-light')
  })

  it('calls onToggle with the tag id when a pill is clicked', async () => {
    const onToggle = vi.fn()
    render(<DistractionTags tags={TAGS} selected={[]} onToggle={onToggle} onAdd={() => {}} />)
    await userEvent.click(screen.getByText('Phone'))
    expect(onToggle).toHaveBeenCalledWith('1')
  })

  it('shows an add input when "+ add" is clicked', async () => {
    render(<DistractionTags tags={TAGS} selected={[]} onToggle={() => {}} onAdd={() => {}} />)
    await userEvent.click(screen.getByText('+ add'))
    expect(screen.getByPlaceholderText(/add a tag/i)).toBeInTheDocument()
  })

  it('calls onAdd with the typed name when Enter is pressed', async () => {
    const onAdd = vi.fn()
    render(<DistractionTags tags={TAGS} selected={[]} onToggle={() => {}} onAdd={onAdd} />)
    await userEvent.click(screen.getByText('+ add'))
    await userEvent.type(screen.getByPlaceholderText(/add a tag/i), 'Boredom{Enter}')
    expect(onAdd).toHaveBeenCalledWith('Boredom')
  })
})
