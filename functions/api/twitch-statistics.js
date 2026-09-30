const CHANNEL_LOGIN = "paplovag";
const CACHE_SECONDS = 600;
const SNAPSHOT_KEY = "paplovag-twitch-statistics";
let tokenState = null;
let tokenPending = null;

function json(data, status = 200, cacheSeconds = 0) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheSeconds ? `public, max-age=60, s-maxage=${cacheSeconds}` : "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(6000) });
  if (!response.ok) {
    const error = new Error("twitch_request_failed");
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function appToken(env, force = false) {
  const sameClient = tokenState?.clientId === env.TWITCH_CLIENT_ID && tokenState?.secret === env.TWITCH_CLIENT_SECRET;
  if (!force && sameClient && tokenState.expiresAt > Date.now() + 60000) {
    if (tokenState.validatedAt > Date.now() - 3600000) return tokenState.value;
    try {
      const validated = await requestJson("https://id.twitch.tv/oauth2/validate", {
        headers: { Authorization: `OAuth ${tokenState.value}` }
      });
      if (validated.client_id !== env.TWITCH_CLIENT_ID) throw new Error("twitch_client_mismatch");
      tokenState.validatedAt = Date.now();
      return tokenState.value;
    } catch (error) {
      if (error.status !== 401) throw error;
    }
  }
  if (tokenPending) return tokenPending;
  tokenPending = (async function () {
    const payload = await requestJson("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.TWITCH_CLIENT_ID,
        client_secret: env.TWITCH_CLIENT_SECRET,
        grant_type: "client_credentials"
      })
    });
    if (typeof payload.access_token !== "string" || !payload.access_token || !(Number(payload.expires_in) > 0)) {
      throw new Error("twitch_invalid_token_response");
    }
    tokenState = {
      clientId: env.TWITCH_CLIENT_ID,
      secret: env.TWITCH_CLIENT_SECRET,
      value: payload.access_token,
      expiresAt: Date.now() + Number(payload.expires_in) * 1000,
      validatedAt: Date.now()
    };
    return payload.access_token;
  })();
  try { return await tokenPending; }
  finally { tokenPending = null; }
}

async function loadStatistics(env) {
  let token = await appToken(env);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const headers = { "Client-Id": env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` };
      const users = await requestJson(`https://api.twitch.tv/helix/users?login=${CHANNEL_LOGIN}`, { headers });
      const broadcaster = users.data?.find(user => user.login?.toLowerCase() === CHANNEL_LOGIN);
      if (!broadcaster?.id) throw new Error("twitch_channel_not_found");
      // Only the aggregate count is needed. No user scope or follower list is requested.
      const payload = await requestJson(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${encodeURIComponent(broadcaster.id)}&first=1`, { headers });
      if (typeof payload.total !== "number" || !Number.isSafeInteger(payload.total) || payload.total < 0) {
        throw new Error("twitch_invalid_statistics");
      }
      return { followers: payload.total, updatedAt: new Date().toISOString(), stale: false };
    } catch (error) {
      if (error.status !== 401 || attempt === 1) throw error;
      token = await appToken(env, true);
    }
  }
}

export async function onRequestGet({ request, env, waitUntil }) {
  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) {
    return json({ error: "twitch_not_configured" }, 503);
  }
  const cacheUrl = new URL(request.url);
  cacheUrl.search = "";
  cacheUrl.searchParams.set("version", "1");
  const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;
  const kv = env.MEDIA_KIT_KV || env.KV;
  try {
    const data = await loadStatistics(env);
    const response = json(data, 200, CACHE_SECONDS);
    waitUntil(cache.put(cacheKey, response.clone()).catch(() => {}));
    if (kv) waitUntil(kv.put(SNAPSHOT_KEY, JSON.stringify(data)).catch(() => {}));
    return response;
  } catch {
    // Only a previous real Twitch result may serve as a fallback.
    if (kv) {
      try {
        const saved = await kv.get(SNAPSHOT_KEY, "json");
        if (typeof saved?.followers === "number" && Number.isSafeInteger(saved.followers) &&
            saved.followers >= 0 && Number.isFinite(Date.parse(saved.updatedAt)) &&
            Date.parse(saved.updatedAt) <= Date.now()) {
          return json({ followers: saved.followers, updatedAt: saved.updatedAt, stale: true }, 200, 60);
        }
      } catch {}
    }
    return json({ error: "twitch_statistics_unavailable" }, 502);
  }
}
