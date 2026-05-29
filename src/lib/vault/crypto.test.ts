import { describe, expect, it } from 'vitest'
import { encryptBlob, decryptBlob } from './crypto'

const pass = 'correct-horse-battery-staple-long'
const plaintext = new TextEncoder().encode('hello vault — SQLite bytes would go here')

describe('encryptBlob / decryptBlob', () => {
  it('roundtrip with correct passphrase', async () => {
    const blob = await encryptBlob(plaintext, pass)
    const back = await decryptBlob(blob, pass)
    expect(new TextDecoder().decode(back)).toBe(new TextDecoder().decode(plaintext))
  })

  it('throws on wrong passphrase', async () => {
    const blob = await encryptBlob(plaintext, pass)
    await expect(decryptBlob(blob, 'wrong')).rejects.toThrow()
  })

  it('handles empty plaintext', async () => {
    const blob = await encryptBlob(new Uint8Array(0), pass)
    const back = await decryptBlob(blob, pass)
    expect(back.byteLength).toBe(0)
  })

  it('each encryption produces a unique ciphertext (random IV + salt)', async () => {
    const a = await encryptBlob(plaintext, pass)
    const b = await encryptBlob(plaintext, pass)
    expect(a).not.toEqual(b)
  })

  it('blob layout: salt(16) + iv(12) + ciphertext >= plaintext length', async () => {
    const blob = await encryptBlob(plaintext, pass)
    expect(blob.byteLength).toBeGreaterThan(16 + 12 + plaintext.byteLength)
  })
})
