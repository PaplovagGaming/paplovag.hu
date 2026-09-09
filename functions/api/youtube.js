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

function parseIsoDurationSeconds(value) {
  const match = String(value || "").match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!match) return 0;
  const days = Number(match[1] || 0);
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  const seconds = Number(match[4] || 0);
  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

function pickThumbnail(thumbnails = {}) {
  return (
    thumbnails.maxres ??
    thumbnails.standard ??
    thumbnails.high ??
    thumbnails.medium ??
    thumbnails.default ??
    {}
  ).url ?? "";
}

function normalizeVideo(item) {
  return {
    id: item?.id ?? null,
    title: item?.snippet?.title ?? "Tűzpróba video",
    thumbnailUrl: pickThumbnail(item?.snippet?.thumbnails),
    publishedAt: item?.snippet?.publishedAt ?? null,
    durationSeconds: parseIsoDurationSeconds(item?.contentDetails?.duration),
    viewCount: Number(item?.statistics?.viewCount || 0)
  };
}

async function loadVideoDetails(apiKey, ids) {
  const uniqueIds = [...new Set((ids || []).filter(Boolean))];
  if (!uniqueIds.length) return { ok: true, items: [] };

  const output = [];
  for (let i = 0; i < uniqueIds.length; i += 50) {
    const chunk = uniqueIds.slice(i, i + 50);
    const params = new URLSearchParams({
      part: "snippet,contentDetails,statistics,status,liveStreamingDetails",
      id: chunk.join(","),
      maxResults: "50",
      key: apiKey
    });
    const result = await getYouTubeJson(
      `https://www.googleapis.com/youtube/v3/videos?${params}`
    );
    if (!result.ok) return result;
    output.push(...(result.data.items ?? []));
  }

  return { ok: true, items: output };
}

async function getUploadsPlaylistId(apiKey, channelId) {
  const params = new URLSearchParams({
    part: "contentDetails",
    id: channelId,
    key: apiKey
  });
  const result = await getYouTubeJson(
    `https://www.googleapis.com/youtube/v3/channels?${params}`
  );
  if (!result.ok) return result;

  return {
    ok: true,
    playlistId: result.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads ?? null
  };
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

  const items = (result.data.items ?? []).map((playlist) => ({
    id: playlist.id,
    title: playlist?.snippet?.title ?? "YouTube playlist",
    thumbnailUrl: pickThumbnail(playlist?.snippet?.thumbnails),
    itemCount: playlist?.contentDetails?.itemCount ?? null
  }));

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
  const uploadsResult = await getUploadsPlaylistId(apiKey, channelId);
  if (!uploadsResult.ok) return uploadsResult.response;
  if (!uploadsResult.playlistId) return json({ items: [] }, 200, 3600);

  const playlistParams = new URLSearchParams({
    part: "snippet,contentDetails",
    playlistId: uploadsResult.playlistId,
    maxResults: "6",
    key: apiKey
  });

  const playlistResult = await getYouTubeJson(
    `https://www.googleapis.com/youtube/v3/playlistItems?${playlistParams}`
  );
  if (!playlistResult.ok) return playlistResult.response;

  const items = (playlistResult.data.items ?? []).map((item) => ({
    id: item?.contentDetails?.videoId ?? item?.snippet?.resourceId?.videoId ?? null,
    title: item?.snippet?.title ?? "Tűzpróba video",
    thumbnailUrl: pickThumbnail(item?.snippet?.thumbnails),
    publishedAt: item?.contentDetails?.videoPublishedAt ?? item?.snippet?.publishedAt ?? null
  })).filter((item) => item.id);

  return json({ items }, 200, 3600);
}

async function loadRecentUploadsDetailed(apiKey, channelId) {
  const uploadsResult = await getUploadsPlaylistId(apiKey, channelId);
  if (!uploadsResult.ok) return uploadsResult;
  if (!uploadsResult.playlistId) return { ok: true, items: [] };

  const orderedIds = [];
  let pageToken = "";

  for (let page = 0; page < 3; page += 1) {
    const params = new URLSearchParams({
      part: "contentDetails",
      playlistId: uploadsResult.playlistId,
      maxResults: "50",
      key: apiKey
    });
    if (pageToken) params.set("pageToken", pageToken);

    const result = await getYouTubeJson(
      `https://www.googleapis.com/youtube/v3/playlistItems?${params}`
    );
    if (!result.ok) return result;

    for (const item of result.data.items ?? []) {
      const id = item?.contentDetails?.videoId;
      if (id) orderedIds.push(id);
    }

    pageToken = result.data.nextPageToken || "";
    if (!pageToken) break;
  }

  const detailsResult = await loadVideoDetails(apiKey, orderedIds);
  if (!detailsResult.ok) return detailsResult;

  const detailsById = new Map(detailsResult.items.map((item) => [item.id, item]));
  const items = orderedIds
    .map((id) => detailsById.get(id))
    .filter(Boolean)
    .filter((item) => item?.status?.privacyStatus === "public")
    .filter((item) => !item?.liveStreamingDetails)
    .map(normalizeVideo);

  return { ok: true, items };
}

async function loadTopVideos(apiKey, channelId) {
  const searchParams = new URLSearchParams({
    part: "snippet",
    channelId,
    type: "video",
    order: "viewCount",
    maxResults: "12",
    key: apiKey
  });
  const searchResult = await getYouTubeJson(
    `https://www.googleapis.com/youtube/v3/search?${searchParams}`
  );
  if (!searchResult.ok) return searchResult;

  const ids = (searchResult.data.items ?? [])
    .map((item) => item?.id?.videoId)
    .filter(Boolean);
  const detailsResult = await loadVideoDetails(apiKey, ids);
  if (!detailsResult.ok) return detailsResult;

  const items = detailsResult.items
    .filter((item) => item?.status?.privacyStatus === "public")
    .filter((item) => !item?.liveStreamingDetails)
    .map(normalizeVideo)
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, 3);

  return { ok: true, items };
}

async function loadShowcase(apiKey, channelId) {
  const [recentResult, topResult] = await Promise.all([
    loadRecentUploadsDetailed(apiKey, channelId),
    loadTopVideos(apiKey, channelId)
  ]);

  if (!recentResult.ok) return recentResult.response;
  if (!topResult.ok) return topResult.response;

  const shorts = recentResult.items
    .filter((item) => item.durationSeconds > 0 && item.durationSeconds <= 180)
    .slice(0, 3);

  const long = recentResult.items
    .filter((item) => item.durationSeconds > 180)
    .slice(0, 3);

  return json(
    {
      shorts,
      top: topResult.items,
      long,
      shortRule: "duration_lte_180_seconds"
    },
    200,
    21600
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
  const channelName = requestUrl.searchParams.get("channel") ?? "paplovag";
  const channelId = CHANNELS[channelName];

  if (!channelId) {
    return json({ error: "invalid_channel", allowed: Object.keys(CHANNELS) }, 400);
  }

  if (!["playlists", "live", "recent", "showcase"].includes(type)) {
    return json(
      {
        error: "invalid_type",
        allowed: ["playlists", "live", "recent", "showcase"]
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
    else if (type === "recent") response = await loadRecentVideos(env.GOOGLE_API_KEY, channelId);
    else response = await loadShowcase(env.GOOGLE_API_KEY, channelId);

    if (response.ok) {
      waitUntil(cache.put(cacheKey, response.clone()));
    }

    return response;
  } catch (error) {
    console.error("YouTube proxy failure", error);
    return json({ error: "youtube_proxy_failed" }, 502);
  }
}
