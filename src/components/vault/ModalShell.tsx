import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'

type Props = {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

// Wraps native <dialog> so the browser handles focus trap, Esc, and backdrop.

export default function ModalShell({ open, onClose, title, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dlg = ref.current
    if (!dlg) return
    if (open && !dlg.open) dlg.showModal()
    if (!open && dlg.open) dlg.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby="modal-title"
      onClose={onClose}
      onClick={(e) => {
        // Click-on-backdrop closes. Inner clicks bubble from children with target !== dialog.
        if (e.target === e.currentTarget) onClose()
      }}
      className="w-[480px] max-w-[calc(100vw-2rem)] rounded-card border border-line bg-card p-0 text-ink backdrop:bg-black/30"
    >
      <header className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 id="modal-title" className="text-[15px] font-medium tracking-tight">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-field p-1 text-ink-3 transition-colors hover:bg-card-2 hover:text-ink"
          aria-label="Close"
        >
          <X size={16} strokeWidth={1.75} />
        </button>
      </header>
      <div className="px-5 py-4">{children}</div>
    </dialog>
  )
}
