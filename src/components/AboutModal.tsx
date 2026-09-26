'use client'
import { Modal } from '@/components/Modal'

interface AboutModalProps {
  open: boolean
  onClose: () => void
}

export function AboutModal({ open, onClose }: AboutModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="About Tokiroom">
      <p>
        Tokiroom is a quiet space for focused work. You come in, do
        your work, leave. If you stayed 5 minutes, that counts. If
        you stayed 4 hours, that counts too. Any time you spend here
        is time worth spending.
      </p>
      <p>
        The tools are simple on purpose. A timer. A place to write
        notes. A way to group sessions by what you&apos;re working
        on. Come back whenever you want.
      </p>
      <p>
        You come and go on your own time. Look back at your hours
        whenever you want, and feel good about the time you gave.
      </p>
      <p>
        Sometimes you focus alone. Sometimes you open a room and a
        friend joins. Either way is the same shape: show up, do the
        work, leave when you&apos;re done.
      </p>
      <p>
        The name is a small nod to a place from{' '}
        <em>Dragon Ball Z</em> called the Hyperbolic Time Chamber. In
        Japanese it&apos;s <em>Seishin no Toki no Heya</em>. A room
        where a day of training inside is a year outside. A good
        session here can feel a little like that.
      </p>
      <p className="mt-2 text-text-muted">
        Thanks for being here.
      </p>
    </Modal>
  )
}
