# Edge Functions Implementation Plan & Tasks (Spec 03)

**Specification Reference:** [`specs/03-edge-functions-spec.md`](file:///f:/SHADI/2-Programming/Model%20Notifications/moodle-radar/specs/03-edge-functions-spec.md)  
**Status:** 100% Completed & Verified by Test Suite (`test/edge-functions.test.mjs`) ✅  
**Last Updated:** 2026-10-17  

---

## Task Progress Checklist

### Phase 1: Shared Infrastructure & Security
- [x] **Task 1.1:** Setup CORS headers and HTTP response helper in `supabase/functions/_shared/cors.ts`.
- [x] **Task 1.2:** Implement Web Crypto AES-256-GCM encryption/decryption in `supabase/functions/_shared/crypto.ts` with PostgreSQL `BYTEA` hex string support (`\x...`).
- [x] **Task 1.3:** Implement Telegram API client in `supabase/functions/_shared/telegramClient.ts` supporting `sendMessage`, `editMessageText`, `answerCallbackQuery`, and rate-limiting throttling (25 msgs/sec).

---

### Phase 2: Donor Onboarding & Course Discovery (`/sync-courses`)
- [x] **Task 2.1:** Build `supabase/functions/sync-courses/index.ts` handler:
  - Input validation (`label`, `moodle_base_url`, `wstoken`).
  - Handshake with Moodle via `getSiteInfo(baseUrl, wstoken)`.
  - AES-256-GCM token encryption.
  - Insert / update `donor_tokens` with verified Moodle user ID and fullname.
  - Discover courses via `getUsersCourses(baseUrl, wstoken, userid)`.
  - Upsert discovered courses into `courses` table and link fallback tokens.
  - Return JSON payload with course summary and CORS support.

---

### Phase 3: Autonomous Poller Engine (`/moodle-poller`)
- [x] **Task 3.1:** Build `supabase/functions/moodle-poller/index.ts` handler:
  - Query active monitored courses (`is_monitored = TRUE`) or single course on-demand.
  - Group courses by donor token and decrypt tokens in-memory.
  - Circuit Breaker initialization and consecutive failure safety.
  - Sequential course polling with 500ms-1200ms randomized jitter delay.
  - Module tree inspection (`getCourseContents`) and announcements inspection (`getForumDiscussions`).
  - Delta watermarking evaluation with `course_items_state`.
  - Target subscriber lookup and batched Telegram broadcast dispatch.
  - Audit logging to `notification_logs` and timestamp update `last_polled_at`.

---

### Phase 4: Telegram Bot Webhook & Router (`/telegram-webhook`)
- [x] **Task 4.1:** Build `supabase/functions/telegram-webhook/index.ts` handler:
  - Webhook secret token authentication (`X-Telegram-Bot-Api-Secret-Token`).
  - Router for slash commands: `/start`, `/search`, `/my_courses`, `/pause`, `/resume`.
  - Router for callback queries: `s:<course_id>` (subscribe/unsubscribe toggle), `c:<cohort>:<page>`, `m:<page>`.
  - Instant `200 OK` acknowledgment response.

---

### Phase 5: Verification & Automated Test Suite
- [x] **Task 5.1:** Build test suite `test/edge-functions.test.mjs` verifying:
  - AES-256-GCM encryption, decryption, and authentication tag tampering detection.
  - Telegram message formatting (HTML markdown escaping).
  - Webhook command router and callback query parser.
  - Sync-courses and poller payload generation.
- [x] **Task 5.2:** Run test suite and confirm 100% pass rate.
