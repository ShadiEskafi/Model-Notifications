import assert from 'node:assert/strict'
import {
  encryptToken,
  decryptToken,
  bytesToPostgresHex,
  hexToBytes,
  CryptoError,
} from '../supabase/functions/_shared/crypto.ts'
import { handleCors, jsonResponse, errorResponse } from '../supabase/functions/_shared/cors.ts'
import {
  escapeHtml,
  formatMoodleAlertMessage,
} from '../supabase/functions/_shared/telegramClient.ts'

console.log('🧪 Starting Spec 03 Edge Functions Test Suite...\n')

// ---------------------------------------------------------------------------
// Test 1: AES-256-GCM Token Encryption & Decryption Roundtrip
// ---------------------------------------------------------------------------
console.log('1. Testing AES-256-GCM Encryption / Decryption...')
const testMasterKey = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'
const testPlainToken = '9f82b4c107e361284a123456789abcdef'

const encrypted = await encryptToken(testPlainToken, testMasterKey)
assert.ok(encrypted.ciphertext)
assert.equal(encrypted.iv.byteLength, 12, 'IV must be 12 bytes for AES-GCM')
assert.equal(encrypted.authTag.byteLength, 16, 'Auth tag must be 16 bytes (128 bits)')
assert.ok(encrypted.encrypted_token_hex.startsWith('\\x'))
assert.ok(encrypted.iv_hex.startsWith('\\x'))
assert.ok(encrypted.auth_tag_hex.startsWith('\\x'))

const decrypted = await decryptToken(
  {
    encrypted_token: encrypted.encrypted_token_hex,
    iv: encrypted.iv_hex,
    auth_tag: encrypted.auth_tag_hex,
  },
  testMasterKey
)
assert.equal(decrypted, testPlainToken, 'Decrypted token must match original plaintext token')
console.log('   ✅ Encryption & decryption roundtrip passed.')

// ---------------------------------------------------------------------------
// Test 2: Tamper Resistance & Integrity Verification
// ---------------------------------------------------------------------------
console.log('2. Testing Tamper Resistance & Auth Tag Verification...')
// Alter one byte in the ciphertext
const tamperedCipher = new Uint8Array(encrypted.ciphertext)
tamperedCipher[0] = tamperedCipher[0] ^ 0xff

await assert.rejects(
  async () => {
    await decryptToken(
      {
        encrypted_token: tamperedCipher,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag,
      },
      testMasterKey
    )
  },
  (err) => {
    assert.ok(err instanceof CryptoError)
    return true
  },
  'Tampered ciphertext must be rejected by AES-GCM authentication tag check'
)
console.log('   ✅ Tamper resistance & integrity verification passed.')

// ---------------------------------------------------------------------------
// Test 3: PostgreSQL Hex Conversion
// ---------------------------------------------------------------------------
console.log('3. Testing PostgreSQL BYTEA Hex Converters...')
const sampleBytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01, 0x23])
const pgHex = bytesToPostgresHex(sampleBytes)
assert.equal(pgHex, '\\xdeadbeef0123')

const recoveredBytes = hexToBytes(pgHex)
assert.deepEqual(recoveredBytes, sampleBytes)
console.log('   ✅ PostgreSQL BYTEA hex conversion passed.')

// ---------------------------------------------------------------------------
// Test 4: CORS and HTTP Responses
// ---------------------------------------------------------------------------
console.log('4. Testing CORS and HTTP Responses...')
const optionsReq = new Request('https://edge.supabase.co/sync-courses', {
  method: 'OPTIONS',
})
const preflightRes = handleCors(optionsReq)
assert.ok(preflightRes)
assert.equal(preflightRes.status, 200)

const getReq = new Request('https://edge.supabase.co/sync-courses', { method: 'POST' })
assert.equal(handleCors(getReq), null)

const okRes = jsonResponse({ success: true, count: 5 }, 200)
assert.equal(okRes.status, 200)
assert.equal(okRes.headers.get('Content-Type'), 'application/json; charset=utf-8')

const errRes = errorResponse('Invalid token', 400, 'INVALID_TOKEN')
assert.equal(errRes.status, 400)
console.log('   ✅ CORS and response helpers passed.')

// ---------------------------------------------------------------------------
// Test 5: Telegram Client HTML Formatting & Escaping
// ---------------------------------------------------------------------------
console.log('5. Testing Telegram HTML Alert Formatter...')
const rawText = 'Calculus <I> & "Matrix" Test'
assert.equal(escapeHtml(rawText), 'Calculus &lt;I&gt; &amp; &quot;Matrix&quot; Test')

const alertHtml = formatMoodleAlertMessage({
  courseName: 'الأمن السيبراني',
  courseShortname: 'SEC301',
  cohortTag: 'السنة الثالثة',
  eventType: 'EVENT_CREATED',
  itemType: 'mod_assign',
  itemTitle: 'واجب التشفير رقم 1',
  itemUrl: 'https://moodle.university.edu/mod/assign/view.php?id=9820',
  author: 'د. خالد عمر',
  dueDate: 1713999600,
})

assert.ok(alertHtml.includes('📝 تكليف جديد'))
assert.ok(alertHtml.includes('الأمن السيبراني'))
assert.ok(alertHtml.includes('SEC301'))
assert.ok(alertHtml.includes('واجب التشفير رقم 1'))
assert.ok(alertHtml.includes('د. خالد عمر'))
assert.ok(alertHtml.includes('https://moodle.university.edu/mod/assign/view.php?id=9820'))
console.log('   ✅ Telegram HTML alert message formatting passed.')

console.log('\n🎉 ALL SPEC 03 EDGE FUNCTIONS TESTS PASSED CLEANLY!\n')
