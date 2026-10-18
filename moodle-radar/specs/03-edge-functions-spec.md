# Edge Functions Specification: Moodle Radar

**Document Reference:** `specs/03-edge-functions-spec.md`  
**Related Documents:** 
- [`intent/PRD.md`](file:///f:/SHADI/2-Programming/Model%20Notifications/moodle-radar/intent/PRD.md)
- [`specs/01-database-spec.md`](file:///f:/SHADI/2-Programming/Model%20Notifications/moodle-radar/specs/01-database-spec.md)
- [`specs/02-moodle-integration-spec.md`](file:///f:/SHADI/2-Programming/Model%20Notifications/moodle-radar/specs/02-moodle-integration-spec.md)
- [`specs/04-telegram-bot-spec.md`](file:///f:/SHADI/2-Programming/Model%20Notifications/moodle-radar/specs/04-telegram-bot-spec.md)
- [`specs/05-dashboard-frontend-spec.md`](file:///f:/SHADI/2-Programming/Model%20Notifications/moodle-radar/specs/05-dashboard-frontend-spec.md)

---

## 1. Runtime Environment & Shared Infrastructure

All backend serverless operations run on **Supabase Edge Functions** (Deno 1.x / 2.x runtime). Functions execute within low-latency edge nodes and interact directly with Supabase PostgreSQL and external APIs.

### 1.1 Environment Secrets Configuration
The following environment variables are securely injected into the Edge runtime via Supabase Secrets:
* `SUPABASE_URL`: Internal URL for Supabase API access.
* `SUPABASE_SERVICE_ROLE_KEY`: Elevated key bypassing RLS for worker operations.
* `ENCRYPTION_MASTER_KEY`: 256-bit hexadecimal string (64 chars) for AES-256-GCM cryptographic operations.
* `TELEGRAM_BOT_TOKEN`: The bot token obtained from `@BotFather`.
* `TELEGRAM_WEBHOOK_SECRET`: A high-entropy random string verified in the `X-Telegram-Bot-Api-Secret-Token` header.

---

## 2. Cryptographic Engine (AES-256-GCM via Web Crypto API)

All donor tokens are encrypted before being written to PostgreSQL and decrypted only in-memory during poller cycles.

```typescript
// Location: supabase/functions/_shared/crypto.ts

export interface EncryptedPayload {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  authTag: Uint8Array;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

async function getMasterCryptoKey(): Promise<CryptoKey> {
  const masterHex = Deno.env.get("ENCRYPTION_MASTER_KEY");
  if (!masterHex || masterHex.length !== 64) {
    throw new Error("Invalid or missing ENCRYPTION_MASTER_KEY (must be 64-char hex)");
  }
  return await crypto.subtle.importKey(
    "raw",
    hexToBytes(masterHex),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptToken(plainToken: string): Promise<EncryptedPayload> {
  const key = await getMasterCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 12-byte IV for GCM
  const encoded = new TextEncoder().encode(plainToken);

  const combined = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    key,
    encoded
  );

  // Web Crypto appends the 16-byte authentication tag to the ciphertext
  const combinedBytes = new Uint8Array(combined);
  const authTag = combinedBytes.slice(combinedBytes.byteLength - 16);
  const ciphertext = combinedBytes.slice(0, combinedBytes.byteLength - 16);

  return { ciphertext, iv, authTag };
}

export async function decryptToken(payload: EncryptedPayload): Promise<string> {
  const key = await getMasterCryptoKey();
  
  // Re-assemble ciphertext + authTag for Web Crypto verification
  const combined = new Uint8Array(payload.ciphertext.byteLength + payload.authTag.byteLength);
  combined.set(payload.ciphertext, 0);
  combined.set(payload.authTag, payload.ciphertext.byteLength);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: payload.iv, tagLength: 128 },
    key,
    combined
  );

  return new TextDecoder().decode(decrypted);
}
```

---

## 3. Function Specifications

### 3.1 Function: `/sync-courses`
* **Purpose:** Validates raw donor tokens via Moodle API, encrypts them, syncs enrolled courses, and links fallback donors.
* **HTTP Method:** `POST`
* **Authorization:** Requires authenticated Super Admin JWT (`Authorization: Bearer <JWT>`).

#### Request Schema:
```json
{
  "label": "Cybersecurity - Year 3",
  "moodle_base_url": "https://moodle.university.edu",
  "wstoken": "9f82b4c107e361284a123456789abcdef"
}
```

#### Execution Logic:
1. Validates presence of `label` and `wstoken`.
2. Invokes Moodle `core_webservice_get_site_info` with `wstoken`. If failed, returns `400 Bad Request`.
3. Calls `encryptToken(wstoken)` to produce `ciphertext`, `iv`, and `authTag`.
4. Upserts record into `donor_tokens` table.
5. Invokes Moodle `core_enrol_get_users_courses` using discovered `moodle_user_id`.
6. For each course returned:
   - If course already exists: links `fallback_token_id = donor.id`.
   - If course is new: inserts into `courses` with `is_monitored = true` and `donor_token_id = donor.id`.
7. Returns discovered course summary.

#### Response Schemas:
* **Success (`200 OK`):**
  ```json
  {
    "success": true,
    "donor_id": "7b84dbdc-f703-4927-9de8-137a6bca2351",
    "moodle_user_fullname": "Ahmad Al-Mansoor",
    "synced_courses_count": 6
  }
  ```
* **Failure (`400 Bad Request`):**
  ```json
  {
    "success": false,
    "error_code": "MOODLE_VALIDATION_ERROR",
    "message": "Access control exception: Invalid token or account locked"
  }
  ```

---

### 3.2 Function: `/moodle-poller`
* **Purpose:** Scheduled batch poller triggered by `pg_cron` every 10 minutes.
* **HTTP Method:** `POST`
* **Authorization:** `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`.

#### Execution Logic:
1. Queries all courses where `is_monitored = TRUE`.
2. Groups courses by their `donor_token_id` to decrypt each token once.
3. For each course:
   - Enforces sequential delay of 500ms–1200ms randomized jitter.
   - Checks circuit breaker status (halts if 3 consecutive courses fail with 5xx/timeout).
   - Fetches course modules via `core_course_get_contents` and discussions via `mod_forum_get_forum_discussions`.
   - Evaluates timestamp delta against `course_items_state`.
   - If new or modified items are found, queries subscribed bot users from `subscriptions` JOIN `bot_users` (where `is_paused = FALSE`).
   - Dispatches batched alerts to Telegram via `dispatchBatchedMessages` (25 msgs/sec).
   - Updates `course.last_polled_at = NOW()`.
   - Logs metrics to `notification_logs`.

#### Response Schema (`200 OK`):
```json
{
  "status": "completed",
  "polled_courses": 18,
  "events_detected": 2,
  "messages_dispatched": 145,
  "execution_duration_ms": 14200
}
```

---

### 3.3 Function: `/telegram-webhook`
* **Purpose:** Receives Telegram webhooks, routes commands, and processes inline keyboard callback queries.
* **HTTP Method:** `POST`
* **Security:** Verifies `X-Telegram-Bot-Api-Secret-Token == TELEGRAM_WEBHOOK_SECRET`.

#### Router Mapping:
| Incoming Update Type | Trigger / Pattern | Destination Handler |
| :--- | :--- | :--- |
| `message.text` | `/start` | `handleStartCommand(message)` |
| `message.text` | `/search <query>` | `handleSearchCommand(message, query)` |
| `message.text` | `/my_courses` | `handleMyCoursesCommand(message)` |
| `message.text` | `/pause` | `handlePauseCommand(message, true)` |
| `message.text` | `/resume` | `handlePauseCommand(message, false)` |
| `callback_query.data` | `s:<course_id>` | `handleSubscriptionToggle(callbackQuery)` |
| `callback_query.data` | `u:<course_id>` | `handleDirectUnsubscribe(callbackQuery)` |
| `callback_query.data` | `c:<cohort>:<page>` | `handleCohortCatalogPage(callbackQuery)` |
| `callback_query.data` | `m:<page>` | `handleMyCoursesPage(callbackQuery)` |

#### Response:
Always returns `200 OK` with `{ "ok": true }` to Telegram within 2 seconds to prevent webhook retries.
