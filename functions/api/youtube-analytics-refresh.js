const DATA_KEY = "tuzproba-media-kit";
const TOKEN_KEY = "tuzproba-youtube-oauth-refresh-token";
const ADMIN_COOKIE = "tp_media_admin_session";
const TARGET_CHANNEL_ID = "UCdw9t0aw4TED_GV-ffWCQMg";
const TIME_ZONE = "Europe/Budapest";

const DEFAULT_DATA = {
  version: 1,
  updatedAt: "2026-09-09",
  stats: {
    subscribers: 8916,
    views28d: 127669,
    views90d: 332972,
    watchHours90d: 27349,
    impressions90d: 2013756,
    ctr: 4.95,
    avgViewDuration: "9:51",
    subscriberGrowth90d: 1273
  },
  audience: {
    coreAgeLabel: "25–44",
    coreAgeShare: 68.85,
    male: 71.67,
    female: 28.33,
    countries: [
      { name: "Hungary", share: 79.6 },
      { name: "Romania", share: 6.8 },
      { name: "Ukraine", share: 2.9 },
      { name: "Slovakia", share: 2.0 }
    ]
  },
  contact: {
    email: "paplovaggaming@gmail.com",
    channelUrl: `https://www.youtube.com/channel/${TARGET_CHANNEL_ID}`
  }
};

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

function parseCookies(request) {
  const result = {};
  const raw = request.headers.get("Cookie") || "";
  for (const item of raw.split(";")) {
    const [name, ...rest] = item.trim().split("=");
    if (!name) continue;
    try {
      result[name] = decodeURIComponent(rest.join("="));
    } catch {
      result[name] = rest.join("=");
    }
  }
  return result;
}

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64urlText(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
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
  for (let i = 0; i < signature.length; i += 1) {
    mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (mismatch !== 0) return false;

  try {
    const payload = JSON.parse(decodeBase64urlText(encoded));
    return Number(payload.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function secureEqual(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (!left || !right || left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

async function isAuthorized(request, env) {
  const cookies = parseCookies(request);
  if (await verifySession(cookies[ADMIN_COOKIE], env.MEDIA_KIT_ADMIN_PASSWORD)) {
    return "admin";
  }

  const authorization = request.headers.get("Authorization") || "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (env.MEDIA_KIT_CRON_SECRET && secureEqual(bearer, env.MEDIA_KIT_CRON_SECRET)) {
    return "cron";
  }

  return null;
}

function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}

async function encryptionKey(secret) {
  const material = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`tuzproba-youtube-oauth:${secret}`)
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
  if (!response.ok || !payload.access_token) {
    console.error("YouTube OAuth refresh failed", response.status, payload?.error || "unknown_error");
    throw new Error("oauth_refresh_failed");
  }
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

function reportObjects(report) {
  const names = (report?.columnHeaders || []).map((header) => header.name);
  return (report?.rows || []).map((row) => Object.fromEntries(names.map((name, index) => [name, row[index]])));
}

async function analyticsQuery(accessToken, { startDate, endDate, metrics, dimensions, sort, maxResults }) {
  const params = new URLSearchParams({
    ids: "channel==MINE",
    startDate,
    endDate,
    metrics
  });
  if (dimensions) params.set("dimensions", dimensions);
  if (sort) params.set("sort", sort);
  if (maxResults) params.set("maxResults", String(maxResults));
  return googleJson(`https://youtubeanalytics.googleapis.com/v2/reports?${params}`, accessToken);
}

function secondsToDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function countryName(code) {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(String(code || "").toUpperCase()) || code;
  } catch {
    return code;
  }
}

async function loadStoredData(kv) {
  try {
    return (await kv.get(DATA_KEY, "json")) || structuredClone(DEFAULT_DATA);
  } catch {
    return structuredClone(DEFAULT_DATA);
  }
}

async function refreshMediaKit(env) {
  if (!env.YOUTUBE_OAUTH_CLIENT_ID || !env.YOUTUBE_OAUTH_CLIENT_SECRET || !env.MEDIA_KIT_ADMIN_PASSWORD) {
    throw new Error("oauth_secrets_missing");
  }

  const kv = storage(env);
  if (!kv) throw new Error("storage_not_configured");

  const storedToken = await kv.get(TOKEN_KEY, "json");
  if (!storedToken) throw new Error("oauth_not_connected");

  const refreshToken = await decryptRefreshToken(storedToken, env.MEDIA_KIT_ADMIN_PASSWORD);
  const accessToken = await getAccessToken(env, refreshToken);
  const current = await loadStoredData(kv);

  const todayLocal = localDateString();
  const endDate = shiftDate(todayLocal, -1);
  const start28 = shiftDate(endDate, -27);
  const start90 = shiftDate(endDate, -89);

  const channelPayload = await googleJson(
    "https://www.googleapis.com/youtube/v3/channels?part=id,statistics&mine=true&maxResults=50",
    accessToken
  );
  const targetChannel = (channelPayload.items || []).find((item) => item.id === TARGET_CHANNEL_ID);
  if (!targetChannel) throw new Error("wrong_youtube_channel");

  const [report28, report90] = await Promise.all([
    analyticsQuery(accessToken, {
      startDate: start28,
      endDate,
      metrics: "views"
    }),
    analyticsQuery(accessToken, {
      startDate: start90,
      endDate,
      metrics: "views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost"
    })
  ]);

  const row28 = reportObjects(report28)[0];
  const row90 = reportObjects(report90)[0];
  if (!row28 || !row90) throw new Error("analytics_core_data_unavailable");

  const warnings = [];
  const next = structuredClone(current || DEFAULT_DATA);
  next.version = 1;
  next.updatedAt = todayLocal;
  next.stats = { ...(current?.stats || DEFAULT_DATA.stats) };
  next.audience = { ...(current?.audience || DEFAULT_DATA.audience) };
  next.contact = { ...(current?.contact || DEFAULT_DATA.contact) };

  const subscriberCount = Number(targetChannel?.statistics?.subscriberCount);
  if (Number.isFinite(subscriberCount)) next.stats.subscribers = Math.round(subscriberCount);
  else warnings.push("subscriber_count_preserved");

  next.stats.views28d = Math.round(Number(row28.views) || 0);
  next.stats.views90d = Math.round(Number(row90.views) || 0);
  next.stats.watchHours90d = Math.round((Number(row90.estimatedMinutesWatched) || 0) / 60);
  next.stats.avgViewDuration = secondsToDuration(row90.averageViewDuration);
  next.stats.subscriberGrowth90d = Math.round((Number(row90.subscribersGained) || 0) - (Number(row90.subscribersLost) || 0));

  try {
    const reach = await analyticsQuery(accessToken, {
      startDate: start90,
      endDate,
      metrics: "videoThumbnailImpressions,videoThumbnailImpressionsClickRate"
    });
    const row = reportObjects(reach)[0];
    if (row && Number.isFinite(Number(row.videoThumbnailImpressions))) {
      next.stats.impressions90d = Math.round(Number(row.videoThumbnailImpressions));
    } else {
      warnings.push("impressions_preserved");
    }
    if (row && Number.isFinite(Number(row.videoThumbnailImpressionsClickRate))) {
      next.stats.ctr = round(Number(row.videoThumbnailImpressionsClickRate) * 100, 2);
      if (next.stats.ctr > 100) next.stats.ctr = round(Number(row.videoThumbnailImpressionsClickRate), 2);
    } else {
      warnings.push("ctr_preserved");
    }
  } catch (error) {
    console.warn("YouTube reach metrics unavailable in targeted query", error.reason || error.message);
    warnings.push("reach_metrics_preserved");
  }

  try {
    const demographics = await analyticsQuery(accessToken, {
      startDate: start90,
      endDate,
      metrics: "viewerPercentage",
      dimensions: "ageGroup,gender"
    });
    const rows = reportObjects(demographics);
    const total = rows.reduce((sum, row) => sum + (Number(row.viewerPercentage) || 0), 0);
    const core = rows
      .filter((row) => row.ageGroup === "age25-34" || row.ageGroup === "age35-44")
      .reduce((sum, row) => sum + (Number(row.viewerPercentage) || 0), 0);
    const maleRaw = rows.filter((row) => row.gender === "male").reduce((sum, row) => sum + (Number(row.viewerPercentage) || 0), 0);
    const femaleRaw = rows.filter((row) => row.gender === "female").reduce((sum, row) => sum + (Number(row.viewerPercentage) || 0), 0);
    const binaryTotal = maleRaw + femaleRaw;

    if (total > 0) {
      next.audience.coreAgeLabel = "25–44";
      next.audience.coreAgeShare = round((core / total) * 100, 2);
    }
    if (binaryTotal > 0) {
      next.audience.male = round((maleRaw / binaryTotal) * 100, 2);
      next.audience.female = round((femaleRaw / binaryTotal) * 100, 2);
    }
  } catch (error) {
    console.warn("YouTube demographics unavailable", error.reason || error.message);
    warnings.push("demographics_preserved");
  }

  try {
    const geography = await analyticsQuery(accessToken, {
      startDate: start90,
      endDate,
      metrics: "views",
      dimensions: "country",
      sort: "-views",
      maxResults: 6
    });
    const rows = reportObjects(geography);
    const totalViews = Math.max(1, Number(row90.views) || 0);
    const countries = rows
      .filter((row) => row.country)
      .map((row) => ({
        name: countryName(row.country),
        share: round(((Number(row.views) || 0) / totalViews) * 100, 2)
      }))
      .filter((country) => country.share > 0);
    if (countries.length) next.audience.countries = countries;
  } catch (error) {
    console.warn("YouTube geography unavailable", error.reason || error.message);
    warnings.push("countries_preserved");
  }

  next.youtubeSync = {
    lastSuccessAt: new Date().toISOString(),
    analyticsEndDate: endDate,
    views28StartDate: start28,
    views90StartDate: start90,
    warnings
  };

  await kv.put(DATA_KEY, JSON.stringify(next));
  return { data: next, warnings };
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: "invalid_origin" }, 403);

  const authorizedAs = await isAuthorized(request, env);
  if (!authorizedAs) return json({ error: "not_authenticated" }, 401);

  try {
    const result = await refreshMediaKit(env);
    return json({ ok: true, triggeredBy: authorizedAs, ...result });
  } catch (error) {
    console.error("YouTube Analytics media kit refresh failed", error.message);
    const code = String(error.message || "refresh_failed");
    const status = code === "wrong_youtube_channel" ? 409 : code.includes("missing") || code.includes("not_configured") ? 503 : 502;
    return json({ error: code }, status);
  }
}
