/**
 * Telegram Bot API Client & Dispatcher
 * Specification Reference: specs/03-edge-functions-spec.md & specs/04-telegram-bot-spec.md
 */

export interface InlineKeyboardButton {
  text: string
  callback_data?: string
  url?: string
}

export interface SendMessageOptions {
  parse_mode?: 'HTML' | 'MarkdownV2' | 'Markdown'
  reply_markup?: {
    inline_keyboard?: InlineKeyboardButton[][]
  }
  disable_web_page_preview?: boolean
}

export interface TelegramApiResponse<T = unknown> {
  ok: boolean
  result?: T
  description?: string
  error_code?: number
  parameters?: {
    retry_after?: number
  }
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function cleanSnippet(html?: string): string | undefined {
  if (!html) return undefined
  const cleaned = html
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return cleaned ? cleaned.slice(0, 350) : undefined
}

export async function callTelegramApi<T = unknown>(
  botToken: string,
  method: string,
  payload: Record<string, unknown>
): Promise<TelegramApiResponse<T>> {
  const url = `https://api.telegram.org/bot${botToken}/${method}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    })

    const data = await res.json()
    return data as TelegramApiResponse<T>
  } catch (err: unknown) {
    return {
      ok: false,
      description: err instanceof Error ? err.message : String(err),
    }
  }
}

export interface SendTelegramResult {
  ok: boolean
  isBlocked?: boolean
  description?: string
  result?: unknown
}

export async function sendTelegramMessageWithRetry(
  botToken: string,
  chatId: number | string,
  text: string,
  options: SendMessageOptions = {},
  attempt = 1
): Promise<SendTelegramResult> {
  const res = await callTelegramApi(botToken, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: options.parse_mode || 'HTML',
    reply_markup: options.reply_markup,
    disable_web_page_preview: options.disable_web_page_preview ?? true,
  })

  // HTTP 429 Rate-limit Retry-After interceptor (Spec 4.2)
  if (res.error_code === 429 && attempt <= 3) {
    const retrySec = res.parameters?.retry_after || 2
    const sleepMs = retrySec * 1000 + 500
    await new Promise((resolve) => setTimeout(resolve, sleepMs))
    return sendTelegramMessageWithRetry(botToken, chatId, text, options, attempt + 1)
  }

  // HTTP 403 Forbidden: Student has blocked the bot or chat was deleted
  if (res.error_code === 403) {
    return {
      ok: false,
      isBlocked: true,
      description: res.description || 'Bot was blocked by the user',
    }
  }

  return {
    ok: res.ok,
    description: res.description,
    result: res.result,
  }
}

export async function sendMessage(
  botToken: string,
  chatId: number | string,
  text: string,
  options: SendMessageOptions = {}
): Promise<TelegramApiResponse> {
  return await callTelegramApi(botToken, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: options.parse_mode || 'HTML',
    reply_markup: options.reply_markup,
    disable_web_page_preview: options.disable_web_page_preview ?? true,
  })
}

export async function editMessageText(
  botToken: string,
  chatId: number | string,
  messageId: number,
  text: string,
  options: SendMessageOptions = {}
): Promise<TelegramApiResponse> {
  return await callTelegramApi(botToken, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: options.parse_mode || 'HTML',
    reply_markup: options.reply_markup,
    disable_web_page_preview: options.disable_web_page_preview ?? true,
  })
}

export async function answerCallbackQuery(
  botToken: string,
  callbackQueryId: string,
  text?: string,
  showAlert = false
): Promise<TelegramApiResponse> {
  return await callTelegramApi(botToken, 'answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    show_alert: showAlert,
  })
}

/**
 * Format notification alert message in Arabic with HTML formatting according to Spec Section 5
 */
export function formatMoodleAlertMessage(params: {
  courseName: string
  courseShortname?: string
  cohortTag?: string
  eventType: 'EVENT_CREATED' | 'EVENT_UPDATED'
  itemType: 'mod_forum' | 'mod_assign' | 'mod_resource' | 'mod_url'
  itemTitle: string
  itemUrl?: string
  dueDate?: number
  author?: string
  previewSnippet?: string
}): string {
  const {
    courseName,
    courseShortname,
    eventType,
    itemType,
    itemTitle,
    itemUrl,
    dueDate,
    author,
    previewSnippet,
  } = params

  const courseDisplayName = courseShortname
    ? `${escapeHtml(courseName)} (${escapeHtml(courseShortname)})`
    : escapeHtml(courseName)

  // 5.1 New Announcement (mod_forum)
  if (itemType === 'mod_forum') {
    let msg = `🚨 <b>${courseDisplayName}</b>\n`
    msg += `📢 <b>إعلان جديد:</b> ${escapeHtml(itemTitle)}\n`
    if (author) {
      msg += `👨‍🏫 <i>${escapeHtml(author)}</i>\n`
    }
    if (previewSnippet) {
      msg += `\n${escapeHtml(previewSnippet)}\n`
    }
    if (itemUrl) {
      msg += `\n<a href="${escapeHtml(itemUrl)}">🔗 فتح الإعلان في مودل</a>\n`
    }
    msg += `\n<i>رادار مودل — جسر التنبيهات الأكاديمي</i>`
    return msg
  }

  // 5.2 Assignment Created or Deadline Modified (mod_assign)
  if (itemType === 'mod_assign') {
    const isNew = eventType === 'EVENT_CREATED'
    const statusBadge = isNew ? '📝 تكليف جديد' : '🔄 تعديل على موعد التكليف'
    let msg = `⚠️ <b>${courseDisplayName}</b>\n`
    msg += `<b>${statusBadge}:</b> ${escapeHtml(itemTitle)}\n`

    if (author) {
      msg += `👨‍🏫 <i>${escapeHtml(author)}</i>\n`
    }

    if (dueDate) {
      const dateFormatted = new Date(dueDate * 1000).toLocaleString('ar-EG', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
      msg += `📅 <b>موعد التسليم:</b> <b>${dateFormatted}</b>\n`
    }

    msg += `\nالحالة: <i>${isNew ? 'جديد' : 'تم تعديل الموعد النهائي'}</i>\n`
    if (itemUrl) {
      msg += `\n<a href="${escapeHtml(itemUrl)}">🔗 عرض التكليف في مودل</a>\n`
    }
    msg += `\n<i>رادار مودل — جسر التنبيهات الأكاديمي</i>`
    return msg
  }

  // 5.3 New Course Material or Link (mod_resource, mod_url)
  const isResource = itemType === 'mod_resource'
  let msg = `📁 <b>${courseDisplayName}</b>\n`
  msg += `📄 <b>${isResource ? 'تم رفع ملف أو محاضرة جديدة:' : 'رابط تعليمي جديد:'}</b> ${escapeHtml(itemTitle)}\n`
  if (itemUrl) {
    msg += `\n<a href="${escapeHtml(itemUrl)}">🔗 ${isResource ? 'تحميل / فتح الملف' : 'فتح الرابط'}</a>\n`
  }
  msg += `\n<i>رادار مودل — جسر التنبيهات الأكاديمي</i>`
  return msg
}

/**
 * Batched message dispatcher respecting Telegram rate limits (Spec 04 Section 4.1).
 * Chunks recipients into groups of 25, executes with Promise.allSettled,
 * and pauses 1000ms between chunks.
 */
export async function dispatchBatchedMessages(
  botToken: string,
  chatIds: Array<number | string>,
  messageHtml: string,
  options: SendMessageOptions = {},
  config: { chunkSize?: number; batchPauseMs?: number } = {}
): Promise<{
  successCount: number
  failureCount: number
  blockedChatIds: Array<number | string>
  errors: string[]
}> {
  const chunkSize = config.chunkSize ?? 25
  const batchPauseMs = config.batchPauseMs ?? 1000

  let successCount = 0
  let failureCount = 0
  const blockedChatIds: Array<number | string> = []
  const errors: string[] = []

  for (let i = 0; i < chatIds.length; i += chunkSize) {
    const chunk = chatIds.slice(i, i + chunkSize)

    const results = await Promise.allSettled(
      chunk.map(async (chatId) => {
        const res = await sendTelegramMessageWithRetry(botToken, chatId, messageHtml, options)
        return { chatId, ...res }
      })
    )

    for (const res of results) {
      if (res.status === 'fulfilled') {
        const val = res.value
        if (val.ok) {
          successCount += 1
        } else {
          failureCount += 1
          if (val.isBlocked) {
            blockedChatIds.push(val.chatId)
          }
          errors.push(`Chat ${val.chatId}: ${val.description || 'Unknown delivery failure'}`)
        }
      } else {
        failureCount += 1
        errors.push(`Chat dispatch error: ${res.reason instanceof Error ? res.reason.message : String(res.reason)}`)
      }
    }

    // Inter-chunk pause if more recipients remain
    if (i + chunkSize < chatIds.length) {
      await new Promise((resolve) => setTimeout(resolve, batchPauseMs))
    }
  }

  return { successCount, failureCount, blockedChatIds, errors }
}
