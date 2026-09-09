const apiUrl = "/api/tuzproba-media-kit";
const youtubeRefreshUrl = "/api/youtube-analytics-refresh";
let currentData = null;

function qs(id) { return document.getElementById(id); }

function setStatus(message, type = "") {
  const el = qs("admin-status");
  if (!el) return;
  el.textContent = message;
  el.className = `tp-status ${type}`.trim();
}

async function api(body) {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body)
  });

  let payload = {};
  try { payload = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(payload.error || `HTTP ${response.status}`);
    error.code = payload.error;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function loadPublicData() {
  const response = await fetch(apiUrl, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
    cache: "no-store"
  });
  if (!response.ok) throw new Error("Could not load media kit data.");
  return response.json();
}

function formatSyncTime(value) {
  if (!value) return "Not yet refreshed";
  try {
    return new Intl.DateTimeFormat("hu-HU", {
      timeZone: "Europe/Budapest",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function renderSyncInfo(data) {
  const sync = data?.youtubeSync || {};
  const reach = data?.youtubeReachSync || {};
  if (qs("youtube-sync-time")) qs("youtube-sync-time").textContent = formatSyncTime(sync.lastSuccessAt);

  const notes = [];
  if (sync.analyticsEndDate) notes.push(`Analytics data through ${sync.analyticsEndDate}.`);

  if (reach.status === "ready") {
    notes.push(`Reach data through ${reach.endDate}. Impressions / CTR refreshed via YouTube Reporting API.`);
  } else if (reach.status === "job_created") {
    notes.push("Reach reporting job created. YouTube can take up to 24 hours to generate the first report; previous Impressions / CTR are kept until then.");
  } else if (reach.status === "waiting_for_reports") {
    notes.push("Reach reports are not available yet; previous Impressions / CTR are kept and the next refresh will try again.");
  } else if (reach.status === "backfilling") {
    notes.push(`Reach history is backfilling (${reach.daysCached || 0} daily reports cached). Another refresh continues the backfill automatically.`);
  } else if (reach.status === "api_unavailable") {
    notes.push("YouTube Reporting API is not enabled or available for this Google Cloud project. Enable YouTube Reporting API, then refresh again.");
  } else if (reach.status === "error") {
    notes.push("YouTube Reporting API returned an error; previous Impressions / CTR were kept.");
  } else if (Array.isArray(sync.warnings) && sync.warnings.some((warning) => ["reach_metrics_preserved", "impressions_preserved", "ctr_preserved"].includes(warning))) {
    notes.push("Previous Impressions / CTR values were kept.");
  }

  if (Array.isArray(sync.warnings)) {
    if (sync.warnings.includes("demographics_preserved")) notes.push("Previous demographic values were kept.");
    if (sync.warnings.includes("countries_preserved")) notes.push("Previous market values were kept.");
  }
  if (qs("youtube-sync-note")) qs("youtube-sync-note").textContent = notes.join(" ");
}

function populate(data) {
  currentData = JSON.parse(JSON.stringify(data));
  const s = data.stats || {};
  const a = data.audience || {};
  qs("subscribers").value = s.subscribers ?? "";
  qs("views28d").value = s.views28d ?? "";
  qs("views90d").value = s.views90d ?? "";
  qs("watchHours90d").value = s.watchHours90d ?? "";
  qs("impressions90d").value = s.impressions90d ?? "";
  qs("ctr").value = s.ctr ?? "";
  qs("avgViewDuration").value = s.avgViewDuration ?? "";
  qs("subscriberGrowth90d").value = s.subscriberGrowth90d ?? "";
  qs("coreAgeLabel").value = a.coreAgeLabel ?? "25–44";
  qs("coreAgeShare").value = a.coreAgeShare ?? "";
  qs("male").value = a.male ?? "";
  qs("female").value = a.female ?? "";
  qs("email").value = data.contact?.email ?? "paplovaggaming@gmail.com";

  const countries = Array.isArray(a.countries) ? a.countries : [];
  for (let i = 0; i < 6; i += 1) {
    qs(`country${i + 1}Name`).value = countries[i]?.name || "";
    qs(`country${i + 1}Share`).value = countries[i]?.share ?? "";
  }
  renderSyncInfo(data);
}

function gather() {
  const countries = [];
  for (let i = 0; i < 6; i += 1) {
    const name = qs(`country${i + 1}Name`).value.trim();
    const share = qs(`country${i + 1}Share`).value;
    if (name) countries.push({ name, share: Number(share) || 0 });
  }
  return {
    version: 1,
    stats: {
      subscribers: Number(qs("subscribers").value),
      views28d: Number(qs("views28d").value),
      views90d: Number(qs("views90d").value),
      watchHours90d: Number(qs("watchHours90d").value),
      impressions90d: Number(qs("impressions90d").value),
      ctr: Number(qs("ctr").value),
      avgViewDuration: qs("avgViewDuration").value.trim(),
      subscriberGrowth90d: Number(qs("subscriberGrowth90d").value)
    },
    audience: {
      coreAgeLabel: qs("coreAgeLabel").value.trim(),
      coreAgeShare: Number(qs("coreAgeShare").value),
      male: Number(qs("male").value),
      female: Number(qs("female").value),
      countries
    },
    contact: {
      email: qs("email").value.trim(),
      channelUrl: currentData?.contact?.channelUrl || "https://www.youtube.com/channel/UCdw9t0aw4TED_GV-ffWCQMg"
    }
  };
}

function showEditor(storageConfigured) {
  qs("login-panel").classList.add("tp-hidden");
  qs("editor-panel").classList.remove("tp-hidden");
  qs("storage-warning").classList.toggle("tp-hidden", storageConfigured);
}

async function checkSession() {
  try {
    const status = await api({ action: "admin_status" });
    if (!status.authenticated) return;
    const payload = await loadPublicData();
    populate(payload.data);
    showEditor(status.storageConfigured);
    setStatus("Admin session active.", "ok");
  } catch {}
}

qs("login-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Signing in…");
  try {
    const result = await api({ action: "admin_login", password: qs("password").value });
    const payload = await loadPublicData();
    populate(payload.data);
    showEditor(result.storageConfigured);
    qs("password").value = "";
    setStatus("Admin signed in.", "ok");
  } catch (error) {
    if (error.code === "admin_password_not_configured") setStatus("MEDIA_KIT_ADMIN_PASSWORD is not configured in Cloudflare yet.", "error");
    else if (error.code === "invalid_admin_password") setStatus("Incorrect admin password.", "error");
    else if (error.code === "media_kit_access_required") location.href = `/tuzproba/media-kit/login/?next=${encodeURIComponent(location.pathname)}`;
    else setStatus(`Sign-in failed: ${error.message}`, "error");
  }
});

qs("editor-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Saving…");
  try {
    const result = await api({ action: "save", data: gather() });
    currentData = result.data;
    populate(result.data);
    setStatus(`Saved successfully. Media kit updated: ${result.data.updatedAt}.`, "ok");
  } catch (error) {
    if (error.code === "storage_not_configured") setStatus("No KV binding found. Bind the namespace as KV or MEDIA_KIT_KV in this Cloudflare project.", "error");
    else if (error.code === "not_authenticated") {
      setStatus("Your admin session expired. Sign in again.", "error");
      qs("editor-panel").classList.add("tp-hidden");
      qs("login-panel").classList.remove("tp-hidden");
    } else setStatus(error.message || "Save failed.", "error");
  }
});

async function runYouTubeRefresh() {
  const response = await fetch(youtubeRefreshUrl, {
    method: "POST",
    headers: { Accept: "application/json" },
    credentials: "same-origin"
  });
  let payload = {};
  try { payload = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(payload.error || `HTTP ${response.status}`);
    error.code = payload.error;
    throw error;
  }
  return payload;
}

qs("youtube-refresh")?.addEventListener("click", async () => {
  const button = qs("youtube-refresh");
  if (button) button.disabled = true;
  setStatus("Refreshing YouTube Analytics…");

  try {
    let payload = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      if (button) button.textContent = attempt === 1 ? "Refreshing YouTube data…" : `Backfilling reach data… ${attempt}/3`;
      payload = await runYouTubeRefresh();
      populate(payload.data);

      const reach = payload.data?.youtubeReachSync || {};
      const canContinue = reach.status === "backfilling" && Number(reach.reportsProcessedThisRun) > 0 && attempt < 3;
      if (!canContinue) break;
    }

    const reach = payload?.data?.youtubeReachSync || {};
    if (reach.status === "ready") {
      setStatus("YouTube Analytics + Reach refreshed successfully.", "ok");
    } else if (reach.status === "job_created") {
      setStatus("Core YouTube Analytics refreshed. Reach reporting job created; first reach reports can take up to 24 hours.", "ok");
    } else if (reach.status === "waiting_for_reports") {
      setStatus("Core YouTube Analytics refreshed. Reach reports are not available yet; the next refresh will try again.", "ok");
    } else if (reach.status === "backfilling") {
      setStatus("Core YouTube Analytics refreshed. Reach backfill is still in progress; press Refresh again to continue now, or let the daily job continue it.", "ok");
    } else if (reach.status === "api_unavailable") {
      setStatus("Core YouTube Analytics refreshed, but YouTube Reporting API must be enabled in Google Cloud before Impressions / CTR can update.", "error");
    } else if (reach.status === "error") {
      setStatus("Core YouTube Analytics refreshed, but the reach report sync failed; previous Impressions / CTR were kept.", "error");
    } else {
      setStatus("YouTube Analytics refreshed successfully.", "ok");
    }
  } catch (error) {
    const messages = {
      oauth_not_connected: "YouTube OAuth is not connected yet.",
      oauth_refresh_failed: "Google rejected the stored OAuth refresh token. Reconnect YouTube Analytics.",
      wrong_youtube_channel: "The connected Google account does not expose the Tűzpróba YouTube channel.",
      analytics_core_data_unavailable: "YouTube Analytics did not return the required channel data yet.",
      not_authenticated: "Your admin session expired. Sign in again.",
      storage_not_configured: "The Media Kit KV binding is missing.",
      oauth_secrets_missing: "The YouTube OAuth secrets are missing from Cloudflare."
    };
    setStatus(messages[error.code] || `YouTube refresh failed: ${error.message}`, "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Refresh YouTube data now";
    }
  }
});

qs("logout")?.addEventListener("click", async () => {
  try { await api({ action: "admin_logout" }); } catch {}
  location.reload();
});

qs("open-public")?.addEventListener("click", () => {
  window.open("/tuzproba/media-kit/", "_blank", "noopener");
});

checkSession();
