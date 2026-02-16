-- ============================================================================
-- Migration: Strengthen Blockchain Integrity System
-- Description: Adds profile_hash and verification_attempt_id to blockchain_identities,
--              adds user_id to blockchain_content_records, expands audit log actions,
--              and adds missing RLS policies for service_role.
-- Date: 2026-02-16
-- ============================================================================

-- 1. Add verification_attempt_id and profile_hash to blockchain_identities
--    verification_attempt_id: links the identity to the verification attempt that created it
--    profile_hash: SHA-256 hash of core profile fields at issuance time (detects tampering)
ALTER TABLE public.blockchain_identities
    ADD COLUMN IF NOT EXISTS verification_attempt_id UUID REFERENCES public.verification_attempts(id),
    ADD COLUMN IF NOT EXISTS profile_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_blockchain_identities_verification_attempt
    ON public.blockchain_identities USING btree (verification_attempt_id) TABLESPACE pg_default;

-- 2. Add user_id to blockchain_content_records for direct audit traceability
--    Previously you had to join through content tables to find the author.
ALTER TABLE public.blockchain_content_records
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_blockchain_content_records_user_id
    ON public.blockchain_content_records USING btree (user_id) TABLESPACE pg_default;

-- 3. Composite index for the most common query pattern (content_id + created_at DESC)
CREATE INDEX IF NOT EXISTS idx_blockchain_content_records_content_id_created
    ON public.blockchain_content_records USING btree (content_id, created_at DESC) TABLESPACE pg_default;

-- 4. Expand audit log action constraint to include content recording actions
--    and profile verification actions.
--    The original constraint only allowed: issue, verify, revoke, issue_retry, issue_failed
--    We need: record_content, record_content_failed, verify_profile, integrity_check
DO $$
BEGIN
    -- Drop the old constraint if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'blockchain_audit_log_action_check'
        AND table_name = 'blockchain_audit_log'
    ) THEN
        ALTER TABLE public.blockchain_audit_log
            DROP CONSTRAINT blockchain_audit_log_action_check;
    END IF;

    -- Add the expanded constraint
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

-- 5. RLS policies for service_role on blockchain_content_records
--    The existing migration only created SELECT policies.
--    Backend API routes run as service_role and need INSERT/UPDATE.
DO $$
BEGIN
    -- Only create if not exists (avoid error on re-run)
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'blockchain_content_records'
        AND policyname = 'Service role can manage content records'
    ) THEN
        CREATE POLICY "Service role can manage content records"
            ON public.blockchain_content_records
            FOR ALL
            USING (auth.role() = 'service_role')
            WITH CHECK (auth.role() = 'service_role');
    END IF;
END $$;

-- 6. RLS policies for service_role on blockchain_audit_log
--    Ensure service_role can INSERT audit log entries.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'blockchain_audit_log'
        AND policyname = 'Service role can manage audit logs'
    ) THEN
        CREATE POLICY "Service role can manage audit logs"
            ON public.blockchain_audit_log
            FOR ALL
            USING (auth.role() = 'service_role')
            WITH CHECK (auth.role() = 'service_role');
    END IF;
END $$;

-- 7. Users can read their own audit logs
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'blockchain_audit_log'
        AND policyname = 'Users can view their own audit logs'
    ) THEN
        CREATE POLICY "Users can view their own audit logs"
            ON public.blockchain_audit_log
            FOR SELECT
            USING (auth.uid() = user_id);
    END IF;
END $$;

-- 8. Users can read their own content records
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'blockchain_content_records'
        AND policyname = 'Users can view their own content records'
    ) THEN
        CREATE POLICY "Users can view their own content records"
            ON public.blockchain_content_records
            FOR SELECT
            USING (auth.uid() = user_id);
    END IF;
END $$;
