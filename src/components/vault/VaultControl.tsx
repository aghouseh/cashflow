import { useEffect, useRef, useState } from 'react'
import { lock } from '../../lib/vault'
import ChangePassphraseModal from './ChangePassphraseModal'
import EnableEncryptionModal from './EnableEncryptionModal'
import UnlockModal from './UnlockModal'
import VaultBadge from './VaultBadge'
import VaultDropdown from './VaultDropdown'

type Modal = 'enable' | 'unlock' | 'change' | null

// Bundles badge + dropdown + modals. Lives in the TopBar's upper-right.
// Handles dropdown open-state, click-outside, Escape; defers modal contents
// to the dedicated dialog components.

export default function VaultControl() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [modal, setModal] = useState<Modal>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onPointer(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  function openModal(m: Modal) {
    setMenuOpen(false)
    setModal(m)
  }

  return (
    <>
      <div ref={ref} className="relative">
        <VaultBadge
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
        />
        {menuOpen && (
          <VaultDropdown
            onEnableEncryption={() => openModal('enable')}
            onUnlock={() => openModal('unlock')}
            onLock={async () => {
              setMenuOpen(false)
              await lock()
            }}
            onChangePassphrase={() => openModal('change')}
            onExport={() => {
              setMenuOpen(false)
              // TODO: export flow
              console.warn('Export not implemented yet')
            }}
            onImport={() => {
              setMenuOpen(false)
              // TODO: import flow
              console.warn('Import not implemented yet')
            }}
          />
        )}
      </div>

      <EnableEncryptionModal open={modal === 'enable'} onClose={() => setModal(null)} />
      <UnlockModal open={modal === 'unlock'} onClose={() => setModal(null)} />
      <ChangePassphraseModal open={modal === 'change'} onClose={() => setModal(null)} />
    </>
  )
}
