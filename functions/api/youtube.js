const CHANNELS = {
  paplovag: "UCUEDPQyLPN5lrTH06k2oWYA",
  tuzproba: "UCdw9t0aw4TED_GV-ffWCQMg"
};

const CACHE_VERSION = "20260910-showcase-v6";

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
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  let data = {};
  try { data = await response.json(); } catch {}

  if (!response.ok) {
    const reason = data?.error?.errors?.[0]?.reason ?? data?.error?.status ?? "unknown_error";
    console.error("YouTube API error", response.status, reason);
    return {
      ok: false,
      response: json({ error: "youtube_api_error", upstreamStatus: response.status, reason }, 502)
    };
  }
  return { ok: true, data };
}

function parseIsoDurationSeconds(value) {
  const match = String(value || "").match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!match) return 0;
  return Number(match[1] || 0) * 86400 + Number(match[2] || 0) * 3600 + Number(match[3] || 0) * 60 + Number(match[4] || 0);
}

function pickThumbnail(thumbnails = {}) {
  return (thumbnails.maxres ?? thumbnails.standard ?? thumbnails.high ?? thumbnails.medium ?? thumbnails.default ?? {}).url ?? "";
}

function normalizeVideo(item) {
  return {
    id: item?.id ?? null,
    title: item?.snippet?.title ?? "YouTube video",
    thumbnailUrl: pickThumbnail(item?.snippet?.thumbnails),
    publishedAt: item?.snippet?.publishedAt ?? null,
    durationSeconds: parseIsoDurationSeconds(item?.contentDetails?.duration),
    viewCount: Number(item?.statistics?.viewCount || 0),
    hasLiveStreamingDetails: Boolean(item?.liveStreamingDetails),
    liveBroadcastContent: item?.snippet?.liveBroadcastContent ?? "none"
  };
}

function publishTimestamp(item) {
  const value = Date.parse(item?.publishedAt || "");
  return Number.isFinite(value) ? value : 0;
}

async function loadVideoDetails(apiKey, ids) {
  const uniqueIds = [...new Set((ids || []).filter(Boolean))];
  if (!uniqueIds.length) return { ok: true, items: [] };

  const output = [];
  for (let i = 0; i < uniqueIds.length; i += 50) {
    const params = new URLSearchParams({
      part: "snippet,contentDetails,statistics,status,liveStreamingDetails",
      id: uniqueIds.slice(i, i + 50).join(","),
      maxResults: "50",
      key: apiKey
    });
    const result = await getYouTubeJson(`https://www.googleapis.com/youtube/v3/videos?${params}`);
    if (!result.ok) return result;
    output.push(...(result.data.items ?? []));
  }
  return { ok: true, items: output };
}

async function getUploadsPlaylistId(apiKey, channelId) {
  const params = new URLSearchParams({ part: "contentDetails", id: channelId, key: apiKey });
  const result = await getYouTubeJson(`https://www.googleapis.com/youtube/v3/channels?${params}`);
  if (!result.ok) return result;
  return { ok: true, playlistId: result.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads ?? null };
}

async function loadPlaylists(apiKey, channelId) {
  const params = new URLSearchParams({ part: "snippet,contentDetails", channelId, maxResults: "10", key: apiKey });
  const result = await getYouTubeJson(`https://www.googleapis.com/youtube/v3/playlists?${params}`);
  if (!result.ok) return result.response;
  return json({
    items: (result.data.items ?? []).map((playlist) => ({
      id: playlist.id,
      title: playlist?.snippet?.title ?? "YouTube playlist",
      thumbnailUrl: pickThumbnail(playlist?.snippet?.thumbnails),
      itemCount: playlist?.contentDetails?.itemCount ?? null
    }))
  }, 200, 21600);
}

async function loadLiveStatus(apiKey, channelId) {
  const params = new URLSearchParams({ part: "snippet", channelId, type: "video", eventType: "live", maxResults: "1", key: apiKey });
  const result = await getYouTubeJson(`https://www.googleapis.com/youtube/v3/search?${params}`);
  if (!result.ok) return result.response;
  return json({ liveVideoId: result.data.items?.[0]?.id?.videoId ?? null }, 200, 1800);
}

async function loadRecentVideos(apiKey, channelId) {
  const uploadsResult = await getUploadsPlaylistId(apiKey, channelId);
  if (!uploadsResult.ok) return uploadsResult.response;
  if (!uploadsResult.playlistId) return json({ items: [] }, 200, 3600);

  const params = new URLSearchParams({ part: "snippet,contentDetails", playlistId: uploadsResult.playlistId, maxResults: "6", key: apiKey });
  const result = await getYouTubeJson(`https://www.googleapis.com/youtube/v3/playlistItems?${params}`);
  if (!result.ok) return result.response;

  return json({
    items: (result.data.items ?? []).map((item) => ({
      id: item?.contentDetails?.videoId ?? item?.snippet?.resourceId?.videoId ?? null,
      title: item?.snippet?.title ?? "YouTube video",
      thumbnailUrl: pickThumbnail(item?.snippet?.thumbnails),
      publishedAt: item?.contentDetails?.videoPublishedAt ?? item?.snippet?.publishedAt ?? null
    })).filter((item) => item.id)
  }, 200, 3600);
}

async function loadUploadsDetailed(apiKey, channelId, maxPages = 50) {
  const uploadsResult = await getUploadsPlaylistId(apiKey, channelId);
  if (!uploadsResult.ok) return uploadsResult;
  if (!uploadsResult.playlistId) return { ok: true, items: [], scannedIds: 0, fullyScanned: true };

  const ids = [];
  let pageToken = "";
  let fullyScanned = false;

  for (let page = 0; page < maxPages; page += 1) {
    const params = new URLSearchParams({ part: "contentDetails", playlistId: uploadsResult.playlistId, maxResults: "50", key: apiKey });
    if (pageToken) params.set("pageToken", pageToken);
    const result = await getYouTubeJson(`https://www.googleapis.com/youtube/v3/playlistItems?${params}`);
    if (!result.ok) return result;
    for (const item of result.data.items ?? []) {
      const id = item?.contentDetails?.videoId;
      if (id) ids.push(id);
    }
    pageToken = result.data.nextPageToken || "";
    if (!pageToken) { fullyScanned = true; break; }
  }

  const details = await loadVideoDetails(apiKey, ids);
  if (!details.ok) return details;
  const byId = new Map(details.items.map((item) => [item.id, item]));
  const items = ids.map((id) => byId.get(id)).filter(Boolean).filter((item) => item?.status?.privacyStatus === "public").map(normalizeVideo);
  return { ok: true, items, scannedIds: ids.length, fullyScanned };
}

async function loadRecentShowcaseCandidates(apiKey, channelId, maxPages = 4) {
  const uploadsResult = await getUploadsPlaylistId(apiKey, channelId);
  if (!uploadsResult.ok) return uploadsResult;
  if (!uploadsResult.playlistId) return { ok: true, items: [], scannedIds: 0 };

  const ids = [];
  let pageToken = "";
  for (let page = 0; page < maxPages; page += 1) {
    const params = new URLSearchParams({ part: "contentDetails", playlistId: uploadsResult.playlistId, maxResults: "50", key: apiKey });
    if (pageToken) params.set("pageToken", pageToken);
    const result = await getYouTubeJson(`https://www.googleapis.com/youtube/v3/playlistItems?${params}`);
    if (!result.ok) return result;
    for (const item of result.data.items ?? []) {
      const id = item?.contentDetails?.videoId;
      if (id) ids.push(id);
    }
    pageToken = result.data.nextPageToken || "";
    if (!pageToken) break;
  }

  const details = await loadVideoDetails(apiKey, ids);
  if (!details.ok) return details;
  const byId = new Map(details.items.map((item) => [item.id, item]));
  const now = Date.now();
  const items = ids
    .map((id) => byId.get(id))
    .filter(Boolean)
    .filter((item) => item?.status?.privacyStatus === "public")
    .map(normalizeVideo)
    .filter((item) => publishTimestamp(item) > 0 && publishTimestamp(item) <= now)
    .sort((a, b) => publishTimestamp(b) - publishTimestamp(a));
  return { ok: true, items, scannedIds: ids.length };
}

async function loadTopByViewCount(apiKey, channelId) {
  const params = new URLSearchParams({
    part: "snippet",
    channelId,
    type: "video",
    order: "viewCount",
    maxResults: "25",
    key: apiKey
  });
  const search = await getYouTubeJson(`https://www.googleapis.com/youtube/v3/search?${params}`);
  if (!search.ok) return search;
  const ids = (search.data.items ?? []).map((item) => item?.id?.videoId).filter(Boolean);
  const details = await loadVideoDetails(apiKey, ids);
  if (!details.ok) return details;
  const now = Date.now();
  const items = details.items
    .filter((item) => item?.status?.privacyStatus === "public")
    .map(normalizeVideo)
    .filter((item) => publishTimestamp(item) > 0 && publishTimestamp(item) <= now && item.viewCount > 0)
    .sort((a, b) => b.viewCount - a.viewCount);
  return { ok: true, items };
}

async function loadShowcaseFast(apiKey, channelId) {
  const [recentResult, topResult] = await Promise.all([
    loadRecentShowcaseCandidates(apiKey, channelId, 4),
    loadTopByViewCount(apiKey, channelId)
  ]);
  if (!recentResult.ok) return recentResult.response;
  if (!topResult.ok) return topResult.response;

  const shorts = recentResult.items
    .filter((item) => item.liveBroadcastContent === "none")
    .filter((item) => item.durationSeconds > 0 && item.durationSeconds <= 180)
    .slice(0, 5);

  const long = recentResult.items
    .filter((item) => item.liveBroadcastContent === "none")
    .filter((item) => item.durationSeconds > 180)
    .slice(0, 3);

  return json({
    shorts,
    top: topResult.items.slice(0, 3),
    long,
    shortRule: "recent_public_duration_lte_180_seconds_not_current_or_upcoming_live",
    longRule: "recent_public_duration_gt_180_seconds_not_current_or_upcoming_live",
    topRule: "youtube_search_order_viewCount_then_verified_with_video_statistics",
    scannedRecentUploads: recentResult.scannedIds,
    fastShowcase: true
  }, 200, 21600);
}

async function loadShowcase(apiKey, channelId) {
  const uploadsResult = await loadUploadsDetailed(apiKey, channelId);
  if (!uploadsResult.ok) return uploadsResult.response;
  const now = Date.now();
  const published = uploadsResult.items
    .filter((item) => publishTimestamp(item) > 0 && publishTimestamp(item) <= now)
    .sort((a, b) => publishTimestamp(b) - publishTimestamp(a));

  const shorts = published.filter((item) => item.liveBroadcastContent === "none").filter((item) => item.durationSeconds > 0 && item.durationSeconds <= 180).slice(0, 5);
  const long = published.filter((item) => item.liveBroadcastContent === "none").filter((item) => item.durationSeconds > 180).slice(0, 3);
  const top = [...published].filter((item) => item.viewCount > 0).sort((a, b) => b.viewCount - a.viewCount).slice(0, 3);

  return json({
    shorts,
    top,
    long,
    shortRule: "published_duration_lte_180_seconds_not_current_or_upcoming_live",
    longRule: "published_duration_gt_180_seconds_not_current_or_upcoming_live_sorted_by_published_at",
    topRule: "all_public_published_uploads_sorted_by_view_count",
    scannedUploads: uploadsResult.scannedIds,
    fullyScanned: uploadsResult.fullyScanned
  }, 200, 21600);
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
  if (!channelId) return json({ error: "invalid_channel", allowed: Object.keys(CHANNELS) }, 400);
  if (!["playlists", "live", "recent", "showcase"].includes(type)) return json({ error: "invalid_type", allowed: ["playlists", "live", "recent", "showcase"] }, 400);

  const cacheUrl = new URL(requestUrl.origin + requestUrl.pathname);
  cacheUrl.searchParams.set("type", type);
  cacheUrl.searchParams.set("channel", channelName);
  cacheUrl.searchParams.set("cache", CACHE_VERSION);
  const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    let response;
    if (type === "playlists") response = await loadPlaylists(env.GOOGLE_API_KEY, channelId);
    else if (type === "live") response = await loadLiveStatus(env.GOOGLE_API_KEY, channelId);
    else if (type === "recent") response = await loadRecentVideos(env.GOOGLE_API_KEY, channelId);
    else if (channelName === "paplovag") response = await loadShowcaseFast(env.GOOGLE_API_KEY, channelId);
    else response = await loadShowcase(env.GOOGLE_API_KEY, channelId);

    if (response.ok) waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    console.error("YouTube proxy failure", error);
    return json({ error: "youtube_proxy_failed" }, 502);
  }
}
