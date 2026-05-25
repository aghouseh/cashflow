import {
  Download,
  KeyRound,
  Lock,
  ShieldCheck,
  Unlock,
  Upload,
} from 'lucide-react'
import { useVaultMode } from '../../lib/vault/use-vault'

type Props = {
  onEnableEncryption: () => void
  onUnlock: () => void
  onLock: () => void
  onChangePassphrase: () => void
  onExport: () => void
  onImport: () => void
}

// Menu contents vary with current vault mode. Visibility + dismissal are
// the parent's job (see VaultControl).

export default function VaultDropdown({
  onEnableEncryption,
  onUnlock,
  onLock,
  onChangePassphrase,
  onExport,
  onImport,
}: Props) {
  const mode = useVaultMode()

  return (
    <div
      role="menu"
      className="absolute right-0 top-[calc(100%+6px)] z-20 w-64 rounded-card border border-line bg-card p-1 text-ink shadow-[0_24px_60px_rgba(0,0,0,0.12)]"
    >
      {mode === 'none' && (
        <>
          <p className="px-3 pb-1.5 pt-2 text-[11px] leading-snug text-ink-3">
            Data lives on this device only. Not encrypted.
          </p>
          <MenuItem icon={ShieldCheck} onClick={onEnableEncryption}>
            Enable encryption…
          </MenuItem>
          <Divider />
        </>
      )}

      {mode === 'unlocked' && (
        <>
          <MenuItem icon={Lock} onClick={onLock}>
            Lock now
          </MenuItem>
          <MenuItem icon={KeyRound} onClick={onChangePassphrase}>
            Change passphrase…
          </MenuItem>
          <Divider />
        </>
      )}

      {mode === 'locked' && (
        <>
          <MenuItem icon={Unlock} onClick={onUnlock}>
            Unlock…
          </MenuItem>
          <Divider />
        </>
      )}

      <MenuItem icon={Download} onClick={onExport}>
        Export backup…
      </MenuItem>
      <MenuItem icon={Upload} onClick={onImport}>
        Import…
      </MenuItem>
    </div>
  )
}

function MenuItem({
  icon: Icon,
  onClick,
  children,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-field px-3 py-2 text-left text-[13px] text-ink transition-colors hover:bg-card-2"
    >
      <Icon size={14} strokeWidth={1.75} aria-hidden />
      {children}
    </button>
  )
}

function Divider() {
  return <hr className="my-1 border-0 border-t border-line" />
}
