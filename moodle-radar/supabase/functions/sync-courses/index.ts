/**
 * Edge Function: /sync-courses
 * Specification Reference: specs/03-edge-functions-spec.md Section 3.1
 * 
 * Validates donor token via Moodle API, encrypts it via AES-256-GCM,
 * registers donor in PostgreSQL, and syncs enrolled courses.
 */

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getSiteInfo, getUsersCourses, MoodleApiError } from '../_shared/moodleClient.ts'
import { encryptToken } from '../_shared/crypto.ts'

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  if (req.method !== 'POST') {
    return errorResponse('Method Not Allowed: Expected POST', 405)
  }

  try {
    const body = await req.json().catch(() => ({}))
    const { label, moodle_base_url, wstoken } = body

    if (!label || typeof label !== 'string' || !label.trim()) {
      return errorResponse('Missing required parameter: label', 400, 'INVALID_LABEL')
    }

    if (!wstoken || typeof wstoken !== 'string' || !wstoken.trim()) {
      return errorResponse('Missing required parameter: wstoken', 400, 'INVALID_WSTOKEN')
    }

    const cleanBaseUrl = (moodle_base_url && typeof moodle_base_url === 'string')
      ? moodle_base_url.trim().replace(/\/+$/, '')
      : 'https://moodle.university.edu'

    // 1. Handshake with Moodle via core_webservice_get_site_info
    let siteInfo
    try {
      siteInfo = await getSiteInfo(cleanBaseUrl, wstoken.trim())
    } catch (moodleErr: unknown) {
      const msg = moodleErr instanceof MoodleApiError
        ? moodleErr.message
        : moodleErr instanceof Error
        ? moodleErr.message
        : 'Failed to authenticate with Moodle'
      return errorResponse(msg, 400, 'MOODLE_VALIDATION_ERROR')
    }

    // 2. Encrypt token via AES-256-GCM
    const masterKey = Deno.env.get('MASTER_ENCRYPTION_KEY') || Deno.env.get('ENCRYPTION_MASTER_KEY') || ''
    if (!masterKey) {
      throw new Error('Master encryption key is not configured in Supabase environment secrets.')
    }
    const encrypted = await encryptToken(wstoken.trim(), masterKey)

    // 3. Initialize elevated Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // 4. Save or update donor token in donor_tokens table
    const donorPayload = {
      label: label.trim(),
      moodle_user_id: siteInfo.userid,
      moodle_user_fullname: siteInfo.fullname,
      moodle_base_url: cleanBaseUrl,
      encrypted_token: encrypted.encrypted_token_hex,
      iv: encrypted.iv_hex,
      auth_tag: encrypted.auth_tag_hex,
      status: 'active',
      last_validated_at: new Date().toISOString(),
      last_error_message: null,
      updated_at: new Date().toISOString(),
    }

    const { data: existingDonor } = await supabase
      .from('donor_tokens')
      .select('id')
      .eq('label', label.trim())
      .maybeSingle()

    let donor: any = null
    if (existingDonor) {
      const { data: updated, error: updateError } = await supabase
        .from('donor_tokens')
        .update(donorPayload)
        .eq('id', existingDonor.id)
        .select()
        .single()

      if (updateError) {
        throw new Error(`Database error updating donor token: ${updateError.message}`)
      }
      donor = updated
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('donor_tokens')
        .insert(donorPayload)
        .select()
        .single()

      if (insertError) {
        throw new Error(`Database error saving donor token: ${insertError.message}`)
      }
      donor = inserted
    }

    // 5. Discover enrolled courses from Moodle
    let enrolledCourses = []
    try {
      enrolledCourses = await getUsersCourses(cleanBaseUrl, wstoken.trim(), siteInfo.userid)
    } catch (courseErr: unknown) {
      console.warn('Could not auto-fetch enrolled courses:', courseErr)
    }

    // 6. Sync courses into courses table
    const syncedCourses = []
    for (const c of enrolledCourses) {
      // Check if course already exists
      const { data: existingCourse } = await supabase
        .from('courses')
        .select('id, donor_token_id, fallback_token_id')
        .eq('id', c.id)
        .maybeSingle()

      if (existingCourse) {
        // Link as fallback token if different donor
        if (existingCourse.donor_token_id !== donor.id && !existingCourse.fallback_token_id) {
          await supabase
            .from('courses')
            .update({
              fallback_token_id: donor.id,
              updated_at: new Date().toISOString(),
            })
            .eq('id', c.id)
        }
        syncedCourses.push({ id: c.id, fullname: c.fullname, isNew: false })
      } else {
        // Insert new course
        const { error: insertError } = await supabase.from('courses').insert({
          id: c.id,
          fullname: c.fullname,
          shortname: c.shortname || `#${c.id}`,
          category_id: c.category || null,
          cohort_tag: label.trim(),
          donor_token_id: donor.id,
          fallback_token_id: null,
          is_monitored: true,
          filter_forum: true,
          filter_assign: true,
          filter_resources: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })

        if (!insertError) {
          syncedCourses.push({ id: c.id, fullname: c.fullname, isNew: true })
        }
      }
    }

    return jsonResponse({
      success: true,
      donor_id: donor.id,
      moodle_user_fullname: siteInfo.fullname,
      moodle_user_id: siteInfo.userid,
      synced_courses_count: syncedCourses.length,
      courses: syncedCourses,
    })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error('Unhandled error in /sync-courses:', err)
    return errorResponse(`Internal server error: ${errorMsg}`, 500, 'INTERNAL_SERVER_ERROR')
  }
})
