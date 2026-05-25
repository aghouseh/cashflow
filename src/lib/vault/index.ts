// Vault: owns the lifecycle of the SQLite blob's at-rest state.
//
// Three modes (see ../../memory/project_storage_and_auth.md):
//   - none      → SQLocal persists plaintext to OPFS as normal.
//   - unlocked  → ciphertext blob on OPFS; plaintext live in SQLocal's in-memory
//                 file; key held in module scope; flush on every write.
//   - locked    → ciphertext blob on OPFS; key discarded; DB not accessible.
//
// Enable is one-way: once encrypted, the user cannot revert to plaintext mode
// from inside the app. To go back, export plaintext JSON + start fresh.
//
// Currently scaffolded: crypto + state shape only. Wire-up of SQLocal blob
// shuttling lives in a follow-up task once the UI screens that need it land.

import { databaseFile } from '../db/client'
import { encryptBlob, decryptBlob } from './crypto'
import { readMeta, writeMeta, type VaultMode } from './state'

let currentMode: VaultMode = readMeta().encrypted ? 'locked' : 'none'
let keyPassphrase: string | null = null

export function getMode(): VaultMode {
  return currentMode
}

export function isUnlocked(): boolean {
  return currentMode === 'none' || currentMode === 'unlocked'
}

export async function enableEncryption(passphrase: string): Promise<void> {
  if (currentMode !== 'none') {
    throw new Error('Encryption already enabled')
  }
  const plaintext = new Uint8Array(await (await databaseFile.read()).arrayBuffer())
  const ciphertext = await encryptBlob(plaintext, passphrase)
  // TODO: write ciphertext to a separate OPFS path and clear the plaintext SQLocal file.
  void ciphertext
  writeMeta({ encrypted: true, encryptedBlobPath: 'cashflow.vault' })
  keyPassphrase = passphrase
  currentMode = 'unlocked'
}

export async function unlock(passphrase: string): Promise<void> {
  if (currentMode !== 'locked') return
  // TODO: read ciphertext from OPFS, decrypt, overwriteDatabaseFile.
  void decryptBlob
  keyPassphrase = passphrase
  currentMode = 'unlocked'
}

export async function lock(): Promise<void> {
  if (currentMode !== 'unlocked') return
  // TODO: encrypt current SQLocal file with stored passphrase, persist, zero in-memory db.
  keyPassphrase = null
  currentMode = 'locked'
}

export async function changePassphrase(
  oldPassphrase: string,
  newPassphrase: string,
): Promise<void> {
  if (currentMode !== 'unlocked') {
    throw new Error('Vault must be unlocked to change passphrase')
  }
  if (keyPassphrase !== oldPassphrase) {
    throw new Error('Old passphrase incorrect')
  }
  keyPassphrase = newPassphrase
  await lock()
  await unlock(newPassphrase)
}
