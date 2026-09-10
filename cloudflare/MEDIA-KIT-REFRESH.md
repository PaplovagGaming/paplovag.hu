# Media Kit refresh operations

The Pages API and the scheduled Worker are separate deployments. A Pages Git
deployment updates the API/admin, but does **not** publish
`cloudflare/media-kit-cron-worker.js` to an existing standalone Worker.

Publish this file to the **existing** Media Kit cron Worker, retaining its
`MEDIA_KIT_CRON_SECRET`. Set its Cron Trigger to `1 * * * *` (UTC). The handler
selects 00:01 Europe/Budapest, including summer/winter time. `/health` must list
both `tuzproba` and `paplovag`; it reports the expected schedule, not the actual
Cloudflare trigger configuration. Verify the trigger in Cloudflare.

Both POST endpoints accept the same cron bearer secret. The Worker attempts both
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
fabricated. A complete 90-day window is required before replacing Impressions/CTR.
Google report generation or history availability can delay that window.

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
