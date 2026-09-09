const TARGET_URL = "https://paplovag.hu/api/youtube-analytics-refresh";
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

async function runRefresh(env) {
  if (!env.MEDIA_KIT_CRON_SECRET) throw new Error("MEDIA_KIT_CRON_SECRET is not configured");

  const response = await fetch(TARGET_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.MEDIA_KIT_CRON_SECRET}`,
      Accept: "application/json"
    }
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`Media Kit refresh failed: HTTP ${response.status} ${text.slice(0, 300)}`);
  return text;
}

export default {
  async scheduled(controller, env, ctx) {
    const at = new Date(controller.scheduledTime || Date.now());
    const local = budapestTime(at);
    if (local.hour !== 0 || local.minute !== 1) return;
    ctx.waitUntil(runRefresh(env));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, schedule: "1 * * * *", timeZone: TIME_ZONE }), {
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    }
    return new Response("Not found", { status: 404 });
  }
};
