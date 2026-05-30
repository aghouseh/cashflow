import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { lock } from '../../lib/vault'
import { wipeAllData } from '../../lib/data/wipe'
import ChangePassphraseModal from './ChangePassphraseModal'
import EnableEncryptionModal from './EnableEncryptionModal'
import UnlockModal from './UnlockModal'
import VaultBadge from './VaultBadge'
import VaultDropdown from './VaultDropdown'
import ExportModal from '../ExportModal'
import ImportModal from '../ImportModal'

type Modal = 'enable' | 'unlock' | 'change' | 'export' | 'import' | null

// Bundles badge + dropdown + modals. Lives in the TopBar's upper-right.
// Handles dropdown open-state, click-outside, Escape; defers modal contents
// to the dedicated dialog components.

export default function VaultControl() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [modal, setModal] = useState<Modal>(null)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

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
            onExport={() => openModal('export')}
            onImport={() => openModal('import')}
            onEraseData={async () => {
              setMenuOpen(false)
              if (!window.confirm('Erase ALL data? This cannot be undone.')) return
              await wipeAllData()
              navigate({ to: '/onboarding' })
            }}
          />
        )}
      </div>

      <EnableEncryptionModal open={modal === 'enable'} onClose={() => setModal(null)} />
      <UnlockModal open={modal === 'unlock'} onClose={() => setModal(null)} />
      <ChangePassphraseModal open={modal === 'change'} onClose={() => setModal(null)} />
      <ExportModal open={modal === 'export'} onClose={() => setModal(null)} />
      <ImportModal
        open={modal === 'import'}
        onClose={() => setModal(null)}
        onImported={() => { setModal(null); navigate({ to: '/' }) }}
      />
    </>
  )
}
