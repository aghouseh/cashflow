import {
  Download,
  KeyRound,
  Lock,
  ShieldCheck,
  Trash2,
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
  onEraseData: () => void
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
  onEraseData,
}: Props) {
  const mode = useVaultMode()

  return (
    <div
      role="menu"
      aria-label="Vault options"
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
      <Divider />
      <MenuItem icon={Trash2} onClick={onEraseData} destructive>
        Erase all data…
      </MenuItem>
    </div>
  )
}

function MenuItem({
  icon: Icon,
  onClick,
  destructive = false,
  children,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>
  onClick: () => void
  destructive?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-field px-3 py-2 text-left text-[13px] transition-colors hover:bg-card-2 ${
        destructive ? 'text-out-ink hover:bg-out-soft/60' : 'text-ink'
      }`}
    >
      <Icon size={14} strokeWidth={1.75} aria-hidden />
      {children}
    </button>
  )
}

function Divider() {
  return <hr className="my-1 border-0 border-t border-line" />
}
