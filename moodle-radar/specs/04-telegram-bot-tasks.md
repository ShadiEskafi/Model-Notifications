# Telegram Bot Implementation Plan & Tasks (Spec 04)

**Specification Reference:** [`specs/04-telegram-bot-spec.md`](file:///f:/SHADI/2-Programming/Model%20Notifications/moodle-radar/specs/04-telegram-bot-spec.md)  
**Status:** 100% Completed & Verified by Test Suite (`test/telegram-bot.test.mjs`) ✅  
**Last Updated:** 2026-10-17  

---

## Task Progress Checklist

### Phase 1: Telegram Bot Core UX & Command Routing
- [x] **Task 1.1:** Implement complete command routing in `telegram-webhook/index.ts` & `_shared/telegramBotUi.ts`:
  - `/start`: Welcome message and interactive navigation menu.
  - `/search <keyword>`: Search monitored courses with inline subscription buttons.
  - `/my_courses`: List active subscriptions with 1-click unsubscribe buttons.
  - `/pause` & `/resume`: Mute/unmute alert delivery without losing subscriptions.
  - `/help`: Detailed Arabic guide on using the bot.
  - `/about`: Privacy guarantee and system overview.
- [x] **Task 1.2:** Implement deep-linking support (`/start c_<course_id>`) for instant one-click subscription from links or QR codes.
- [x] **Task 1.3:** Implement `/bind_course <course_id>` for Telegram group and channel alert broadcasts with admin permission verification.

---

### Phase 2: Compact Inline Keyboard Architecture (< 20 Bytes)
- [x] **Task 2.1:** Standardize compact callback opcodes:
  - `s:<course_id>` (Toggle Subscribe - 6 bytes)
  - `u:<course_id>` (Direct Unsubscribe - 6 bytes)
  - `c:<cohort_tag>:<page>` (Browse Cohort Catalog - 8 bytes)
  - `m:<page>` (Manage Subscriptions - 3 bytes)
- [x] **Task 2.2:** Implement reactive message editing and toast alerts via `answerCallbackQuery`.
- [x] **Task 2.3:** Implement pagination navigation buttons (`⬅️ السابق` / `التالي ➡️`) for multi-page course catalogs and subscriptions.

---

### Phase 3: Message HTML Templates & Throttled Dispatch Engine
- [x] **Task 3.1:** Implement message layout templates matching Spec Section 5:
  - `mod_forum`: New Announcement template with author, time, snippet, and action buttons.
  - `mod_assign`: Assignment alert with due date formatting, status badge, and Moodle link.
  - `mod_resource` / `mod_url`: File/link notification with direct download link.
- [x] **Task 3.2:** Implement chunked batch dispatch algorithm (chunks of 25, 1000ms inter-chunk pause) via `Promise.allSettled`.
- [x] **Task 3.3:** Implement HTTP 429 `retry_after` interceptor with exponential backoff and HTTP 403 Forbidden auto-flagging for blocked users.

---

### Phase 4: Webhook Setup & Bot Menu Deployment Automation
- [x] **Task 4.1:** Create automated script `scripts/setup-telegram-webhook.mjs`:
  - Register webhook URL with `secret_token` and `drop_pending_updates`.
  - Register Telegram slash commands menu via `setMyCommands`.
  - Verify webhook deployment status via `getWebhookInfo`.

---

### Phase 5: Verification & Automated Test Suite
- [x] **Task 5.1:** Create automated verification test suite `test/telegram-bot.test.mjs`:
  - Verify deep-linking parsing (`/start c_1042`).
  - Verify callback payload size constraints (< 20 bytes).
  - Verify message templates layout and HTML escaping.
  - Verify chunked dispatcher and HTTP 429 retry-after behavior.
  - Verify webhook event routing logic.
- [x] **Task 5.2:** Execute all repository test suites and verify 100% pass rate.
