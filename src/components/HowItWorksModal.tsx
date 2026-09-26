'use client'
import { Modal } from '@/components/Modal'

interface HowItWorksModalProps {
  open: boolean
  onClose: () => void
}

export function HowItWorksModal({ open, onClose }: HowItWorksModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="How Tokiroom works">
      <p>
        Tokiroom is a room for focused work. Walk in, do the work,
        walk out. Any amount of time you spend here counts, no matter
        how much.
      </p>
      <p>
        A <strong>session</strong> is one block of time. Set a duration,
        work on whatever you want, save it when you&apos;re done. Add
        tasks or notes if you feel like it, or don&apos;t. It&apos;s
        all optional.
      </p>
      <p>
        A <strong>goal</strong> groups sessions on something you keep
        coming back to, like studying for an exam or building a
        project. Assign one on the save screen and your hours pile up
        in <strong>All goals</strong>.
      </p>
      <p>
        Give a goal a <strong>schedule</strong> (Mon, Wed, Fri, or
        whichever days) and it&apos;ll show up in{' '}
        <em>Today&apos;s plan</em> on those days. It won&apos;t fuss
        if you skip.
      </p>
      <p>
        Tap <strong>Focus with someone</strong> to open a room and
        share the link. Everyone runs their own timer, sees who else
        is in, and leaves whenever they&apos;re done. If a friend is
        still going when your time&apos;s up, you can stay with them.
      </p>
      <p>
        Add <strong>friends</strong> from your Friends menu using an
        invite link, or after a shared session on the save screen.
        You can also <strong>share a goal</strong> from its page to
        keep a linked copy on a friend&apos;s account. Your sessions
        stay yours; the goal stays linked.
      </p>
      <p>
        No account required. Your data is yours. Attach an email
        whenever you want to keep it across devices.
      </p>
    </Modal>
  )
}
