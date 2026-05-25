import { useSyncExternalStore } from 'react'
import { getMode, subscribe } from './index'
import type { VaultMode } from './state'

export function useVaultMode(): VaultMode {
  return useSyncExternalStore(
    subscribe,
    getMode,
    () => 'none' as VaultMode, // SSR snapshot — pre-hydration, treat as unencrypted
  )
}
