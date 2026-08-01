const CHANNEL_ID = "UCUEDPQyLPN5lrTH06k2oWYA";

function jsonResponse(data, status = 200, cacheSeconds = 0) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  };

  if (cacheSeconds > 0) {
    headers["Cache-Control"] = `public, max-age=60, s-maxage=${cacheSeconds}`;
  } else {
    headers["Cache-Control"] = "no-store";
  }

  return new Response(JSON.stringify(data), { status, headers });
}

function upstreamErrorPayload(data, status) {
  return {
    error: "youtube_api_error",
    upstreamStatus: status,
    reason:
      data?.error?.errors?.[0]?.reason ??
      data?.error?.status ??
      "unknown_error",
  };
}

async function requestYouTube(apiKey, type) {
  const endpoint =
    type === "playlists"
      ? "https://www.googleapis.com/youtube/v3/playlists"
      : "https://www.googleapis.com/youtube/v3/search";

  const params = new URLSearchParams({
    part: "snippet",
    channelId: CHANNEL_ID,
    maxResults: type === "playlists" ? "10" : "1",
    key: apiKey,
  });

  if (type === "playlists") {
    params.set("part", "snippet,contentDetails");
  } else {
    params.set("type", "video");
    params.set("eventType", "live");
  }

  const response = await fetch(`${endpoint}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });

  let data;
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      payload: upstreamErrorPayload(data, response.status),
    };
  }

  if (type === "playlists") {
    return {
      ok: true,
      payload: {
        items: (data.items ?? []).map((item) => {
          const thumbnails = item?.snippet?.thumbnails ?? {};
          const thumbnail =
            thumbnails.high ??
            thumbnails.medium ??
            thumbnails.default ??
            null;

          return {
            id: item.id,
            title: item?.snippet?.title ?? "YouTube lejátszási lista",
            thumbnailUrl: thumbnail?.url ?? "",
            itemCount: item?.contentDetails?.itemCount ?? null,
          };
        }),
      },
    };
  }

  return {
    ok: true,
    payload: {
      liveVideoId: data.items?.[0]?.id?.videoId ?? null,
    },
  };
}

export async function onRequestGet(context) {
  const { request, env, waitUntil } = context;
  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "playlists";

  if (type !== "playlists" && type !== "live") {
    return jsonResponse(
      { error: "invalid_type", allowed: ["playlists", "live"] },
      400
    );
  }

  if (!env.GOOGLE_API_KEY) {
    return jsonResponse({ error: "missing_google_api_key" }, 500);
  }

  const cacheSeconds = type === "playlists" ? 3600 : 180;
  const cacheUrl = new URL(request.url);
  cacheUrl.search = `?type=${type}`;
  const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const result = await requestYouTube(env.GOOGLE_API_KEY, type);

    if (!result.ok) {
      console.error("YouTube API error", result.payload);
      return jsonResponse(result.payload, 502);
    }

    const response = jsonResponse(result.payload, 200, cacheSeconds);
    waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    console.error("YouTube proxy error", error);
    return jsonResponse({ error: "youtube_proxy_failed" }, 502);
  }
}
