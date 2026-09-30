const CACHE_SECONDS = 60;
const SNAPSHOT_KEY = "paplovag-twitch-statistics";
const SOURCE_URL = "https://kingdom.paplovag.hu/api/creator/twitch/public";

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

function valid(data) {
  return typeof data?.followers === "number" && Number.isSafeInteger(data.followers) &&
    data.followers >= 0 && typeof data.updatedAt === "string" &&
    Number.isFinite(Date.parse(data.updatedAt)) && Date.parse(data.updatedAt) <= Date.now() + 60000;
}

export async function onRequestGet({ request, env, waitUntil }) {
  const cacheUrl = new URL(request.url);
  cacheUrl.search = "";
  cacheUrl.searchParams.set("version", "2-kingdom");
  const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;
  const kv = env.MEDIA_KIT_KV || env.KV;
  let sourceStatus = 0;
  try {
    // Server-to-server fetch: no visitor cookies or credentials are forwarded.
    const upstream = await fetch(SOURCE_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20000),
      redirect: "error"
    });
    sourceStatus = upstream.status;
    if (!upstream.ok) throw new Error("twitch_source_unavailable");
    const payload = await upstream.json();
    if (!valid(payload)) throw new Error("twitch_invalid_statistics");
    const data = { followers: payload.followers, updatedAt: payload.updatedAt, stale: payload.stale === true };
    const response = json(data, 200, data.stale ? 60 : CACHE_SECONDS);
    waitUntil(cache.put(cacheKey, response.clone()).catch(() => {}));
    if (kv && !data.stale) waitUntil(kv.put(SNAPSHOT_KEY, JSON.stringify(data)).catch(() => {}));
    return response;
  } catch {
    if (kv) {
      try {
        const saved = await kv.get(SNAPSHOT_KEY, "json");
        if (valid(saved)) return json({ followers: saved.followers, updatedAt: saved.updatedAt, stale: true }, 200, 60);
      } catch {}
    }
    return json({ error: sourceStatus === 503 ? "twitch_not_configured" : "twitch_statistics_unavailable" }, sourceStatus === 503 ? 503 : 502);
  }
}
