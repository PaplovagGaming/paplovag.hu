const ADMIN_COOKIE = "tp_media_admin_session";
const STATE_PREFIX = "tuzproba-youtube-oauth-state:";
const REDIRECT_URI = "https://paplovag.hu/api/youtube-oauth/callback";
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly"
];

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

function storage(env) {
  return env.MEDIA_KIT_KV || env.KV || null;
}

function errorPage(message, status = 400) {
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>YouTube OAuth</title></head><body style="font-family:system-ui;background:#090403;color:#fff7ef;padding:40px"><h1>YouTube OAuth</h1><p>${message}</p><p><a style="color:#ffb47d" href="/tuzproba/media-kit/admin/">Vissza az adminhoz</a></p></body></html>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" }
  });
}

export async function onRequestGet({ request, env }) {
  if (!env.YOUTUBE_OAUTH_CLIENT_ID || !env.YOUTUBE_OAUTH_CLIENT_SECRET) {
    return errorPage("Hiányzik a YOUTUBE_OAUTH_CLIENT_ID vagy YOUTUBE_OAUTH_CLIENT_SECRET secret.", 503);
  }

  const kv = storage(env);
  if (!kv) return errorPage("A Media Kit KV binding nincs konfigurálva.", 503);

  const cookies = parseCookies(request);
  const isAdmin = await verifySession(cookies[ADMIN_COOKIE], env.MEDIA_KIT_ADMIN_PASSWORD);
  if (!isAdmin) {
    return Response.redirect("https://paplovag.hu/tuzproba/media-kit/admin/", 302);
  }

  const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
  await kv.put(`${STATE_PREFIX}${state}`, "1", { expirationTtl: 600 });

  const params = new URLSearchParams({
    client_id: env.YOUTUBE_OAUTH_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: SCOPES.join(" "),
    state
  });

  return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, 302);
}
