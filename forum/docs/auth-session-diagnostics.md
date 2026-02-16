# Auth Session Diagnostics Runbook

This runbook captures the evidence needed to verify fast, reliable session restore and to detect regressions.

## Enable diagnostics

Set these env vars in your local environment:

- `NEXT_PUBLIC_AUTH_DIAGNOSTICS=1`
- (optional) `NEXT_PUBLIC_PERF_DEBUG=1`
- (optional safety valve) `NEXT_PUBLIC_SUPABASE_RECOVERY_RESET=1`

## What is instrumented

### Client auth lifecycle (`AuthContext`)

Log prefix: `[AuthDiag]`

Key events:

- `BOOT_START`
- `GET_SESSION_START`
- `GET_SESSION_END`
- `GET_SESSION_TIMEOUT`
- `GET_SESSION_ERROR`
- `GET_SESSION_EXCEPTION`
- `AUTH_STATE_CHANGE`
- `SESSION_APPLIED`
- `PROFILE_FETCH_START`
- `PROFILE_FETCH_END`
- `PROFILE_FETCH_ERROR`
- `PROFILE_FETCH_EXCEPTION`
- `PROFILE_FETCH_STALE`
- `PROFILE_FETCH_SKIPPED_IN_FLIGHT`
- `PROFILE_FETCH_SKIPPED_DEBOUNCE`
- `BOOT_DONE`

### Supabase browser fetch instrumentation (`supabaseClient`)

Log prefix: `[AuthDiag][SupabaseFetch]`

Includes:

- auth request start/end/error for `/auth/v1/*`
- token refresh burst counters for `/auth/v1/token`
- warning when refresh storm threshold is detected

### Proxy middleware (`proxy.ts`)

Log prefix: `[AuthDiag][Proxy]`

Includes:

- `getUser` refresh errors/exceptions in edge auth refresh path
- prefetch skip behavior
- refresh attempts only when Supabase auth cookie is present

## Repro scenarios

Run each scenario and collect logs + network captures:

1. No persisted auth token
2. Valid persisted session
3. Expired access token + valid refresh token
4. Corrupted refresh token
5. Multi-tab open/refresh

## Success criteria

- No `HEAD ... notifications ... 400` from unread-count path
- No `getSession timeout` during normal valid-session startup
- No token refresh storm (`/auth/v1/token` burst warnings)
- Avatar/profile present quickly after authenticated page load

## Evidence template

For each scenario, record:

- `time_to_auth_ms`
- `time_to_profile_ms`
- `token_refresh_calls_10s`
- `getSession_timeout` (yes/no)
- `notifications_400` (count)
- notes
