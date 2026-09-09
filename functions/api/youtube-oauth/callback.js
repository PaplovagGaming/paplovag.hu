const STATE_PREFIX = "tuzproba-youtube-oauth-state:";
const TOKEN_KEY = "tuzproba-youtube-oauth-refresh-token";
const REDIRECT_URI = "https://paplovag.hu/api/youtube-oauth/callback";

function storage(env) {
  return env.MEDIA_KIT_KV || env.KV || null;
}

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function encryptionKey(secret) {
  const material = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`tuzproba-youtube-oauth:${secret}`)
  );
  return crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, ["encrypt"]);
}

async function encryptRefreshToken(token, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey(secret);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(token)
  );
  return {
    version: 1,
    iv: base64url(iv),
    ciphertext: base64url(new Uint8Array(encrypted)),
    storedAt: new Date().toISOString()
  };
}

function errorPage(message, status = 400) {
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>YouTube OAuth</title></head><body style="font-family:system-ui;background:#090403;color:#fff7ef;padding:40px"><h1>YouTube OAuth</h1><p>${message}</p><p><a style="color:#ffb47d" href="/tuzproba/media-kit/admin/">Vissza az adminhoz</a></p></body></html>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" }
  });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) return errorPage("A Google OAuth engedélykérés megszakadt vagy elutasításra került.");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return errorPage("Hiányzó OAuth code vagy state paraméter.");

  if (!env.YOUTUBE_OAUTH_CLIENT_ID || !env.YOUTUBE_OAUTH_CLIENT_SECRET || !env.MEDIA_KIT_ADMIN_PASSWORD) {
    return errorPage("Hiányzik egy szükséges OAuth vagy admin secret.", 503);
  }

  const kv = storage(env);
  if (!kv) return errorPage("A Media Kit KV binding nincs konfigurálva.", 503);

  const stateKey = `${STATE_PREFIX}${state}`;
  const validState = await kv.get(stateKey);
  if (!validState) return errorPage("Az OAuth state lejárt vagy érvénytelen. Indítsd újra az összekötést.", 403);
  await kv.delete(stateKey);

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      code,
      client_id: env.YOUTUBE_OAUTH_CLIENT_ID,
      client_secret: env.YOUTUBE_OAUTH_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code"
    })
  });

  let tokenData = {};
  try {
    tokenData = await tokenResponse.json();
  } catch {
  }

  if (!tokenResponse.ok) {
    console.error("YouTube OAuth token exchange failed", tokenResponse.status, tokenData?.error || "unknown_error");
    return errorPage("A Google OAuth token exchange sikertelen volt. Ellenőrizd a redirect URI-t és az OAuth kliens beállításait.", 502);
  }

  if (!tokenData.refresh_token) {
    return errorPage("A Google nem adott refresh tokent. Indítsd újra az összekötést; a flow prompt=consent és access_type=offline beállítással fut.", 502);
  }

  const encrypted = await encryptRefreshToken(tokenData.refresh_token, env.MEDIA_KIT_ADMIN_PASSWORD);
  await kv.put(TOKEN_KEY, JSON.stringify({
    ...encrypted,
    scope: tokenData.scope || "",
    tokenType: tokenData.token_type || "Bearer"
  }));

  return Response.redirect("https://paplovag.hu/tuzproba/media-kit/admin/?youtube=connected", 302);
}
