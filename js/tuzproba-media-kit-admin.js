const apiUrl = "/api/tuzproba-media-kit";
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
    cache: "no-store"
  });
  if (!response.ok) throw new Error("Could not load media kit data.");
  return response.json();
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
    const status = await api({ action: "status" });
    if (!status.authenticated) return;
    const payload = await loadPublicData();
    populate(payload.data);
    showEditor(status.storageConfigured);
    setStatus("Signed in.", "ok");
  } catch {}
}

qs("login-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Signing in…");

  try {
    const result = await api({ action: "login", password: qs("password").value });
    const payload = await loadPublicData();
    populate(payload.data);
    showEditor(result.storageConfigured);
    qs("password").value = "";
    setStatus("Signed in.", "ok");
  } catch (error) {
    if (error.code === "password_not_configured") {
      setStatus("MEDIA_KIT_PASSWORD is not configured in Cloudflare Pages yet.", "error");
    } else if (error.code === "invalid_password") {
      setStatus("Incorrect password.", "error");
    } else {
      setStatus(`Sign-in failed: ${error.message}`, "error");
    }
  }
});

qs("editor-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Saving…");

  try {
    const data = gather();
    const result = await api({ action: "save", data });
    currentData = result.data;
    populate(result.data);
    setStatus(`Saved successfully. Public media kit updated: ${result.data.updatedAt}.`, "ok");
  } catch (error) {
    if (error.code === "storage_not_configured") {
      setStatus("MEDIA_KIT_KV is not bound in Cloudflare Pages yet.", "error");
    } else if (error.code === "not_authenticated") {
      setStatus("Your session expired. Refresh the page and sign in again.", "error");
    } else {
      setStatus(error.message || "Save failed.", "error");
    }
  }
});

qs("logout")?.addEventListener("click", async () => {
  try { await api({ action: "logout" }); } catch {}
  location.reload();
});

qs("open-public")?.addEventListener("click", () => {
  window.open("/tuzproba/media-kit/", "_blank", "noopener");
});

checkSession();
