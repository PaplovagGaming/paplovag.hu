# Media Kit refresh operations

The Pages API and the scheduled Worker are separate deployments. A Pages Git
deployment updates the API/admin, but does **not** publish
`cloudflare/media-kit-cron-worker.js` to an existing standalone Worker.

Publish this file to the **existing** Media Kit cron Worker, retaining its
`MEDIA_KIT_CRON_SECRET`. Set its Cron Trigger to `1 * * * *` (UTC). The handler
refreshes Paplovag video lists every hour and Analytics at 00:01 Europe/Budapest,
including summer/winter time. `/health` must list
both `tuzproba` and `paplovag`; it reports the expected schedule, not the actual
Cloudflare trigger configuration. Verify the trigger in Cloudflare.

Both Analytics POST endpoints accept the same cron bearer secret. The Worker attempts both
even if one fails; logs include channel, HTTP status, reach status, cached-day
count and the actual error. A failed HTTP/core/reach refresh rejects the scheduled
run so Cloudflare records a failure. Waiting for Google reports is not a failure.

## Paplovag storage and credentials

Pages uses `MEDIA_KIT_KV` (or `KV`). Paplovag keys:

| Key | Purpose |
| --- | --- |
| `paplovag-media-kit` | Core data and `youtubeSync` / `youtubeReachSync` diagnostics |
| `paplovag-youtube-oauth-refresh-token` | Encrypted Paplovag OAuth token |
| `paplovag-youtube-reach-history` | Daily reach data, job ID and report type |

The admin secret is `PAPLOVAG_MEDIA_KIT_ADMIN_PASSWORD`, falling back to
`MEDIA_KIT_ADMIN_PASSWORD`. OAuth encryption uses the `paplovag-youtube-oauth:`
prefix; never copy the Tuzproba token into the Paplovag key. Shared OAuth client
secrets are `YOUTUBE_OAUTH_CLIENT_ID` / `YOUTUBE_OAUTH_CLIENT_SECRET`.

Reach CSV dates accept both YYYYMMDD and YYYY-MM-DD. CTR is a percentage and is
weighted by impressions. Valid header-only reports count as zero-activity days;
malformed reports and another channel's rows fail explicitly. Parser version 2
causes old cached reports to be reimported instead of trusting previously parsed
values. Each refresh imports at most 30 reports, follows pagination, and retains
successfully imported days if a subsequent download fails. No missing day is
fabricated. Until a complete 90-day window exists, the latest contiguous available
period (up to 90 days) supplies Impressions/CTR. Admin and public cards show
`windowDays`, `startDate` and `endDate`; the legacy `impressions90d` storage field
now follows that explicit period. Page loads also derive values from existing
history, so a further Google refresh is not required to display cached data.

## Verification

Run `node --test tests/paplovag-refresh.test.mjs` (Node 22+).

After deploying Pages, open `/media-kit/admin/` and refresh. The status next to the
button must immediately show progress, then the new timestamp and reach status.
Check that cached days increase when Google reports are available. If Google
rejects a request, the admin shows its message and status. The button recovers on
HTTP/network errors or timeout. Avoid concurrent manual and scheduled refreshes:
KV is eventually consistent and is not a transactional locking mechanism.

For production verification, inspect the next scheduled Worker event and both
channel results. Check Paplovag KV history and its last successful refresh time.
An initial job or unavailable reports legitimately requires waiting for Google;
an API-disabled, permission, quota or token error requires the corresponding
Google-side fix shown in the admin.

## Persistent video lists

Authenticated visitor GET `/api/paplovag-showcase` only reads saved snapshots.
It never fetches Google, including `?refresh=1`. The `shorts`, `top`, `tech` and
`gaming` snapshots live under `paplovag-youtube-showcase-v9:<section>` with no KV
expiration. Every successful section gets its own `sectionUpdatedAt`; a refresh
failure retains that section's data and timestamp, with an explicit error.

The previous v8 Shorts/videos caches migrate on first read while still available.
If an old cache has already expired, run **Refresh video lists now** in the admin
once, or invoke the four cron POST requests before serving the new page. A missing
snapshot shows a preparation message; it does not start a slow visitor-side build.

The Worker calls POST `/api/paplovag-showcase?section=<section>` once for each of
`shorts`, `top`, `tech`, `gaming` every hour. Only a valid Paplovag admin session or
`Authorization: Bearer <MEDIA_KIT_CRON_SECRET>` can refresh. Requests are separated
to bound each playlist's work and prevent one failure from stopping other lists.
The admin button attempts all four and reports section-specific failures.

Deploy the Pages changes and update the existing standalone Worker separately.
Verify `/health` includes `hourlyVideoTargets`, then check an hourly event and the
four stored timestamps. Existing Analytics cron timing and Tuzproba data keys are
unchanged. Tests: `node --test tests/paplovag-*.test.mjs`.
