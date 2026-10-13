const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const demo = new URLSearchParams(location.search).get("demo") === "1";
let state = {
    active: null,
    entries: [],
    history: [],
    audit: [],
    pending: 0,
    bot: null,
  },
  busy = false,
  view = "active",
  user = null,
  draftDirty = false,
  formRevision = 0;
let clockOffset = 0, rollingDialog = "", dialogTimer;
const serverTime = () => Date.now() + clockOffset;
const actions = {
  draft: ["open", "archive"],
  open: ["close", "remind"],
  closing: [],
  closed: ["draw"],
  drawn: ["reroll", "archive"],
};
const statusNames = {
  draft: "Előkészítés",
  open: "Nevezés nyitva",
  closing: "Nevezések egyeztetése",
  closed: "Sorsolásra kész",
  drawn: "Kisorsolva",
  archived: "Archiválva",
};
const errors = {
  unauthorized: "Jelentkezz be Twitch-fiókoddal.",
  reauth_required: "Lejárt a Twitch-kapcsolat. Jelentkezz be újra.",
  forbidden:
    "Ehhez a központhoz Paplovag Twitch-moderátori jogosultság szükséges.",
  twitch_verification_unavailable:
    "A Twitch-jogosultságot most nem sikerült ellenőrizni. Próbáld újra később.",
  mod_service_unavailable:
    "A MOD háttérszolgáltatás még nem érhető el. A bekötésig nincs élő adat vagy művelet.",
  bot_not_ready:
    "Nem érkezett friss állapot a Streamer.bot adaptertől. Ellenőrizd, hogy az időzítő akció engedélyezve van-e.",
  invalid_keyword: "A kulcsszó 2–32 betű, szám, kötőjel vagy aláhúzás lehet.",
  invalid_prize: "Adj meg egy legfeljebb 200 karakteres nyereményt.",
  invalid_ticket_limit: "A maximum 1–10 jegy lehet platformonként.",
  state_conflict:
    "A játék állapota megváltozott, vagy már van aktív játék. Frissítsd a listát.",
  game_conflict: "Egy másik moderátor közben módosította a játékot.",
  no_entries: "Nincs visszaigazolt résztvevő, ezért még nem lehet sorsolni.",
  pending_purchases: "Még van egyeztetésre váró vásárlás.",
  supporter_status_stale:
    "Hiányzik a nevezéskor rögzített támogatói státusz. A sorsolásig ezt igazolni kell.",
  invalid_game_state: "Ez a művelet a jelenlegi állapotban nem végezhető el.",
  close_before_draw:
    "A botnak előbb vissza kell igazolnia a nevezések lezárását.",
  claim_pending: "A nyertesnek még van ideje jelentkezni. Újrasorsolás csak lejárt határidő után lehetséges.",
  winner_not_confirmed: "A nyertes még nem jelentkezett. Lejárat után újrasorsolhatsz.",
  claim_bot_not_ready: "A 90 másodperces jelentkezéshez az új, nyertesi chatválaszt kezelő botadapter szükséges.",
  no_eligible_entries: "Minden résztvevő kiesett; nincs további kisorsolható név.",
  overlay_test_during_draw: "A kisorsolt nyertes játékát előbb zárd le. A teszt nem takarhatja el a valódi nyertest.",
  overlay_not_configured: "Előbb készíts overlay-címet, és illeszd be az OBS böngészőforrásába.",
};
function text(el, value) {
  el.textContent = value;
  return el;
}
const element = (tag, cls, value) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (value !== undefined) el.textContent = value;
  return el;
};
const format = (v) => new Intl.NumberFormat("hu-HU").format(v);
const date = (v) =>
  new Date(v).toLocaleString("hu-HU", {
    timeZone: "Europe/Budapest",
    dateStyle: "short",
    timeStyle: "short",
  });
function notice(message, success = false) {
  $("#notice").hidden = false;
  $("#notice").classList.toggle("success", success);
  text($("#notice"), message);
}
async function api(path, body) {
  const r = await fetch(`/api/mod/${path}`, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await r.json();
  } catch {
    throw new Error("mod_service_unavailable");
  }
  if (!r.ok) throw new Error(data.error || "mod_service_unavailable");
  return data;
}
function forbidden(code) {
  if (code === "forbidden") {
    location.replace("/mod/forbidden/");
    return;
  }
  $("#app").hidden = true;
  $("#auth-view").hidden = false;
  $("#auth-view").dataset.state = code;
  text(
    $("#auth-error"),
    errors[code] || "A belépés nem sikerült. Próbáld újra.",
  );
}
function platformBadge(platform) {
  return element(
    "span",
    `platform ${platform}`,
    { twitch: "Twitch", youtube: "YouTube", kick: "Kick" }[platform] ||
      platform,
  );
}
function render() {
  const g = state.active,
    entries = state.entries;
  const editable = !g || g.status === "draft";
  for (const id of ["prize", "keyword", "note", "max-tickets"])
    $("#" + id).disabled = !editable || busy;
  $("#create-game").hidden = Boolean(g && g.status !== "draft");
  text($("#create-game"), g ? "Beállítások mentése" : "Játék létrehozása ＋");
  $("#create-game").disabled = busy;
  $("#game-controls").hidden = !g;
  if (g && (!editable || !draftDirty)) {
    $("#prize").value = g.prize;
    $("#keyword").value = g.keyword;
    $("#note").value = g.note || "";
    $("#max-tickets").value = g.max_tickets;
    formRevision = g.revision;
  }
  text($("#game-status"), g ? statusNames[g.status] : "Nincs aktív játék");
  if(g?.status==="drawn")text($("#game-status"),state.currentRound?.claim_status==="claimed"?"Nyertes jelentkezett – lezárható":state.currentRound?.claim_status==="expired"?"Újrasorsolható":"Nyertes jelentkezésére vár");
  $("#game-status").classList.toggle("open", g?.status === "open");
  $$("[data-action]").forEach((b) => {
    b.disabled =
      busy || !g || !(actions[g.status] || []).includes(b.dataset.action) || (draftDirty && b.dataset.action === "open");
    if (b.closest("#game-controls"))
      b.hidden = !g || !(actions[g.status] || []).includes(b.dataset.action);
    const round = state.currentRound;
    if (g?.status === "drawn" && b.dataset.action === "reroll") b.disabled = busy || !round || round.claim_status === "claimed" || serverTime() < Date.parse(round.claim_deadline) || !entries.some(e=>!e.excluded);
    if (g?.status === "drawn" && b.dataset.action === "archive") b.disabled = busy || !round || (round.claim_status !== "claimed" && !(round.claim_status === "expired" && !entries.some(e=>!e.excluded)));
    if (b.dataset.action === "archive") text(b,g?.status === "draft" ? "Előkészítés elvetése" : state.currentRound?.claim_status === "expired" && !entries.some(e=>!e.excluded) ? "Lezárás nyertes nélkül" : "Nyertes megvan – játék lezárása");
  });
  renderClaim();
  text(
    $("#pending-label"),
    state.pending
      ? `${state.pending} vásárlás visszaigazolásra vár.`
      : g?.status === "closing"
        ? "A bot lezárási visszaigazolására várunk."
        : "",
  );
  text($("#stat-people"), format(entries.length));
  const tickets = entries.reduce((s, e) => s + e.tickets, 0);
  text($("#stat-tickets"), format(tickets));
  text($("#stat-spent"), `${format(tickets * 100)} garas felhasználva`);
  text(
    $("#stat-supporters"),
    format(
      entries.filter(
        (e) => e.supporter && Number.isFinite(Date.parse(e.supporter_at)),
      ).length,
    ),
  );
  text($("#participant-count"), entries.length);
  const connected = state.bot?.online;
  text(
    $("#bot-badge"),
    connected ? "Streamer.bot kapcsolódva" : "Streamer.bot nincs kapcsolódva",
  );
  $("#bot-badge").classList.toggle("online", Boolean(connected));
  const search = $("#search").value.toLowerCase(),
    filter = $("#platform-filter").value,
    filtered = entries.filter(
      (e) =>
        e.display_name.toLowerCase().includes(search) &&
        (!filter || filter === e.platform),
    );
  $("#participants").replaceChildren();
  for (const e of filtered) {
    const row = element("tr");
    row.classList.toggle("excluded",Boolean(e.excluded));
    const name = element("td"),
      wrap = element("span", "user-cell");
    wrap.append(
      element("span", "user-initial", e.display_name.slice(0, 2).toUpperCase()),
      element("span", "", e.display_name),
    );
    name.append(wrap);
    if(e.excluded)name.append(element("span","excluded-note","Kizárva: nem jelentkezett"));
    const platform = element("td");
    platform.append(platformBadge(e.platform));
    const supporter = element("td");
    const fresh =
      Number.isFinite(Date.parse(e.supporter_at));
    supporter.append(
      element(
        "span",
        e.supporter ? "support-active" : "support-inactive",
        fresh ? (e.supporter ? "✦ Támogató nevezéskor" : "Nem támogató nevezéskor") : "Igazolásra vár",
      ),
    );
    row.append(
      name,
      platform,
      element("td", "", e.tickets),
      supporter,
      element(
        "td",
        "weight",
        e.excluded ? "0×" : fresh ? `${e.tickets * (e.supporter ? 2 : 1)}×` : "—",
      ),
    );
    $("#participants").append(row);
  }
  $("#participants-empty").hidden = filtered.length > 0;
  text(
    $("#announcement-text"),
    `🎁 Nyereményjáték! ${$("#prize").value || "{nyeremény}"} | Nevezés: !${$("#keyword").value || "{kulcsszó}"} <garas> | 100 garas/jegy, max. ${$("#max-tickets").value || 10} jegy/platform. Az adott platformon nevezéskor aktív támogatók 2× sorsolási súlyt kapnak.`,
  );
  $("#history-list").replaceChildren();
  if (!state.history.length)
    $("#history-list").append(
      element("div", "card empty", "Még nincs korábbi sorsolás."),
    );
  for (const d of state.history) {
    const item = element("article", "card history-item"),
      info = element("div"),
      meta = element("div", "history-meta");
    info.append(
      element("h2", "", d.prize),
      element(
        "p",
        "",
        `${["claimed","legacy"].includes(d.claim_status)?"Nyertes":"Kisorsolt név"}: ${d.winner.display_name} · ${d.winner.platform}`,
      ),
    );
    meta.append(
      element("div", "", date(d.created_at)),
      element("div", "", `Sorsolta: ${d.actor_name}`),
      element("div", "", `Összes sorsolási súly: ${d.total_weight}`),
      element("div", "", { awaiting:"Jelentkezésre vár", claimed:"Nyertes jelentkezett", expired:"Nem jelentkezett" }[d.claim_status] || "Korábbi sorsolás"),
    );
    item.append(element("span", "win-icon", "✦"), info, meta);
    const details = element("button", "button secondary", "Részletek");
    details.addEventListener("click", () => showDetails(d.id));
    item.append(details);
    $("#history-list").append(item);
  }
  $("#audit-list").replaceChildren();
  for (const e of state.audit) {
    const row = element("tr");
    row.append(
      element("td", "", date(e.created_at)),
      element(
        "td",
        "",
        {
          created: "Játék létrehozva",
          open: "Nevezés megnyitva",
          closing: "Lezárás elindítva",
          closed: "Bot lezárást igazolt",
          drawn: "Kisorsolva",
          draw: "Sorsolás rögzítve",
          reroll: "Újrasorsolás rögzítve",
          winner_claimed: "A nyertes jelentkezett",
          winner_expired: "A nyertes nem jelentkezett időben",
          archived: "Archiválva",
          purchase_committed: "Jegyvásárlás visszaigazolva",
          message_ack: "Chatüzenet visszaigazolva",
        }[e.action] || e.action,
      ),
      element("td", "", e.actor_name),
    );
    $("#audit-list").append(row);
  }
  tick();
}
function tick() {
  const target =
    state.active?.status === "open"
      ? Date.parse(state.active.next_reminder_at)
      : NaN;
  if (Number.isFinite(target)) {
    const s = Math.max(0, Math.ceil((target - Date.now()) / 1000));
    text(
      $("#stat-reminder"),
      `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`,
    );
  } else text($("#stat-reminder"), "—");
}
function switchView(name) {
  view = name;
  $$(".view").forEach((v) => (v.hidden = v.id !== `view-${name}`));
  $$("[data-view]").forEach((b) =>
    b.classList.toggle("selected", b.dataset.view === name),
  );
  text(
    $("#view-title"),
    {
      active: "Nyereményjáték",
      history: "Előző sorsolások",
      audit: "Audit napló",
      overlay: "OBS overlay",
    }[name],
  );
}
async function refresh() {
  if (demo) {
    render();
    return;
  }
  try {
    state = await api("state");
    clockOffset = Date.parse(state.serverNow) - Date.now();
    render();
  } catch (e) {
    if (["unauthorized", "reauth_required", "forbidden"].includes(e.message))
      forbidden(e.message);
    else notice(errors[e.message] || "Az adatok frissítése nem sikerült.");
  }
}
function renderClaim() {
  const d=state.currentRound;
  $("#claim-panel").hidden=!d;
  if(!d)return;
  const revealing=serverTime()<Date.parse(d.reveal_at);
  text($("#claim-winner"),revealing?"✦ Sorsolás folyamatban…":d.winner.display_name);
  const left=Math.max(0,Math.ceil((Date.parse(d.claim_deadline)-serverTime())/1000));
  text($("#claim-clock"),d.claim_status==="claimed"?"✓":revealing?"✦":`${left} mp`);
  text($("#claim-status"),d.claim_status==="claimed"?"A nyertes jelentkezett. Az admin lezárhatja a játékot.":left===0?"A nyertes nem jelentkezett. Újrasorsoláskor kimarad.":revealing?"A név megjelenése után 90 másodperc indul.":`Írj bármit a ${d.winner.platform} chatbe a jelentkezéshez!`);
  if(rollingDialog===d.id&&$("#winner-dialog").open&&serverTime()>=Date.parse(d.reveal_at))text($("#winner-name"),d.winner.display_name);
  if(rollingDialog===d.id)text($("#winner-claim-clock"),d.claim_status==="claimed"?"✓ Jelentkezett":revealing?"Pörgetés…":left===0?"Nem jelentkezett":`${left} mp`);
}
function showWinner(d) {
  $("#draw-details").hidden = true;
  text($("#winner-name"), d.winner.display_name);
  text($("#winner-prize"), d.prize);
  text($("#winner-mod"), `Sorsolta: ${d.actor_name} · ${d.winner.platform}`);
  if (!$("#winner-dialog").open) $("#winner-dialog").showModal();
  clearInterval(dialogTimer);rollingDialog=d.id;
  $("#winner-claim-clock").hidden=!d.claim_deadline;
  if(d.claim_deadline)text($("#winner-claim-clock"),d.claim_status==="claimed"?"✓ Jelentkezett":d.claim_status==="expired"?"Nem jelentkezett":"90 mp a név megjelenése után");
  if(d.reveal_at&&serverTime()<Date.parse(d.reveal_at)) {
    const names=(d.snapshot || []).map(e=>e.display_name);let i=0;
    text($("#winner-name"),"✦");
    dialogTimer=setInterval(()=>{
      if(serverTime()>=Date.parse(d.reveal_at)){clearInterval(dialogTimer);text($("#winner-name"),d.winner.display_name);return;}
      text($("#winner-name"),names[i++%names.length]||"✦");
    },120);
  }
}
async function showDetails(id) {
  try {
    const d = demo
      ? state.history.find((x) => x.id === id)
      : (await api(`draws/${id}`)).draw;
    showWinner(d);
    text(
      $("#winner-mod"),
      `Sorsolta: ${d.actor_name} · ${d.winner.platform} · ${d.total_weight} összsúly`,
    );
    $("#draw-details").hidden = false;
    text(
      $("#snapshot-hash"),
      d.snapshot_hash ? `Snapshot: ${d.snapshot_hash}` : "Előnézeti eredmény",
    );
    $("#draw-snapshot").replaceChildren();
    for (const e of d.snapshot || []) {
      const row = element("tr");
      row.append(
        element("td", "", e.display_name),
        element("td", "", e.platform),
        element("td", "", e.tickets),
        element("td", "", e.weight),
      );
      $("#draw-snapshot").append(row);
    }
  } catch (e) {
    notice(errors[e.message] || "A részletek nem érhetők el.");
  }
}
async function mutate(action, body) {
  if (busy) return;
  busy = true;
  render();
  try {
    const result = demo ? demoMutation(action, body) : await api(action, body);
    draftDirty = false;
    notice(
      demo
        ? "Előnézet: a művelet csak a mintaadatot módosította."
        : "A műveletet rögzítettük.",
      true,
    );
    if (result.draw) showWinner(result.draw);
    await refresh();
    return result;
  } catch (e) {
    notice(errors[e.message] || "A művelet nem sikerült. Próbáld újra.");
    await refresh();
  } finally {
    busy = false;
    render();
  }
}
$("#game-form").addEventListener("submit", (e) => {
  e.preventDefault();
  mutate(state.active ? `games/${state.active.id}/save` : "games", {
    requestId: crypto.randomUUID(),
    revision: formRevision,
    prize: $("#prize").value,
    keyword: $("#keyword").value,
    maxTickets: Number($("#max-tickets").value),
    note: $("#note").value,
  });
});
$$("[data-action]").forEach((b) =>
  b.addEventListener("click", async () => {
    const action = b.dataset.action;
    if (
      ["draw","reroll"].includes(action) &&
      !confirm(
        action === "reroll" ? "Újrasorsolás a meglévő jegyekből, a nem jelentkezők kizárásával. Indítod?" : "Sorsolás a nevezéskor rögzített támogatói súlyokkal. A nyertesnek 90 másodperce lesz jelentkezni. Indítod?",
      )
    )
      return;
    await mutate(`games/${state.active.id}/${action}`, {
      requestId: crypto.randomUUID(),
    });
  }),
);
$$("[data-view]").forEach((b) =>
  b.addEventListener("click", () => switchView(b.dataset.view)),
);
$("#search").addEventListener("input", render);
$("#platform-filter").addEventListener("change", render);
$("#game-form").addEventListener("input", () => {
  draftDirty = true;
  if (!state.active || state.active.status === "draft") render();
});
$("#stream-toggle").addEventListener("click", () => {
  const open = $("#stream-content").hidden;
  $("#stream-content").hidden = !open;
  text($("#stream-toggle"), open ? "Stream elrejtése" : "Stream betöltése");
  if (open && !$("#stream").src) {
    const parent = encodeURIComponent(location.hostname);
    $("#stream").src =
      `https://player.twitch.tv/?channel=paplovag&parent=${parent}&muted=true`;
    $("#chat").src =
      `https://www.twitch.tv/embed/paplovag/chat?parent=${parent}&darkpopout`;
  }
});
$("#logout").addEventListener("click", async () => {
  if (!demo) {
    try {
      await api("auth/logout", {});
    } catch {
      notice("A kijelentkezés nem sikerült.");
      return;
    }
  }
  location.href = "/mod/";
});
$("#generate-overlay").addEventListener("click", async () => {
  if (demo) {
    $("#overlay-url").value = `${location.origin}/mod/overlay/?demo=1`;
    return;
  }
  const result = await mutate("overlay", {});
  if (result) {
    $("#overlay-url").value = result.url;
    $("#overlay-url").select();
  }
});
$("#close-winner").addEventListener("click", () => $("#winner-dialog").close());
$("#test-overlay").addEventListener("click",async()=>{
  const button=$("#test-overlay"),label=$("#overlay-test-status");button.disabled=true;
  try {
    if(demo){text(label,"Előnézeti teszt: nyisd meg a generált mintacímet az OBS-ben.");return;}
    await api("overlay/test",{requestId:crypto.randomUUID()});
    text(label,"Teszt elindítva. Az OBS overlayen néhány másodpercen belül mintanevek pörögnek, majd teszt-visszaszámláló indul.");
  }catch(e){text(label,errors[e.message] || "A tesztet nem sikerült elindítani.");}
  finally{button.disabled=false;}
});
$("#next-game").addEventListener("click", () => $("#winner-dialog").close());
function demoMutation(path, body) {
  const action = path.split("/").pop();
  if (path === "games") {
    state.active = {
      id: "demo",
      keyword: body.keyword,
      prize: body.prize,
      note: body.note,
      max_tickets: body.maxTickets,
      status: "draft",
      revision: 0,
    };
    state.entries = [];
  } else if (action === "save") {
    Object.assign(state.active, {
      keyword: body.keyword,
      prize: body.prize,
      note: body.note,
      max_tickets: body.maxTickets,
    });
  } else if (action === "archive") {
    state.active = null;
    state.entries = [];
    state.currentRound=null;
  } else if (action === "open") state.active.status = "open";
  else if (action === "close") state.active.status = "closed";
  else if (action === "refresh-supporters") {
    state.entries.forEach((e) => (e.supporter_at = new Date().toISOString()));
  } else if (action === "draw" || action === "reroll") {
    const eligible=state.entries.filter(e=>!e.excluded);
    if (!eligible.length) throw new Error("no_eligible_entries");
    const d = {
      id: crypto.randomUUID(),
      winner: eligible[0],
      prize: state.active.prize,
      actor_name: user.name,
      created_at: new Date().toISOString(),
      reveal_at:new Date(Date.now()+3000).toISOString(),claim_deadline:new Date(Date.now()+93000).toISOString(),claim_status:"awaiting",
      total_weight: eligible.reduce(
        (s, e) => s + e.tickets * (e.supporter ? 2 : 1),
        0,
      ),
      snapshot: eligible.map((e) => ({
        ...e,
        weight: e.tickets * (e.supporter ? 2 : 1),
      })),
    };
    state.history.unshift(d);
    state.active.status="drawn";state.currentRound=d;
    return { draw: d };
  }
  return { ok: true };
}
async function init() {
  if (demo) {
    user = { name: "Paplovag MOD" };
    state = {
      active: {
        id: "demo",
        prize: "Kingdom Come: Deliverance II · Steam kulcs",
        keyword: "nyeremeny",
        note: "Esti stream nyereményjátéka",
        max_tickets: 10,
        status: "open",
        next_reminder_at: new Date(
          Date.now() + 12 * 60000 + 34000,
        ).toISOString(),
      },
      entries: [
        ["TavernaLovag", "twitch", 10, 1],
        ["Csillagjáró", "youtube", 4, 1],
        ["ZöldSárkány", "kick", 7, 0],
        ["KardosMáté", "twitch", 3, 0],
        ["Holdfény", "youtube", 5, 1],
        ["PixelVitéz", "kick", 2, 1],
        ["BáróBorsó", "twitch", 8, 0],
        ["Liliom", "youtube", 1, 0],
      ].map(([name, platform, tickets, supporter], i) => ({
        user_id: String(i),
        display_name: name,
        platform,
        tickets,
        supporter,
        supporter_at: new Date().toISOString(),
      })),
      history: [],
      audit: [
        {
          action: "open",
          actor_name: "Paplovag MOD",
          created_at: new Date().toISOString(),
        },
      ],
      pending: 0,
      bot: { online: true },
    };
    $("#demo-banner").hidden = false;
  } else {
    try {
      if (!(await api("auth/status")).ready) {
        $(".twitch-login").removeAttribute("href");
        $(".twitch-login").setAttribute("aria-disabled", "true");
        text($(".twitch-login"), "Twitch-kapcsolat előkészítése");
        text($("#auth-error"), "A Twitch-belépéshez szükséges beállítás még hiányzik. Próbáld újra a bekötés után.");
        return;
      }
      user = (await api("session")).user;
    } catch (e) {
      forbidden(e.message);
      return;
    }
  }
  if(demo) {
    const stage=new URLSearchParams(location.search).get("stage");
    if(["claim","expired","claimed"].includes(stage)) {
      demoMutation("draw",{});
      if(stage==="expired") {
        state.currentRound.reveal_at=new Date(Date.now()-93000).toISOString();
        state.currentRound.claim_deadline=new Date(Date.now()-1000).toISOString();
        state.currentRound.claim_status="expired";state.entries[0].excluded=true;
      } else if(stage==="claimed"){state.currentRound.claim_status="claimed";state.currentRound.reveal_at=new Date(Date.now()-1000).toISOString();}
    }
  }
  text($("#user-name"), user.name);
  if (user.avatar && new URL(user.avatar).protocol === "https:") {
    $("#avatar").src = user.avatar;
    $("#avatar").hidden = false;
  }
  $("#auth-view").hidden = true;
  $("#app").hidden = false;
  await refresh();
  setInterval(() => {
    if (!document.hidden && !busy) refresh();
  }, 3000);
  setInterval(()=>{if(state.currentRound){if(demo&&state.currentRound.claim_status==="awaiting"&&serverTime()>=Date.parse(state.currentRound.claim_deadline)){state.currentRound.claim_status="expired";state.entries.filter(e=>e.platform===state.currentRound.winner.platform&&e.user_id===state.currentRound.winner.user_id).forEach(e=>e.excluded=true);}render();}},1000);
  setInterval(tick, 1000);
}
init();
