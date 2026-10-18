/**
 * Cryptographic Engine: AES-256-GCM via Web Crypto API
 * Specification Reference: specs/03-edge-functions-spec.md Section 2
 * 
 * Securely encrypts and decrypts donor tokens with PostgreSQL BYTEA hex support (\x...).
 */

export interface EncryptedResult {
  ciphertext: Uint8Array
  iv: Uint8Array
  authTag: Uint8Array
  encrypted_token_hex: string
  iv_hex: string
  auth_tag_hex: string
}

export interface EncryptedInput {
  encrypted_token: Uint8Array | string
  iv: Uint8Array | string
  auth_tag: Uint8Array | string
}

export class CryptoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CryptoError'
  }
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function hexToBytes(hex: string): Uint8Array {
  // Strip PostgreSQL bytea prefix if present: \x or \\x
  const cleanHex = hex.replace(/^\\*x/i, '')
  if (cleanHex.length % 2 !== 0) {
    throw new CryptoError('Hex string must have an even length')
  }

  const bytes = new Uint8Array(cleanHex.length / 2)
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16)
  }
  return bytes
}

export function bytesToPostgresHex(bytes: Uint8Array): string {
  return `\\x${bytesToHex(bytes)}`
}

function normalizeToBytes(input: Uint8Array | string): Uint8Array {
  if (input instanceof Uint8Array) {
    return input
  }
  if (typeof input === 'string') {
    return hexToBytes(input)
  }
  throw new CryptoError('Invalid input type: expected Uint8Array or hex string')
}

export async function getMasterCryptoKey(masterHex?: string): Promise<CryptoKey> {
  let keyHex = masterHex
  if (!keyHex) {
    // Try Deno or Node env
    if (typeof Deno !== 'undefined' && Deno.env?.get) {
      keyHex = Deno.env.get('ENCRYPTION_MASTER_KEY')
    } else if (typeof process !== 'undefined' && process.env) {
      keyHex = process.env.ENCRYPTION_MASTER_KEY
    }
  }

  // Fallback for local development if not yet set
  if (!keyHex) {
    keyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  }

  const cleanHex = keyHex.replace(/^\\*x/i, '')
  if (cleanHex.length !== 64) {
    throw new CryptoError('ENCRYPTION_MASTER_KEY must be a 64-character hexadecimal string (256 bits)')
  }

  const rawBytes = hexToBytes(cleanHex)
  return await crypto.subtle.importKey(
    'raw',
    rawBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Encrypts a plaintext donor token with AES-256-GCM using a random 12-byte IV.
 */
export async function encryptToken(
  plainToken: string,
  masterKeyHex?: string
): Promise<EncryptedResult> {
  const key = await getMasterCryptoKey(masterKeyHex)
  const iv = crypto.getRandomValues(new Uint8Array(12)) // 12-byte IV
  const encoded = new TextEncoder().encode(plainToken)

  const combined = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    encoded
  )

  const combinedBytes = new Uint8Array(combined)
  const authTag = combinedBytes.slice(combinedBytes.byteLength - 16)
  const ciphertext = combinedBytes.slice(0, combinedBytes.byteLength - 16)

  return {
    ciphertext,
    iv,
    authTag,
    encrypted_token_hex: bytesToPostgresHex(ciphertext),
    iv_hex: bytesToPostgresHex(iv),
    auth_tag_hex: bytesToPostgresHex(authTag),
  }
}

/**
 * Decrypts an encrypted donor token payload with integrity authentication.
 */
export async function decryptToken(
  payload: EncryptedInput,
  masterKeyHex?: string
): Promise<string> {
  const key = await getMasterCryptoKey(masterKeyHex)

  const ciphertextBytes = normalizeToBytes(payload.encrypted_token)
  const ivBytes = normalizeToBytes(payload.iv)
  const authTagBytes = normalizeToBytes(payload.auth_tag)

  if (ivBytes.byteLength !== 12) {
    throw new CryptoError(`Invalid IV length: expected 12 bytes, got ${ivBytes.byteLength}`)
  }
  if (authTagBytes.byteLength !== 16) {
    throw new CryptoError(`Invalid auth tag length: expected 16 bytes, got ${authTagBytes.byteLength}`)
  }

  // Web Crypto expects ciphertext concatenated with the 16-byte auth tag
  const combined = new Uint8Array(ciphertextBytes.byteLength + authTagBytes.byteLength)
  combined.set(ciphertextBytes, 0)
  combined.set(authTagBytes, ciphertextBytes.byteLength)

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes, tagLength: 128 },
      key,
      combined
    )
    return new TextDecoder().decode(decrypted)
  } catch (err: unknown) {
    throw new CryptoError(
      `Decryption failed: auth tag mismatch or corrupted ciphertext (${err instanceof Error ? err.message : String(err)})`
    )
  }
}
