const CHANNELS = {
  paplovag: "UCUEDPQyLPN5lrTH06k2oWYA",
  tuzproba: "UCdw9t0aw4TED_GV-ffWCQMg"
};

function json(data, status = 200, sharedCacheSeconds = 0) {
  const cacheControl = sharedCacheSeconds
    ? `public, max-age=300, s-maxage=${sharedCacheSeconds}`
    : "no-store";

  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff"
    }
  });
}

async function getYouTubeJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" }
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    // The error is normalized below.
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
          reason
        },
        502
      )
    };
  }

  return { ok: true, data };
}

async function loadPlaylists(apiKey, channelId) {
  const params = new URLSearchParams({
    part: "snippet,contentDetails",
    channelId,
    maxResults: "10",
    key: apiKey
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
      title: playlist?.snippet?.title ?? "YouTube playlist",
      thumbnailUrl: thumbnail.url ?? "",
      itemCount: playlist?.contentDetails?.itemCount ?? null
    };
  });

  return json({ items }, 200, 21600);
}

async function loadLiveStatus(apiKey, channelId) {
  const params = new URLSearchParams({
    part: "snippet",
    channelId,
    type: "video",
    eventType: "live",
    maxResults: "1",
    key: apiKey
  });

  const result = await getYouTubeJson(
    `https://www.googleapis.com/youtube/v3/search?${params}`
  );

  if (!result.ok) return result.response;

  return json(
    {
      liveVideoId: result.data.items?.[0]?.id?.videoId ?? null
    },
    200,
    1800
  );
}

async function loadRecentVideos(apiKey, channelId) {
  const channelParams = new URLSearchParams({
    part: "contentDetails",
    id: channelId,
    key: apiKey
  });

  const channelResult = await getYouTubeJson(
    `https://www.googleapis.com/youtube/v3/channels?${channelParams}`
  );
  if (!channelResult.ok) return channelResult.response;

  const uploadsPlaylistId = channelResult.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) return json({ items: [] }, 200, 3600);

  const playlistParams = new URLSearchParams({
    part: "snippet,contentDetails",
    playlistId: uploadsPlaylistId,
    maxResults: "6",
    key: apiKey
  });

  const playlistResult = await getYouTubeJson(
    `https://www.googleapis.com/youtube/v3/playlistItems?${playlistParams}`
  );
  if (!playlistResult.ok) return playlistResult.response;

  const items = (playlistResult.data.items ?? []).map((item) => {
    const thumbnails = item?.snippet?.thumbnails ?? {};
    const thumbnail = thumbnails.maxres ?? thumbnails.standard ?? thumbnails.high ?? thumbnails.medium ?? thumbnails.default ?? {};
    return {
      id: item?.contentDetails?.videoId ?? item?.snippet?.resourceId?.videoId ?? null,
      title: item?.snippet?.title ?? "Tűzpróba video",
      thumbnailUrl: thumbnail.url ?? "",
      publishedAt: item?.contentDetails?.videoPublishedAt ?? item?.snippet?.publishedAt ?? null
    };
  }).filter((item) => item.id);

  return json({ items }, 200, 3600);
}

export async function onRequestGet(context) {
  const { request, env, waitUntil } = context;

  if (!env.GOOGLE_API_KEY) {
    console.error("Missing GOOGLE_API_KEY binding");
    return json({ error: "missing_google_api_key" }, 500);
  }

  const requestUrl = new URL(request.url);
  const type = requestUrl.searchParams.get("type") ?? "playlists";
  const channelName = requestUrl.searchParams.get("channel") ?? "paplovag";
  const channelId = CHANNELS[channelName];

  if (!channelId) {
    return json({ error: "invalid_channel", allowed: Object.keys(CHANNELS) }, 400);
  }

  if (!["playlists", "live", "recent"].includes(type)) {
    return json(
      {
        error: "invalid_type",
        allowed: ["playlists", "live", "recent"]
      },
      400
    );
  }

  const cacheUrl = new URL(requestUrl.origin + requestUrl.pathname);
  cacheUrl.searchParams.set("type", type);
  cacheUrl.searchParams.set("channel", channelName);
  const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    let response;
    if (type === "playlists") response = await loadPlaylists(env.GOOGLE_API_KEY, channelId);
    else if (type === "live") response = await loadLiveStatus(env.GOOGLE_API_KEY, channelId);
    else response = await loadRecentVideos(env.GOOGLE_API_KEY, channelId);

    if (response.ok) {
      waitUntil(cache.put(cacheKey, response.clone()));
    }

    return response;
  } catch (error) {
    console.error("YouTube proxy failure", error);
    return json({ error: "youtube_proxy_failed" }, 502);
  }
}
