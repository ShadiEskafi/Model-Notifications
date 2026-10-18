/**
 * Telegram Bot UI & Navigation Architecture
 * Specification Reference: specs/04-telegram-bot-spec.md
 * 
 * Provides compact inline keyboard generators (< 20 bytes payload),
 * deep-linking parsing/generation, and Arabic HTML message layout generators.
 */

import { escapeHtml, type InlineKeyboardButton } from './telegramClient.ts'

export interface CourseSummary {
  id: number
  fullname: string
  shortname?: string | null
  cohort_tag?: string | null
  is_monitored?: boolean
}

export interface SubscriptionItem {
  course_id: number
  courses?: CourseSummary | null
}

export interface DeepLinkResult {
  isDeepLink: boolean
  type?: 'course'
  courseId?: number
}

export interface ParsedCallback {
  opcode: 's' | 'u' | 'c' | 'm' | string
  targetId?: string
  contextParam?: string
}

/**
 * Validates that callback_data strictly adheres to the < 20 bytes constraint.
 */
export function assertCallbackPayloadSize(payload: string): string {
  const byteLength = new TextEncoder().encode(payload).length
  if (byteLength >= 20) {
    throw new Error(`Callback payload '${payload}' exceeds 20 bytes (${byteLength} bytes)`)
  }
  return payload
}

/**
 * Encodes opcode, target ID, and optional context into a compact delimited payload.
 * Syntax: <opcode>:<target_id>:<context_param>
 */
export function encodeCallback(
  opcode: 's' | 'u' | 'c' | 'm' | string,
  targetId: string | number,
  contextParam?: string | number
): string {
  let payload = `${opcode}:${targetId}`
  if (contextParam !== undefined && contextParam !== null) {
    payload += `:${contextParam}`
  }
  return assertCallbackPayloadSize(payload)
}

/**
 * Parses compact callback_data into structured components.
 */
export function parseCallback(payload: string): ParsedCallback {
  const parts = payload.split(':')
  return {
    opcode: parts[0] || '',
    targetId: parts[1],
    contextParam: parts[2],
  }
}

/**
 * Parses deep-link parameter from /start command.
 * Example: "/start c_1042" -> { isDeepLink: true, type: 'course', courseId: 1042 }
 */
export function parseStartCommand(text: string): DeepLinkResult {
  const trimmed = text.trim()
  const parts = trimmed.split(/\s+/)

  if (parts.length > 1 && parts[1]) {
    const param = parts[1].trim()
    if (param.startsWith('c_')) {
      const courseId = Number(param.replace('c_', ''))
      if (!Number.isNaN(courseId) && courseId > 0) {
        return {
          isDeepLink: true,
          type: 'course',
          courseId,
        }
      }
    }
  }

  return { isDeepLink: false }
}

/**
 * Generates an official Telegram deep link for instant course subscription.
 */
export function generateCourseDeepLink(botUsername: string, courseId: number): string {
  const cleanUsername = botUsername.replace(/^@/, '')
  return `https://t.me/${cleanUsername}?start=c_${courseId}`
}

/**
 * Generates welcome message HTML.
 */
export function getWelcomeMessage(firstName?: string | null): string {
  const greeting = firstName ? `أهلاً بك يا <b>${escapeHtml(firstName)}</b> في` : 'أهلاً بك في'
  return (
    `👋 ${greeting} <b>رادار مودل!</b>\n\n` +
    `نظام الرصد والإشعار الأكاديمي المستقل.\n` +
    `يراقب رادار مودل تحديثات المحاضرات، التكليفات الجديدة، وتغييرات المواعيد فور نشرها على البوابة الجامعية، ويرسلها إليك مباشرة وبشكل فوري.\n\n` +
    `✨ <b>المميزات:</b>\n` +
    `• لا يتطلب اسم مستخدم أو كلمة مرور جامعية.\n` +
    `• إشعارات فورية بالتكليفات والمواعيد النهائية.\n` +
    `• روابط مباشرة لفتح المحتوى بضغطة واحدة.\n\n` +
    `👇 <b>اختر من القائمة للبدء:</b>`
  )
}

/**
 * Generates help message HTML.
 */
export function getHelpMessage(): string {
  return (
    `📖 <b>دليل استخدام رادار مودل</b>\n\n` +
    `• <code>/start</code> — القائمة الرئيسية وبدء الاستخدام.\n` +
    `• <code>/search اسم المساق</code> — البحث عن مقررات دراسية والاشتراك بها.\n` +
    `• <code>/my_courses</code> — عرض مقرراتك الحالية وإلغاء الاشتراك بضغطة زر.\n` +
    `• <code>/pause</code> — إيقاف التنبيهات مؤقتاً (مثلاً أثناء الإجازة أو الامتحانات).\n` +
    `• <code>/resume</code> — استئناف استلام التنبيهات.\n` +
    `• <code>/bind_course رقم_المساق</code> — ربط مجموعة دراسية (جروب تليجرام) بإشعارات مساق.\n` +
    `• <code>/about</code> — معلومات الخصوصية والأمان عن النظام.\n\n` +
    `💡 <i>نصيحة: يمكنك أيضاً الاشتراك فوراً بالمساق من خلال مسح كود QR أو فتح الرابط الخاص بالمساق.</i>`
  )
}

/**
 * Generates about message HTML.
 */
export function getAboutMessage(): string {
  return (
    `🛡️ <b>عن رادار مودل (Moodle Radar)</b>\n\n` +
    `رادار مودل هو نظام إشعار مستقل مصمم لمساعدة الطلاب على متابعة مستجدات مقرراتهم الجامعية دون تفويت أي تكليف أو إعلان.\n\n` +
    `🔒 <b>معايير الخصوصية والأمان:</b>\n` +
    `• <b>لا نطلب ولا نخزن أبداً</b> بيانات دخولك الجامعية (اسم المستخدم أو كلمة المرور).\n` +
    `• يتم الرصد عن طريق متبرعي الرادار الأكاديميين المعتمدين.\n` +
    `• التوكنات محمية ومشفرة وفق أعلى معايير التشفير العسكري (AES-256-GCM).\n` +
    `• جميع الاتصالات مشفرة عبر HTTPS وبروتوكول Telegram الآمن.\n\n` +
    `🚀 <i>نسخة النظام: الإصدار 1.0 الإنتاجي المستقر</i>`
  )
}

/**
 * Generates deep-link confirmation message HTML.
 */
export function getDeepLinkSubscriptionMessage(params: {
  courseName: string
  courseShortname?: string | null
  alreadySubscribed: boolean
}): string {
  const { courseName, courseShortname, alreadySubscribed } = params
  const courseDisplay = courseShortname ? `${escapeHtml(courseName)} (${escapeHtml(courseShortname)})` : escapeHtml(courseName)

  if (alreadySubscribed) {
    return (
      `ℹ️ <b>أنت مشترك بالفعل في هذا المساق!</b>\n\n` +
      `📚 <b>المساق:</b> ${courseDisplay}\n\n` +
      `التنبيهات مفعلة وسيصلك أي إعلان أو تكليف جديد فور وروده.`
    )
  }

  return (
    `🎉 <b>تم اشتراكك بنجاح عبر الرابط المباشر!</b>\n\n` +
    `📚 <b>المساق:</b> ${courseDisplay}\n\n` +
    `ستصلك الآن تنبيهات المحاضرات، التكليفات، ومواعيد التسليم فور نزولها على مودل مباشرة هنا.`
  )
}

/**
 * Generates group binding confirmation message.
 */
export function getGroupBindingMessage(courseName: string, courseShortname?: string | null): string {
  const courseDisplay = courseShortname ? `${escapeHtml(courseName)} (${escapeHtml(courseShortname)})` : escapeHtml(courseName)
  return (
    `👥 <b>تم ربط هذه المجموعة بالمساق بنجاح!</b>\n\n` +
    `📚 <b>المساق المرتبط:</b> ${courseDisplay}\n\n` +
    `سيتم بث كافة التنبيهات والإعلانات الخاصة بهذا المساق داخل هذه المجموعة تلقائياً.`
  )
}

/**
 * Builds welcome inline keyboard navigation.
 */
export function buildWelcomeKeyboard(): InlineKeyboardButton[][] {
  return [
    [
      { text: '📚 تصفح المقررات الدراسية', callback_data: encodeCallback('c', 'ALL', 0) },
      { text: '⭐ مقرراتي المشترك بها', callback_data: encodeCallback('m', 0) },
    ],
    [
      { text: '📖 دليل الاستخدام', callback_data: encodeCallback('c', 'HELP', 0) },
      { text: '🛡️ الأمان والخصوصية', callback_data: encodeCallback('c', 'ABOUT', 0) },
    ],
  ]
}

/**
 * Builds course list keyboard with toggles and pagination.
 */
export function buildCourseListKeyboard(params: {
  courses: CourseSummary[]
  subscribedIds: Set<number>
  cohortTag: string
  page: number
  hasMore: boolean
}): InlineKeyboardButton[][] {
  const { courses, subscribedIds, cohortTag, page, hasMore } = params
  const keyboard: InlineKeyboardButton[][] = []

  // Course rows
  for (const c of courses) {
    const isSub = subscribedIds.has(c.id)
    const displayName = (c.shortname || c.fullname).slice(0, 24)
    const btnText = isSub ? `✅ ${displayName} (مشترك)` : `➕ ${displayName}`
    keyboard.push([
      {
        text: btnText,
        callback_data: encodeCallback('s', c.id),
      },
    ])
  }

  // Pagination navigation row
  const navRow: InlineKeyboardButton[] = []
  if (page > 0) {
    navRow.push({
      text: '⬅️ السابق',
      callback_data: encodeCallback('c', cohortTag, page - 1),
    })
  }
  if (hasMore) {
    navRow.push({
      text: 'التالي ➡️',
      callback_data: encodeCallback('c', cohortTag, page + 1),
    })
  }

  if (navRow.length > 0) {
    keyboard.push(navRow)
  }

  // Main menu return button
  keyboard.push([
    { text: '🏠 القائمة الرئيسية', callback_data: encodeCallback('c', 'HOME', 0) },
    { text: '⭐ مقرراتي', callback_data: encodeCallback('m', 0) },
  ])

  return keyboard
}

/**
 * Builds subscriptions management keyboard with direct unsubscribe buttons and pagination.
 */
export function buildMyCoursesKeyboard(params: {
  subscriptions: Array<{ course_id: number; shortname?: string; fullname?: string }>
  page: number
  hasMore: boolean
}): InlineKeyboardButton[][] {
  const { subscriptions, page, hasMore } = params
  const keyboard: InlineKeyboardButton[][] = []

  for (const sub of subscriptions) {
    const title = (sub.shortname || sub.fullname || `مساق #${sub.course_id}`).slice(0, 22)
    keyboard.push([
      {
        text: `❌ إلغاء: ${title}`,
        callback_data: encodeCallback('u', sub.course_id),
      },
    ])
  }

  // Pagination
  const navRow: InlineKeyboardButton[] = []
  if (page > 0) {
    navRow.push({
      text: '⬅️ السابق',
      callback_data: encodeCallback('m', page - 1),
    })
  }
  if (hasMore) {
    navRow.push({
      text: 'التالي ➡️',
      callback_data: encodeCallback('m', page + 1),
    })
  }

  if (navRow.length > 0) {
    keyboard.push(navRow)
  }

  keyboard.push([
    { text: '📚 استعراض المقررات', callback_data: encodeCallback('c', 'ALL', 0) },
    { text: '🏠 القائمة الرئيسية', callback_data: encodeCallback('c', 'HOME', 0) },
  ])

  return keyboard
}

/**
 * Builds alert action inline keyboard matching Spec Section 5.
 */
export function buildAlertKeyboard(targetUrl?: string): InlineKeyboardButton[][] {
  const buttons: InlineKeyboardButton[] = []

  if (targetUrl) {
    buttons.push({
      text: '🔗 فتح في مودل',
      url: targetUrl,
    })
  }

  buttons.push({
    text: '⚙️ إدارة اشتراكاتي',
    callback_data: encodeCallback('m', 0),
  })

  return [buttons]
}
