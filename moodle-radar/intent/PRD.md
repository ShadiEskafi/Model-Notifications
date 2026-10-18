# Moodle Radar — Product Requirements Document (PRD) & Specification

**Project Name:** Moodle Radar  
**Target Environment:** University Moodle LMS Notification Bridge & Admin Dashboard  
**Architecture:** React 19 SPA (Vite) + Supabase (PostgreSQL, Edge Functions, pg_cron) + Telegram Bot API  
**Status:** Approved for Implementation (MVP)  

---

## Table of Contents
1. [Interview Requirements Summary (Phases 1–6)](#1-interview-requirements-summary-phases-16)
2. [Executive Summary & System Architecture](#2-executive-summary--system-architecture)
3. [User Stories & Acceptance Criteria (Gherkin)](#3-user-stories--acceptance-criteria-gherkin)
4. [Database Schema & API Contracts](#4-database-schema--api-contracts)
5. [Security & Network Guidelines](#5-security--network-guidelines)
6. [Operational Quotas & Free-Tier Budget](#6-operational-quotas--free-tier-budget)
7. [Production Deployment Runbook](#7-production-deployment-runbook)

---

## 1. Interview Requirements Summary (Phases 1–6)

### Phase 1: Core Value Proposition & Target Audience
* **Problem Statement:** The university's official Moodle mobile application suffers from unreliable push notifications due to infrastructure and mobile licensing constraints. Students are forced to constantly refresh web portals, leading to missed emergency lecture announcements, room changes, and sudden assignment deadlines.
* **Target Audience:**
  * **General Student (End Subscriber):** Zero-credential users who interact exclusively via Telegram to subscribe to courses and receive alerts.
  * **Donor Student (Access Contributor):** Trusted cohort peers (e.g., class representatives) who contribute a read-only Moodle web services token for their academic year/department.
  * **Super Admin:** Manages tokens, monitors token health/revocation, automates course discovery, and supervises system logs.
* **MVP Notification Scope:**
  * **Highest Priority:** Forum Announcements & Discussions (`mod_forum`), Assignments created/deadline modified (`mod_assign`).
  * **High Priority:** Course files, slides, and links (`mod_resource`, `mod_url`).
  * **Strictly Out of Scope:** Private student grades and individual feedback (excluded for student data privacy and architectural simplicity).

### Phase 2: Core User Persona Workflows
* **Super Admin Flow:** 
  * Onboard token with cohort label (e.g., "Cybersecurity - Year 3") via direct `wstoken` string or an ephemeral single-request student credentials extraction (credentials immediately discarded).
  * Validates token via `core_webservice_get_site_info`.
  * Auto-discovers courses via `core_enrol_get_users_courses`. Duplicate courses can be linked as secondary/fallback tokens.
  * Granular controls: Global course toggle (`is_monitored: boolean`), module-level filters (`mod_forum`, `mod_assign`, `mod_resource`, `mod_url`), and an on-demand "Poll Now" diagnostic trigger.
* **Student Bot Flow:**
  * Onboarding via `/start`, registering `telegram_id`, `username`, and `first_name` in `bot_users`.
  * Categorized menu navigation by Faculty/Cohort tag with live subscription state toggles (`[ ➕ Subscribe ]` / `[ ✅ Subscribed ]`), plus a `/search <keyword>` command.
  * Notifications delivered via Direct Message (DM) with course title, doctor name, timestamp, preview text, and an authenticated deep link `[ 🔗 Open in Moodle ]`.
  * Subscription management via `/my_courses` (one-click unsubscribe) and `/pause` / `/resume` for temporary muting.

### Phase 3: Platforms & Tech Stack
* **Frontend:** React 19 SPA powered by Vite (plain JavaScript), styled using Tailwind CSS v4 and Lucide-React icons. Aesthetic: Clean, high-contrast dark dashboard.
* **Authentication:** Supabase Auth (Email & Password), restricted strictly to the Super Admin account (public signups disabled).
* **Backend Runtime (Serverless):**
  * `/telegram-webhook`: Supabase Edge Function processing Telegram updates and subscription callbacks.
  * `/moodle-poller`: Supabase Edge Function executing every 10 minutes via PostgreSQL `pg_cron` + `pg_net`.
  * `/sync-courses`: Supabase Edge Function executing token validation, AES-256 encryption, and course sync without client-side CORS issues.
* **Hosting:** Vercel or Cloudflare Pages (Frontend) + Supabase Free Tier (Backend/DB/Edge Functions).

### Phase 4: Non-Functional Requirements
* **Token Security:** Tokens encrypted at rest in PostgreSQL using AES-256-GCM via the Web Crypto API. The 256-bit `ENCRYPTION_MASTER_KEY` resides strictly in Supabase Edge Secrets. Database stores `encrypted_token`, 12-byte `iv`, and 16-byte `auth_tag`.
* **Moodle Polling Safeguards:** Courses polled sequentially with 500ms–1200ms randomized sleep jitter between requests. Requests use the official Moodle Mobile `User-Agent`. Circuit breaker triggers after 3 consecutive 5xx errors or network timeouts, halting execution for the cycle.
* **Telegram Rate Limiting:** Outgoing notifications batched into chunks of 25 messages/second with a 1000ms delay between chunks using `Promise.allSettled`. If an HTTP 429 occurs, dispatcher extracts `parameters.retry_after` and sleeps for `retry_after + 500ms`.

### Phase 5: Key Integrations
* **Moodle API Optimization:** Two lightweight API calls per course:
  * `core_course_get_contents`: Complete course hierarchy, modules, resources, URLs, assignments.
  * `mod_forum_get_forum_discussions`: Announcements forum discussion posts.
* **Stateful Delta Engine (`course_items_state`):** Composite ID (`course_id:module_id` or `course_id:forum:discussion_id`) and Unix `timemodified`.
  * Unseen ID -> `EVENT_CREATED` -> notify & persist.
  * Seen ID with `incoming_timemodified > stored_timemodified` -> `EVENT_UPDATED` -> notify & update.
  * Seen ID with unchanged timestamp -> no-op.
* **Telegram Callback Serialization:** Compact delimiter schema `<action_opcode>:<target_id>:<context_param>` (`s` for toggle, `u` for unsubscribe, `c` for cohort catalog, `m` for page) keeping payloads under 20 bytes (safely below the 64-byte Telegram limit).

### Phase 6: Constraints & Scope
* **Free-Tier Safety:** ~4,320 poller cycles + ~15,000 Telegram interactions = ~19,320 invocations/month (<4% of Supabase's 500,000 quota).
* **Storage Pruning:** Metadata-only storage with an automated 90-day pruning cron keeps database storage below 25 MB (<5% of the 500 MB limit).
* **Strict Exclusions:** Direct binary/PDF proxying (uses deep links), LLM summarization, multi-tenant university support, and heavy analytics graphs.

---

## 2. Executive Summary & System Architecture

### 2.1 Architecture Flowchart

```mermaid
flowchart TD
    subgraph Client Tier
        SA["Super Admin<br/>(Browser)"]
        ST["Students<br/>(Telegram App)"]
    end

    subgraph Frontend Hosting - Vercel / Cloudflare Pages
        WD["React 19 SPA + Vite<br/>Tailwind CSS v4 + Lucide"]
    end

    subgraph Backend Infrastructure - Supabase Free Tier
        AUTH["Supabase Auth<br/>(Email/Password - Admin Only)"]
        PG[("PostgreSQL Database<br/>RLS + pg_cron + pg_net")]
        
        subgraph Serverless Edge Functions
            EF_SYNC["/sync-courses<br/>(Handshake & Token Encryption)"]
            EF_POLL["/moodle-poller<br/>(Delta Engine & Dispatcher)"]
            EF_BOT["/telegram-webhook<br/>(Bot Command & Callback Router)"]
        end
    end

    subgraph External Services
        MDL["University Moodle LMS<br/>(Mobile Web Services REST API)"]
        TG["Telegram Bot API<br/>(Bot Gateway)"]
    end

    SA -->|HTTPS / Supabase Client| WD
    WD -->|Auth Request| AUTH
    WD -->|Manage Courses & Tokens| PG
    WD -->|Invoke Token Sync| EF_SYNC
    EF_SYNC -->|core_webservice_get_site_info<br/>core_enrol_get_users_courses| MDL
    EF_SYNC -->|Store AES-256 Ciphertext| PG

    PG -->|pg_cron: Every 10 mins via pg_net| EF_POLL
    EF_POLL -->|Sequential Jittered Poll<br/>core_course_get_contents<br/>mod_forum_get_forum_discussions| MDL
    EF_POLL -->|Evaluate Timestamps against course_items_state| PG
    EF_POLL -->|Throttled Batch Dispatch<br/>(25 msgs/sec)| TG

    ST -->|Send Commands / Callbacks| TG
    TG -->|Webhook Event| EF_BOT
    EF_BOT -->|Update bot_users & subscriptions| PG
    TG -->|Direct Message Alert| ST
```

---

## 3. User Stories & Acceptance Criteria (Gherkin)

### US-1: Super Admin Token Onboarding & Validation
```gherkin
Feature: Donor Token Onboarding
  Scenario: Successfully onboarding a raw Moodle token
    Given the Super Admin is authenticated on the Web Dashboard
    When the admin opens the "Donor Management" modal
    And enters the Cohort Label "Cybersecurity - Year 3"
    And provides a valid Moodle wstoken string
    And clicks "Validate & Connect"
    Then the backend invokes "core_webservice_get_site_info" against the Moodle base URL
    And encrypts the token using AES-256-GCM with the master environment key
    And creates a new record in "donor_tokens" with status "active"
    And displays a success notification with the donor's registered student name and site info

  Scenario: Attempting to onboard an expired or invalid token
    Given the Super Admin provides an invalid or revoked wstoken
    When the admin clicks "Validate & Connect"
    Then the Moodle API returns an invalid token exception
    And no record is committed to "donor_tokens"
    And the modal displays an explicit error message: "Moodle Handshake Failed: Invalid token or account locked"
```

### US-2: Automated Course Discovery & Fallback Token Mapping
```gherkin
Feature: Course Discovery & Fallback Mapping
  Scenario: Auto-discovering courses from a freshly validated donor token
    Given a donor token has passed handshake validation
    When the backend calls "core_enrol_get_users_courses" using the donor's ID
    Then the UI renders a preview list of all enrolled courses showing ID, Fullname, and Category
    And marks duplicate courses already present in the database
    When the admin confirms import
    Then new courses are inserted into "courses" with "is_monitored = true" and assigned to this donor
    And previously existing courses are updated with this donor as "fallback_token_id"
```

### US-3: Granular Course & Module Polling Controls
```gherkin
Feature: Granular Polling Controls
  Scenario: Pausing an active course
    Given a course "Embedded Systems" is currently monitored with "is_monitored = true"
    When the admin toggles the course switch to "Paused"
    Then the database updates "is_monitored = false"
    And subsequent "/moodle-poller" cycles bypass this course without deleting historical records

  Scenario: Disabling specific module types
    Given a course has "Forum Announcements" enabled and "Resources & URLs" disabled
    When the poller runs for this course
    Then it processes new items from "mod_forum"
    And skips any new items originating from "mod_resource" or "mod_url"
```

### US-4: Student Telegram Onboarding & Cohort Browsing
```gherkin
Feature: Student Telegram Bot Onboarding
  Scenario: First-time student interaction
    Given a student sends "/start" to the Telegram Bot
    When the webhook processes the message
    Then it inserts or updates the student's record in "bot_users" with their telegram_id and username
    And responds with a welcome banner and an inline keyboard of available Cohort Tags (e.g., "[Cybersecurity - Year 3]")

  Scenario: Browsing courses within a cohort tag
    Given the student clicks inline button "[Cybersecurity - Year 3]"
    When the bot processes callback "c:cyber3:1"
    Then the bot edits the message to display the list of courses with dynamic subscription buttons:
      | Button Label | Action |
      | [ ➕ Subscribe ] Database Systems | Unsubscribed state |
      | [ ✅ Subscribed ] Computer Networks | Subscribed state |
```

### US-5: Student Course Subscription & Keyword Search
```gherkin
Feature: Course Subscription and Search
  Scenario: Toggling course subscription via inline button
    Given a student sees "[ ➕ Subscribe ] Database Systems"
    When the student clicks the button (callback "s:1042")
    Then the backend inserts a row into "subscriptions" linking the user and course ID
    And immediately updates the inline button to "[ ✅ Subscribed ] Database Systems"
    And displays a transient notification: "Subscribed to Database Systems"

  Scenario: Searching courses via keyword
    Given a student sends "/search networks"
    When the bot queries courses matching the substring "networks"
    Then it returns an inline keyboard of matching courses with their current subscription toggle status
```

### US-6: Polling Engine Delta Detection & Change Notification
```gherkin
Feature: Stateful Delta Detection
  Scenario: Detecting a newly posted doctor announcement
    Given the poller invokes "mod_forum_get_forum_discussions" for course ID 201
    And receives a discussion item with ID "disc_991" and timemodified 1713340000
    When the composite key "201:forum:disc_991" does NOT exist in "course_items_state"
    Then the poller classifies the event as "EVENT_CREATED"
    And writes "201:forum:disc_991" with timemodified 1713340000 into "course_items_state"
    And queues a notification dispatch to all active subscribers of course 201

  Scenario: Detecting an updated assignment deadline
    Given an assignment module "201:mod_assign:550" exists in "course_items_state" with timemodified 1713300000
    When the poller reads the assignment module with an incoming timemodified of 1713350000
    Then the poller classifies the event as "EVENT_UPDATED"
    And updates the stored timemodified to 1713350000
    And queues a modified alert: "🚨 [Course Name] - Deadline Modified"
```

### US-7: Notification Dispatch & Rate-Limit Throttling
```gherkin
Feature: Throttled Telegram Dispatch
  Scenario: Broadcasting an announcement to 80 subscribed students
    Given an event requires notification delivery to 80 subscribers
    When the dispatcher executes
    Then it splits the recipients into 4 batches (25, 25, 25, 5)
    And dispatches batch 1 immediately via "Promise.allSettled"
    And sleeps for 1000ms before sending batch 2
    And continues until all batches are dispatched
    And logs total delivery successes and failures in "notification_logs"

  Scenario: Encountering Telegram HTTP 429 Too Many Requests
    Given Telegram responds to a dispatch chunk with HTTP 429 and "retry_after = 3"
    When the dispatcher catches the error
    Then it pauses execution for 3.5 seconds (retry_after + 500ms buffer)
    And retries the failed chunk before proceeding
```

### US-8: Student Subscription Management & Global Pause
```gherkin
Feature: Subscription Management and Muting
  Scenario: Managing subscribed courses
    Given a student sends "/my_courses"
    When the bot queries the student's active subscriptions
    Then it lists each course with an inline "[ ❌ Unsubscribe ]" button (callback "u:<course_id>")
    When the student clicks "[ ❌ Unsubscribe ]"
    Then the subscription is deleted from the database and the list refreshes

  Scenario: Pausing all alerts during exams or vacation
    Given a student sends "/pause"
    When the bot sets "bot_users.is_paused = true"
    Then no notifications are delivered to this student during subsequent poller cycles
    When the student sends "/resume"
    Then "bot_users.is_paused" is set to "false" and alerts resume immediately
```

---

## 4. Database Schema & API Contracts

### 4.1 PostgreSQL Schema (DDL)

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Donor Tokens Table
CREATE TABLE donor_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label VARCHAR(100) NOT NULL,
    moodle_user_id INTEGER,
    moodle_user_fullname VARCHAR(150),
    moodle_base_url VARCHAR(255) NOT NULL DEFAULT 'https://moodle.university.edu',
    encrypted_token BYTEA NOT NULL,
    iv BYTEA NOT NULL,
    auth_tag BYTEA NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
    last_validated_at TIMESTAMPTZ,
    last_error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Courses Table
CREATE TABLE courses (
    id INTEGER PRIMARY KEY, -- Moodle course ID
    fullname VARCHAR(255) NOT NULL,
    shortname VARCHAR(100),
    category_id INTEGER,
    cohort_tag VARCHAR(100) NOT NULL,
    donor_token_id UUID NOT NULL REFERENCES donor_tokens(id) ON DELETE RESTRICT,
    fallback_token_id UUID REFERENCES donor_tokens(id) ON DELETE SET NULL,
    is_monitored BOOLEAN NOT NULL DEFAULT TRUE,
    filter_forum BOOLEAN NOT NULL DEFAULT TRUE,
    filter_assign BOOLEAN NOT NULL DEFAULT TRUE,
    filter_resources BOOLEAN NOT NULL DEFAULT TRUE,
    last_polled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Stateful Course Item Tracking Table
CREATE TABLE course_items_state (
    composite_id VARCHAR(150) PRIMARY KEY, -- Format: "<course_id>:<module_or_forum>:<item_id>"
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    item_type VARCHAR(30) NOT NULL CHECK (item_type IN ('mod_forum', 'mod_assign', 'mod_resource', 'mod_url')),
    timemodified BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_course_items_course ON course_items_state(course_id);

-- 4. Bot Users Table
CREATE TABLE bot_users (
    telegram_id BIGINT PRIMARY KEY,
    username VARCHAR(100),
    first_name VARCHAR(150),
    is_paused BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Subscriptions Junction Table
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id BIGINT NOT NULL REFERENCES bot_users(telegram_id) ON DELETE CASCADE,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (telegram_id, course_id)
);
CREATE INDEX idx_sub_course ON subscriptions(course_id);
CREATE INDEX idx_sub_user ON subscriptions(telegram_id);

-- 6. Notification Delivery Logs Table
CREATE TABLE notification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL,
    item_title VARCHAR(255) NOT NULL,
    recipients_count INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    failure_count INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
    error_details TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_logs_created_at ON notification_logs(created_at);

-- 7. Automated Pruning Procedure (Monthly cleanup of >90 day logs)
CREATE OR REPLACE FUNCTION prune_stale_records()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM notification_logs WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$;

-- 8. Row Level Security Policies
ALTER TABLE donor_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_items_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super Admin Full Access on donor_tokens" ON donor_tokens
    FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Super Admin Full Access on courses" ON courses
    FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Super Admin Full Access on logs" ON notification_logs
    FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
```

### 4.2 API Contracts & Interfaces

#### Endpoint: `/sync-courses` (Supabase Edge Function)
* **Caller:** Admin Dashboard (POST)
* **Request:**
```json
{
  "label": "Cybersecurity - Year 3",
  "moodle_base_url": "https://moodle.university.edu",
  "wstoken": "9f82b4c107e361284a123456789abcdef"
}
```
* **Success Response (200 OK):**
```json
{
  "success": true,
  "donor": {
    "id": "7b84dbdc-f703-4927-9de8-137a6bca2351",
    "label": "Cybersecurity - Year 3",
    "moodle_user_fullname": "Ahmad Al-Mansoor",
    "courses_discovered": 6
  },
  "courses": [
    {
      "id": 1042,
      "fullname": "Network Security & Cryptography",
      "shortname": "SEC301",
      "category_id": 14,
      "is_duplicate": false
    }
  ]
}
```

#### Endpoint: `/moodle-poller` (Supabase Edge Function)
* **Caller:** Scheduled via `pg_cron` (POST)
* **Headers:** `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`
* **Response (200 OK):**
```json
{
  "status": "completed",
  "polled_courses": 18,
  "events_detected": 2,
  "messages_dispatched": 145,
  "execution_time_ms": 14200
}
```

#### Telegram Callback Serialization Contract (<= 20 bytes)
* **Format:** `<opcode>:<target_id>:<context_param>`
* `s:1042` -> Toggle subscription for course ID 1042
* `u:1042` -> Explicit unsubscribe for course ID 1042
* `c:cyber3:1` -> Browse Cohort catalog `cyber3`, page 1
* `m:1` -> Manage active subscriptions, page 1

#### Notification Message Format (HTML Parse Mode)
```html
🚨 <b>Network Security &amp; Cryptography</b>
📢 <b>New Announcement:</b> Midterm Exam Guidelines &amp; Locations
👨‍🏫 <i>Dr. Khalid Omar • 10:45 AM</i>

A revised PDF schedule has been published for all section groups. Please review your designated lab room.

<a href="https://moodle.university.edu/mod/forum/discuss.php?d=1420">🔗 Open in Moodle</a>
```

---

## 5. Security & Network Guidelines

### 5.1 Token Encryption (AES-256-GCM)
All Moodle tokens are encrypted in memory inside Supabase Edge Functions before persisting to PostgreSQL.
```typescript
const iv = crypto.getRandomValues(new Uint8Array(12));
const key = await crypto.subtle.importKey(
  "raw",
  hexToBytes(Deno.env.get("ENCRYPTION_MASTER_KEY")!),
  { name: "AES-GCM" },
  false,
  ["encrypt", "decrypt"]
);

const encoded = new TextEncoder().encode(rawToken);
const ciphertextWithTag = await crypto.subtle.encrypt(
  { name: "AES-GCM", iv, tagLength: 128 },
  key,
  encoded
);

const authTag = ciphertextWithTag.slice(ciphertextWithTag.byteLength - 16);
const ciphertext = ciphertextWithTag.slice(0, ciphertextWithTag.byteLength - 16);
```

### 5.2 Network Evasion & Circuit Breaker
* **User-Agent:** Outgoing Moodle requests identify as `MoodleMobile/4.4.0 (Android; SDK 34; wv) Mobile`.
* **Sequential Jitter:** Random delay between 500ms and 1200ms between course calls to prevent server load spikes.
* **Circuit Breaker:** If Moodle responds with 3 consecutive network timeouts or 5xx HTTP responses, execution halts immediately for that 10-minute cycle.
* **Telegram Throttling:** Dispatches capped at 25 msgs/sec with 1000ms pause between batches, respecting `retry_after` on HTTP 429.

---

## 6. Operational Quotas & Free-Tier Budget

| Metric | Supabase Free Limit | Moodle Radar Usage | Utilization |
| :--- | :--- | :--- | :--- |
| **Edge Function Invocations** | 500,000 / month | ~19,320 / month | **3.86%** |
| **PostgreSQL Database Storage** | 500 MB | ~25 MB (with 90-day pruning) | **5.00%** |
| **Database Bandwidth (Egress)** | 2 GB / month | ~120 MB / month | **6.00%** |
| **Frontend Hosting (Vercel)** | 100 GB Bandwidth | < 500 MB / month | **0.50%** |

---

## 7. Production Deployment Runbook

### Step 1: Supabase Configuration
1. Create a Supabase project at [supabase.com](https://supabase.com).
2. Execute the DDL in Section 4.1 in the **SQL Editor**.
3. Generate and store environment secrets:
   ```bash
   openssl rand -hex 32 # Generate 256-bit key
   supabase secrets set ENCRYPTION_MASTER_KEY="<generated-key>"
   supabase secrets set TELEGRAM_BOT_TOKEN="<bot-token>"
   ```

### Step 2: Edge Functions Deployment
```bash
supabase functions deploy sync-courses --no-verify-jwt
supabase functions deploy moodle-poller --no-verify-jwt
supabase functions deploy telegram-webhook --no-verify-jwt
```

### Step 3: Telegram Webhook Registration
```bash
curl -F "url=https://<project-ref>.supabase.co/functions/v1/telegram-webhook" \
     https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook
```

### Step 4: Schedule Poller via `pg_cron`
In the Supabase SQL editor:
```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
    'moodle-radar-poller',
    '*/10 * * * *',
    $$
    SELECT net.http_post(
        url := 'https://<project-ref>.supabase.co/functions/v1/moodle-poller',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer <SUPABASE_SERVICE_ROLE_KEY>'
        ),
        body := '{}'::jsonb
    );
    $$
);
```

### Step 5: Web Admin Dashboard Deployment (Vercel)
1. Link repository to Vercel.
2. Build Settings:
   - Framework: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`
3. Environment Variables:
   - `VITE_SUPABASE_URL`: `https://<project-ref>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY`: `<anon-key>`
4. Deploy and verify Super Admin authentication in Supabase Auth.
