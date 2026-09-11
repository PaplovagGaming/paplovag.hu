const TARGETS = [
  { name: "tuzproba", url: "https://paplovag.hu/api/youtube-analytics-refresh" },
  { name: "paplovag", url: "https://paplovag.hu/api/paplovag-youtube-analytics-refresh" }
];
const VIDEO_TARGETS = ["shorts", "top", "tech", "gaming"].map(section => ({ name: "paplovag-" + section, url: "https://paplovag.hu/api/paplovag-showcase?section=" + section }));
const TIME_ZONE = "Europe/Budapest";

function budapestTime(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { hour: Number(values.hour), minute: Number(values.minute) };
}

async function refreshOne(env, target) {
  const response = await fetch(target.url, {
    method: "POST",
    signal: AbortSignal.timeout(120000),
    headers: {
      Authorization: `Bearer ${env.MEDIA_KIT_CRON_SECRET}`,
      Accept: "application/json"
    }
  });
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch {}
  const reach = payload?.data?.youtubeReachSync;
  const reachFailed = ["error", "api_unavailable", "report_type_unavailable", "rate_limited"].includes(reach?.status);
  return {
    name: target.name,
    ok: response.ok && payload?.ok === true && !reachFailed,
    status: response.status,
    lastSuccessAt: payload?.data?.youtubeSync?.lastSuccessAt || null,
    reachStatus: reach?.status || null,
    daysCached: reach?.daysCached ?? null,
    error: reach?.error || payload?.message || payload?.error || (!payload ? text.slice(0, 300) : null)
  };
}

async function runRefreshes(env, targets = TARGETS) {
  if (!env.MEDIA_KIT_CRON_SECRET) throw new Error("MEDIA_KIT_CRON_SECRET is not configured");
  const results = [];
  for (const target of targets) {
    try {
      results.push(await refreshOne(env, target));
    } catch (error) {
      results.push({ name: target.name, ok: false, error: error.message });
    }
  }
  console.log("Media Kit refresh results", JSON.stringify(results));
  const failed = results.filter((result) => !result.ok);
  if (failed.length) console.error("Media Kit refresh failures", failed);
  return results;
}

export default {
  async scheduled(controller, env, ctx) {
    const at = new Date(controller.scheduledTime || Date.now());
    const local = budapestTime(at);
    if (local.minute !== 1) return;
    const targets = local.hour === 0 ? [...TARGETS, ...VIDEO_TARGETS] : VIDEO_TARGETS;
    ctx.waitUntil(runRefreshes(env, targets).then(results => {
      if (results.some(result => !result.ok)) throw new Error("Media Kit refresh failed: " + JSON.stringify(results));
    }));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({
        ok: true,
        schedule: "1 * * * *",
        timeZone: TIME_ZONE,
        targets: TARGETS.map((target) => target.name),
        hourlyVideoTargets: VIDEO_TARGETS.map(target => target.name)
      }), {
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    }
    return new Response("Not found", { status: 404 });
  }
};
