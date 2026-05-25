// Vault state machine: 'none' (unencrypted) | 'unlocked' | 'locked'.
// Persisted metadata lives in localStorage so the app knows on cold-start
// whether to prompt for a passphrase before initializing the DB.
//
// The actual encrypt/decrypt I/O against the SQLite blob is wired in
// src/lib/vault/index.ts — this file holds only the shape + persistence.

export type VaultMode = 'none' | 'unlocked' | 'locked'

type VaultMeta = {
  encrypted: boolean
  encryptedBlobPath?: string // OPFS path to ciphertext when encrypted=true
}

const META_KEY = 'cashflow:vault-meta'
const DEFAULT_META: VaultMeta = { encrypted: false }

export function readMeta(): VaultMeta {
  if (typeof localStorage === 'undefined') return DEFAULT_META
  const raw = localStorage.getItem(META_KEY)
  if (!raw) return DEFAULT_META
  try {
    return { ...DEFAULT_META, ...(JSON.parse(raw) as Partial<VaultMeta>) }
  } catch {
    return DEFAULT_META
  }
}

export function writeMeta(meta: VaultMeta): void {
  localStorage.setItem(META_KEY, JSON.stringify(meta))
}
