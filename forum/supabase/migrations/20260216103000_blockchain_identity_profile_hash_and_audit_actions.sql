-- ============================================================================
-- Migration: Blockchain identity profile hash + audit action expansion
-- Description:
--   1) Adds blockchain_identities.verification_attempt_id + profile_hash
--   2) Expands blockchain_audit_log.action check constraint to include
--      content-recording and profile-integrity actions.
-- Date: 2026-02-16
-- ============================================================================

-- 1) Add verification_attempt_id + profile_hash to blockchain_identities
ALTER TABLE public.blockchain_identities
  ADD COLUMN IF NOT EXISTS verification_attempt_id UUID REFERENCES public.verification_attempts(id),
  ADD COLUMN IF NOT EXISTS profile_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_blockchain_identities_verification_attempt
  ON public.blockchain_identities USING btree (verification_attempt_id) TABLESPACE pg_default;

-- 2) Expand blockchain_audit_log.action constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'blockchain_audit_log_action_check'
      AND table_name = 'blockchain_audit_log'
  ) THEN
    ALTER TABLE public.blockchain_audit_log
      DROP CONSTRAINT blockchain_audit_log_action_check;
  END IF;

  ALTER TABLE public.blockchain_audit_log
    ADD CONSTRAINT blockchain_audit_log_action_check CHECK (
      action IN (
        'issue',
        'verify',
        'revoke',
        'issue_retry',
        'issue_failed',
        'record_content',
        'record_content_failed',
        'verify_profile',
        'profile_tamper_detected',
        'integrity_check'
      )
    );
END $$;
