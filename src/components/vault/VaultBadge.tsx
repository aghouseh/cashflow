import { LockKeyhole, LockKeyholeOpen, ShieldAlert } from 'lucide-react'
import { useVaultMode } from '../../lib/vault/use-vault'

const COPY = {
  none: { label: 'Local only', tone: 'amber' as const },
  unlocked: { label: 'Encrypted', tone: 'in' as const },
  locked: { label: 'Locked', tone: 'ink' as const },
}

type Props = {
  onClick?: () => void
  'aria-expanded'?: boolean
}

// Persistent state indicator in the TopBar. Amber when unencrypted — the
// honest reminder that this device is the only thing standing between the
// user's data and a snooping browser. Not a toast; not dismissible.

export default function VaultBadge({ onClick, ...aria }: Props) {
  const mode = useVaultMode()
  const { label, tone } = COPY[mode]

  const Icon =
    mode === 'none' ? ShieldAlert : mode === 'locked' ? LockKeyhole : LockKeyholeOpen

  const toneClass =
    tone === 'amber'
      ? 'border-amber/40 bg-amber-soft text-amber-ink'
      : tone === 'in'
        ? 'border-in/30 bg-in-soft text-in-ink'
        : 'border-line-2 bg-card text-ink'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="menu"
      {...aria}
      className={`flex items-center gap-1.5 rounded-chip border px-2.5 py-1 text-[11px] font-medium transition-colors hover:brightness-95 ${toneClass}`}
      aria-label={`Vault: ${label}`}
    >
      <Icon size={13} strokeWidth={1.75} aria-hidden />
      <span>{label}</span>
    </button>
  )
}
