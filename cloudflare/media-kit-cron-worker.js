const TARGETS = [
  { name: "tuzproba", url: "https://paplovag.hu/api/youtube-analytics-refresh" },
  { name: "paplovag", url: "https://paplovag.hu/api/paplovag-youtube-analytics-refresh" }
];
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
    headers: {
      Authorization: `Bearer ${env.MEDIA_KIT_CRON_SECRET}`,
      Accept: "application/json"
    }
  });
  const text = await response.text();
  return {
    name: target.name,
    ok: response.ok,
    status: response.status,
    body: text.slice(0, 300)
  };
}

async function runRefreshes(env) {
  if (!env.MEDIA_KIT_CRON_SECRET) throw new Error("MEDIA_KIT_CRON_SECRET is not configured");
  const results = [];
  for (const target of TARGETS) {
    results.push(await refreshOne(env, target));
  }
  const failed = results.filter((result) => !result.ok);
  if (failed.length) console.error("Media Kit refresh failures", failed);
  return results;
}

export default {
  async scheduled(controller, env, ctx) {
    const at = new Date(controller.scheduledTime || Date.now());
    const local = budapestTime(at);
    if (local.hour !== 0 || local.minute !== 1) return;
    ctx.waitUntil(runRefreshes(env));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({
        ok: true,
        schedule: "1 * * * *",
        timeZone: TIME_ZONE,
        targets: TARGETS.map((target) => target.name)
      }), {
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    }
    return new Response("Not found", { status: 404 });
  }
};
