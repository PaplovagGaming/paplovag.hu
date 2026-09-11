const ACCESS_COOKIE = "pg_media_access";
const TOKEN_KEY = "paplovag-youtube-oauth-refresh-token";
const CACHE_KEY = "paplovag-youtube-showcase-v9";
const SECTION_NAMES = ["shorts", "top", "tech", "gaming"];
const TARGET_CHANNEL_ID = "UCUEDPQyLPN5lrTH06k2oWYA";
const SHORTS_PLAYLIST_ID = "PLrH3C01Hh-gmsL1RGeAu-0r4viY6vnA91";
const TECH_PLAYLIST_ID = "PLrH3C01Hh-gnG5Qs_Xwe3z2yxMFYSwFWh";
const GAMING_PLAYLIST_ID = "PLrH3C01Hh-gk7hkFKyO7wwne6FYEhdAup";
const TIME_ZONE = "Europe/Budapest";
const FRESH_MS = 60 * 60 * 1000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Referrer-Policy": "no-referrer"
    }
  });
}

function storage(env) { return env.MEDIA_KIT_KV || env.KV || null; }
function accessSecret(env) { return env.PAPLOVAG_MEDIA_KIT_PASSWORD || env.MEDIA_KIT_PASSWORD || ""; }
function adminSecret(env) { return env.PAPLOVAG_MEDIA_KIT_ADMIN_PASSWORD || env.MEDIA_KIT_ADMIN_PASSWORD || ""; }

function parseCookies(request) {
  const out = {};
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (!name) continue;
    try { out[name] = decodeURIComponent(rest.join("=")); }
    catch { out[name] = rest.join("="); }
  }
  return out;
}

function base64url(bytes) {
  let s = "";
  for (const byte of bytes) s += String.fromCharCode(byte);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function decodeText(value) {
  const n = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const p = n + "=".repeat((4 - n.length % 4) % 4);
  const b = atob(p);
  return new TextDecoder().decode(Uint8Array.from(b, c => c.charCodeAt(0)));
}
function decodeBytes(value) {
  const n = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const p = n + "=".repeat((4 - n.length % 4) % 4);
  const b = atob(p);
  return Uint8Array.from(b, c => c.charCodeAt(0));
}
async function hmac(value, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}
async function verifySession(token, secret) {
  if (!token || !secret) return false;
  const [encoded, signature] = String(token).split(".");
  if (!encoded || !signature) return false;
  const expected = await hmac(encoded, secret);
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < signature.length; i += 1) mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  if (mismatch) return false;
  try { return Number(JSON.parse(decodeText(encoded)).exp) > Math.floor(Date.now() / 1000); }
  catch { return false; }
}

async function encryptionKey(secret) {
  const material = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`paplovag-youtube-oauth:${secret}`));
  return crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, ["decrypt"]);
}
async function decryptRefreshToken(record, secret) {
  const key = await encryptionKey(secret);
  const data = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decodeBytes(record.iv) }, key, decodeBytes(record.ciphertext));
  return new TextDecoder().decode(data);
}
async function getAccessToken(env, refreshToken) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: env.YOUTUBE_OAUTH_CLIENT_ID,
      client_secret: env.YOUTUBE_OAUTH_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });
  let payload = {};
  try { payload = await response.json(); } catch {}
  if (!response.ok || !payload.access_token) throw new Error("oauth_refresh_failed");
  return payload.access_token;
}
async function googleJson(url, token) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  let payload = {};
  try { payload = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `Google API HTTP ${response.status}`);
    error.status = response.status;
    error.reason = payload?.error?.status || payload?.error?.errors?.[0]?.reason || "google_api_error";
    throw error;
  }
  return payload;
}

function localDate() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function shiftDate(value, days) {
  const d = new Date(`${value}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function maxDate(a, b) { return String(a) > String(b) ? String(a) : String(b); }
function parseDuration(value) {
  const m = String(value || "").match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  return m ? Number(m[1] || 0) * 86400 + Number(m[2] || 0) * 3600 + Number(m[3] || 0) * 60 + Number(m[4] || 0) : 0;
}
function thumb(t = {}) { return (t.maxres ?? t.standard ?? t.high ?? t.medium ?? t.default ?? {}).url ?? ""; }
function publicVideo(item) {
  return {
    id: item?.id ?? null,
    title: item?.snippet?.title ?? "YouTube video",
    thumbnailUrl: thumb(item?.snippet?.thumbnails),
    publishedAt: item?.snippet?.publishedAt ?? null,
    durationSeconds: parseDuration(item?.contentDetails?.duration),
    viewCount: Number(item?.statistics?.viewCount || 0)
  };
}
function reportRows(report) {
  const names = (report?.columnHeaders || []).map(header => header.name);
  return (report?.rows || []).map(row => Object.fromEntries(names.map((name, index) => [name, row[index]])));
}
function cleanError(error) {
  return String(error?.message || error?.reason || "section_failed").replace(/\s+/g, " ").slice(0, 180);
}

async function videoDetails(token, ids, parts = "snippet,contentDetails,statistics,status,liveStreamingDetails") {
  const unique = [...new Set((ids || []).filter(Boolean))];
  const out = [];
  for (let i = 0; i < unique.length; i += 50) {
    const q = new URLSearchParams({ part: parts, id: unique.slice(i, i + 50).join(","), maxResults: "50" });
    const payload = await googleJson(`https://www.googleapis.com/youtube/v3/videos?${q}`, token);
    out.push(...(payload.items || []));
  }
  return out;
}

async function latestShorts(token) {
  const ids = new Set();
  let pageToken = "";
  // The curated playlist defines Shorts membership; stream volume and age do not.
  for (let page = 0; page < 20; page += 1) {
    const q = new URLSearchParams({ part: "contentDetails", playlistId: SHORTS_PLAYLIST_ID, maxResults: "50" });
    if (pageToken) q.set("pageToken", pageToken);
    const payload = await googleJson("https://www.googleapis.com/youtube/v3/playlistItems?" + q, token);
    for (const item of payload.items || []) if (item.contentDetails?.videoId) ids.add(item.contentDetails.videoId);
    pageToken = payload.nextPageToken || "";
    if (!pageToken) break;
  }
  if (pageToken) throw new Error("Shorts playlist exceeds 1000 entries; complete publication ordering could not be verified");
  const details = await videoDetails(token, [...ids]);
  const items = details
    .filter(item => item.status?.privacyStatus === "public" && item.snippet?.channelId === TARGET_CHANNEL_ID)
    .filter(item => !item.liveStreamingDetails && item.snippet?.liveBroadcastContent === "none")
    .filter(item => Number.isFinite(Date.parse(item.snippet?.publishedAt)))
    .sort((a, b) => Date.parse(b.snippet.publishedAt) - Date.parse(a.snippet.publishedAt) || a.id.localeCompare(b.id))
    .slice(0, 5).map(publicVideo);
  return { items, method: "curated_shorts_playlist", playlistId: SHORTS_PLAYLIST_ID, checkedCandidates: ids.size, analyticsErrors: 0 };
}

async function lifetimeTop(token, startDate, endDate) {
  const q = new URLSearchParams({
    ids: "channel==MINE",
    startDate,
    endDate,
    metrics: "views",
    dimensions: "video",
    sort: "-views",
    maxResults: "25"
  });
  const report = await googleJson(`https://youtubeanalytics.googleapis.com/v2/reports?${q}`, token);
  const rows = reportRows(report);
  const details = await videoDetails(token, rows.map(row => row.video).filter(Boolean));
  const byId = new Map(details.map(item => [item.id, item]));
  const out = [];
  for (const row of rows) {
    const item = byId.get(row.video);
    if (!item || item?.status?.privacyStatus !== "public") continue;
    out.push(publicVideo(item));
    if (out.length >= 3) break;
  }
  return out;
}

// Each authenticated request uses at most 18 Google calls for playlist work.
// The signed continuation carries partial results; KV only receives complete lists.
async function playlistBatch(token, section, state = null) {
  const playlistId = section === "gaming" ? GAMING_PLAYLIST_ID : TECH_PLAYLIST_ID;
  const work = state || { section, phase: section === "gaming" ? "excludeTech" : "videos", pageToken: "", excluded: [], seen: [], top: [], latest: [], totalVideos: 0, processed: 0 };
  const excluded = new Set(work.excluded), seen = new Set(work.seen);
  let calls = 0;
  while (calls < 17 && work.phase !== "done") {
    const source = work.phase === "excludeTech" ? TECH_PLAYLIST_ID : playlistId;
    const q = new URLSearchParams({ part: "contentDetails", playlistId: source, maxResults: "50" });
    if (work.pageToken) q.set("pageToken", work.pageToken);
    const page = await googleJson("https://www.googleapis.com/youtube/v3/playlistItems?" + q, token);
    calls++;
    const ids = [...new Set((page.items || []).map(item => item.contentDetails?.videoId).filter(Boolean))];
    if (work.phase === "excludeTech") {
      ids.forEach(id => excluded.add(id));
    } else {
      const fresh = ids.filter(id => !seen.has(id));
      fresh.forEach(id => seen.add(id));
      work.processed = seen.size;
      const candidates = fresh.filter(id => !excluded.has(id));
      const details = candidates.length ? await videoDetails(token, candidates) : [];
      if (candidates.length) calls++;
      const videos = details.filter(item => item.status?.privacyStatus === "public" && item.snippet?.channelId === TARGET_CHANNEL_ID).map(publicVideo);
      work.totalVideos += videos.length;
      work.top = [...work.top, ...videos].sort((a, b) => b.viewCount - a.viewCount || a.id.localeCompare(b.id)).slice(0, 3);
      work.latest = [...work.latest, ...videos].filter(v => Number.isFinite(Date.parse(v.publishedAt))).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id)).slice(0, 3);
    }
    const next = page.nextPageToken || "";
    if (next && next === work.pageToken) throw new Error("Google returned a repeated playlist page token");
    work.pageToken = next;
    if (!next) work.phase = work.phase === "excludeTech" ? "videos" : "done";
  }
  work.excluded = [...excluded]; work.seen = [...seen];
  return { work, complete: work.phase === "done", value: { playlistId, totalVideos: work.totalVideos, scannedVideos: work.processed, excludedTechVideos: section === "gaming" ? work.seen.filter(id => excluded.has(id)).length : 0, rankingRule: "complete_playlist_lifetime_views", top: work.top, latest: work.latest } };
}

async function playlistSection(token, playlistId) {
  const result = await playlistBatch(token, playlistId === GAMING_PLAYLIST_ID ? "gaming" : "tech");
  if (!result.complete) throw new Error("Playlist requires a continued refresh; incomplete rankings are not published");
  return result.value;
}

async function refreshPlaylist(request, env, kv, section) {
  const secret = adminSecret(env);
  let state = null;
  const body = await request.text();
  const continuation = body ? JSON.parse(body).continuation : null;
  if (continuation) {
    const [encoded, signature] = String(continuation).split(".");
    if (!encoded || !signature || !secureEqual(await hmac("playlist-refresh:" + encoded, secret), signature)) throw new Error("invalid_playlist_continuation");
    state = JSON.parse(decodeText(encoded));
    if (state.section !== section || state.exp < Date.now()) throw new Error("expired_or_wrong_playlist_continuation");
  }
  if (!secret || !env.YOUTUBE_OAUTH_CLIENT_ID || !env.YOUTUBE_OAUTH_CLIENT_SECRET) throw new Error("oauth_secrets_missing");
  const record = await kv.get(TOKEN_KEY, "json");
  if (!record) throw new Error("oauth_not_connected");
  const token = await getAccessToken(env, await decryptRefreshToken(record, secret));
  const channel = await googleJson("https://www.googleapis.com/youtube/v3/channels?part=id&mine=true&maxResults=50", token);
  if (!(channel.items || []).some(item => item.id === TARGET_CHANNEL_ID)) throw new Error("wrong_youtube_channel");
  const result = await playlistBatch(token, section, state);
  if (!result.complete) {
    result.work.exp = state?.exp || Date.now() + 30 * 60 * 1000;
    const encoded = base64url(new TextEncoder().encode(JSON.stringify(result.work)));
    return json({ ok: true, pending: true, section, processed: result.work.processed, continuation: encoded + "." + await hmac("playlist-refresh:" + encoded, secret) }, 202);
  }
  const updatedAt = new Date().toISOString();
  await kv.put(CACHE_KEY + ":" + section, JSON.stringify({ version: 9, [section]: result.value, sectionStatus: { [section]: "ok" }, sectionErrors: {}, sectionUpdatedAt: { [section]: updatedAt }, updatedAt }));
  return json({ ok: true, pending: false, section, processed: result.work.processed, totalVideos: result.value.totalVideos, updatedAt });
}

async function safeSection(name, task, fallback, status, errors) {
  try {
    const value = await task();
    status[name] = "ok";
    return value;
  } catch (error) {
    console.error(`Paplovag showcase section ${name} failed`, error);
    status[name] = "error";
    errors[name] = cleanError(error);
    return fallback;
  }
}

async function build(env, kv, previous = null, section = "all", cacheKey = CACHE_KEY) {
  const secret = adminSecret(env);
  if (!env.YOUTUBE_OAUTH_CLIENT_ID || !env.YOUTUBE_OAUTH_CLIENT_SECRET || !secret) throw new Error("oauth_secrets_missing");
  const record = await kv.get(TOKEN_KEY, "json");
  if (!record) throw new Error("oauth_not_connected");
  const token = await getAccessToken(env, await decryptRefreshToken(record, secret));

  const channel = await googleJson("https://www.googleapis.com/youtube/v3/channels?part=id,snippet,contentDetails&mine=true&maxResults=50", token);
  const target = (channel.items || []).find(item => item.id === TARGET_CHANNEL_ID);
  if (!target) throw new Error("wrong_youtube_channel");

  const endDate = shiftDate(localDate(), -1);
  const startDate = String(target?.snippet?.publishedAt || "2013-01-01").slice(0, 10);
  const sectionStatus = {};
  const sectionErrors = {};

  const [shortResult, top, tech, gaming] = await Promise.all([
    section !== "shorts" && section !== "all" ? { items: [] } : safeSection("shorts", () => latestShorts(token), { items: previous?.shorts || [], method: "cached_fallback", checkedCandidates: 0, analyticsErrors: 0 }, sectionStatus, sectionErrors),
    section !== "top" && section !== "all" ? null : safeSection("top", () => lifetimeTop(token, startDate, endDate), previous?.top || [], sectionStatus, sectionErrors),
    section !== "tech" && section !== "all" ? null : safeSection("tech", () => playlistSection(token, TECH_PLAYLIST_ID), previous?.tech || { playlistId: TECH_PLAYLIST_ID, totalVideos: 0, top: [], latest: [] }, sectionStatus, sectionErrors),
    section !== "gaming" && section !== "all" ? null : safeSection("gaming", () => playlistSection(token, GAMING_PLAYLIST_ID), previous?.gaming || { playlistId: GAMING_PLAYLIST_ID, totalVideos: 0, top: [], latest: [] }, sectionStatus, sectionErrors)
  ]);

  if (shortResult.warning) { sectionStatus.shorts = "error"; sectionErrors.shorts = shortResult.warning; }
  const result = {
    version: 9,
    shorts: shortResult.items,
    top,
    tech,
    gaming,
    sectionStatus,
    sectionErrors,
    diagnostics: {
      shortsMethod: shortResult.method,
      shortsPlaylistId: SHORTS_PLAYLIST_ID,
      shortsCheckedCandidates: shortResult.checkedCandidates,
      shortsAnalyticsErrors: shortResult.analyticsErrors
    },
    updatedAt: new Date().toISOString(),
    topRule: `youtube_analytics_full_channel_${startDate}_through_${endDate}_sorted_by_views`
  };

  result.sectionUpdatedAt = { ...(previous?.sectionUpdatedAt || {}) };
  for (const name of Object.keys(sectionStatus)) {
    if (sectionStatus[name] === "ok") result.sectionUpdatedAt[name] = result.updatedAt;
  }
  // No expiration: a failed refresh must never remove the last good videos.
  await kv.put(cacheKey, JSON.stringify(result));
  return result;
}

async function readSection(kv, name, migrate = true) {
  const key = CACHE_KEY + ":" + name;
  const current = await kv.get(key, "json");
  if (current) return current;
  // Migrate the previously published cache without waiting for YouTube.
  const legacy = await kv.get("paplovag-youtube-showcase-v8:" + (name === "shorts" ? "shorts" : "videos"), "json");
  if (legacy && legacy[name] != null) {
    legacy.sectionUpdatedAt = { ...legacy.sectionUpdatedAt, [name]: legacy.updatedAt };
    if (migrate) await kv.put(key, JSON.stringify(legacy));
    return legacy;
  }
  return null;
}

function selectedSections(request) {
  const section = new URL(request.url).searchParams.get("section");
  if (SECTION_NAMES.includes(section)) return [section];
  if (section === "videos") return ["top", "tech", "gaming"];
  return SECTION_NAMES;
}

export async function onRequestGet({ request, env }) {
  const secret = accessSecret(env);
  if (!secret) return json({ error: "password_not_configured" }, 503);
  if (!(await verifySession(parseCookies(request)[ACCESS_COOKIE], secret))) return json({ error: "media_kit_access_required" }, 401);
  const kv = storage(env);
  if (!kv) return json({ error: "storage_not_configured" }, 503);
  try {
    const names = selectedSections(request);
    const snapshots = await Promise.all(names.map(name => readSection(kv, name)));
    const result = { version: 9, sectionStatus: {}, sectionErrors: {}, sectionUpdatedAt: {}, stale: false };
    names.forEach((name, index) => {
      const snapshot = snapshots[index];
      result[name] = snapshot?.[name] || (name === "shorts" || name === "top" ? [] : { top: [], latest: [] });
      result.sectionStatus[name] = snapshot?.sectionStatus?.[name] || "pending";
      if (snapshot?.sectionErrors?.[name]) result.sectionErrors[name] = snapshot.sectionErrors[name];
      const updated = snapshot?.sectionUpdatedAt?.[name] || snapshot?.updatedAt;
      result.sectionUpdatedAt[name] = updated || null;
      if (!updated || Date.now() - Date.parse(updated) >= FRESH_MS) result.stale = true;
    });
    return json(result);
  } catch (error) { return json({ error: "showcase_storage_read_failed", message: cleanError(error) }, 503); }
}

function secureEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "invalid_origin" }, 403);
  const bearer = (request.headers.get("Authorization") || "").replace(/^Bearer /, "");
  const cron = secureEqual(bearer, env.MEDIA_KIT_CRON_SECRET || "");
  const admin = await verifySession(parseCookies(request).pg_media_admin_session, adminSecret(env));
  if (!cron && !admin) return json({ error: "not_authenticated" }, 401);
  const names = selectedSections(request);
  // Separate requests bound each playlist's work and isolate Google failures.
  if (names.length !== 1) return json({ error: "single_section_required" }, 400);
  const kv = storage(env);
  if (!kv) return json({ error: "storage_not_configured" }, 503);
  const name = names[0];
  try {
    if (name === "gaming" || name === "tech") return await refreshPlaylist(request, env, kv, name);
    const previous = await readSection(kv, name, false);
    const result = await build(env, kv, previous, name, CACHE_KEY + ":" + name);
    const ok = result.sectionStatus[name] === "ok";
    return json({ ok, section: name, updatedAt: result.sectionUpdatedAt?.[name], error: result.sectionErrors[name] || null }, ok ? 200 : 502);
  } catch (error) { return json({ ok: false, section: name, error: cleanError(error) }, 502); }
}
