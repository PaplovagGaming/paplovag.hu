const apiUrl="/api/paplovag-media-kit";const youtubeRefreshUrl="/api/paplovag-youtube-analytics-refresh";let currentData=null;const qs=id=>document.getElementById(id);function setStatus(message,type=""){const el=qs("admin-status");if(!el)return;el.textContent=message;el.className=`pg-status ${type}`.trim()}async function api(body){const response=await fetch(apiUrl,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},credentials:"same-origin",body:JSON.stringify(body)});let payload={};try{payload=await response.json()}catch{}if(!response.ok){const e=new Error(payload.error||`HTTP ${response.status}`);e.code=payload.error;throw e}return payload}async function loadData(){const response=await fetch(apiUrl,{headers:{Accept:"application/json"},credentials:"same-origin",cache:"no-store"});if(!response.ok)throw new Error("Could not load media kit data.");return response.json()}function formatSyncTime(value){if(!value)return"Not yet refreshed";try{return new Intl.DateTimeFormat("hu-HU",{timeZone:"Europe/Budapest",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(new Date(value))}catch{return value}}function ensureCountryFields(){const host=qs("countries-fields");if(!host||host.children.length)return;for(let i=1;i<=6;i++){const wrap=document.createElement("div");wrap.className="pg-field";wrap.innerHTML=`<label for="country${i}Name">Country ${i}</label><input class="pg-input" id="country${i}Name" type="text"><input class="pg-input" id="country${i}Share" type="number" min="0" max="100" step="0.01" placeholder="Share %">`;host.appendChild(wrap)}}function reachMessage(reach = {}) {
  const days = Number(reach.daysCached) || 0;
  if (reach.windowDays) return `Impressions / CTR: ${reach.windowDays} days (${reach.startDate} through ${reach.endDate}).${reach.windowDays < 90 ? " Available history is shown while the 90-day window builds." : ""}${reach.error ? ` Latest refresh error: ${reach.error}` : ""}`;
  if (reach.error) return `Reach failed (${reach.errorCode || reach.status}${reach.errorStatus ? `, HTTP ${reach.errorStatus}` : ""}): ${reach.error}`;
  if (reach.status === "ready") return `Impressions / CTR refreshed for ${reach.startDate} through ${reach.endDate}.`;
  if (reach.status === "job_created") return "Reach reporting job created. Google must generate the first reports; try again after 24 hours.";
  if (reach.status === "backfilling") return `Reach history: ${days} days cached; ${reach.reportsProcessedThisRun || 0} reports imported. Further available reports will be imported on the next refresh. Impressions / CTR need a complete 90-day window.`;
  if (reach.status === "waiting_for_reports") return `Waiting for Google reports (${days} days cached). Previous Impressions / CTR are preserved until 90 complete days are available.`;
  return `Reach status: ${reach.status || "not refreshed"} (${days} days cached).`;
}
function renderSyncInfo(data) {
  const sync = data?.youtubeSync || {};
  const reach = data?.youtubeReachSync || {};
  const period = reach.windowDays ? `${reach.windowDays} days · ${reach.startDate} – ${reach.endDate}` : "reporting period";
  qs("impressions-label").textContent = `Impressions · ${period}`;
  qs("ctr-label").textContent = `CTR · % · ${period}`;
  qs("youtube-sync-time").textContent = formatSyncTime(sync.lastSuccessAt);
  qs("youtube-sync-note").textContent = [sync.analyticsEndDate ? `Analytics through ${sync.analyticsEndDate}.` : "", reachMessage(data?.youtubeReachSync)].filter(Boolean).join(" ");
}
function populate(data){ensureCountryFields();currentData=JSON.parse(JSON.stringify(data||{}));const s=data?.stats||{},a=data?.audience||{};for(const id of["subscribers","views28d","views90d","watchHours90d","impressions90d","ctr","avgViewDuration","subscriberGrowth90d"])qs(id).value=s[id]??"";for(const id of["coreAgeLabel","coreAgeShare","male","female"])qs(id).value=a[id]??"";qs("email").value=data?.contact?.email||"paplovaggaming@gmail.com";const countries=Array.isArray(a.countries)?a.countries:[];for(let i=0;i<6;i++){qs(`country${i+1}Name`).value=countries[i]?.name||"";qs(`country${i+1}Share`).value=countries[i]?.share??""}renderSyncInfo(data)}function gather(){const countries=[];for(let i=0;i<6;i++){const name=qs(`country${i+1}Name`).value.trim();if(name)countries.push({name,share:Number(qs(`country${i+1}Share`).value)||0})}return{version:1,stats:{subscribers:Number(qs("subscribers").value)||0,views28d:Number(qs("views28d").value)||0,views90d:Number(qs("views90d").value)||0,watchHours90d:Number(qs("watchHours90d").value)||0,impressions90d:Number(qs("impressions90d").value)||0,ctr:Number(qs("ctr").value)||0,avgViewDuration:qs("avgViewDuration").value.trim(),subscriberGrowth90d:Number(qs("subscriberGrowth90d").value)||0},audience:{coreAgeLabel:qs("coreAgeLabel").value.trim(),coreAgeShare:Number(qs("coreAgeShare").value)||0,male:Number(qs("male").value)||0,female:Number(qs("female").value)||0,countries},contact:{email:qs("email").value.trim(),channelUrl:currentData?.contact?.channelUrl||"https://www.youtube.com/channel/UCUEDPQyLPN5lrTH06k2oWYA"}}}function showEditor(storageConfigured){qs("login-panel").classList.add("pg-hidden");qs("editor-panel").classList.remove("pg-hidden");qs("storage-warning").classList.toggle("pg-hidden",storageConfigured)}async function checkSession(){ensureCountryFields();try{const status=await api({action:"admin_status"});if(!status.authenticated)return;const payload=await loadData();populate(payload.data);showEditor(status.storageConfigured);setStatus("Admin session active.","ok")}catch{}}qs("login-form")?.addEventListener("submit",async event=>{event.preventDefault();setStatus("Signing in…");try{const result=await api({action:"admin_login",password:qs("password").value});const payload=await loadData();populate(payload.data);showEditor(result.storageConfigured);qs("password").value="";setStatus("Admin signed in.","ok")}catch(error){if(error.code==="invalid_admin_password")setStatus("Incorrect admin password.","error");else if(error.code==="media_kit_access_required")location.href=`/media-kit/login/?next=${encodeURIComponent(location.pathname)}`;else setStatus(`Sign-in failed: ${error.message}`,"error")}});qs("editor-form")?.addEventListener("submit",async event=>{event.preventDefault();setStatus("Saving…");try{const result=await api({action:"save",data:gather()});populate(result.data);setStatus("Saved successfully.","ok")}catch(error){setStatus(`Save failed: ${error.message}`,"error")}});async function runRefresh() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  try {
    const response = await fetch(youtubeRefreshUrl, { method: "POST", headers: { Accept: "application/json" }, credentials: "same-origin", cache: "no-store", signal: controller.signal });
    let payload;
    try { payload = await response.json(); }
    catch { throw new Error(`The server returned an unreadable response (HTTP ${response.status}). Reload the admin page and check the last refresh time.`); }
    if (!response.ok || !payload.ok || !payload.data) {
      const error = new Error(payload.message || payload.error || `HTTP ${response.status}`);
      error.code = payload.error;
      error.googleStatus = payload.googleStatus;
      throw error;
    }
    return payload;
  } finally { clearTimeout(timeout); }
}
qs("youtube-refresh")?.addEventListener("click", async () => {
  const button = qs("youtube-refresh");
  if (button.disabled) return;
  const label = button.textContent;
  button.disabled = true;
  button.textContent = "Refreshing…";
  const status = qs("youtube-refresh-status");
  const show = (message, type = "") => {
    status.textContent = message;
    status.className = `pg-status ${type}`.trim();
  };
  show("Refreshing Paplovag YouTube Analytics and reach history… This can take up to two minutes.");
  try {
    const payload = await runRefresh();
    populate(payload.data);
    const reach = payload.data.youtubeReachSync || {};
    const failed = Boolean(reach.error) || ["error", "api_unavailable", "report_type_unavailable", "rate_limited"].includes(reach.status);
    show(`Core Analytics refreshed at ${formatSyncTime(payload.data.youtubeSync?.lastSuccessAt)}. ${reachMessage(reach)}`, failed ? "error" : "ok");
  } catch (error) {
    const hints = {
      oauth_not_connected: "Connect Paplovag YouTube first.",
      oauth_refresh_failed: "Reconnect Paplovag YouTube.",
      not_authenticated: "Sign in to admin again.",
      wrong_youtube_channel: "Reconnect using the Paplovag Gaming channel."
    };
    show(error.name === "AbortError"
      ? "Refresh timed out. Reload this page to check whether the server completed it before retrying."
      : `YouTube refresh failed: ${error.message}${error.googleStatus ? ` (Google HTTP ${error.googleStatus})` : ""}. ${hints[error.code] || ""}`, "error");
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
});
qs("logout")?.addEventListener("click",async()=>{try{await api({action:"admin_logout"})}catch{}location.reload()});qs("open-public")?.addEventListener("click",()=>window.open("/media-kit/","_blank","noopener"));checkSession();
qs("video-refresh")?.addEventListener("click", async () => {
  const button = qs("video-refresh"), status = qs("video-refresh-status");
  if (button.disabled) return;
  button.disabled = true;
  const failures = [];
  try {
    for (const section of ["shorts", "top", "tech", "gaming"]) {
      status.textContent = "Refreshing video lists: " + section + "…";
      try {
        let continuation;
        for (let batch = 0; batch < 40; batch++) {
          const response = await fetch("/api/paplovag-showcase?section=" + section, { method: "POST", credentials: "same-origin", signal: AbortSignal.timeout(120000), headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ continuation }) });
          const payload = await response.json();
          if (!response.ok || !payload.ok) throw new Error(payload.error || "HTTP " + response.status);
          if (!payload.pending) break;
          if (!payload.continuation) throw new Error("Missing playlist continuation");
          if (batch === 39) throw new Error("Playlist is too large for one refresh; previous complete list retained");
          continuation = payload.continuation;
          status.textContent = "Refreshing " + section + ": " + payload.processed + " playlist videos checked…";
        }
      } catch (error) { failures.push(section + ": " + error.message); }
    }
    status.textContent = failures.length ? "Some lists could not refresh; previous videos are kept. " + failures.join("; ") : "All video lists refreshed and saved. Visitors receive these saved lists without waiting for YouTube.";
    status.className = "pg-status " + (failures.length ? "error" : "ok");
  } finally { button.disabled = false; }
});
