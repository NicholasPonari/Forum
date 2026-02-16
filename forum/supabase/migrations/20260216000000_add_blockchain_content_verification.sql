-- Create blockchain_identities if it doesn't exist (User mentioned it exists, but ensuring it's in migrations)
create table if not exists public.blockchain_identities (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  identity_hash text not null,
  issuer_signature text not null,
  tx_hash text not null,
  block_number bigint null,
  contract_address text not null,
  chain_id integer not null,
  status text not null default 'active'::text,
  issued_at timestamp with time zone not null default now(),
  revoked_at timestamp with time zone null,
  constraint blockchain_identities_pkey primary key (id),
  constraint blockchain_identities_identity_hash_key unique (identity_hash),
  constraint blockchain_identities_user_id_key unique (user_id),
  constraint blockchain_identities_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE,
  constraint blockchain_identities_status_check check (
    (
      status = any (
        array[
          'active'::text,
          'revoked'::text,
          'pending_retry'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_blockchain_identities_user_id on public.blockchain_identities using btree (user_id) TABLESPACE pg_default;
create index IF not exists idx_blockchain_identities_identity_hash on public.blockchain_identities using btree (identity_hash) TABLESPACE pg_default;
create index IF not exists idx_blockchain_identities_status on public.blockchain_identities using btree (status) TABLESPACE pg_default;

-- Create blockchain_audit_log if it doesn't exist
create table if not exists public.blockchain_audit_log (
  id uuid not null default gen_random_uuid (),
  user_id uuid null,
  action text not null,
  identity_hash text null,
  tx_hash text null,
  metadata jsonb null default '{}'::jsonb,
  error_message text null,
  created_at timestamp with time zone not null default now(),
  constraint blockchain_audit_log_pkey primary key (id),
  constraint blockchain_audit_log_user_id_fkey foreign KEY (user_id) references auth.users (id),
  constraint blockchain_audit_log_action_check check (
    (
      action = any (
        array[
          'issue'::text,
          'verify'::text,
          'revoke'::text,
          'issue_retry'::text,
          'issue_failed'::text,
          'record_content'::text,
          'record_content_failed'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_blockchain_audit_action on public.blockchain_audit_log using btree (action) TABLESPACE pg_default;
create index IF not exists idx_blockchain_audit_user on public.blockchain_audit_log using btree (user_id) TABLESPACE pg_default;
create index IF not exists idx_blockchain_audit_created on public.blockchain_audit_log using btree (created_at desc) TABLESPACE pg_default;

-- New table for Content Verification
create table if not exists public.blockchain_content_records (
  id uuid not null default gen_random_uuid (),
  content_id text not null, -- Generic reference to content ID (can be uuid or int, so text)
  content_type text not null, -- 'issue', 'comment', 'vote'
  content_hash text not null,
  tx_hash text not null,
  block_number bigint null,
  status text not null default 'pending'::text,
  created_at timestamp with time zone not null default now(),
  constraint blockchain_content_records_pkey primary key (id),
  constraint blockchain_content_records_status_check check (
    (
      status = any (
        array[
          'pending'::text,
          'verified'::text,
          'failed'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_blockchain_content_records_content_id on public.blockchain_content_records (content_id);
create index IF not exists idx_blockchain_content_records_content_hash on public.blockchain_content_records (content_hash);
create index IF not exists idx_blockchain_content_records_status on public.blockchain_content_records (status);

-- RLS Policies
alter table public.blockchain_identities enable row level security;
alter table public.blockchain_audit_log enable row level security;
alter table public.blockchain_content_records enable row level security;

-- Identities: Everyone can read (for verification), only service role can insert/update (handled via backend)
create policy "Public read access for identities" on public.blockchain_identities for select using (true);

-- Content Records: Everyone can read
create policy "Public read access for content records" on public.blockchain_content_records for select using (true);
