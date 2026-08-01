const CHANNEL_ID = "UCUEDPQyLPN5lrTH06k2oWYA";

function json(data, status = 200, sharedCacheSeconds = 0) {
  const cacheControl = sharedCacheSeconds
    ? `public, max-age=300, s-maxage=${sharedCacheSeconds}`
    : "no-store";

  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function getYouTubeJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    // A hibát lent egységesen kezeljük.
  }

  if (!response.ok) {
    const reason =
      data?.error?.errors?.[0]?.reason ??
      data?.error?.status ??
      "unknown_error";

    console.error("YouTube API error", response.status, reason);

    return {
      ok: false,
      response: json(
        {
          error: "youtube_api_error",
          upstreamStatus: response.status,
          reason,
        },
        502
      ),
    };
  }

  return { ok: true, data };
}

async function loadPlaylists(apiKey) {
  const params = new URLSearchParams({
    part: "snippet,contentDetails",
    channelId: CHANNEL_ID,
    maxResults: "10",
    key: apiKey,
  });

  const result = await getYouTubeJson(
    `https://www.googleapis.com/youtube/v3/playlists?${params}`
  );

  if (!result.ok) return result.response;

  const items = (result.data.items ?? []).map((playlist) => {
    const thumbnails = playlist?.snippet?.thumbnails ?? {};
    const thumbnail =
      thumbnails.high ??
      thumbnails.medium ??
      thumbnails.default ??
      {};

    return {
      id: playlist.id,
      title: playlist?.snippet?.title ?? "YouTube lejátszási lista",
      thumbnailUrl: thumbnail.url ?? "",
      itemCount: playlist?.contentDetails?.itemCount ?? null,
    };
  });

  // A lejátszási listák ritkán változnak: 6 órás Cloudflare-cache.
  return json({ items }, 200, 21600);
}

async function loadLiveStatus(apiKey) {
  const params = new URLSearchParams({
    part: "snippet",
    channelId: CHANNEL_ID,
    type: "video",
    eventType: "live",
    maxResults: "1",
    key: apiKey,
  });

  const result = await getYouTubeJson(
    `https://www.googleapis.com/youtube/v3/search?${params}`
  );

  if (!result.ok) return result.response;

  return json(
    {
      liveVideoId: result.data.items?.[0]?.id?.videoId ?? null,
    },
    200,
    1800
  );
}

export async function onRequestGet(context) {
  const { request, env, waitUntil } = context;

  if (!env.GOOGLE_API_KEY) {
    console.error("Missing GOOGLE_API_KEY binding");
    return json({ error: "missing_google_api_key" }, 500);
  }

  const requestUrl = new URL(request.url);
  const type = requestUrl.searchParams.get("type") ?? "playlists";

  if (type !== "playlists" && type !== "live") {
    return json(
      {
        error: "invalid_type",
        allowed: ["playlists", "live"],
      },
      400
    );
  }

  // A cache-kulcsben nincs benne a Google API-kulcs.
  const cacheUrl = new URL(requestUrl.origin + requestUrl.pathname);
  cacheUrl.searchParams.set("type", type);
  const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const response =
      type === "playlists"
        ? await loadPlaylists(env.GOOGLE_API_KEY)
        : await loadLiveStatus(env.GOOGLE_API_KEY);

    if (response.ok) {
      waitUntil(cache.put(cacheKey, response.clone()));
    }

    return response;
  } catch (error) {
    console.error("YouTube proxy failure", error);
    return json({ error: "youtube_proxy_failed" }, 502);
  }
}
