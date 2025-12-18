# Issue 430: GitHub username integration + caching

Tracking: https://github.com/ubiquity/pay.ubq.fi/issues/430  
Primary PR context: https://github.com/ubiquity/pay.ubq.fi/pull/448

## Goal

Display human-friendly GitHub usernames (derived from `beneficiaryUserId`) in permit rows, while keeping GitHub API usage safe:

- Cache usernames for 30 days (persist across sessions).
- Avoid exhausting unauthenticated GitHub rate limits.
- Handle GitHub API failures gracefully (fallback to wallet address / existing UI).

## Current State (already implemented)

- Username fetch hook exists:
  - `src/hooks/use-github-usernames.ts:9`
- Persistent cache exists (localStorage + 30-day TTL + in-flight dedupe):
  - `src/utils/github-cache.ts:6`
- UI passes `githubUsername` into rows (funding-wallet view shows it next to the source link):
  - `src/components/permits-table.tsx:55`
  - `src/components/permit-row.tsx:138`

## Gaps / Risks vs Acceptance Criteria

### 1) Batch fetching stops after first 60 IDs

`useGithubUsernames` takes the first 60 missing IDs and fetches them once. If there are >60 unique `beneficiaryUserId`s, the remainder never get fetched unless the `permits` array changes again.

### 2) Failed requests are “remembered forever” in-session

IDs are added to `fetchedIdsRef` before fetch completes. If GitHub returns a transient error (network issue, 403 rate limit, etc.), that ID is never retried in the current session.

### 3) No real rate-limit handling

There is a comment noting unauthenticated rate limits, but:

- The code does not inspect GitHub `X-RateLimit-*` headers.
- A burst of 60 parallel requests can hit secondary throttling or “abuse detection”.
- There is no backoff or scheduled retry after reset.

### 4) Error handling is console-only

This is acceptable for MVP (fallback still works), but we should at least prevent pointless refetch loops and allow later retries.

## Proposed Implementation (scope-limited, merge-friendly)

Keep UI changes out of scope (avoid touching `PermitRow` / `DashboardPage`). Make the hook + cache robust enough that UI “just works”.

### A) Improve `githubUsernameCache.fetchUsername()` with rate-limit awareness

Update `src/utils/github-cache.ts` to:

1. Track rate-limit state from response headers:
   - `X-RateLimit-Remaining`
   - `X-RateLimit-Reset` (unix seconds)
2. If `remaining === 0`, store `rateLimitedUntil = resetTimeMs` and short-circuit future fetches until then.
3. If response is `403` and headers indicate rate limiting, treat it as rate-limited (not a hard failure).
4. Add a small concurrency limit inside the cache (or in the hook) to avoid firing 60 requests at once.
   - A simple “worker pool” of 3–5 concurrent fetches is sufficient.

Suggested cache API additions (example):

- `getRateLimit(): { remaining: number | null; resetAtMs: number | null }`
- `isRateLimited(): boolean`

### B) Make the hook fetch progressively and retry safely

Update `src/hooks/use-github-usernames.ts` to:

1. Build a deterministic list of needed user IDs:
   - Unique `beneficiaryUserId` values from permits.
   - Exclude IDs already in `usernames` state or in persistent cache.
2. Fetch usernames in a controlled loop:
   - While there are IDs remaining and not rate-limited:
     - Fetch next batch of N IDs (e.g., N=10) with concurrency limit.
     - Merge successes into state.
3. Only mark an ID as “done” after:
   - It’s cached successfully (username found), **or**
   - It’s negative-cached (see section C), **or**
   - It is blocked by rate limiting (and should be retried after reset).

Important: remove or repurpose `fetchedIdsRef` so it doesn’t prevent legitimate retries.

### C) Optional: negative caching for “not found”

If GitHub returns `404` for a user ID:

- Store a short-lived negative cache entry (e.g., 24 hours) so we don’t re-request every render.
- Keep the UI fallback to wallet address.

This can be implemented without changing the external cache interface by storing `{ username: "", fetchedAt, notFound: true }` or a separate key namespace (e.g. `githubUsernameNotFound:<id>`).

### D) Keep behavior stable under frequent `permits` updates

`permits` can change often (quote refresh, validation updates). Ensure the hook:

- Doesn’t restart the whole loop on every minor permits update.
- Cancels in-flight work on unmount (use `AbortController` or a `cancelled` flag).

## Acceptance Criteria (Definition of Done)

- For a set of permits with `beneficiaryUserId`:
  - Usernames appear in the UI when available.
  - Unavailable usernames fall back to existing display (no crashes).
- Caching:
  - A successful username fetch is persisted for 30 days.
  - Refreshing the page does not refetch cached usernames.
- Rate limiting:
  - The system does not exceed GitHub’s unauthenticated rate limit in a single session.
  - When rate-limited, fetching pauses and can resume after reset (same session or next reload).

## Files (expected touch set)

- `src/hooks/use-github-usernames.ts`
- `src/utils/github-cache.ts`
- (Optional new helper) `src/utils/github-rate-limit.ts`

## Manual QA Checklist

1. Clear localStorage keys related to GitHub cache.
2. Load the dashboard with permits that include `beneficiaryUserId`.
3. Confirm:
   - Requests go to `https://api.github.com/user/<id>`.
   - Usernames populate and persist in localStorage.
4. Reload page:
   - Confirm no (or minimal) repeated GitHub requests for cached IDs.
5. Simulate rate limiting:
   - Temporarily force fetch to return a 403 with rate-limit headers (via devtools override or mocked fetch).
   - Confirm the hook stops requesting and does not spin.
