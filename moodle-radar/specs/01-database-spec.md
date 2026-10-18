# Database Specification: Moodle Radar

**Document Reference:** `specs/01-database-spec.md`  
**Related Documents:** 
- [`intent/PRD.md`](file:///f:/SHADI/2-Programming/Model%20Notifications/moodle-radar/intent/PRD.md)
- [`specs/02-moodle-integration-spec.md`](file:///f:/SHADI/2-Programming/Model%20Notifications/moodle-radar/specs/02-moodle-integration-spec.md)
- [`specs/03-edge-functions-spec.md`](file:///f:/SHADI/2-Programming/Model%20Notifications/moodle-radar/specs/03-edge-functions-spec.md)
- [`specs/04-telegram-bot-spec.md`](file:///f:/SHADI/2-Programming/Model%20Notifications/moodle-radar/specs/04-telegram-bot-spec.md)
- [`specs/05-dashboard-frontend-spec.md`](file:///f:/SHADI/2-Programming/Model%20Notifications/moodle-radar/specs/05-dashboard-frontend-spec.md)

---

## 1. Overview & Architectural Scope

The Moodle Radar database layer is implemented on **Supabase PostgreSQL 15+**. It operates under a zero-cost model within Supabase's Free Tier quotas (500 MB database cap, 2 GB egress). 

The database serves four primary architectural objectives:
1. **Encrypted Token Vault:** Stores donor tokens encrypted with AES-256-GCM.
2. **Course Topology & Granular Controls:** Maps courses to donor tokens, cohort tags, and module-level monitoring toggles.
3. **Stateful Delta Watermarking:** Tracks individual Moodle activity items and Unix timestamps to ensure deduplication.
4. **Student Subscription Graph:** Maps Telegram bot users to their selected courses with instant toggle capabilities.

---

## 2. Complete PostgreSQL DDL Schema

```sql
-- ============================================================================
-- 1. EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_net";

-- ============================================================================
-- 2. TABLE: donor_tokens
-- Purpose: Houses encrypted Moodle Mobile Web Service tokens provided by donors.
-- ============================================================================
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

-- ============================================================================
-- 3. TABLE: courses
-- Purpose: Tracks onboarded university courses, their primary/fallback donors,
-- and module-level polling filters.
-- ============================================================================
CREATE TABLE courses (
    id INTEGER PRIMARY KEY, -- Moodle course ID (from core_enrol_get_users_courses)
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

-- ============================================================================
-- 4. TABLE: course_items_state
-- Purpose: Stateful watermarking table for Moodle modules, announcements, and files.
-- ============================================================================
CREATE TABLE course_items_state (
    composite_id VARCHAR(150) PRIMARY KEY, -- "<course_id>:<module_or_forum>:<item_id>"
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    item_type VARCHAR(30) NOT NULL CHECK (item_type IN ('mod_forum', 'mod_assign', 'mod_resource', 'mod_url')),
    timemodified BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 5. TABLE: bot_users
-- Purpose: Registers Telegram bot subscribers and global muting preferences.
-- ============================================================================
CREATE TABLE bot_users (
    telegram_id BIGINT PRIMARY KEY,
    username VARCHAR(100),
    first_name VARCHAR(150),
    is_paused BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 6. TABLE: subscriptions
-- Purpose: Many-to-many relationship linking bot users to monitored courses.
-- ============================================================================
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id BIGINT NOT NULL REFERENCES bot_users(telegram_id) ON DELETE CASCADE,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (telegram_id, course_id)
);

-- ============================================================================
-- 7. TABLE: notification_logs
-- Purpose: Audit trail of dispatched alerts, recipients count, and errors.
-- ============================================================================
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
```

---

## 3. Performance Indexes

The following B-Tree indexes ensure optimal execution of the 10-minute poller and Telegram webhook queries:

```sql
-- Index on monitored courses for fast poller retrieval
CREATE INDEX idx_courses_monitored ON courses(is_monitored) WHERE is_monitored = TRUE;

-- Index on cohort tag for Telegram catalog browsing
CREATE INDEX idx_courses_cohort ON courses(cohort_tag);

-- Index on course items for cascade operations and course lookups
CREATE INDEX idx_course_items_course ON course_items_state(course_id);

-- Indexes on subscriptions junction table
CREATE INDEX idx_subscriptions_course ON subscriptions(course_id);
CREATE INDEX idx_subscriptions_user ON subscriptions(telegram_id);

-- Index on notification logs timestamp for pruning operations and dashboard feeds
CREATE INDEX idx_logs_created_at ON notification_logs(created_at DESC);
```

---

## 4. Row-Level Security (RLS) Policies

All tables have RLS enabled by default to enforce least-privilege access:
1. **Super Admin Role (`authenticated`):** Granted full CRUD privileges through the Web Dashboard.
2. **Service Role (`service_role`):** Used by Supabase Edge Functions (`/sync-courses`, `/moodle-poller`, `/telegram-webhook`), bypassing RLS.
3. **Public / Anonymous Role (`anon`):** Denied all access across all tables.

```sql
-- Enable RLS across all application tables
ALTER TABLE donor_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_items_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

-- 1. donor_tokens Policies
CREATE POLICY "Super Admin Full Access on donor_tokens"
    ON donor_tokens
    FOR ALL
    TO authenticated
    USING (TRUE)
    WITH CHECK (TRUE);

-- 2. courses Policies
CREATE POLICY "Super Admin Full Access on courses"
    ON courses
    FOR ALL
    TO authenticated
    USING (TRUE)
    WITH CHECK (TRUE);

-- 3. course_items_state Policies
CREATE POLICY "Super Admin Read on course_items_state"
    ON course_items_state
    FOR SELECT
    TO authenticated
    USING (TRUE);

-- 4. bot_users Policies
CREATE POLICY "Super Admin Read on bot_users"
    ON bot_users
    FOR SELECT
    TO authenticated
    USING (TRUE);

-- 5. subscriptions Policies
CREATE POLICY "Super Admin Read on subscriptions"
    ON subscriptions
    FOR SELECT
    TO authenticated
    USING (TRUE);

-- 6. notification_logs Policies
CREATE POLICY "Super Admin Full Access on notification_logs"
    ON notification_logs
    FOR ALL
    TO authenticated
    USING (TRUE)
    WITH CHECK (TRUE);
```

---

## 5. Automated Data Pruning & Retention

To safeguard the 500 MB database quota, an automated database cleanup procedure deletes delivery logs older than 90 days. This procedure is scheduled via `pg_cron` to run on the 1st of every month at midnight.

```sql
-- Cleanup procedure definition
CREATE OR REPLACE FUNCTION prune_stale_records()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    -- Purge historical notification logs older than 90 days
    DELETE FROM notification_logs 
    WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$;

-- Schedule pruning cron job for the 1st day of each month at 00:00 UTC
SELECT cron.schedule(
    'prune-stale-records-job',
    '0 0 1 * *',
    $$ SELECT prune_stale_records(); $$
);
```

---

## 6. Table Volume Projections & Free-Tier Quota Model

The schema stores lightweight metadata only. No binary payloads, PDF documents, or avatar files are stored in PostgreSQL.

| Table Name | Estimated Row Count (Annual) | Avg Row Size | Total Storage Estimate |
| :--- | :--- | :--- | :--- |
| `donor_tokens` | ~20 records | ~600 bytes | ~12 KB |
| `courses` | ~100 records | ~400 bytes | ~40 KB |
| `course_items_state` | ~5,000 items | ~250 bytes | ~1.25 MB |
| `bot_users` | ~2,500 students | ~200 bytes | ~500 KB |
| `subscriptions` | ~12,500 links | ~120 bytes | ~1.5 MB |
| `notification_logs` (90-day window) | ~30,000 entries | ~400 bytes | ~12 MB |
| **Total Estimated Footprint** | — | — | **~15.3 MB** |

> **Capacity Safety Margin:** Total storage remains at **~3.06% of the 500 MB free quota**, guaranteeing multi-year operational headroom without database scaling costs.
