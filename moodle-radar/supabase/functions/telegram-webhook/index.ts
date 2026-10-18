/**
 * Edge Function: /telegram-webhook
 * Specification Reference: specs/03-edge-functions-spec.md Section 3.3 & specs/04-telegram-bot-spec.md
 * 
 * Processes Telegram webhook events, routes commands, manages student subscriptions,
 * supports deep-linking (/start c_<course_id>), and handles interactive inline keyboard callbacks.
 */

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { jsonResponse } from '../_shared/cors.ts'
import {
  sendMessage,
  editMessageText,
  answerCallbackQuery,
  callTelegramApi,
  type InlineKeyboardButton,
} from '../_shared/telegramClient.ts'
import {
  parseStartCommand,
  parseCallback,
  encodeCallback,
  getWelcomeMessage,
  getHelpMessage,
  getAboutMessage,
  getDeepLinkSubscriptionMessage,
  getGroupBindingMessage,
  buildWelcomeKeyboard,
  buildCourseListKeyboard,
  buildMyCoursesKeyboard,
} from '../_shared/telegramBotUi.ts'

const PAGE_SIZE = 5

Deno.serve(async (req: Request) => {
  // Telegram requires immediate 200 OK
  if (req.method !== 'POST') {
    return jsonResponse({ ok: true })
  }

  const webhookSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')
  if (webhookSecret) {
    const incomingSecret = req.headers.get('x-telegram-bot-api-secret-token')
    if (incomingSecret !== webhookSecret) {
      console.warn('Unauthorized webhook secret token mismatch')
      return new Response('Unauthorized', { status: 401 })
    }
  }

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
  if (!botToken) {
    console.error('TELEGRAM_BOT_TOKEN not configured')
    return jsonResponse({ ok: true })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  try {
    const update = await req.json()

    // -------------------------------------------------------------------------
    // 1. Handle Slash Commands & Text Messages
    // -------------------------------------------------------------------------
    if (update.message && update.message.text) {
      const msg = update.message
      const chatId = msg.chat.id
      const text = msg.text.trim()
      const user = msg.from
      const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup'

      // Upsert student or group in bot_users
      if (!isGroup) {
        await supabase.from('bot_users').upsert(
          {
            telegram_id: user.id,
            username: user.username || null,
            first_name: user.first_name || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'telegram_id' }
        )
      }

      // 1.1 /start Command (with Deep-Link Support)
      if (text.startsWith('/start')) {
        const deepLink = parseStartCommand(text)

        // Case A: Deep link directly into a course (/start c_1042)
        if (deepLink.isDeepLink && deepLink.type === 'course' && deepLink.courseId) {
          const { data: course } = await supabase
            .from('courses')
            .select('id, fullname, shortname, cohort_tag')
            .eq('id', deepLink.courseId)
            .maybeSingle()

          if (!course) {
            await sendMessage(
              botToken,
              chatId,
              `⚠️ <b>عذراً، المساق المطلوب غير موجود أو لم يتم تفعيله بعد في رادار مودل.</b>\n\n` +
              `يمكنك تصفح المقررات المتاحة باستخدام الزر أدناه:`,
              {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '📚 استعراض المقررات', callback_data: encodeCallback('c', 'ALL', 0) }],
                    [{ text: '🏠 القائمة الرئيسية', callback_data: encodeCallback('c', 'HOME', 0) }],
                  ],
                },
              }
            )
            return jsonResponse({ ok: true })
          }

          // Check existing subscription
          const { data: existingSub } = await supabase
            .from('subscriptions')
            .select('id')
            .eq('telegram_id', user.id)
            .eq('course_id', course.id)
            .maybeSingle()

          if (!existingSub) {
            await supabase.from('subscriptions').insert({
              telegram_id: user.id,
              course_id: course.id,
            })
          }

          const responseText = getDeepLinkSubscriptionMessage({
            courseName: course.fullname,
            courseShortname: course.shortname,
            alreadySubscribed: !!existingSub,
          })

          const keyboard: InlineKeyboardButton[][] = [
            [
              { text: '❌ إلغاء الاشتراك من المساق', callback_data: encodeCallback('u', course.id) },
              { text: '⭐ مقرراتي المشترك بها', callback_data: encodeCallback('m', 0) },
            ],
            [
              { text: '📚 استعراض باقي المقررات', callback_data: encodeCallback('c', 'ALL', 0) },
              { text: '🏠 القائمة الرئيسية', callback_data: encodeCallback('c', 'HOME', 0) },
            ],
          ]

          await sendMessage(botToken, chatId, responseText, {
            reply_markup: { inline_keyboard: keyboard },
          })
          return jsonResponse({ ok: true })
        }

        // Case B: Regular /start (Welcome screen)
        const welcomeText = getWelcomeMessage(user.first_name)
        await sendMessage(botToken, chatId, welcomeText, {
          reply_markup: { inline_keyboard: buildWelcomeKeyboard() },
        })
        return jsonResponse({ ok: true })
      }

      // 1.2 /search Command
      if (text.startsWith('/search')) {
        const query = text.replace('/search', '').trim()
        if (!query) {
          await sendMessage(
            botToken,
            chatId,
            '🔍 <b>طريقة البحث السريع:</b>\n\n' +
            'اكتب <code>/search اسم المقرر أو رمزه</code> للبحث عن مساقاتك.\n' +
            'مثال: <code>/search أمن المعلومات</code> أو <code>/search CYB</code>'
          )
          return jsonResponse({ ok: true })
        }

        // Search courses in Supabase
        const { data: courses } = await supabase
          .from('courses')
          .select('id, fullname, shortname, cohort_tag')
          .eq('is_monitored', true)
          .or(`fullname.ilike.%${query}%,shortname.ilike.%${query}%,cohort_tag.ilike.%${query}%`)
          .limit(8)

        if (!courses || courses.length === 0) {
          await sendMessage(
            botToken,
            chatId,
            `⚠️ لم يتم العثور على مقررات مراقبة مطابقة للبحث: <b>${query}</b>\n\n` +
            `تأكد من كتابة الكلمة بشكل صحيح، أو تصفح قائمة المقررات الكاملة.`,
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '📚 تصفح جميع المقررات', callback_data: encodeCallback('c', 'ALL', 0) }],
                ],
              },
            }
          )
          return jsonResponse({ ok: true })
        }

        // Check user subscriptions
        const { data: subs } = await supabase
          .from('subscriptions')
          .select('course_id')
          .eq('telegram_id', user.id)

        const subSet = new Set((subs || []).map((s) => s.course_id))

        let responseText = `🔍 <b>نتائج البحث عن:</b> <i>${query}</i>\n`
        responseText += `اضغط على الزر للاشتراك أو إلغاء الاشتراك مباشرة:\n`

        const keyboard: InlineKeyboardButton[][] = []
        courses.forEach((c) => {
          const isSubscribed = subSet.has(c.id)
          const displayName = (c.shortname || c.fullname).slice(0, 24)
          const btnText = isSubscribed ? `✅ ${displayName} (مشترك)` : `➕ ${displayName}`

          keyboard.push([
            { text: btnText, callback_data: encodeCallback('s', c.id) },
          ])
        })

        keyboard.push([
          { text: '⭐ مقرراتي المشترك بها', callback_data: encodeCallback('m', 0) },
          { text: '🏠 القائمة الرئيسية', callback_data: encodeCallback('c', 'HOME', 0) },
        ])

        await sendMessage(botToken, chatId, responseText, {
          reply_markup: { inline_keyboard: keyboard },
        })
        return jsonResponse({ ok: true })
      }

      // 1.3 /my_courses Command
      if (text.startsWith('/my_courses')) {
        const { data: userSubs, count } = await supabase
          .from('subscriptions')
          .select('course_id, courses(id, fullname, shortname)', { count: 'exact' })
          .eq('telegram_id', user.id)
          .range(0, PAGE_SIZE - 1)

        if (!userSubs || userSubs.length === 0) {
          await sendMessage(
            botToken,
            chatId,
            '📭 <b>أنت غير مشترك في أي مقررات حالياً.</b>\n\n' +
            'استخدم أمر <code>/search</code> للبحث عن مقرراتك، أو تصفح القائمة الكاملة للاشتراك:',
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '📚 تصفح المقررات الدراسية', callback_data: encodeCallback('c', 'ALL', 0) }],
                  [{ text: '🏠 القائمة الرئيسية', callback_data: encodeCallback('c', 'HOME', 0) }],
                ],
              },
            }
          )
          return jsonResponse({ ok: true })
        }

        const totalCount = count || userSubs.length
        const hasMore = totalCount > PAGE_SIZE

        let msgText = `⭐ <b>المقررات المشترك بها (${totalCount}):</b>\n\n`
        const subscriptionsForKeyboard: Array<{ course_id: number; shortname?: string; fullname?: string }> = []

        userSubs.forEach((s: any) => {
          const c = s.courses
          if (c) {
            msgText += `• <b>${c.fullname}</b> ${c.shortname ? `(${c.shortname})` : ''}\n`
            subscriptionsForKeyboard.push({
              course_id: c.id,
              shortname: c.shortname,
              fullname: c.fullname,
            })
          }
        })

        msgText += `\n<i>اضغط على ❌ لإلغاء الاشتراك من أي مقرر:</i>`

        const keyboard = buildMyCoursesKeyboard({
          subscriptions: subscriptionsForKeyboard,
          page: 0,
          hasMore,
        })

        await sendMessage(botToken, chatId, msgText, {
          reply_markup: { inline_keyboard: keyboard },
        })
        return jsonResponse({ ok: true })
      }

      // 1.4 /pause Command
      if (text.startsWith('/pause')) {
        await supabase
          .from('bot_users')
          .update({ is_paused: true, updated_at: new Date().toISOString() })
          .eq('telegram_id', user.id)

        await sendMessage(
          botToken,
          chatId,
          '⏸️ <b>تم إيقاف التنبيهات مؤقتاً بنجاح!</b>\n\n' +
          'لن تتلقى إشعارات جديدة حتى تقوم بإعادة تفعيلها.\n' +
          'لاستئناف التنبيهات في أي وقت، أرسل <code>/resume</code>.'
        )
        return jsonResponse({ ok: true })
      }

      // 1.5 /resume Command
      if (text.startsWith('/resume')) {
        await supabase
          .from('bot_users')
          .update({ is_paused: false, updated_at: new Date().toISOString() })
          .eq('telegram_id', user.id)

        await sendMessage(
          botToken,
          chatId,
          '▶️ <b>تم استئناف التنبيهات بنجاح!</b>\n\n' +
          'ستصلك كافة إشعارات المحاضرات والتكليفات للمقررات المشترك بها فوراً.'
        )
        return jsonResponse({ ok: true })
      }

      // 1.6 /bind_course Command (Group Chat Broadcast)
      if (text.startsWith('/bind_course')) {
        if (!isGroup) {
          await sendMessage(
            botToken,
            chatId,
            'ℹ️ <b>أمر ربط المجموعات:</b>\n\n' +
            'هذا الأمر مخصص للمجموعات الدراسية (Groups) لبث إشعارات المقرر لجميع أعضاء المجموعة.\n' +
            'قم بإضافة البوت إلى مجموعتك ثم أرسل: <code>/bind_course رقم_المساق</code>'
          )
          return jsonResponse({ ok: true })
        }

        const courseIdStr = text.replace('/bind_course', '').trim()
        const targetCourseId = Number(courseIdStr)

        if (!targetCourseId || Number.isNaN(targetCourseId)) {
          await sendMessage(
            botToken,
            chatId,
            '⚠️ <b>صيغة الأمر غير صحيحة.</b>\nالاستخدام الصحيح: <code>/bind_course 1042</code> (استبدل 1042 برقم المقرر).'
          )
          return jsonResponse({ ok: true })
        }

        // Verify sender is admin or creator
        const memberRes = await callTelegramApi<any>(botToken, 'getChatMember', {
          chat_id: chatId,
          user_id: user.id,
        })

        const status = memberRes.result?.status
        if (status !== 'creator' && status !== 'administrator') {
          await sendMessage(
            botToken,
            chatId,
            '🚫 <b>عذراً!</b> أمر ربط المساق بالمجموعة متاح فقط لمشرفي المجموعة (Admins).'
          )
          return jsonResponse({ ok: true })
        }

        // Query course
        const { data: course } = await supabase
          .from('courses')
          .select('id, fullname, shortname')
          .eq('id', targetCourseId)
          .maybeSingle()

        if (!course) {
          await sendMessage(
            botToken,
            chatId,
            `⚠️ لم يتم العثور على مقرر برقم: <b>${targetCourseId}</b> في نظام الرادار.`
          )
          return jsonResponse({ ok: true })
        }

        // Upsert group in bot_users (telegram_id can be negative for groups)
        await supabase.from('bot_users').upsert(
          {
            telegram_id: chatId,
            first_name: msg.chat.title || 'مجموعة دراسية',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'telegram_id' }
        )

        // Insert subscription for group
        await supabase.from('subscriptions').upsert(
          {
            telegram_id: chatId,
            course_id: course.id,
          },
          { onConflict: 'telegram_id,course_id' }
        )

        const bindingText = getGroupBindingMessage(course.fullname, course.shortname)
        await sendMessage(botToken, chatId, bindingText)
        return jsonResponse({ ok: true })
      }

      // 1.7 /help Command
      if (text.startsWith('/help')) {
        await sendMessage(botToken, chatId, getHelpMessage(), {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '📚 استعراض المقررات', callback_data: encodeCallback('c', 'ALL', 0) },
                { text: '🏠 القائمة الرئيسية', callback_data: encodeCallback('c', 'HOME', 0) },
              ],
            ],
          },
        })
        return jsonResponse({ ok: true })
      }

      // 1.8 /about Command
      if (text.startsWith('/about')) {
        await sendMessage(botToken, chatId, getAboutMessage(), {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🏠 القائمة الرئيسية', callback_data: encodeCallback('c', 'HOME', 0) }],
            ],
          },
        })
        return jsonResponse({ ok: true })
      }
    }

    // -------------------------------------------------------------------------
    // 2. Handle Inline Keyboard Callback Queries
    // -------------------------------------------------------------------------
    if (update.callback_query) {
      const cb = update.callback_query
      const user = cb.from
      const data = (cb.data as string) || ''
      const message = cb.message

      const parsed = parseCallback(data)
      const { opcode, targetId, contextParam } = parsed

      // 2.1 Opcode 's': Toggle Subscription (s:<course_id>)
      if (opcode === 's') {
        const courseId = Number(targetId)

        const { data: existingSub } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('telegram_id', user.id)
          .eq('course_id', courseId)
          .maybeSingle()

        let nowSubscribed = false
        if (existingSub) {
          // Unsubscribe
          await supabase.from('subscriptions').delete().eq('id', existingSub.id)
          await answerCallbackQuery(botToken, cb.id, 'تم إلغاء الاشتراك من المساق ❌')
        } else {
          // Subscribe
          await supabase.from('subscriptions').insert({
            telegram_id: user.id,
            course_id: courseId,
          })
          nowSubscribed = true
          await answerCallbackQuery(botToken, cb.id, 'تم الاشتراك بنجاح! ستصلك التنبيهات فوراً ✅')
        }

        // Dynamically update button icon
        if (message && message.reply_markup?.inline_keyboard) {
          const updatedKeyboard = message.reply_markup.inline_keyboard.map((row: any) =>
            row.map((btn: any) => {
              if (btn.callback_data === data) {
                const cleanLabel = btn.text
                  .replace(/^[✅➕❌]\s*/, '')
                  .replace(/\s*\(مشترك\)/, '')
                  .trim()

                return {
                  ...btn,
                  text: nowSubscribed ? `✅ ${cleanLabel} (مشترك)` : `➕ ${cleanLabel}`,
                }
              }
              return btn
            })
          )

          await editMessageText(botToken, message.chat.id, message.message_id, message.text, {
            reply_markup: { inline_keyboard: updatedKeyboard },
          })
        }

        return jsonResponse({ ok: true })
      }

      // 2.2 Opcode 'u': Direct Unsubscribe (u:<course_id>)
      if (opcode === 'u') {
        const courseId = Number(targetId)

        await supabase
          .from('subscriptions')
          .delete()
          .eq('telegram_id', user.id)
          .eq('course_id', courseId)

        await answerCallbackQuery(botToken, cb.id, 'تم إلغاء الاشتراك من المساق بنجاح 🗑️')

        // Refresh My Courses view
        const { data: userSubs, count } = await supabase
          .from('subscriptions')
          .select('course_id, courses(id, fullname, shortname)', { count: 'exact' })
          .eq('telegram_id', user.id)
          .range(0, PAGE_SIZE - 1)

        if (!userSubs || userSubs.length === 0) {
          if (message) {
            await editMessageText(
              botToken,
              message.chat.id,
              message.message_id,
              '📭 <b>أنت غير مشترك في أي مساقات حالياً.</b>',
              {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '📚 استعراض المقررات', callback_data: encodeCallback('c', 'ALL', 0) }],
                    [{ text: '🏠 القائمة الرئيسية', callback_data: encodeCallback('c', 'HOME', 0) }],
                  ],
                },
              }
            )
          }
          return jsonResponse({ ok: true })
        }

        const totalCount = count || userSubs.length
        const hasMore = totalCount > PAGE_SIZE

        let msgText = `⭐ <b>المقررات المشترك بها (${totalCount}):</b>\n\n`
        const subscriptionsForKeyboard: Array<{ course_id: number; shortname?: string; fullname?: string }> = []

        userSubs.forEach((s: any) => {
          const c = s.courses
          if (c) {
            msgText += `• <b>${c.fullname}</b> ${c.shortname ? `(${c.shortname})` : ''}\n`
            subscriptionsForKeyboard.push({
              course_id: c.id,
              shortname: c.shortname,
              fullname: c.fullname,
            })
          }
        })

        msgText += `\n<i>اضغط على ❌ لإلغاء الاشتراك من أي مقرر:</i>`

        const keyboard = buildMyCoursesKeyboard({
          subscriptions: subscriptionsForKeyboard,
          page: 0,
          hasMore,
        })

        if (message) {
          await editMessageText(botToken, message.chat.id, message.message_id, msgText, {
            reply_markup: { inline_keyboard: keyboard },
          })
        }
        return jsonResponse({ ok: true })
      }

      // 2.3 Opcode 'c': Catalog & Menu Navigation (c:<cohort>:<page>)
      if (opcode === 'c') {
        const cohortTag = targetId || 'ALL'
        const page = Number(contextParam) || 0

        await answerCallbackQuery(botToken, cb.id)

        // Sub-navigation: Return to HOME
        if (cohortTag === 'HOME') {
          if (message) {
            await editMessageText(
              botToken,
              message.chat.id,
              message.message_id,
              getWelcomeMessage(user.first_name),
              { reply_markup: { inline_keyboard: buildWelcomeKeyboard() } }
            )
          }
          return jsonResponse({ ok: true })
        }

        // Sub-navigation: HELP
        if (cohortTag === 'HELP') {
          if (message) {
            await editMessageText(
              botToken,
              message.chat.id,
              message.message_id,
              getHelpMessage(),
              {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '📚 استعراض المقررات', callback_data: encodeCallback('c', 'ALL', 0) }],
                    [{ text: '🏠 القائمة الرئيسية', callback_data: encodeCallback('c', 'HOME', 0) }],
                  ],
                },
              }
            )
          }
          return jsonResponse({ ok: true })
        }

        // Sub-navigation: ABOUT
        if (cohortTag === 'ABOUT') {
          if (message) {
            await editMessageText(
              botToken,
              message.chat.id,
              message.message_id,
              getAboutMessage(),
              {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '🏠 القائمة الرئيسية', callback_data: encodeCallback('c', 'HOME', 0) }],
                  ],
                },
              }
            )
          }
          return jsonResponse({ ok: true })
        }

        // Query courses for requested page
        let queryBuilder = supabase
          .from('courses')
          .select('id, fullname, shortname, cohort_tag', { count: 'exact' })
          .eq('is_monitored', true)
          .order('id', { ascending: true })

        if (cohortTag !== 'ALL') {
          queryBuilder = queryBuilder.eq('cohort_tag', cohortTag)
        }

        const startIdx = page * PAGE_SIZE
        const { data: courses, count } = await queryBuilder.range(startIdx, startIdx + PAGE_SIZE - 1)

        // Query user subscriptions
        const { data: subs } = await supabase
          .from('subscriptions')
          .select('course_id')
          .eq('telegram_id', user.id)

        const subSet = new Set((subs || []).map((s) => s.course_id))
        const totalCount = count || (courses || []).length
        const totalPages = Math.ceil(totalCount / PAGE_SIZE)
        const hasMore = startIdx + PAGE_SIZE < totalCount

        let catalogText = `📚 <b>دليل المقررات المتاحة للمراقبة:</b>\n`
        catalogText += `الصفحة (${page + 1} من ${totalPages || 1}) • إجمالي المساقات: ${totalCount}\n\n`
        catalogText += `اضغط على الزر للاشتراك أو إلغاء الاشتراك:`

        const keyboard = buildCourseListKeyboard({
          courses: (courses || []) as any,
          subscribedIds: subSet,
          cohortTag,
          page,
          hasMore,
        })

        if (message) {
          await editMessageText(botToken, message.chat.id, message.message_id, catalogText, {
            reply_markup: { inline_keyboard: keyboard },
          })
        }
        return jsonResponse({ ok: true })
      }

      // 2.4 Opcode 'm': My Courses Pagination (m:<page>)
      if (opcode === 'm') {
        const page = Number(targetId) || 0
        await answerCallbackQuery(botToken, cb.id)

        const startIdx = page * PAGE_SIZE
        const { data: userSubs, count } = await supabase
          .from('subscriptions')
          .select('course_id, courses(id, fullname, shortname)', { count: 'exact' })
          .eq('telegram_id', user.id)
          .range(startIdx, startIdx + PAGE_SIZE - 1)

        if (!userSubs || userSubs.length === 0) {
          if (message) {
            await editMessageText(
              botToken,
              message.chat.id,
              message.message_id,
              '📭 <b>أنت غير مشترك في أي مساقات حالياً.</b>',
              {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '📚 استعراض المقررات', callback_data: encodeCallback('c', 'ALL', 0) }],
                    [{ text: '🏠 القائمة الرئيسية', callback_data: encodeCallback('c', 'HOME', 0) }],
                  ],
                },
              }
            )
          }
          return jsonResponse({ ok: true })
        }

        const totalCount = count || userSubs.length
        const totalPages = Math.ceil(totalCount / PAGE_SIZE)
        const hasMore = startIdx + PAGE_SIZE < totalCount

        let msgText = `⭐ <b>المقررات المشترك بها (${totalCount}):</b>\n`
        msgText += `الصفحة (${page + 1} من ${totalPages || 1})\n\n`

        const subscriptionsForKeyboard: Array<{ course_id: number; shortname?: string; fullname?: string }> = []

        userSubs.forEach((s: any) => {
          const c = s.courses
          if (c) {
            msgText += `• <b>${c.fullname}</b> ${c.shortname ? `(${c.shortname})` : ''}\n`
            subscriptionsForKeyboard.push({
              course_id: c.id,
              shortname: c.shortname,
              fullname: c.fullname,
            })
          }
        })

        msgText += `\n<i>اضغط على ❌ لإلغاء الاشتراك من أي مقرر:</i>`

        const keyboard = buildMyCoursesKeyboard({
          subscriptions: subscriptionsForKeyboard,
          page,
          hasMore,
        })

        if (message) {
          await editMessageText(botToken, message.chat.id, message.message_id, msgText, {
            reply_markup: { inline_keyboard: keyboard },
          })
        }
        return jsonResponse({ ok: true })
      }
    }

    return jsonResponse({ ok: true })
  } catch (err) {
    console.error('Error handling Telegram webhook:', err)
    return jsonResponse({ ok: true })
  }
})
