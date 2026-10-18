/**
 * Edge Function: /moodle-poller
 * Specification Reference: specs/03-edge-functions-spec.md Section 3.2
 * 
 * Scheduled batch delta poller executed every 10 minutes via pg_cron
 * or on-demand diagnostic trigger from the Web Dashboard.
 */

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import {
  getCourseContents,
  getCourseLabels,
  getForumDiscussions,
  getJitterDelay,
  MoodleApiError,
} from '../_shared/moodleClient.ts'
import { decryptToken } from '../_shared/crypto.ts'
import { CircuitBreaker } from '../_shared/circuitBreaker.ts'
import {
  evaluateModuleDelta,
  evaluateDiscussionDelta,
  buildCompositeId,
  DeltaEvent,
} from '../_shared/deltaEngine.ts'
import {
  formatMoodleAlertMessage,
  dispatchBatchedMessages,
  cleanSnippet,
} from '../_shared/telegramClient.ts'
import { buildAlertKeyboard } from '../_shared/telegramBotUi.ts'

Deno.serve(async (req: Request) => {
  const startTime = Date.now()
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    const body = await req.json().catch(() => ({}))
    const onDemandCourseId = body.courseId ? Number(body.courseId) : null

    // 1. Initialize elevated Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') || ''
    const masterKey = Deno.env.get('MASTER_ENCRYPTION_KEY') || Deno.env.get('ENCRYPTION_MASTER_KEY') || ''

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // 2. Fetch courses to poll
    let query = supabase
      .from('courses')
      .select('*, donor_tokens!donor_token_id(*)')

    if (onDemandCourseId) {
      query = query.eq('id', onDemandCourseId)
    } else {
      query = query.eq('is_monitored', true)
    }

    const { data: courses, error: coursesError } = await query

    if (coursesError) {
      throw new Error(`Failed to query courses: ${coursesError.message}`)
    }

    if (!courses || courses.length === 0) {
      return jsonResponse({
        status: 'completed',
        message: onDemandCourseId
          ? `Course #${onDemandCourseId} not found or not monitored`
          : 'No active monitored courses found',
        polled_courses: 0,
        events_detected: 0,
        messages_dispatched: 0,
        execution_duration_ms: Date.now() - startTime,
      })
    }

    // -------------------------------------------------------------------------
    // Mode A: Test Broadcast by Time Window (Admin Diagnostic Broadcast)
    // -------------------------------------------------------------------------
    const isTestBroadcast = body.mode === 'test_broadcast'
    if (isTestBroadcast) {
      if (!onDemandCourseId) {
        return errorResponse('Missing required parameter: courseId', 400, 'INVALID_COURSE_ID')
      }

      const targetCourse = courses[0]
      const donor = targetCourse.donor_tokens
      if (!donor) {
        return errorResponse(`المساق #${targetCourse.id} غير مرتبط بأي حساب متبرع`, 400, 'NO_DONOR_TOKEN')
      }

      // Decrypt token
      let plainToken: string
      try {
        plainToken = await decryptToken(
          {
            encrypted_token: donor.encrypted_token,
            iv: donor.iv,
            auth_tag: donor.auth_tag,
          },
          masterKey
        )
      } catch (decryptErr) {
        return errorResponse(
          `فشل فك تشفير توكن المتبرع: ${decryptErr instanceof Error ? decryptErr.message : String(decryptErr)}`,
          500,
          'DECRYPT_ERROR'
        )
      }

      // Fetch course contents
      const sections = await getCourseContents(donor.moodle_base_url, plainToken, targetCourse.id)
      const allModules = sections.flatMap((s) => s.modules || [])

      // Fetch course labels (Text & Media areas / direct section announcements)
      const labelMap = new Map<number, any>()
      if (allModules.some((m) => m.modname === 'label')) {
        const labels = await getCourseLabels(donor.moodle_base_url, plainToken, targetCourse.id)
        for (const l of labels) {
          if (l.coursemodule) labelMap.set(l.coursemodule, l)
          if (l.id) labelMap.set(l.id, l)
        }
      }

      interface CandidateItem {
        itemType: 'mod_forum' | 'mod_assign' | 'mod_resource' | 'mod_url'
        itemTitle: string
        timemodified: number
        itemUrl?: string
        author?: string
        dueDate?: number
        previewSnippet?: string
      }

      const candidates: CandidateItem[] = []

      // Modules (Assignments, Resources, URLs, Folders, Labels)
      for (const mod of allModules) {
        const modname = mod.modname
        let itemType: 'mod_forum' | 'mod_assign' | 'mod_resource' | 'mod_url' | null = null

        if (modname === 'assign') itemType = 'mod_assign'
        else if (modname === 'resource' || modname === 'folder') itemType = 'mod_resource'
        else if (modname === 'url') itemType = 'mod_url'
        else if (modname === 'forum') itemType = 'mod_forum'
        else if (modname === 'label') itemType = 'mod_forum'

        if (!itemType) continue

        // 1. Text & Media area announcement (mod_label)
        if (modname === 'label') {
          const labelData = labelMap.get(mod.id) || labelMap.get(mod.instance)
          const timemodified = labelData?.timemodified || 0
          const rawText = labelData?.intro || mod.description || ''
          const previewSnippet = cleanSnippet(rawText)

          candidates.push({
            itemType: 'mod_forum',
            itemTitle: mod.name || 'إعلان / ملاحظة هامة',
            timemodified,
            itemUrl: `${donor.moodle_base_url.replace(/\/+$/, '')}/course/view.php?id=${targetCourse.id}`,
            previewSnippet,
          })
          continue
        }

        // 2. Forum announcements
        if (modname === 'forum') {
          try {
            const forumId = mod.instance || mod.id
            const discussions = await getForumDiscussions(donor.moodle_base_url, plainToken, forumId, 0, 5)
            for (const disc of discussions) {
              const discTime = disc.timemodified || disc.created || 0
              candidates.push({
                itemType: 'mod_forum',
                itemTitle: disc.name,
                timemodified: discTime,
                itemUrl: `${donor.moodle_base_url.replace(/\/+$/, '')}/mod/forum/discuss.php?d=${disc.id}`,
                author: disc.userfullname,
                previewSnippet: cleanSnippet(disc.message),
              })
            }
          } catch (forumErr) {
            console.warn(`Could not fetch forum discussions for test broadcast:`, forumErr)
          }
          continue
        }

        // 3. Regular modules (resources, assignments, URLs)
        let timemodified = 0
        if (mod.dates && mod.dates.length > 0) {
          timemodified = Math.max(...mod.dates.map((d: any) => d.timestamp || 0))
        }
        if (mod.contents && mod.contents.length > 0) {
          const contentTimes = mod.contents.map((c: any) => c.timemodified || 0)
          timemodified = Math.max(timemodified, ...contentTimes)
        }

        const dueDate = mod.dates?.find((d: any) => d.label?.includes('Due'))?.timestamp

        candidates.push({
          itemType,
          itemTitle: mod.name,
          timemodified,
          itemUrl: mod.url,
          dueDate,
        })
      }

      if (candidates.length === 0) {
        return jsonResponse({
          success: false,
          message: 'المساق لا يحتوي على أي ملفات أو واجبات أو إعلانات منشورة على مودل حالياً.',
        })
      }

      // Filter by time window if specified
      const timeWindowHours = typeof body.timeWindowHours === 'number' ? body.timeWindowHours : 24
      let filteredCandidates = candidates

      if (timeWindowHours > 0) {
        const cutoff = Math.floor(Date.now() / 1000) - (timeWindowHours * 3600)
        filteredCandidates = candidates.filter((c) => c.timemodified >= cutoff)

        if (filteredCandidates.length === 0) {
          const windowText = timeWindowHours === 24
            ? 'آخر 24 ساعة'
            : timeWindowHours === 72
            ? 'آخر 3 أيام'
            : timeWindowHours === 168
            ? 'آخر أسبوع'
            : `آخر ${timeWindowHours} ساعة`

          return jsonResponse({
            success: false,
            message: `لم يتم العثور على أي تحديثات منشورة في هذا المساق خلال ${windowText}. يمكنك اختيار "أحدث محتوى متاح" لإرسال آخر نشاط مسجل.`,
          })
        }
      }

      // Sort descending by timemodified
      filteredCandidates.sort((a, b) => b.timemodified - a.timemodified)
      const selectedItem = filteredCandidates[0]

      // Fetch active subscribers for this course
      const { data: subscriberRows } = await supabase
        .from('subscriptions')
        .select('telegram_id, bot_users(is_paused)')
        .eq('course_id', targetCourse.id)

      const activeChatIds = (subscriberRows || [])
        .filter((row: any) => !row.bot_users?.is_paused)
        .map((row: any) => row.telegram_id)

      if (activeChatIds.length === 0) {
        return jsonResponse({
          success: true,
          deliveredCount: 0,
          failureCount: 0,
          recipientsCount: 0,
          itemTitle: selectedItem.itemTitle,
          itemType: selectedItem.itemType,
          message: `تم رصد أحدث عنصر: "${selectedItem.itemTitle}"، ولكن لا يوجد أي طالب مشترك في هذا المساق حالياً في بوت تليجرام. اشترك في المساق عبر البوت أولاً لتصلك الرسالة!`,
        })
      }

      // Format alert message
      const alertHtml = `<b>[🧪 إرسال تجريبي / اختبار]</b>\n` + formatMoodleAlertMessage({
        courseName: targetCourse.fullname,
        courseShortname: targetCourse.shortname,
        cohortTag: targetCourse.cohort_tag,
        eventType: 'EVENT_CREATED',
        itemType: selectedItem.itemType,
        itemTitle: selectedItem.itemTitle,
        itemUrl: selectedItem.itemUrl,
        author: selectedItem.author,
        dueDate: selectedItem.dueDate,
        previewSnippet: selectedItem.previewSnippet,
      })

      // Dispatch
      const dispatchRes = await dispatchBatchedMessages(botToken, activeChatIds, alertHtml, {
        reply_markup: {
          inline_keyboard: buildAlertKeyboard(selectedItem.itemUrl),
        },
      })

      // Log to notification_logs
      await supabase.from('notification_logs').insert({
        course_id: targetCourse.id,
        event_type: 'TEST_BROADCAST',
        item_title: `[تجريبي] ${selectedItem.itemTitle}`,
        recipients_count: activeChatIds.length,
        success_count: dispatchRes.successCount,
        failure_count: dispatchRes.failureCount,
        status: dispatchRes.failureCount === 0 ? 'success' : dispatchRes.successCount > 0 ? 'partial' : 'failed',
        error_details: dispatchRes.errors.length > 0 ? dispatchRes.errors.slice(0, 5).join('\n') : null,
        created_at: new Date().toISOString(),
      })

      return jsonResponse({
        success: true,
        mode: 'test_broadcast',
        deliveredCount: dispatchRes.successCount,
        failureCount: dispatchRes.failureCount,
        recipientsCount: activeChatIds.length,
        itemTitle: selectedItem.itemTitle,
        itemType: selectedItem.itemType,
        message: `تم إرسال أحدث عنصر: "${selectedItem.itemTitle}" بنجاح إلى ${dispatchRes.successCount} طالب على تليجرام.`,
      })
    }

    // -------------------------------------------------------------------------
    // Mode B: Standard Automated Polling Engine (Scheduled Cron / Manual Poll)
    // -------------------------------------------------------------------------
    // 3. Cache decrypted donor tokens
    const decryptedTokensCache = new Map<string, string>()
    const circuitBreaker = new CircuitBreaker({ maxConsecutiveFailures: 3 })

    let eventsDetectedCount = 0
    let messagesDispatchedCount = 0

    // 4. Sequential polling loop with jitter delay
    for (let i = 0; i < courses.length; i++) {
      const course = courses[i]

      // Check Circuit Breaker status
      if (!circuitBreaker.canExecute()) {
        console.error('Circuit breaker tripped! Halting current poller cycle.')
        break
      }

      // Add randomized jitter delay between courses (evade firewall triggers)
      if (i > 0) {
        await getJitterDelay(500, 1200)
      }

      const donor = course.donor_tokens
      if (!donor) {
        console.warn(`Course #${course.id} has no assigned donor token. Skipping.`)
        continue
      }

      if (donor.status !== 'active') {
        console.warn(`Donor ${donor.id} is ${donor.status}. Skipping course #${course.id}.`)
        continue
      }

      // Retrieve or decrypt token
      let plainToken: string
      try {
        if (decryptedTokensCache.has(donor.id)) {
          plainToken = decryptedTokensCache.get(donor.id)!
        } else {
          plainToken = await decryptToken(
            {
              encrypted_token: donor.encrypted_token,
              iv: donor.iv,
              auth_tag: donor.auth_tag,
            },
            masterKey
          )
          decryptedTokensCache.set(donor.id, plainToken)
        }
      } catch (decryptErr) {
        console.error(`Failed to decrypt token for donor ${donor.id}:`, decryptErr)
        await supabase
          .from('donor_tokens')
          .update({
            status: 'expired',
            last_error_message: 'Decryption failed: integrity check mismatch',
            updated_at: new Date().toISOString(),
          })
          .eq('id', donor.id)
        continue
      }

      // 5. Query Moodle modules & contents
      const detectedEvents: DeltaEvent[] = []
      try {
        const sections = await getCourseContents(donor.moodle_base_url, plainToken, course.id)
        circuitBreaker.recordSuccess()

        // Gather all module items
        const allModules = sections.flatMap((s) => s.modules || [])

        // Fetch course labels if any (text & media area announcements)
        const labelMap = new Map<number, any>()
        if (allModules.some((m) => m.modname === 'label')) {
          const labels = await getCourseLabels(donor.moodle_base_url, plainToken, course.id)
          for (const l of labels) {
            if (l.coursemodule) labelMap.set(l.coursemodule, l)
            if (l.id) labelMap.set(l.id, l)
          }
        }

        // Fetch existing watermarks for this course
        const { data: storedWatermarks } = await supabase
          .from('course_items_state')
          .select('composite_id, course_id, item_type, timemodified')
          .eq('course_id', course.id)

        const watermarkMap = new Map(
          (storedWatermarks || []).map((w) => [w.composite_id, w])
        )

        // Evaluate modules (assignments, files, resources, labels)
        for (const mod of allModules) {
          if (mod.modname === 'label') {
            const labelData = labelMap.get(mod.id) || labelMap.get(mod.instance)
            if (labelData) {
              (mod as any).timemodified = labelData.timemodified;
              (mod as any).intro = labelData.intro;
            }
          }

          let modItemType: 'mod_forum' | 'mod_assign' | 'mod_resource' | 'mod_url' = 'mod_resource'
          if (mod.modname === 'assign') modItemType = 'mod_assign'
          else if (mod.modname === 'url') modItemType = 'mod_url'
          else if (mod.modname === 'label') modItemType = 'mod_forum'

          const delta = evaluateModuleDelta(
            course.id,
            mod,
            watermarkMap.get(buildCompositeId(course.id, modItemType, mod.id)),
            {
              filter_forum: course.filter_forum,
              filter_assign: course.filter_assign,
              filter_resources: course.filter_resources,
            }
          )
          if (delta) {
            detectedEvents.push(delta)
          }

          // If module is a forum and forum filter is enabled, check recent announcements
          if (mod.modname === 'forum' && course.filter_forum) {
            try {
              const forumId = mod.instance || mod.id
              const discussions = await getForumDiscussions(donor.moodle_base_url, plainToken, forumId, 0, 5)
              for (const disc of discussions) {
                const discDelta = evaluateDiscussionDelta(
                  course.id,
                  disc,
                  watermarkMap.get(buildCompositeId(course.id, 'mod_forum', disc.id)),
                  {
                    filter_forum: course.filter_forum,
                    filter_assign: course.filter_assign,
                    filter_resources: course.filter_resources,
                  }
                )
                if (discDelta) {
                  detectedEvents.push(discDelta)
                }
              }
            } catch (forumErr) {
              console.warn(`Could not fetch forum ${mod.id} discussions:`, forumErr)
            }
          }
        }
      } catch (coursePollErr: unknown) {
        console.error(`Error polling course #${course.id}:`, coursePollErr)
        circuitBreaker.recordFailure(coursePollErr)

        // Check if token was revoked or expired on Moodle
        if (coursePollErr instanceof MoodleApiError && coursePollErr.errorCode === 'invalidtoken') {
          await supabase
            .from('donor_tokens')
            .update({
              status: 'revoked',
              last_error_message: 'Moodle rejected token: invalidtoken',
              updated_at: new Date().toISOString(),
            })
            .eq('id', donor.id)
        }
        continue
      }

      // 6. Process Detected Delta Events & Dispatch Notifications
      if (detectedEvents.length > 0) {
        eventsDetectedCount += detectedEvents.length

        // Fetch subscribed active bot users for this course
        const { data: subscriberRows } = await supabase
          .from('subscriptions')
          .select('telegram_id, bot_users(is_paused)')
          .eq('course_id', course.id)

        const activeChatIds = (subscriberRows || [])
          .filter((row: any) => !row.bot_users?.is_paused)
          .map((row: any) => row.telegram_id)

        for (const event of detectedEvents) {
          // Update / Upsert watermark into course_items_state
          await supabase.from('course_items_state').upsert({
            composite_id: event.compositeId,
            course_id: course.id,
            item_type: event.itemType,
            timemodified: event.timemodified,
            updated_at: new Date().toISOString(),
          })

          // Dispatch to Telegram if bot token and subscribers exist
          let successCount = 0
          let failureCount = 0
          let errorDetails = ''

          if (botToken && activeChatIds.length > 0) {
            const rawMod = event.rawItem as any
            const itemUrl =
              rawMod.url ||
              (rawMod.modname === 'label'
                ? `${donor.moodle_base_url.replace(/\/+$/, '')}/course/view.php?id=${course.id}`
                : undefined)
            const previewSnippet = cleanSnippet(rawMod.message || rawMod.intro || rawMod.description)

            const messageHtml = formatMoodleAlertMessage({
              courseName: course.fullname,
              courseShortname: course.shortname,
              cohortTag: course.cohort_tag,
              eventType: event.eventType,
              itemType: event.itemType,
              itemTitle: event.itemTitle,
              itemUrl,
              author: rawMod.userfullname,
              dueDate: rawMod.dates?.find((d: any) => d.label?.includes('Due'))?.timestamp,
              previewSnippet,
            })

            const dispatchRes = await dispatchBatchedMessages(botToken, activeChatIds, messageHtml, {
              reply_markup: {
                inline_keyboard: buildAlertKeyboard(itemUrl),
              },
            })
            successCount = dispatchRes.successCount
            failureCount = dispatchRes.failureCount
            messagesDispatchedCount += successCount
            if (dispatchRes.errors.length > 0) {
              errorDetails = dispatchRes.errors.slice(0, 5).join('\n')
            }

            // Auto-pause blocked bot users on HTTP 403 (Spec 04 Section 4.2)
            if (dispatchRes.blockedChatIds && dispatchRes.blockedChatIds.length > 0) {
              await supabase
                .from('bot_users')
                .update({ is_paused: true, updated_at: new Date().toISOString() })
                .in('telegram_id', dispatchRes.blockedChatIds)
            }
          }

          // Log to notification_logs
          await supabase.from('notification_logs').insert({
            course_id: course.id,
            event_type: event.eventType,
            item_title: event.itemTitle,
            recipients_count: activeChatIds.length,
            success_count: successCount,
            failure_count: failureCount,
            status: failureCount === 0 ? 'success' : successCount > 0 ? 'partial' : 'failed',
            error_details: errorDetails || null,
            created_at: new Date().toISOString(),
          })
        }
      }

      // Update course last_polled_at
      await supabase
        .from('courses')
        .update({
          last_polled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', course.id)
    }

    const durationMs = Date.now() - startTime
    return jsonResponse({
      status: 'completed',
      polled_courses: courses.length,
      events_detected: eventsDetectedCount,
      messages_dispatched: messagesDispatchedCount,
      execution_duration_ms: durationMs,
    })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error('Fatal poller error:', err)
    return errorResponse(`Poller error: ${errorMsg}`, 500, 'POLLER_ERROR')
  }
})
