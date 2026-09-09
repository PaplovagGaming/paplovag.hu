const ACCESS_COOKIE = "pg_media_access";
const TOKEN_KEY = "paplovag-youtube-oauth-refresh-token";
const CACHE_KEY = "paplovag-youtube-showcase-v3";
const TARGET_CHANNEL_ID = "UCUEDPQyLPN5lrTH06k2oWYA";
const TECH_PLAYLIST_ID = "PLrH3C01Hh-gnG5Qs_Xwe3z2yxMFYSwFWh";
const GAMING_PLAYLIST_ID = "PLrH3C01Hh-gk7hkFKyO7wwne6FYEhdAup";
const CACHE_TTL_SECONDS = 2 * 60 * 60;
const TIME_ZONE = "Europe/Budapest";

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

function storage(env) {
  return env.MEDIA_KIT_KV || env.KV || null;
}

function accessSecret(env) {
  return env.PAPLOVAG_MEDIA_KIT_PASSWORD || env.MEDIA_KIT_PASSWORD || "";
}

function adminSecret(env) {
  return env.PAPLOVAG_MEDIA_KIT_ADMIN_PASSWORD || env.MEDIA_KIT_ADMIN_PASSWORD || "";
}

function parseCookies(request) {
  const result = {};
  for (const item of (request.headers.get("Cookie") || "").split(";")) {
    const [name, ...rest] = item.trim().split("=");
    if (!name) continue;
    try { result[name] = decodeURIComponent(rest.join("=")); }
    catch { result[name] = rest.join("="); }
  }
  return result;
}

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64urlText(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function decodeBase64urlBytes(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64url(new Uint8Array(signature));
}

async function verifySession(token, secret) {
  if (!token || !secret) return false;
  const [encoded, signature] = String(token).split(".");
  if (!encoded || !signature) return false;
  const expected = await hmac(encoded, secret);
  if (signature.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < signature.length; i += 1) mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  if (mismatch !== 0) return false;
  try { return Number(JSON.parse(decodeBase64urlText(encoded)).exp) > Math.floor(Date.now() / 1000); }
  catch { return false; }
}

async function encryptionKey(secret) {
  const material = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`paplovag-youtube-oauth:${secret}`)
  );
  return crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, ["decrypt"]);
}

async function decryptRefreshToken(record, secret) {
  if (!record?.iv || !record?.ciphertext || !secret) throw new Error("oauth_token_unavailable");
  const key = await encryptionKey(secret);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64urlBytes(record.iv) },
    key,
    decodeBase64urlBytes(record.ciphertext)
  );
  return new TextDecoder().decode(decrypted);
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

async function googleJson(url, accessToken) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }
  });
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

function localDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDate(dateString, days) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function parseIsoDurationSeconds(value) {
  const match = String(value || "").match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!match) return 0;
  return Number(match[1] || 0) * 86400 + Number(match[2] || 0) * 3600 + Number(match[3] || 0) * 60 + Number(match[4] || 0);
}

function pickThumbnail(thumbnails = {}) {
  return (thumbnails.maxres ?? thumbnails.standard ?? thumbnails.high ?? thumbnails.medium ?? thumbnails.default ?? {}).url ?? "";
}

function publicVideo(item) {
  return {
    id: item?.id ?? null,
    title: item?.snippet?.title ?? "YouTube video",
    thumbnailUrl: pickThumbnail(item?.snippet?.thumbnails),
    publishedAt: item?.snippet?.publishedAt ?? null,
    durationSeconds: parseIsoDurationSeconds(item?.contentDetails?.duration),
    viewCount: Number(item?.statistics?.viewCount || 0)
  };
}

function reportObjects(report) {
  const names = (report?.columnHeaders || []).map((header) => header.name);
  return (report?.rows || []).map((row) => Object.fromEntries(names.map((name, index) => [name, row[index]])));
}

async function loadOwnedVideoDetails(accessToken, ids) {
  const uniqueIds = [...new Set((ids || []).filter(Boolean))];
  if (!uniqueIds.length) return [];
  const output = [];
  for (let i = 0; i < uniqueIds.length; i += 50) {
    const params = new URLSearchParams({
      part: "snippet,contentDetails,statistics,status,liveStreamingDetails",
      id: uniqueIds.slice(i, i + 50).join(","),
      maxResults: "50"
    });
    const payload = await googleJson(`https://www.googleapis.com/youtube/v3/videos?${params}`, accessToken);
    output.push(...(payload.items || []));
  }
  return output;
}

async function loadCreatorContentTypes(accessToken, ids, channelStartDate, endDate) {
  if (!ids.length) return new Map();
  const params = new URLSearchParams({
    ids: "channel==MINE",
    startDate: channelStartDate,
    endDate,
    metrics: "views",
    dimensions: "video,creatorContentType",
    filters: `video==${ids.join(",")}`,
    sort: "-views",
    maxResults: "200"
  });
  const report = await googleJson(`https://youtubeanalytics.googleapis.com/v2/reports?${params}`, accessToken);
  const types = new Map();
  for (const row of reportObjects(report)) {
    const videoId = String(row.video || "");
    const type = String(row.creatorContentType || "");
    if (!videoId || !type) continue;
    if (type === "SHORTS" || !types.has(videoId)) types.set(videoId, type);
  }
  return types;
}

async function loadRecentShowcase(accessToken, uploadsPlaylistId, channelStartDate, endDate) {
  const shorts = [];
  const long = [];
  let pageToken = "";
  let scannedUploads = 0;

  for (let page = 0; page < 6; page += 1) {
    const params = new URLSearchParams({
      part: "contentDetails",
      playlistId: uploadsPlaylistId,
      maxResults: "50"
    });
    if (pageToken) params.set("pageToken", pageToken);
    const playlist = await googleJson(`https://www.googleapis.com/youtube/v3/playlistItems?${params}`, accessToken);
    const ids = (playlist.items || []).map((item) => item?.contentDetails?.videoId).filter(Boolean);
    scannedUploads += ids.length;

    const [details, contentTypes] = await Promise.all([
      loadOwnedVideoDetails(accessToken, ids),
      loadCreatorContentTypes(accessToken, ids, channelStartDate, endDate)
    ]);
    const byId = new Map(details.map((item) => [item.id, item]));

    for (const id of ids) {
      const item = byId.get(id);
      if (!item || item?.status?.privacyStatus !== "public") continue;
      if (item?.snippet?.liveBroadcastContent && item.snippet.liveBroadcastContent !== "none") continue;
      if (item?.liveStreamingDetails) continue;

      const type = contentTypes.get(id) || "";
      const duration = parseIsoDurationSeconds(item?.contentDetails?.duration);

      if (shorts.length < 5 && type === "SHORTS") {
        shorts.push(publicVideo(item));
      } else if (long.length < 3 && type && type !== "SHORTS" && type !== "LIVE_STREAM") {
        long.push(publicVideo(item));
      } else if (long.length < 3 && !type && duration > 180) {
        long.push(publicVideo(item));
      }

      if (shorts.length >= 5 && long.length >= 3) break;
    }

    if (shorts.length >= 5 && long.length >= 3) break;
    pageToken = playlist.nextPageToken || "";
    if (!pageToken) break;
  }

  return { shorts, long, scannedUploads };
}

async function loadLifetimeTop(accessToken, channelStartDate, endDate) {
  const params = new URLSearchParams({
    ids: "channel==MINE",
    startDate: channelStartDate,
    endDate,
    metrics: "views",
    dimensions: "video",
    sort: "-views",
    maxResults: "25"
  });
  const report = await googleJson(`https://youtubeanalytics.googleapis.com/v2/reports?${params}`, accessToken);
  const rows = reportObjects(report);
  const ids = rows.map((row) => row.video).filter(Boolean);
  const details = await loadOwnedVideoDetails(accessToken, ids);
  const byId = new Map(details.map((item) => [item.id, item]));
  const top = [];
  for (const row of rows) {
    const item = byId.get(row.video);
    if (!item || item?.status?.privacyStatus !== "public") continue;
    top.push(publicVideo(item));
    if (top.length >= 3) break;
  }
  return top;
}

async function loadPlaylistSection(accessToken, playlistId) {
  const ids = [];
  let pageToken = "";

  for (let page = 0; page < 20; page += 1) {
    const params = new URLSearchParams({
      part: "contentDetails",
      playlistId,
      maxResults: "50"
    });
    if (pageToken) params.set("pageToken", pageToken);
    const payload = await googleJson(`https://www.googleapis.com/youtube/v3/playlistItems?${params}`, accessToken);
    for (const item of payload.items || []) {
      const id = item?.contentDetails?.videoId;
      if (id) ids.push(id);
    }
    pageToken = payload.nextPageToken || "";
    if (!pageToken) break;
  }

  const details = await loadOwnedVideoDetails(accessToken, ids);
  const videos = details
    .filter((item) => item?.status?.privacyStatus === "public")
    .filter((item) => item?.snippet?.channelId === TARGET_CHANNEL_ID)
    .map(publicVideo);

  const top = [...videos]
    .sort((a, b) => (Number(b.viewCount) || 0) - (Number(a.viewCount) || 0))
    .slice(0, 3);

  const latest = [...videos]
    .sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0))
    .slice(0, 3);

  return { playlistId, top, latest, totalVideos: videos.length };
}

async function buildShowcase(env, kv) {
  if (!env.YOUTUBE_OAUTH_CLIENT_ID || !env.YOUTUBE_OAUTH_CLIENT_SECRET || !adminSecret(env)) {
    throw new Error("oauth_secrets_missing");
  }
  const tokenRecord = await kv.get(TOKEN_KEY, "json");
  if (!tokenRecord) throw new Error("oauth_not_connected");
  const refreshToken = await decryptRefreshToken(tokenRecord, adminSecret(env));
  const accessToken = await getAccessToken(env, refreshToken);

  const channel = await googleJson(
    "https://www.googleapis.com/youtube/v3/channels?part=id,snippet,contentDetails&mine=true&maxResults=50",
    accessToken
  );
  const target = (channel.items || []).find((item) => item.id === TARGET_CHANNEL_ID);
  if (!target) throw new Error("wrong_youtube_channel");
  const uploadsPlaylistId = target?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) throw new Error("uploads_playlist_unavailable");

  const today = localDateString();
  const endDate = shiftDate(today, -1);
  const channelStartDate = String(target?.snippet?.publishedAt || "2013-01-01").slice(0, 10);

  const [recent, top, tech, gaming] = await Promise.all([
    loadRecentShowcase(accessToken, uploadsPlaylistId, channelStartDate, endDate),
    loadLifetimeTop(accessToken, channelStartDate, endDate),
    loadPlaylistSection(accessToken, TECH_PLAYLIST_ID),
    loadPlaylistSection(accessToken, GAMING_PLAYLIST_ID)
  ]);

  const showcase = {
    shorts: recent.shorts,
    top,
    long: recent.long,
    tech,
    gaming,
    updatedAt: new Date().toISOString(),
    scannedRecentUploads: recent.scannedUploads,
    shortRule: "youtube_analytics_creatorContentType_SHORTS",
    topRule: `youtube_analytics_full_channel_${channelStartDate}_through_${endDate}_sorted_by_views`,
    longRule: "latest_public_non_short_non_livestream",
    techRule: `playlist_${TECH_PLAYLIST_ID}_top_by_current_views_and_latest_by_publishedAt`,
    gamingRule: `playlist_${GAMING_PLAYLIST_ID}_top_by_current_views_and_latest_by_publishedAt`
  };

  await kv.put(CACHE_KEY, JSON.stringify(showcase), { expirationTtl: CACHE_TTL_SECONDS });
  return showcase;
}

export async function onRequestGet({ request, env }) {
  const secret = accessSecret(env);
  if (!secret) return json({ error: "password_not_configured" }, 503);
  const authenticated = await verifySession(parseCookies(request)[ACCESS_COOKIE], secret);
  if (!authenticated) return json({ error: "media_kit_access_required" }, 401);

  const kv = storage(env);
  if (!kv) return json({ error: "storage_not_configured" }, 503);

  const force = new URL(request.url).searchParams.get("refresh") === "1";
  if (!force) {
    try {
      const cached = await kv.get(CACHE_KEY, "json");
      if (cached?.shorts && cached?.top && cached?.tech?.top && cached?.gaming?.top) return json(cached);
    } catch {}
  }

  try {
    return json(await buildShowcase(env, kv));
  } catch (error) {
    console.error("Paplovag showcase refresh failed", error.message);
    const code = String(error.message || "showcase_failed");
    const status = code === "wrong_youtube_channel" ? 409 : code.includes("missing") || code.includes("not_configured") ? 503 : 502;
    return json({ error: code }, status);
  }
}
