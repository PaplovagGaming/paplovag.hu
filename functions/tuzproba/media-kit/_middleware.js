const SESSION_COOKIE = "tp_media_session";

function parseCookies(request) {
  const result = {};
  const raw = request.headers.get("Cookie") || "";
  for (const item of raw.split(";")) {
    const [name, ...rest] = item.trim().split("=");
    if (!name) continue;
    result[name] = decodeURIComponent(rest.join("="));
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
  const [encoded, signature] = token.split(".");
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

function privateResponse(response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  headers.set("Referrer-Policy", "no-referrer");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const normalizedPath = url.pathname.replace(/\/+$/, "") || "/";
  const loginPath = "/tuzproba/media-kit/login";

  if (normalizedPath === loginPath) {
    return privateResponse(await context.next());
  }

  const secret = env.MEDIA_KIT_PASSWORD;
  if (!secret) {
    return new Response("Media kit password protection is not configured.", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow, noarchive"
      }
    });
  }

  const cookies = parseCookies(request);
  const authenticated = await verifySession(cookies[SESSION_COOKIE], secret);
  if (!authenticated) {
    const loginUrl = new URL("/tuzproba/media-kit/login/", url.origin);
    loginUrl.searchParams.set("next", `${url.pathname}${url.search}`);
    return Response.redirect(loginUrl.toString(), 302);
  }

  return privateResponse(await context.next());
}
