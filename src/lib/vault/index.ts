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
// Disk I/O for the encrypted blob is implemented in ./disk.ts. This file owns
// the state machine + subscription API consumed by the React layer.

import { databaseFile } from '../db/client'
import { encryptBlob, decryptBlob } from './crypto'
import { readEncryptedBlob, writeEncryptedBlob } from './disk'
import { readMeta, writeMeta, type VaultMode } from './state'

let currentMode: VaultMode = readMeta().encrypted ? 'locked' : 'none'
let keyPassphrase: string | null = null

type Listener = (mode: VaultMode) => void
const listeners = new Set<Listener>()

function emit() {
  for (const cb of listeners) cb(currentMode)
}

export function subscribe(cb: Listener): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function getMode(): VaultMode {
  return currentMode
}

export function isUnlocked(): boolean {
  return currentMode === 'none' || currentMode === 'unlocked'
}

async function snapshotPlaintext(): Promise<Uint8Array> {
  const file = await databaseFile.read()
  return new Uint8Array(await file.arrayBuffer())
}

export async function enableEncryption(passphrase: string): Promise<void> {
  if (currentMode !== 'none') {
    throw new Error('Encryption already enabled')
  }
  const plaintext = await snapshotPlaintext()
  const ciphertext = await encryptBlob(plaintext, passphrase)
  await writeEncryptedBlob(ciphertext)
  writeMeta({ encrypted: true, encryptedBlobPath: 'cashflow.vault' })
  keyPassphrase = passphrase
  currentMode = 'unlocked'
  emit()
}

export async function unlock(passphrase: string): Promise<void> {
  if (currentMode !== 'locked') return
  const blob = await readEncryptedBlob()
  if (!blob) throw new Error('No encrypted vault found')
  const plaintext = await decryptBlob(blob, passphrase)
  // Pass the underlying ArrayBuffer, not the Uint8Array view. SQLocal's import
  // path puts `message.database` directly in postMessage's transfer list —
  // only ArrayBuffer is transferable; Uint8Array throws DataCloneError.
  await databaseFile.write(plaintext.buffer as ArrayBuffer)
  keyPassphrase = passphrase
  currentMode = 'unlocked'
  emit()
}

export async function lock(): Promise<void> {
  if (currentMode !== 'unlocked' || !keyPassphrase) return
  await flush()
  keyPassphrase = null
  currentMode = 'locked'
  emit()
}

// Encrypt the live SQLocal file and persist to OPFS. Called after every write
// when in unlocked mode; also called by lock() before discarding the key.
export async function flush(): Promise<void> {
  if (currentMode !== 'unlocked' || !keyPassphrase) return
  const plaintext = await snapshotPlaintext()
  const ciphertext = await encryptBlob(plaintext, keyPassphrase)
  await writeEncryptedBlob(ciphertext)
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
  await flush()
}
