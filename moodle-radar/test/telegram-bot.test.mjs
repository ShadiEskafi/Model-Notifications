import assert from 'node:assert/strict'
import {
  encodeCallback,
  parseCallback,
  assertCallbackPayloadSize,
  parseStartCommand,
  generateCourseDeepLink,
  getWelcomeMessage,
  getHelpMessage,
  getAboutMessage,
  getDeepLinkSubscriptionMessage,
  getGroupBindingMessage,
  buildWelcomeKeyboard,
  buildCourseListKeyboard,
  buildMyCoursesKeyboard,
  buildAlertKeyboard,
} from '../supabase/functions/_shared/telegramBotUi.ts'
import {
  escapeHtml,
  formatMoodleAlertMessage,
  dispatchBatchedMessages,
} from '../supabase/functions/_shared/telegramClient.ts'

console.log('🧪 Starting Spec 04 Telegram Bot Test Suite...\n')

// ---------------------------------------------------------------------------
// Test 1: Compact Callback Data Schema & < 20 Bytes Payload Constraint
// ---------------------------------------------------------------------------
console.log('1. Testing Callback Schema (< 20 Bytes)...')

const togglePayload = encodeCallback('s', 1042)
assert.equal(togglePayload, 's:1042')
assert.ok(Buffer.byteLength(togglePayload) < 20, 'Toggle callback payload must be < 20 bytes')
assert.equal(Buffer.byteLength(togglePayload), 6)

const unsubPayload = encodeCallback('u', 1042)
assert.equal(unsubPayload, 'u:1042')
assert.ok(Buffer.byteLength(unsubPayload) < 20, 'Unsubscribe callback payload must be < 20 bytes')
assert.equal(Buffer.byteLength(unsubPayload), 6)

const catalogPayload = encodeCallback('c', 'cyb3', 1)
assert.equal(catalogPayload, 'c:cyb3:1')
assert.ok(Buffer.byteLength(catalogPayload) < 20, 'Catalog callback payload must be < 20 bytes')
assert.equal(Buffer.byteLength(catalogPayload), 8)

const managePayload = encodeCallback('m', 0)
assert.equal(managePayload, 'm:0')
assert.ok(Buffer.byteLength(managePayload) < 20, 'Manage callback payload must be < 20 bytes')
assert.equal(Buffer.byteLength(managePayload), 3)

// Verify parser roundtrip
const parsedCatalog = parseCallback(catalogPayload)
assert.equal(parsedCatalog.opcode, 'c')
assert.equal(parsedCatalog.targetId, 'cyb3')
assert.equal(parsedCatalog.contextParam, '1')

const parsedToggle = parseCallback(togglePayload)
assert.equal(parsedToggle.opcode, 's')
assert.equal(parsedToggle.targetId, '1042')
assert.equal(parsedToggle.contextParam, undefined)

// Verify oversized payload rejection
assert.throws(() => {
  assertCallbackPayloadSize('a:very_long_payload_exceeding_twenty_bytes:123')
}, /exceeds 20 bytes/)

console.log('   ✅ Compact callback schema and byte length constraints verified.')

// ---------------------------------------------------------------------------
// Test 2: Deep-Linking Parser & URL Generator (/start c_<course_id>)
// ---------------------------------------------------------------------------
console.log('2. Testing Deep-Linking Parser & Generator...')

const regularStart = parseStartCommand('/start')
assert.equal(regularStart.isDeepLink, false)

const whitespaceStart = parseStartCommand('  /start   ')
assert.equal(whitespaceStart.isDeepLink, false)

const courseDeepLink = parseStartCommand('/start c_1042')
assert.equal(courseDeepLink.isDeepLink, true)
assert.equal(courseDeepLink.type, 'course')
assert.equal(courseDeepLink.courseId, 1042)

const invalidDeepLink = parseStartCommand('/start unknown_param')
assert.equal(invalidDeepLink.isDeepLink, false)

const generatedUrl = generateCourseDeepLink('@MoodleRadarBot', 1042)
assert.equal(generatedUrl, 'https://t.me/MoodleRadarBot?start=c_1042')

const generatedUrlClean = generateCourseDeepLink('MoodleRadarBot', 9901)
assert.equal(generatedUrlClean, 'https://t.me/MoodleRadarBot?start=c_9901')

console.log('   ✅ Deep-link parsing and URL generation verified.')

// ---------------------------------------------------------------------------
// Test 3: Message HTML Templates (Spec 04 Section 5)
// ---------------------------------------------------------------------------
console.log('3. Testing HTML Notification Templates...')

// 3.1 mod_forum (Announcement)
const forumAlert = formatMoodleAlertMessage({
  courseName: 'أمن الشبكات المتقدم',
  courseShortname: 'NET401',
  eventType: 'EVENT_CREATED',
  itemType: 'mod_forum',
  itemTitle: 'تأجيل موعد الاختبار الفصلي',
  author: 'د. سامي الأحمد',
  previewSnippet: 'نظراً للظروف الطارئة تقرر تأجيل الاختبار إلى يوم الأحد القادم.',
  itemUrl: 'https://moodle.uni.edu/mod/forum/discuss.php?d=554',
})

assert.ok(forumAlert.includes('🚨 <b>أمن الشبكات المتقدم (NET401)</b>'))
assert.ok(forumAlert.includes('📢 <b>إعلان جديد:</b> تأجيل موعد الاختبار الفصلي'))
assert.ok(forumAlert.includes('👨‍🏫 <i>د. سامي الأحمد</i>'))
assert.ok(forumAlert.includes('نظراً للظروف الطارئة'))
assert.ok(forumAlert.includes('https://moodle.uni.edu/mod/forum/discuss.php?d=554'))

// 3.2 mod_assign (New assignment & Deadline modified)
const newAssignAlert = formatMoodleAlertMessage({
  courseName: 'الذكاء الاصطناعي',
  courseShortname: 'AI302',
  eventType: 'EVENT_CREATED',
  itemType: 'mod_assign',
  itemTitle: 'مشروع خوارزميات البحث',
  dueDate: 1714500000,
  itemUrl: 'https://moodle.uni.edu/mod/assign/view.php?id=882',
})
assert.ok(newAssignAlert.includes('⚠️ <b>الذكاء الاصطناعي (AI302)</b>'))
assert.ok(newAssignAlert.includes('📝 تكليف جديد'))
assert.ok(newAssignAlert.includes('موعد التسليم:'))
assert.ok(newAssignAlert.includes('الحالة: <i>جديد</i>'))

const modAssignAlert = formatMoodleAlertMessage({
  courseName: 'الذكاء الاصطناعي',
  eventType: 'EVENT_UPDATED',
  itemType: 'mod_assign',
  itemTitle: 'مشروع خوارزميات البحث',
  dueDate: 1714700000,
})
assert.ok(modAssignAlert.includes('🔄 تعديل على موعد التكليف'))
assert.ok(modAssignAlert.includes('تم تعديل الموعد النهائي'))

// 3.3 mod_resource & mod_url
const resourceAlert = formatMoodleAlertMessage({
  courseName: 'قواعد البيانات',
  eventType: 'EVENT_CREATED',
  itemType: 'mod_resource',
  itemTitle: 'سلايدات الفصل الخامس: Normalization',
  itemUrl: 'https://moodle.uni.edu/mod/resource/view.php?id=332',
})
assert.ok(resourceAlert.includes('📁 <b>قواعد البيانات</b>'))
assert.ok(resourceAlert.includes('تم رفع ملف أو محاضرة جديدة:'))
assert.ok(resourceAlert.includes('تحميل / فتح الملف'))

// 3.4 HTML Entity Escaping Check
const unsafeText = '<script>alert("XSS & Tamper")</script>'
const escaped = escapeHtml(unsafeText)
assert.equal(escaped, '&lt;script&gt;alert(&quot;XSS &amp; Tamper&quot;)&lt;/script&gt;')

console.log('   ✅ HTML templates and entity escaping verified.')

// ---------------------------------------------------------------------------
// Test 4: Inline Keyboard Generators & Constraints
// ---------------------------------------------------------------------------
console.log('4. Testing Inline Keyboard Generators...')

// Welcome Keyboard
const welcomeKb = buildWelcomeKeyboard()
assert.ok(welcomeKb.length >= 2)
for (const row of welcomeKb) {
  for (const btn of row) {
    if (btn.callback_data) {
      assert.ok(Buffer.byteLength(btn.callback_data) < 20, `Payload '${btn.callback_data}' must be < 20 bytes`)
    }
  }
}

// Course List Keyboard with Toggles and Pagination
const testCourses = [
  { id: 101, fullname: 'تشفير وأمن معلومات', shortname: 'SEC101' },
  { id: 102, fullname: 'برمجة النظم والمترجمات', shortname: 'SYS202' },
  { id: 103, fullname: 'هياكل البيانات والخوارزميات', shortname: 'CS201' },
]
const subSet = new Set([101]) // 101 is subscribed

const courseListKb = buildCourseListKeyboard({
  courses: testCourses,
  subscribedIds: subSet,
  cohortTag: 'cyb3',
  page: 1,
  hasMore: true,
})

// First button should be subscribed (✅)
assert.ok(courseListKb[0][0].text.startsWith('✅'))
assert.equal(courseListKb[0][0].callback_data, 's:101')

// Second button should be unsubscribed (➕)
assert.ok(courseListKb[1][0].text.startsWith('➕'))
assert.equal(courseListKb[1][0].callback_data, 's:102')

// Navigation row should have both previous and next
const navRow = courseListKb.find((row) => row.some((b) => b.text.includes('السابق') || b.text.includes('التالي')))
assert.ok(navRow, 'Navigation row must exist')
assert.ok(navRow.some((b) => b.text.includes('السابق') && b.callback_data === 'c:cyb3:0'))
assert.ok(navRow.some((b) => b.text.includes('التالي') && b.callback_data === 'c:cyb3:2'))

// Check all callback sizes
courseListKb.flat().forEach((btn) => {
  if (btn.callback_data) {
    assert.ok(Buffer.byteLength(btn.callback_data) < 20, `Payload '${btn.callback_data}' exceeds 20 bytes`)
  }
})

// Subscriptions Management Keyboard
const mySubs = [
  { course_id: 101, shortname: 'SEC101', fullname: 'تشفير وأمن معلومات' },
  { course_id: 103, shortname: 'CS201', fullname: 'هياكل البيانات' },
]

const mySubsKb = buildMyCoursesKeyboard({
  subscriptions: mySubs,
  page: 0,
  hasMore: false,
})

assert.ok(mySubsKb[0][0].text.includes('إلغاء: SEC101'))
assert.equal(mySubsKb[0][0].callback_data, 'u:101')
assert.ok(mySubsKb[1][0].text.includes('إلغاء: CS201'))
assert.equal(mySubsKb[1][0].callback_data, 'u:103')

// Alert Action Keyboard
const alertKb = buildAlertKeyboard('https://moodle.uni.edu/mod/assign/view.php?id=123')
assert.equal(alertKb[0][0].url, 'https://moodle.uni.edu/mod/assign/view.php?id=123')
assert.equal(alertKb[0][1].callback_data, 'm:0')

console.log('   ✅ Inline keyboard layouts and pagination verified.')

// ---------------------------------------------------------------------------
// Test 5: Chunked Dispatch Engine & Rate-Limit Handling (Spec 4.1 & 4.2)
// ---------------------------------------------------------------------------
console.log('5. Testing Throttled Dispatch Engine...')

// Mock global fetch to test chunked dispatching and 403 / 429 interception
const originalFetch = globalThis.fetch
let dispatchedChatIds = []
let sleepCount = 0

globalThis.fetch = async (url, opts) => {
  const body = JSON.parse(opts.body)
  dispatchedChatIds.push(body.chat_id)

  // Simulate chat 999 as blocked by user (HTTP 403)
  if (body.chat_id === 999) {
    return {
      status: 403,
      json: async () => ({
        ok: false,
        error_code: 403,
        description: 'Forbidden: bot was blocked by the user',
      }),
    }
  }

  return {
    status: 200,
    json: async () => ({
      ok: true,
      result: { message_id: Math.floor(Math.random() * 10000) },
    }),
  }
}

// Dispatch to 30 recipients with chunkSize=10, pause=50ms
const recipientChatIds = Array.from({ length: 30 }, (_, i) => i + 100)
recipientChatIds.push(999) // include blocked user

const dispatchResult = await dispatchBatchedMessages(
  'mock_bot_token',
  recipientChatIds,
  '<b>Test Alert</b>',
  {},
  { chunkSize: 10, batchPauseMs: 10 }
)

assert.equal(dispatchResult.successCount, 30, '30 normal chats must succeed')
assert.equal(dispatchResult.failureCount, 1, 'Blocked user chat must fail')
assert.ok(dispatchResult.blockedChatIds.includes(999), 'Chat 999 must be recorded in blockedChatIds')
assert.equal(dispatchedChatIds.length, 31, 'All 31 chats must have been dispatched')

// Restore global fetch
globalThis.fetch = originalFetch
console.log('   ✅ Chunked dispatch algorithm and 403 blocked user detection verified.')

// ---------------------------------------------------------------------------
// Test 6: Message Text Generators & Contextual Output
// ---------------------------------------------------------------------------
console.log('6. Testing Text Generators...')

const welcomeMsg = getWelcomeMessage('أحمد')
assert.ok(welcomeMsg.includes('أحمد'))
assert.ok(welcomeMsg.includes('رادار مودل'))

const helpMsg = getHelpMessage()
assert.ok(helpMsg.includes('/start'))
assert.ok(helpMsg.includes('/search'))
assert.ok(helpMsg.includes('/my_courses'))
assert.ok(helpMsg.includes('/bind_course'))

const aboutMsg = getAboutMessage()
assert.ok(aboutMsg.includes('AES-256-GCM'))
assert.ok(aboutMsg.includes('لا نطلب ولا نخزن أبداً'))

const deepLinkSubMsgNew = getDeepLinkSubscriptionMessage({
  courseName: 'البرمجة بلغة سي++',
  courseShortname: 'CS102',
  alreadySubscribed: false,
})
assert.ok(deepLinkSubMsgNew.includes('تم اشتراكك بنجاح عبر الرابط المباشر'))
assert.ok(deepLinkSubMsgNew.includes('CS102'))

const deepLinkSubMsgExisting = getDeepLinkSubscriptionMessage({
  courseName: 'البرمجة بلغة سي++',
  courseShortname: 'CS102',
  alreadySubscribed: true,
})
assert.ok(deepLinkSubMsgExisting.includes('أنت مشترك بالفعل'))

const groupMsg = getGroupBindingMessage('أنظمة التشغيل', 'OS301')
assert.ok(groupMsg.includes('تم ربط هذه المجموعة بالمساق بنجاح'))
assert.ok(groupMsg.includes('OS301'))

console.log('   ✅ Text generators verified.')

console.log('\n🎉 ALL SPEC 04 TELEGRAM BOT TESTS PASSED CLEANLY!\n')
