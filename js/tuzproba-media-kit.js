const fallbackData = {
  updatedAt: "2026-09-09",
  stats: {
    subscribers: 8916,
    views28d: 127669,
    views90d: 332972,
    watchHours90d: 27349,
    impressions90d: 2013756,
    ctr: 4.95,
    avgViewDuration: "9:51",
    subscriberGrowth90d: 1273
  },
  audience: {
    coreAgeLabel: "25–44",
    coreAgeShare: 68.85,
    male: 71.67,
    female: 28.33,
    countries: [
      { name: "Hungary", share: 79.6 },
      { name: "Romania", share: 6.8 },
      { name: "Ukraine", share: 2.9 },
      { name: "Slovakia", share: 2.0 }
    ]
  },
  featuredVideoIds: [],
  contact: {
    email: "paplovaggaming@gmail.com",
    channelUrl: "https://www.youtube.com/channel/UCdw9t0aw4TED_GV-ffWCQMg"
  }
};

const nf = new Intl.NumberFormat("en-US");
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });

function text(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function prettyDate(value) {
  try {
    return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric" }).format(new Date(`${value}T12:00:00Z`));
  } catch {
    return value;
  }
}

function renderStats(data) {
  const s = data.stats;
  text("stat-subscribers", `${compact.format(s.subscribers)}+`);
  text("stat-views28", compact.format(s.views28d));
  text("stat-views90", compact.format(s.views90d));
  text("stat-watch90", `${compact.format(s.watchHours90d)} hrs`);
  text("stat-impressions90", compact.format(s.impressions90d));
  text("stat-ctr", `${Number(s.ctr).toFixed(2)}%`);
  text("stat-avd", s.avgViewDuration);
  text("stat-growth", `${s.subscriberGrowth90d >= 0 ? "+" : ""}${compact.format(s.subscriberGrowth90d)}`);
  text("updated-at", prettyDate(data.updatedAt));
}

function renderAudience(data) {
  const a = data.audience;
  text("core-age-label", a.coreAgeLabel);
  text("core-age-share", `${Number(a.coreAgeShare).toFixed(1)}%`);
  const coreMeter = document.getElementById("core-age-meter");
  if (coreMeter) coreMeter.style.setProperty("--value", `${Math.max(0, Math.min(100, Number(a.coreAgeShare)))}%`);

  text("male-share", `${Number(a.male).toFixed(1)}%`);
  text("female-share", `${Number(a.female).toFixed(1)}%`);

  const list = document.getElementById("country-list");
  if (!list) return;
  list.innerHTML = "";
  for (const country of a.countries || []) {
    const row = document.createElement("div");
    row.className = "tp-country-row";
    const safeShare = Math.max(0, Math.min(100, Number(country.share) || 0));
    row.innerHTML = `
      <span class="tp-country-name"></span>
      <span class="tp-country-bar"><span style="width:${safeShare}%"></span></span>
      <span class="tp-country-share">${safeShare.toFixed(1)}%</span>`;
    row.querySelector(".tp-country-name").textContent = country.name;
    list.appendChild(row);
  }
}

function renderContact(data) {
  const email = data.contact?.email || fallbackData.contact.email;
  const channel = data.contact?.channelUrl || fallbackData.contact.channelUrl;
  const emailLink = document.getElementById("contact-email");
  const channelLink = document.getElementById("contact-channel");
  if (emailLink) {
    emailLink.href = `mailto:${email}`;
    emailLink.textContent = "Contact by email";
  }
  if (channelLink) channelLink.href = channel;
}

function videoEmbed(videoId) {
  const wrap = document.createElement("div");
  wrap.className = "tp-video";
  const iframe = document.createElement("iframe");
  iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`;
  iframe.title = "Tűzpróba featured video";
  iframe.loading = "lazy";
  iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  iframe.allowFullscreen = true;
  wrap.appendChild(iframe);
  return wrap;
}

async function loadRecentVideoIds() {
  try {
    const response = await fetch("/api/youtube?type=recent&channel=tuzproba", { headers: { Accept: "application/json" } });
    if (!response.ok) return [];
    const payload = await response.json();
    return (payload.items || []).map((item) => item.id).filter(Boolean).slice(0, 3);
  } catch {
    return [];
  }
}

async function renderVideos(data) {
  const grid = document.getElementById("video-grid");
  if (!grid) return;
  let ids = Array.isArray(data.featuredVideoIds) ? data.featuredVideoIds.filter(Boolean).slice(0, 3) : [];
  if (!ids.length) ids = await loadRecentVideoIds();

  grid.innerHTML = "";
  if (!ids.length) {
    const empty = document.createElement("div");
    empty.className = "tp-video tp-video-empty";
    empty.textContent = "Featured videos are being updated.";
    grid.appendChild(empty);
    return;
  }
  ids.forEach((id) => grid.appendChild(videoEmbed(id)));
}

async function loadData() {
  try {
    const response = await fetch("/api/tuzproba-media-kit", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("API unavailable");
    const payload = await response.json();
    return payload.data || fallbackData;
  } catch {
    return fallbackData;
  }
}

(async function init() {
  const data = await loadData();
  renderStats(data);
  renderAudience(data);
  renderContact(data);
  await renderVideos(data);
})();
