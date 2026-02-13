-- ============================================================================
-- Migration: Blockchain Identity Tables
-- Description: Creates tables for storing blockchain identity records and audit logs
-- Date: 2026-02-12
-- ============================================================================

-- 1. blockchain_identities: One-to-one mapping of users to on-chain identity records
CREATE TABLE IF NOT EXISTS public.blockchain_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    identity_hash TEXT NOT NULL,
    issuer_signature TEXT NOT NULL,
    tx_hash TEXT NOT NULL,
    block_number BIGINT,
    contract_address TEXT NOT NULL,
    chain_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,

    CONSTRAINT blockchain_identities_user_id_key UNIQUE (user_id),
    CONSTRAINT blockchain_identities_identity_hash_key UNIQUE (identity_hash),
    CONSTRAINT blockchain_identities_status_check CHECK (
        status IN ('active', 'revoked', 'pending_retry')
    )
) TABLESPACE pg_default;

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_blockchain_identities_user_id
    ON public.blockchain_identities USING btree (user_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_blockchain_identities_identity_hash
    ON public.blockchain_identities USING btree (identity_hash) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_blockchain_identities_status
    ON public.blockchain_identities USING btree (status) TABLESPACE pg_default;

-- 2. blockchain_audit_log: Immutable audit trail for all blockchain operations
CREATE TABLE IF NOT EXISTS public.blockchain_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    action TEXT NOT NULL,
    identity_hash TEXT,
    tx_hash TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT blockchain_audit_log_action_check CHECK (
        action IN ('issue', 'verify', 'revoke', 'issue_retry', 'issue_failed')
    )
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_blockchain_audit_action
    ON public.blockchain_audit_log USING btree (action) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_blockchain_audit_user
    ON public.blockchain_audit_log USING btree (user_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_blockchain_audit_created
    ON public.blockchain_audit_log USING btree (created_at DESC) TABLESPACE pg_default;

-- 3. Add blockchain_verified column to profiles (optional, for quick lookups)
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS blockchain_verified BOOLEAN DEFAULT FALSE;

-- 4. RLS Policies
-- Users can read their own blockchain identity
ALTER TABLE public.blockchain_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own blockchain identity"
    ON public.blockchain_identities
    FOR SELECT
    USING (auth.uid() = user_id);

-- Only service role can insert/update/delete (backend API routes use service role)
CREATE POLICY "Service role can manage blockchain identities"
    ON public.blockchain_identities
    FOR ALL
    USING (auth.role() = 'service_role');

-- Audit log: users can read their own logs
ALTER TABLE public.blockchain_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own audit logs"
    ON public.blockchain_audit_log
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage audit logs"
    ON public.blockchain_audit_log
    FOR ALL
    USING (auth.role() = 'service_role');
