const DATA_KEY = "tuzproba-media-kit";
const ACCESS_COOKIE = "tp_media_access";
const ADMIN_COOKIE = "tp_media_admin_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;

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
    channelUrl: "https://www.youtube.com/channel/UCdw9t0aw4TED_GV-ffWCQMg"
  }
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Referrer-Policy": "no-referrer",
      ...extraHeaders
    }
  });
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

function base64urlText(text) {
  return base64url(new TextEncoder().encode(text));
}

function decodeBase64urlText(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
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

async function createSession(secret) {
  const payload = JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS });
  const encoded = base64urlText(payload);
  const signature = await hmac(encoded, secret);
  return `${encoded}.${signature}`;
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

function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}

function storage(env) {
  return env.MEDIA_KIT_KV || env.KV || null;
}

function setCookie(name, value, maxAge = SESSION_TTL_SECONDS) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

function clearCookie(name) {
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function cleanData(input) {
  const stats = input?.stats || {};
  const audience = input?.audience || {};
  const countries = Array.isArray(audience.countries) ? audience.countries : [];

  return {
    version: 1,
    updatedAt: new Date().toISOString().slice(0, 10),
    stats: {
      subscribers: Math.round(clampNumber(stats.subscribers, 0, 1000000000, DEFAULT_DATA.stats.subscribers)),
      views28d: Math.round(clampNumber(stats.views28d, 0, 100000000000, DEFAULT_DATA.stats.views28d)),
      views90d: Math.round(clampNumber(stats.views90d, 0, 100000000000, DEFAULT_DATA.stats.views90d)),
      watchHours90d: Math.round(clampNumber(stats.watchHours90d, 0, 100000000000, DEFAULT_DATA.stats.watchHours90d)),
      impressions90d: Math.round(clampNumber(stats.impressions90d, 0, 1000000000000, DEFAULT_DATA.stats.impressions90d)),
      ctr: clampNumber(stats.ctr, 0, 100, DEFAULT_DATA.stats.ctr),
      avgViewDuration: /^\d{1,3}:\d{2}$/.test(String(stats.avgViewDuration || ""))
        ? String(stats.avgViewDuration)
        : DEFAULT_DATA.stats.avgViewDuration,
      subscriberGrowth90d: Math.round(clampNumber(stats.subscriberGrowth90d, -1000000000, 1000000000, DEFAULT_DATA.stats.subscriberGrowth90d))
    },
    audience: {
      coreAgeLabel: String(audience.coreAgeLabel || DEFAULT_DATA.audience.coreAgeLabel).slice(0, 24),
      coreAgeShare: clampNumber(audience.coreAgeShare, 0, 100, DEFAULT_DATA.audience.coreAgeShare),
      male: clampNumber(audience.male, 0, 100, DEFAULT_DATA.audience.male),
      female: clampNumber(audience.female, 0, 100, DEFAULT_DATA.audience.female),
      countries: countries
        .slice(0, 6)
        .map((country) => ({
          name: String(country?.name || "").trim().slice(0, 40),
          share: clampNumber(country?.share, 0, 100, 0)
        }))
        .filter((country) => country.name)
    },
    contact: {
      email: String(input?.contact?.email || DEFAULT_DATA.contact.email).trim().slice(0, 160),
      channelUrl: DEFAULT_DATA.contact.channelUrl
    }
  };
}

async function loadData(env) {
  const kv = storage(env);
  if (!kv) return DEFAULT_DATA;

  try {
    const stored = await kv.get(DATA_KEY, "json");
    return stored || DEFAULT_DATA;
  } catch (error) {
    console.error("Media kit KV read failed", error);
    return DEFAULT_DATA;
  }
}

async function hasAccess(request, env) {
  const cookies = parseCookies(request);
  return verifySession(cookies[ACCESS_COOKIE], env.MEDIA_KIT_PASSWORD);
}

async function isAdmin(request, env) {
  const cookies = parseCookies(request);
  return verifySession(cookies[ADMIN_COOKIE], env.MEDIA_KIT_ADMIN_PASSWORD);
}

export async function onRequestGet({ request, env }) {
  if (!(await hasAccess(request, env))) {
    return json({ error: "media_kit_access_required" }, 401);
  }

  const data = await loadData(env);
  return json({ data, storageConfigured: Boolean(storage(env)) });
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: "invalid_origin" }, 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const action = String(body?.action || "");

  if (action === "access_login") {
    const secret = env.MEDIA_KIT_PASSWORD;
    if (!secret) return json({ error: "password_not_configured" }, 503);
    if (String(body?.password || "") !== secret) return json({ error: "invalid_password" }, 401);

    const token = await createSession(secret);
    return json(
      { ok: true },
      200,
      { "Set-Cookie": setCookie(ACCESS_COOKIE, token) }
    );
  }

  if (action === "access_logout") {
    return json({ ok: true }, 200, { "Set-Cookie": clearCookie(ACCESS_COOKIE) });
  }

  if (action === "admin_login") {
    if (!(await hasAccess(request, env))) return json({ error: "media_kit_access_required" }, 401);

    const secret = env.MEDIA_KIT_ADMIN_PASSWORD;
    if (!secret) return json({ error: "admin_password_not_configured" }, 503);
    if (String(body?.password || "") !== secret) return json({ error: "invalid_admin_password" }, 401);

    const token = await createSession(secret);
    return json(
      { ok: true, storageConfigured: Boolean(storage(env)) },
      200,
      { "Set-Cookie": setCookie(ADMIN_COOKIE, token) }
    );
  }

  if (action === "admin_logout") {
    return json({ ok: true }, 200, { "Set-Cookie": clearCookie(ADMIN_COOKIE) });
  }

  if (action === "admin_status") {
    const authenticated = await isAdmin(request, env);
    return json({ authenticated, storageConfigured: Boolean(storage(env)) });
  }

  if (action === "save") {
    if (!(await isAdmin(request, env))) return json({ error: "not_authenticated" }, 401);

    const kv = storage(env);
    if (!kv) return json({ error: "storage_not_configured" }, 503);

    const cleaned = cleanData(body?.data || {});
    try {
      await kv.put(DATA_KEY, JSON.stringify(cleaned));
      return json({ ok: true, data: cleaned });
    } catch (error) {
      console.error("Media kit KV write failed", error);
      return json({ error: "storage_write_failed" }, 500);
    }
  }

  return json({ error: "invalid_action" }, 400);
}
