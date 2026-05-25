// AES-GCM-256 encryption with PBKDF2-SHA256-derived keys.
// All raw Web Crypto — no third-party crypto deps.

const PBKDF2_ITERATIONS = 600_000
const SALT_BYTES = 16
const IV_BYTES = 12

export async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const passphraseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passphraseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export function newSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_BYTES))
}

// Output layout: [salt(16) | iv(12) | ciphertext+tag]
// Salt is stored alongside ciphertext so unlock only needs the passphrase.
export async function encryptBlob(
  plaintext: Uint8Array,
  passphrase: string,
): Promise<Uint8Array> {
  const salt = newSalt()
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await deriveKey(passphrase, salt)
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext),
  )

  const out = new Uint8Array(SALT_BYTES + IV_BYTES + ciphertext.byteLength)
  out.set(salt, 0)
  out.set(iv, SALT_BYTES)
  out.set(ciphertext, SALT_BYTES + IV_BYTES)
  return out
}

export async function decryptBlob(
  blob: Uint8Array,
  passphrase: string,
): Promise<Uint8Array> {
  const salt = blob.subarray(0, SALT_BYTES)
  const iv = blob.subarray(SALT_BYTES, SALT_BYTES + IV_BYTES)
  const ciphertext = blob.subarray(SALT_BYTES + IV_BYTES)
  const key = await deriveKey(passphrase, salt)
  return new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext),
  )
}
