const DATA_KEY = "paplovag-media-kit";
const TOKEN_KEY = "paplovag-youtube-oauth-refresh-token";
const REACH_HISTORY_KEY = "paplovag-youtube-reach-history";
const ADMIN_COOKIE = "pg_media_admin_session";
const TARGET_CHANNEL_ID = "UCUEDPQyLPN5lrTH06k2oWYA";
const TIME_ZONE = "Europe/Budapest";
const REACH_REPORT_TYPE_IDS = ["channel_reach_basic_a1", "channel_reach_combined_a1"];
const REACH_JOB_NAME = "Paplovag Gaming Media Kit Reach";
const REACH_BATCH_SIZE = 30;
const REACH_HISTORY_DAYS = 180;
const REACH_WINDOW_DAYS = 90;

const DEFAULT_DATA = {
  version: 1,
  updatedAt: "",
  stats: {
    subscribers: 0,
    views28d: 0,
    views90d: 0,
    watchHours90d: 0,
    impressions90d: 0,
    ctr: 0,
    avgViewDuration: "",
    subscriberGrowth90d: 0
  },
  audience: {
    coreAgeLabel: "",
    coreAgeShare: 0,
    male: 0,
    female: 0,
    countries: []
  },
  contact: {
    email: "paplovaggaming@gmail.com",
    channelUrl: `https://www.youtube.com/channel/${TARGET_CHANNEL_ID}`
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Referrer-Policy": "no-referrer"
    }
  });
}

function storage(env) {
  return env.MEDIA_KIT_KV || env.KV || null;
}

function adminSecret(env) {
  return env.PAPLOVAG_MEDIA_KIT_ADMIN_PASSWORD || env.MEDIA_KIT_ADMIN_PASSWORD || "";
}

function parseCookies(request) {
  const result = {};
  const raw = request.headers.get("Cookie") || "";
  for (const item of raw.split(";")) {
    const [name, ...rest] = item.trim().split("=");
    if (!name) continue;
    try {
      result[name] = decodeURIComponent(rest.join("="));
    } catch {
      result[name] = rest.join("=");
    }
  }
  return result;
}

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64urlText(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function decodeBase64urlBytes(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64url(new Uint8Array(signature));
}

async function verifySession(token, secret) {
  if (!token || !secret) return false;
  const [encoded, signature] = String(token).split(".");
  if (!encoded || !signature) return false;
  const expected = await hmac(encoded, secret);
  if (signature.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < signature.length; i += 1) {
    mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (mismatch !== 0) return false;
  try {
    return Number(JSON.parse(decodeBase64urlText(encoded)).exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function secureEqual(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (!left || !right || left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return mismatch === 0;
}

async function isAuthorized(request, env) {
  const adminOk = await verifySession(parseCookies(request)[ADMIN_COOKIE], adminSecret(env));
  if (adminOk) return "admin";
  const authorization = request.headers.get("Authorization") || "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (env.MEDIA_KIT_CRON_SECRET && secureEqual(bearer, env.MEDIA_KIT_CRON_SECRET)) return "cron";
  return null;
}

function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}

async function encryptionKey(secret) {
  const material = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`paplovag-youtube-oauth:${secret}`)
  );
  return crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, ["decrypt"]);
}

async function decryptRefreshToken(record, secret) {
  if (!record?.iv || !record?.ciphertext || !secret) throw new Error("oauth_token_unavailable");
  const key = await encryptionKey(secret);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64urlBytes(record.iv) },
    key,
    decodeBase64urlBytes(record.ciphertext)
  );
  return new TextDecoder().decode(decrypted);
}

async function getAccessToken(env, refreshToken) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    signal: AbortSignal.timeout(20000),
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: env.YOUTUBE_OAUTH_CLIENT_ID,
      client_secret: env.YOUTUBE_OAUTH_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });
  let payload = {};
  try { payload = await response.json(); } catch {}
  if (!response.ok || !payload.access_token) {
    const error = new Error(payload.error_description || payload.error?.message || payload.error || "Google returned no access token");
    error.code = "oauth_refresh_failed";
    error.status = response.status;
    error.reason = typeof payload.error === "string" ? payload.error : "oauth_refresh_failed";
    throw error;
  }
  return payload.access_token;
}

async function googleJson(url, accessToken, init = {}) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(20000),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(init.headers || {})
    }
  });
  let payload = {};
  try { payload = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `Google API HTTP ${response.status}`);
    error.status = response.status;
    error.reason = payload?.error?.status || payload?.error?.errors?.[0]?.reason || "google_api_error";
    throw error;
  }
  return payload;
}

async function googleText(url, accessToken) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "text/csv,text/plain,*/*" }
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const error = new Error(`YouTube report download HTTP ${response.status}: ${body.slice(0, 160)}`);
    error.status = response.status;
    throw error;
  }
  return response.text();
}

function localDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDate(dateString, days) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function reportObjects(report) {
  const names = (report?.columnHeaders || []).map((header) => header.name);
  return (report?.rows || []).map((row) =>
    Object.fromEntries(names.map((name, index) => [name, row[index]]))
  );
}

async function analyticsQuery(accessToken, options) {
  const params = new URLSearchParams({
    ids: "channel==MINE",
    startDate: options.startDate,
    endDate: options.endDate,
    metrics: options.metrics
  });
  if (options.dimensions) params.set("dimensions", options.dimensions);
  if (options.sort) params.set("sort", options.sort);
  if (options.maxResults) params.set("maxResults", String(options.maxResults));
  return googleJson(`https://youtubeanalytics.googleapis.com/v2/reports?${params}`, accessToken);
}

function secondsToDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function countryName(code) {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(String(code || "").toUpperCase()) || code;
  } catch {
    return code;
  }
}

async function loadStoredData(kv) {
  try {
    return (await kv.get(DATA_KEY, "json")) || structuredClone(DEFAULT_DATA);
  } catch {
    return structuredClone(DEFAULT_DATA);
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const input = String(text || "").replace(/^\uFEFF/, "");

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    if (row.some((value) => value !== "")) rows.push(row);
  }
  if (!rows.length) return [];

  const headers = rows.shift().map((value) => value.trim());
  return rows.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))
  );
}

function normalizeReportDate(value) {
  const raw = String(value || "").trim();
  const date = /^\d{8}$/.test(raw) ? raw.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3") : raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid reach report date: " + raw);
  const parsed = new Date(date + "T12:00:00Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error("Invalid reach report date: " + raw);
  return date;
}

function aggregateReachCsv(text, fallbackDate) {
  const required = ["date", "channel_id", "video_thumbnail_impressions", "video_thumbnail_impressions_ctr"];
  const headers = String(text).replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0].split(",").map(v => v.trim().replace(/^"|"$/g, ""));
  if (!required.every(key => headers.includes(key))) throw new Error("Reach CSV is missing required columns");
  const rows = parseCsv(text);
  const daily = {};
  for (const row of rows) {
    if (row.channel_id !== TARGET_CHANNEL_ID) throw new Error("Reach CSV belongs to a different YouTube channel");
    const date = normalizeReportDate(row.date || fallbackDate);
    if (date !== normalizeReportDate(fallbackDate)) throw new Error("Reach CSV date does not match report day");
    const impressions = Number(row.video_thumbnail_impressions);
    // Reporting API defines CTR as a percentage, including values below 1%.
    const ctr = Number(row.video_thumbnail_impressions_ctr);
    if (!row.video_thumbnail_impressions.trim() || !Number.isFinite(impressions) || impressions < 0 || !Number.isFinite(ctr) || ctr < 0 || ctr > 100 || (impressions > 0 && !row.video_thumbnail_impressions_ctr.trim())) throw new Error("Invalid reach CSV metrics");
    if (!daily[date]) daily[date] = { impressions: 0, ctrWeighted: 0 };
    daily[date].impressions += impressions;
    daily[date].ctrWeighted += impressions * ctr;
  }
  // A valid header-only daily report means zero activity, not a missing day.
  if (!rows.length) daily[normalizeReportDate(fallbackDate)] = { impressions: 0, ctrWeighted: 0 };
  return daily;
}

async function reportingList(accessToken, resource, key, maxPages = 4) {
  const items = [];
  let pageToken = "";
  for (let page = 0; page < maxPages; page += 1) {
    const params = new URLSearchParams({ pageSize: "100" });
    if (key !== "reports") params.set("includeSystemManaged", "true");
    if (pageToken) params.set("pageToken", pageToken);
    const payload = await googleJson("https://youtubereporting.googleapis.com/v1/" + resource + "?" + params, accessToken);
    items.push(...(payload[key] || []));
    pageToken = payload.nextPageToken || "";
    if (!pageToken) return items;
  }
  throw new Error("Reporting API pagination limit exceeded for " + key);
}

const listJobs = token => reportingList(token, "jobs", "jobs", 3);
const listReportTypes = token => reportingList(token, "reportTypes", "reportTypes", 3);

async function ensureReachJob(accessToken) {
  const jobs = await listJobs(accessToken);
  const existing = jobs.find((job) => REACH_REPORT_TYPE_IDS.includes(job.reportTypeId) && !job.expireTime);
  if (existing) return { job: existing, created: false, reportTypeId: existing.reportTypeId };

  const reportTypes = await listReportTypes(accessToken);
  const selected = REACH_REPORT_TYPE_IDS
    .map((id) => reportTypes.find((reportType) => reportType.id === id))
    .find(Boolean);

  if (!selected) {
    const error = new Error("No supported reach report type is available for this channel.");
    error.code = "reach_report_type_unavailable";
    throw error;
  }

  if (selected.systemManaged) {
    const error = new Error("Reach report is system-managed, but no matching job is available yet.");
    error.code = "reach_system_job_unavailable";
    throw error;
  }

  let job;
  try {
    job = await googleJson("https://youtubereporting.googleapis.com/v1/jobs", accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reportTypeId: selected.id, name: REACH_JOB_NAME })
  });
  } catch (error) {
    if (error.status === 409) {
      job = (await listJobs(accessToken)).find(item => item.reportTypeId === selected.id && !item.expireTime);
      if (job) return { job, created: false, reportTypeId: selected.id };
    }
    throw error;
  }
  return { job, created: true, reportTypeId: selected.id };
}

async function listReports(accessToken, jobId, analyticsEndDate) {
  const reports = await reportingList(accessToken, `jobs/${encodeURIComponent(jobId)}/reports`, "reports");
  const minDate = shiftDate(analyticsEndDate, -(REACH_HISTORY_DAYS - 1));
  const newestByDate = new Map();
  for (const report of reports) {
    const date = String(report.startTime || "").slice(0, 10);
    if (!date || date < minDate || date > analyticsEndDate) continue;
    const previous = newestByDate.get(date);
    if (!previous || String(report.createTime || "") > String(previous.createTime || "")) {
      newestByDate.set(date, report);
    }
  }
  return [...newestByDate.values()].sort((a, b) =>
    String(b.startTime || "").localeCompare(String(a.startTime || ""))
  );
}

async function loadReachHistory(kv) {
  try {
    const history = await kv.get(REACH_HISTORY_KEY, "json");
    if (history?.days && typeof history.days === "object") return history;
  } catch {}
  return { version: 1, days: {} };
}

function pruneHistory(history, endDate) {
  const minDate = shiftDate(endDate, -(REACH_HISTORY_DAYS - 1));
  for (const date of Object.keys(history.days || {})) {
    if (date < minDate || date > endDate) delete history.days[date];
  }
}

async function processReports(accessToken, reports, history, kv) {
  const pending = reports
    .filter((report) => {
      const date = String(report.startTime || "").slice(0, 10);
      return date && (history.days?.[date]?.reportId !== report.id || history.days?.[date]?.parserVersion !== 2);
    })
    .slice(0, REACH_BATCH_SIZE);

  let processed = 0;
  for (const report of pending) {
    const fallbackDate = String(report.startTime || "").slice(0, 10);
    let daily;
    try {
      daily = aggregateReachCsv(await googleText(report.downloadUrl, accessToken), fallbackDate);
    } catch (error) {
      error.reportsProcessedThisRun = processed;
      if (processed) await kv.put(REACH_HISTORY_KEY, JSON.stringify(history));
      throw error;
    }
    for (const [date, values] of Object.entries(daily)) {
      history.days[date] = {
        impressions: Math.round(Number(values.impressions) || 0),
        ctrWeighted: Number(values.ctrWeighted) || 0,
        parserVersion: 2,
        reportId: report.id || "",
        reportCreateTime: report.createTime || "",
        syncedAt: new Date().toISOString()
      };
    }
    processed += 1;
    history.updatedAt = new Date().toISOString();
  }
  return processed;
}

function findReachWindow(history, analyticsEndDate) {
  for (let lag = 0; lag <= 30; lag += 1) {
    const endDate = shiftDate(analyticsEndDate, -lag);
    const startDate = shiftDate(endDate, -(REACH_WINDOW_DAYS - 1));
    const days = [];
    let complete = true;
    for (let i = 0; i < REACH_WINDOW_DAYS; i += 1) {
      const item = history.days?.[shiftDate(startDate, i)];
      if (!item || item.parserVersion !== 2) {
        complete = false;
        break;
      }
      days.push(item);
    }
    if (!complete) continue;
    const impressions = days.reduce((sum, day) => sum + (Number(day.impressions) || 0), 0);
    const weighted = days.reduce((sum, day) => sum + (Number(day.ctrWeighted) || 0), 0);
    return {
      startDate,
      endDate,
      impressions: Math.round(impressions),
      ctr: impressions > 0 ? round(weighted / impressions, 2) : 0
    };
  }
  return null;
}

function classifyReachError(error) {
  const message = String(error?.message || "").toLowerCase();
  if (error?.status === 429) return "rate_limited";
  if (message.includes("not been used") || message.includes("service_disabled") || message.includes("is disabled")) {
    return "api_unavailable";
  }
  if (error?.code === "reach_report_type_unavailable") return "report_type_unavailable";
  return "error";
}

export function applyAvailableReach(data, history, endDate) {
  if (!history?.days) return data;
  let window = findReachWindow(history, endDate);
  if (window) window.windowDays = 90;
  else {
    const dates = Object.keys(history.days).filter(date => date <= endDate && date >= shiftDate(endDate, -179) && history.days[date]?.parserVersion === 2).sort().reverse();
    if (!dates.length) return data;
    const latest = dates[0];
    let impressions = 0, weighted = 0, count = 0;
    for (let i = 0; i < 90; i += 1) {
      const day = history.days[shiftDate(latest, -i)];
      if (!day || day.parserVersion !== 2) break;
      impressions += Number(day.impressions) || 0;
      weighted += Number(day.ctrWeighted) || 0;
      count += 1;
    }
    window = { startDate: shiftDate(latest, -(count - 1)), endDate: latest, windowDays: count, impressions: Math.round(impressions), ctr: impressions ? round(weighted / impressions, 2) : 0 };
  }
  // Legacy field name retained for existing clients; windowDays defines its period.
  data.stats = { ...data.stats, impressions90d: window.impressions, ctr: window.ctr };
  data.youtubeReachSync = { ...data.youtubeReachSync, startDate: window.startDate, endDate: window.endDate, windowDays: window.windowDays };
  return data;
}

async function syncReach({ accessToken, kv, analyticsEndDate, stats }) {
  const attemptedAt = new Date().toISOString();
  const history = await loadReachHistory(kv);
  pruneHistory(history, analyticsEndDate);
  const cachedDays = () => Object.values(history.days).filter(day => day.parserVersion === 2).length;
  const finish = result => {
    const available = applyAvailableReach({ stats, youtubeReachSync: result }, history, analyticsEndDate);
    Object.assign(stats, available.stats);
    return available.youtubeReachSync;
  };
  let jobInfo = {};
  try {
    const { job, created, reportTypeId } = await ensureReachJob(accessToken);
    if (!job?.id) throw new Error("reach_job_missing_id");
    jobInfo = { jobId: job.id, reportTypeId };
    history.jobId = job.id;
    history.reportTypeId = reportTypeId;

    if (created) {
      await kv.put(REACH_HISTORY_KEY, JSON.stringify(history));
      return finish({ status: "job_created", jobId: job.id, reportTypeId, lastAttemptAt: attemptedAt, reportsProcessedThisRun: 0, daysCached: cachedDays() });
    }

    const reports = await listReports(accessToken, job.id, analyticsEndDate);
    if (!reports.length) {
      return finish({ status: "waiting_for_reports", jobId: job.id, reportTypeId, lastAttemptAt: attemptedAt, reportsProcessedThisRun: 0, daysCached: cachedDays() });
    }

    const processed = await processReports(accessToken, reports, history, kv);
    pruneHistory(history, analyticsEndDate);
    history.version = 1;
    history.updatedAt = new Date().toISOString();
    await kv.put(REACH_HISTORY_KEY, JSON.stringify(history));

    const window = findReachWindow(history, analyticsEndDate);
    const daysCached = cachedDays();
    if (window) {
      stats.impressions90d = window.impressions;
      stats.ctr = window.ctr;
      return finish({ status: "ready", jobId: job.id, reportTypeId, lastAttemptAt: attemptedAt, lastSuccessAt: new Date().toISOString(), startDate: window.startDate, endDate: window.endDate, reportsProcessedThisRun: processed, daysCached });
    }

    return finish({ status: processed > 0 ? "backfilling" : "waiting_for_reports", jobId: job.id, reportTypeId, lastAttemptAt: attemptedAt, reportsProcessedThisRun: processed, daysCached });
  } catch (error) {
    return finish({
      status: classifyReachError(error),
      lastAttemptAt: attemptedAt,
      ...jobInfo,
      reportsProcessedThisRun: error.reportsProcessedThisRun || 0,
      daysCached: cachedDays(),
      errorCode: String(error.code || error.reason || "reach_reporting_error"),
      errorStatus: Number(error.status) || null,
      error: String(error.message || error.reason || "reach_reporting_error").slice(0, 240)
    });
  }
}

async function refreshMediaKit(env) {
  const secret = adminSecret(env);
  if (!env.YOUTUBE_OAUTH_CLIENT_ID || !env.YOUTUBE_OAUTH_CLIENT_SECRET || !secret) throw new Error("oauth_secrets_missing");
  const kv = storage(env);
  if (!kv) throw new Error("storage_not_configured");
  const storedToken = await kv.get(TOKEN_KEY, "json");
  if (!storedToken) throw new Error("oauth_not_connected");

  const refreshToken = await decryptRefreshToken(storedToken, secret);
  const accessToken = await getAccessToken(env, refreshToken);
  const current = await loadStoredData(kv);
  const todayLocal = localDateString();
  const endDate = shiftDate(todayLocal, -1);
  const start28 = shiftDate(endDate, -27);
  const start90 = shiftDate(endDate, -89);

  const channelPayload = await googleJson(
    "https://www.googleapis.com/youtube/v3/channels?part=id,statistics&mine=true&maxResults=50",
    accessToken
  );
  const targetChannel = (channelPayload.items || []).find((item) => item.id === TARGET_CHANNEL_ID);
  if (!targetChannel) throw new Error("wrong_youtube_channel");

  const [report28, report90] = await Promise.all([
    analyticsQuery(accessToken, { startDate: start28, endDate, metrics: "views" }),
    analyticsQuery(accessToken, { startDate: start90, endDate, metrics: "views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost" })
  ]);
  const row28 = reportObjects(report28)[0];
  const row90 = reportObjects(report90)[0];
  if (!row28 || !row90) throw new Error("analytics_core_data_unavailable");

  const warnings = [];
  const next = structuredClone(current || DEFAULT_DATA);
  next.version = 1;
  next.updatedAt = todayLocal;
  next.stats = { ...(current?.stats || DEFAULT_DATA.stats) };
  next.audience = { ...(current?.audience || DEFAULT_DATA.audience) };
  next.contact = { ...(current?.contact || DEFAULT_DATA.contact) };

  const subscriberCount = Number(targetChannel?.statistics?.subscriberCount);
  if (Number.isFinite(subscriberCount)) next.stats.subscribers = Math.round(subscriberCount);
  next.stats.views28d = Math.round(Number(row28.views) || 0);
  next.stats.views90d = Math.round(Number(row90.views) || 0);
  next.stats.watchHours90d = Math.round((Number(row90.estimatedMinutesWatched) || 0) / 60);
  next.stats.avgViewDuration = secondsToDuration(row90.averageViewDuration);
  next.stats.subscriberGrowth90d = Math.round((Number(row90.subscribersGained) || 0) - (Number(row90.subscribersLost) || 0));

  try {
    const demographics = await analyticsQuery(accessToken, { startDate: start90, endDate, metrics: "viewerPercentage", dimensions: "ageGroup,gender" });
    const rows = reportObjects(demographics);
    const total = rows.reduce((sum, row) => sum + (Number(row.viewerPercentage) || 0), 0);
    const core = rows.filter((row) => row.ageGroup === "age25-34" || row.ageGroup === "age35-44").reduce((sum, row) => sum + (Number(row.viewerPercentage) || 0), 0);
    const male = rows.filter((row) => row.gender === "male").reduce((sum, row) => sum + (Number(row.viewerPercentage) || 0), 0);
    const female = rows.filter((row) => row.gender === "female").reduce((sum, row) => sum + (Number(row.viewerPercentage) || 0), 0);
    const binaryTotal = male + female;
    if (total > 0) {
      next.audience.coreAgeLabel = "25–44";
      next.audience.coreAgeShare = round((core / total) * 100, 2);
    }
    if (binaryTotal > 0) {
      next.audience.male = round((male / binaryTotal) * 100, 2);
      next.audience.female = round((female / binaryTotal) * 100, 2);
    }
  } catch {
    warnings.push("demographics_preserved");
  }

  try {
    const geography = await analyticsQuery(accessToken, { startDate: start90, endDate, metrics: "views", dimensions: "country", sort: "-views", maxResults: 6 });
    const rows = reportObjects(geography);
    const totalViews = Math.max(1, Number(row90.views) || 0);
    const countries = rows.filter((row) => row.country).map((row) => ({ name: countryName(row.country), share: round(((Number(row.views) || 0) / totalViews) * 100, 2) })).filter((country) => country.share > 0);
    if (countries.length) next.audience.countries = countries;
  } catch {
    warnings.push("countries_preserved");
  }

  const reachSync = await syncReach({ accessToken, kv, analyticsEndDate: endDate, stats: next.stats });
  next.youtubeReachSync = reachSync;
  if (reachSync.status !== "ready") warnings.push(`reach_${reachSync.status}`);
  next.youtubeSync = { lastSuccessAt: new Date().toISOString(), analyticsEndDate: endDate, views28StartDate: start28, views90StartDate: start90, warnings };

  await kv.put(DATA_KEY, JSON.stringify(next));
  return { data: next, warnings };
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: "invalid_origin" }, 403);
  const authorizedAs = await isAuthorized(request, env);
  if (!authorizedAs) return json({ error: "not_authenticated" }, 401);
  try {
    return json({ ok: true, triggeredBy: authorizedAs, ...(await refreshMediaKit(env)) });
  } catch (error) {
    console.error("Paplovag YouTube Analytics refresh failed", error.message);
    const code = String(error.code || error.message || "refresh_failed");
    const status = code === "wrong_youtube_channel" ? 409 : code.includes("missing") || code.includes("not_configured") ? 503 : 502;
    return json({ ok: false, error: code, message: String(error.message || code), googleStatus: error.status || null, reason: error.reason || null }, status);
  }
}
