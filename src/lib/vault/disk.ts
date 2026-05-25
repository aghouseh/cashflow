// Direct OPFS access for the encrypted vault blob.
// SQLocal owns `cashflow.sqlite3`; the vault owns `cashflow.vault` alongside it.

const VAULT_FILENAME = 'cashflow.vault'

async function rootDir(): Promise<FileSystemDirectoryHandle> {
  return navigator.storage.getDirectory()
}

export async function readEncryptedBlob(): Promise<Uint8Array | null> {
  const root = await rootDir()
  let handle: FileSystemFileHandle
  try {
    handle = await root.getFileHandle(VAULT_FILENAME)
  } catch {
    return null
  }
  const file = await handle.getFile()
  return new Uint8Array(await file.arrayBuffer())
}

export async function writeEncryptedBlob(bytes: Uint8Array): Promise<void> {
  const root = await rootDir()
  const handle = await root.getFileHandle(VAULT_FILENAME, { create: true })
  const writable = await handle.createWritable()
  await writable.write(bytes)
  await writable.close()
}

export async function deleteEncryptedBlob(): Promise<void> {
  const root = await rootDir()
  try {
    await root.removeEntry(VAULT_FILENAME)
  } catch {
    // already gone
  }
}
