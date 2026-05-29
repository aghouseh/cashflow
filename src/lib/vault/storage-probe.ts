// Probe whether the current browser context supports the OPFS operations
// required for at-rest encryption. Incognito / private-browsing modes on iOS
// and some Chromium forks restrict FileSystemSyncAccessHandle or clear OPFS
// at session end — both make the vault unsafe or outright broken.

export type StorageProbeResult = {
  // Can we read/write OPFS at all?
  opfsAvailable: boolean
  // Heuristic: quota < 120 MB strongly suggests private/incognito mode.
  // Not 100% reliable — used only to surface a warning, not to block.
  likelyIncognito: boolean
}

const PROBE_FILE = '.__vault_probe'

export async function probeVaultStorage(): Promise<StorageProbeResult> {
  // Probe OPFS write access with a throwaway file.
  let opfsAvailable = false
  try {
    const root = await navigator.storage.getDirectory()
    const handle = await root.getFileHandle(PROBE_FILE, { create: true })
    const writable = await handle.createWritable()
    await writable.write(new Uint8Array([0]))
    await writable.close()
    await root.removeEntry(PROBE_FILE)
    opfsAvailable = true
  } catch {
    opfsAvailable = false
  }

  // Incognito heuristic: quota is capped (Chrome ≈ 120 MB, Brave ≈ similar).
  // Normal profiles get gigabytes. Failure to estimate → treat as incognito.
  let likelyIncognito = false
  try {
    const est = await navigator.storage.estimate()
    likelyIncognito = est.quota !== undefined && est.quota < 150 * 1024 * 1024
  } catch {
    likelyIncognito = true
  }

  return { opfsAvailable, likelyIncognito }
}
