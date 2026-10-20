-- ============================================================================
-- Migration: Add Credential-Backed Reactive Self-Healing to donor_tokens
-- Reference: moodle-token-auto-renewal-plan.md
-- ============================================================================

ALTER TABLE donor_tokens
  ADD COLUMN IF NOT EXISTS auth_mode VARCHAR(20) NOT NULL DEFAULT 'token' 
    CHECK (auth_mode IN ('token', 'credentials')),
  ADD COLUMN IF NOT EXISTS username VARCHAR(150),
  ADD COLUMN IF NOT EXISTS encrypted_password BYTEA,
  ADD COLUMN IF NOT EXISTS password_iv BYTEA,
  ADD COLUMN IF NOT EXISTS password_auth_tag BYTEA,
  ADD COLUMN IF NOT EXISTS moodle_service VARCHAR(100) NOT NULL DEFAULT 'moodle_mobile_app',
  ADD COLUMN IF NOT EXISTS auto_refresh_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_refreshed_at TIMESTAMPTZ;

-- Performance index for locating active self-healing eligible donors
CREATE INDEX IF NOT EXISTS idx_donor_tokens_self_healing 
  ON donor_tokens (id, status, auto_refresh_enabled)
  WHERE auth_mode = 'credentials';

COMMENT ON COLUMN donor_tokens.auth_mode IS 'Authentication mode: token (manual wstoken) or credentials (opt-in auto self-healing)';
COMMENT ON COLUMN donor_tokens.username IS 'University student ID or username for Moodle mobile authentication';
COMMENT ON COLUMN donor_tokens.encrypted_password IS 'AES-256-GCM encrypted university password';
COMMENT ON COLUMN donor_tokens.moodle_service IS 'Moodle mobile web service name (default moodle_mobile_app)';
COMMENT ON COLUMN donor_tokens.auto_refresh_enabled IS 'Flag for reactive self-healing. Automatically set to FALSE immediately if credentials fail (zero-lockout protection)';
COMMENT ON COLUMN donor_tokens.last_refreshed_at IS 'Timestamp of the most recent successful reactive re-authentication';
