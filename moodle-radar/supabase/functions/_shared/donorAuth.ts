/**
 * Shared Donor Authentication & Reactive Self-Healing Service
 * Specification Reference: moodle-token-auto-renewal-plan.md
 * 
 * Provides fail-fast zero-lockout protection and AES-256-GCM authenticated credential handling.
 */

import { decryptToken, encryptToken } from './crypto.ts'
import { fetchMoodleToken, MoodleApiError } from './moodleClient.ts'

export class DonorLockoutPreventedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DonorLockoutPreventedError'
  }
}

export interface DonorTokenRecord {
  id: string
  label: string
  moodle_user_id?: number
  moodle_user_fullname?: string
  moodle_base_url: string
  encrypted_token: Uint8Array | string
  iv: Uint8Array | string
  auth_tag: Uint8Array | string
  status: 'active' | 'revoked' | 'expired'
  auth_mode?: 'token' | 'credentials'
  username?: string | null
  encrypted_password?: Uint8Array | string | null
  password_iv?: Uint8Array | string | null
  password_auth_tag?: Uint8Array | string | null
  moodle_service?: string
  auto_refresh_enabled?: boolean
  last_refreshed_at?: string | null
  last_validated_at?: string | null
  last_error_message?: string | null
  created_at?: string
  updated_at?: string
}

export interface SelfHealingResult {
  success: boolean
  token: string
  updatedDonor: Partial<DonorTokenRecord>
}

/**
 * Reactively re-authenticates a donor using stored AES-256-GCM encrypted credentials.
 * 
 * Engineering Safeguards:
 * 1. Fail-fast zero-lockout protection: on attempt #1 of invalid credentials, halts immediately,
 *    marks auto_refresh_enabled = FALSE and status = 'revoked' to prevent university portal lockouts.
 * 2. Transient memory only: decrypted passwords are never saved, logged, or returned.
 */
export async function attemptReactiveSelfHealing(
  supabase: any,
  donor: DonorTokenRecord,
  masterKey: string
): Promise<SelfHealingResult> {
  if (donor.auth_mode !== 'credentials') {
    throw new Error(`Donor "${donor.label}" is configured for manual tokens; self-healing is not enabled.`)
  }

  if (donor.auto_refresh_enabled === false) {
    throw new Error(`Auto self-healing is disabled for donor "${donor.label}" (likely due to previous credential failure).`)
  }

  if (!donor.username || !donor.encrypted_password || !donor.password_iv || !donor.password_auth_tag) {
    throw new Error(`Donor "${donor.label}" has incomplete credential vault data for self-healing.`)
  }

  // 1. Decrypt university password in volatile memory
  let plainPassword: string
  try {
    plainPassword = await decryptToken(
      {
        encrypted_token: donor.encrypted_password,
        iv: donor.password_iv,
        auth_tag: donor.password_auth_tag,
      },
      masterKey
    )
  } catch (decryptErr) {
    const msg = `Password decryption failed for donor "${donor.label}": ${decryptErr instanceof Error ? decryptErr.message : String(decryptErr)}`
    console.error(msg)
    await supabase
      .from('donor_tokens')
      .update({
        status: 'expired',
        last_error_message: msg,
        updated_at: new Date().toISOString(),
      })
      .eq('id', donor.id)
    throw new Error(msg)
  }

  // 2. Request fresh wstoken from Moodle /login/token.php
  let freshToken: string
  const serviceName = donor.moodle_service || 'moodle_mobile_app'

  try {
    freshToken = await fetchMoodleToken(
      donor.moodle_base_url,
      donor.username,
      plainPassword,
      serviceName
    )
  } catch (moodleErr: unknown) {
    if (moodleErr instanceof MoodleApiError) {
      const code = (moodleErr.errorCode || '').toLowerCase()
      // Zero-lockout protection: if university rejects username/password, halt immediately!
      if (code === 'invalidlogin' || code === 'login_error' || moodleErr.httpStatus === 401) {
        const lockoutMsg = 'Invalid university credentials: auto-refresh disabled immediately on first attempt to prevent student account lockout.'
        console.warn(`[Zero-Lockout Protection] ${lockoutMsg} (Donor #${donor.id})`)

        await supabase
          .from('donor_tokens')
          .update({
            auto_refresh_enabled: false,
            status: 'revoked',
            last_error_message: lockoutMsg,
            updated_at: new Date().toISOString(),
          })
          .eq('id', donor.id)

        throw new DonorLockoutPreventedError(lockoutMsg)
      }
    }

    // Network timeout or temporary 5xx errors from university server:
    // Do not disable auto_refresh_enabled, simply report error
    const genericMsg = moodleErr instanceof Error ? moodleErr.message : String(moodleErr)
    throw new Error(`Self-healing failed to connect to Moodle token endpoint: ${genericMsg}`)
  }

  // 3. Encrypt fresh wstoken using AES-256-GCM
  const encryptedFreshToken = await encryptToken(freshToken, masterKey)

  // 4. Update donor_tokens in database
  const nowIso = new Date().toISOString()
  const dbUpdates = {
    encrypted_token: encryptedFreshToken.encrypted_token_hex,
    iv: encryptedFreshToken.iv_hex,
    auth_tag: encryptedFreshToken.auth_tag_hex,
    status: 'active' as const,
    last_refreshed_at: nowIso,
    last_validated_at: nowIso,
    last_error_message: null,
    updated_at: nowIso,
  }

  const { error: dbError } = await supabase
    .from('donor_tokens')
    .update(dbUpdates)
    .eq('id', donor.id)

  if (dbError) {
    throw new Error(`Failed to update database with refreshed token: ${dbError.message}`)
  }

  return {
    success: true,
    token: freshToken,
    updatedDonor: {
      ...donor,
      ...dbUpdates,
      encrypted_token: encryptedFreshToken.encrypted_token_hex,
      iv: encryptedFreshToken.iv_hex,
      auth_tag: encryptedFreshToken.auth_tag_hex,
      status: 'active',
      last_refreshed_at: nowIso,
      last_validated_at: nowIso,
      last_error_message: null,
    },
  }
}
