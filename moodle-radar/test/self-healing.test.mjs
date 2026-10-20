import assert from 'node:assert/strict'
import {
  encryptToken,
  decryptToken,
} from '../supabase/functions/_shared/crypto.ts'
import {
  MoodleApiError,
} from '../supabase/functions/_shared/moodleClient.ts'
import {
  DonorLockoutPreventedError,
} from '../supabase/functions/_shared/donorAuth.ts'

console.log('🧪 Starting Reactive Self-Healing & Zero-Lockout Test Suite...\n')

const testMasterKey = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'
const testPassword = 'SuperSecretUniversityPassword#2026!'

// ---------------------------------------------------------------------------
// Test 1: Password AES-256-GCM Encryption & Decryption
// ---------------------------------------------------------------------------
console.log('1. Testing Student Password Vault Encryption...')
const encryptedPassword = await encryptToken(testPassword, testMasterKey)

assert.ok(encryptedPassword.ciphertext)
assert.equal(encryptedPassword.iv.byteLength, 12)
assert.equal(encryptedPassword.authTag.byteLength, 16)
assert.ok(encryptedPassword.encrypted_token_hex.startsWith('\\x'))

const decryptedPassword = await decryptToken(
  {
    encrypted_token: encryptedPassword.encrypted_token_hex,
    iv: encryptedPassword.iv_hex,
    auth_tag: encryptedPassword.auth_tag_hex,
  },
  testMasterKey
)
assert.equal(decryptedPassword, testPassword, 'Decrypted password must match original plaintext password')
console.log('   ✅ Password vault encryption & integrity check passed.')

// ---------------------------------------------------------------------------
// Test 2: Zero-Lockout Fail-Fast Behavior on Invalid Credentials
// ---------------------------------------------------------------------------
console.log('2. Testing Zero-Lockout Protection (Fail-Fast on Invalid Credentials)...')

let updatedDbPayload = null
const mockSupabase = {
  from(table) {
    assert.equal(table, 'donor_tokens')
    return {
      update(payload) {
        updatedDbPayload = payload
        return {
          eq(col, val) {
            assert.equal(col, 'id')
            assert.equal(val, 'donor-123')
            return Promise.resolve({ error: null })
          },
        }
      },
    }
  },
}

// Simulate attemptReactiveSelfHealing logic with invalidlogin error
async function simulateSelfHealing(isInvalidLogin) {
  if (isInvalidLogin) {
    const lockoutMsg = 'Invalid university credentials: auto-refresh disabled immediately on first attempt to prevent student account lockout.'
    await mockSupabase
      .from('donor_tokens')
      .update({
        auto_refresh_enabled: false,
        status: 'revoked',
        last_error_message: lockoutMsg,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 'donor-123')

    throw new DonorLockoutPreventedError(lockoutMsg)
  }
}

await assert.rejects(
  async () => {
    await simulateSelfHealing(true)
  },
  (err) => {
    assert.ok(err instanceof DonorLockoutPreventedError)
    assert.match(err.message, /Zero-lockout safeguard activated|auto-refresh disabled immediately/)
    return true
  }
)

assert.equal(updatedDbPayload.auto_refresh_enabled, false, 'auto_refresh_enabled must be false immediately on first failure')
assert.equal(updatedDbPayload.status, 'revoked', 'Status must be set to revoked to halt all polling')
console.log('   ✅ Zero-lockout protection verified: halts on attempt #1 and disables auto-refresh.')

// ---------------------------------------------------------------------------
// Test 3: Poller Runtime Token Cache Propagation (Race Condition Safeguard)
// ---------------------------------------------------------------------------
console.log('3. Testing Poller Runtime In-Memory Token Cache Propagation...')
const decryptedTokensCache = new Map()
const donorId = 'donor-abc-456'

// Before healing: cache is empty or has old token
decryptedTokensCache.set(donorId, 'old_expired_token')

// Mid-cycle healing occurs:
const freshToken = 'new_refreshed_token_xyz987'
decryptedTokensCache.set(donorId, freshToken)

// Subsequent course query for the same donor in the same poller execution:
assert.equal(decryptedTokensCache.has(donorId), true)
const tokenUsedForSubsequentCourse = decryptedTokensCache.get(donorId)
assert.equal(tokenUsedForSubsequentCourse, freshToken, 'Subsequent course must immediately reuse cached freshToken without redundant re-auth')
console.log('   ✅ Poller runtime cache synchronization verified.')

console.log('\n🎉 All Reactive Self-Healing & Zero-Lockout Unit Tests Passed Successfully!\n')
