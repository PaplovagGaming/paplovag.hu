let token = location.hash.slice(1);
// OBS may restrict browser storage. The configured URL remains the source of truth.
try {
  if(!token)token=sessionStorage.getItem("paplovag-overlay-token") || "";
  if(token)sessionStorage.setItem("paplovag-overlay-token",token);
} catch { /* Storage is optional; a full overlay URL works without it. */ }
const demo = new URLSearchParams(location.search).get("demo") === "1";
let lastId = "",
  playing = false;
let currentDraw=null,clockOffset=0;
const serverTime=()=>Date.now()+clockOffset;
function countdown() {
  const d=currentDraw,el=document.querySelector("#claim-clock");
  if(!d||!d.claim_deadline){el.hidden=true;return;}
  el.hidden=false;
  const left=Math.max(0,Math.ceil((Date.parse(d.claim_deadline)-serverTime())/1000));
  el.textContent=d.test?(serverTime()<Date.parse(d.reveal_at)?"✦ Tesztpörgetés…":`${left} mp · TESZT – nincs valódi nyertes`):d.game_status==="archived"?"Nyereményjáték lezárva":d.claim_status==="claimed"?"✓ A nyertes jelentkezett":serverTime()<Date.parse(d.reveal_at)?"✦ Pörgetés…":left===0?"Nem jelentkezett – újrasorsolás következhet":`${left} mp · Írj bármit a ${d.winner.platform} chatbe!`;
}
function status(text) {
  const el = document.querySelector("#connection");
  el.textContent = text;
  el.hidden = !text;
}
async function reveal(draw) {
  playing = true;
  const result = document.querySelector("#result");
  result.hidden = false;
  const heading=document.querySelector('#overlay-heading');
  if(heading)heading.textContent=draw.test?'OVERLAY TESZT – MINTANEVEK':'PAPLOVAG NYEREMÉNYJÁTÉK';
  result.classList.add("rolling");
  document.querySelector("#prize").textContent = draw.prize;
  document.querySelector("#moderator").textContent = "";
  const names = draw.candidates?.length ? draw.candidates : ["✦", "A következő szerencsés…", "✦"];
  let i = 0;
  const interval = setInterval(
    () =>
      (document.querySelector("#winner").textContent =
        names[i++ % names.length]),
    180,
  );
  await new Promise((r) => setTimeout(r, Math.max(0,Date.parse(draw.reveal_at || new Date(serverTime()+3000).toISOString())-serverTime())));
  clearInterval(interval);
  result.classList.remove("rolling");
  document.querySelector("#winner").textContent = draw.winner.display_name;
  document.querySelector("#moderator").textContent =
    `${draw.winner.platform} · Sorsolta: ${draw.actor_name}`;
  for (let i = 0; i < 65; i++) {
    const piece = document.createElement("i");
    piece.className = "confetti";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = ["#b18dff", "#e4cbff", "#f8d477", "#82dab5"][
      i % 4
    ];
    piece.style.animationDelay = `${Math.random()}s`;
    document.body.append(piece);
    setTimeout(() => piece.remove(), 4500);
  }
  playing = false;
  countdown();
}
async function poll() {
  if (playing) return;
  if (demo) {
    if (!lastId) {
      lastId = "demo";
      currentDraw={
        test:true,
        id:"demo",reveal_at:new Date(Date.now()+3000).toISOString(),claim_deadline:new Date(Date.now()+93000).toISOString(),claim_status:"awaiting",
        candidates:["TavernaLovag","Paplovag","GarasVadasz","StreamLovag"],
        prize: "Steam játékkulcs",
        winner: { display_name: "TavernaLovag", platform: "twitch" },
        actor_name: "Paplovag MOD",
      };reveal(currentDraw);
    }
    return;
  }
  if (!token) {
    status("Nincs overlay-cím. Készíts újat a MOD Centerben.");
    return;
  }
  try {
    const r = await fetch("/api/mod/overlay", {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (r.status===401) {status("Az overlay címe érvénytelen vagy lecserélték. Másold be a MOD Centerben generált teljes címet az OBS-be.");return;}
    if (!r.ok) throw new Error();
    const { draw,serverNow } = await r.json();
    clockOffset=Date.parse(serverNow)-Date.now();currentDraw=draw;
    status("");
    if(!draw){document.querySelector('#result').hidden=true;lastId='';countdown();return;}
    if (draw && draw.id !== lastId) {
      lastId = draw.id;
      reveal(draw);
    }
    countdown();
  } catch {
    status("Az overlay kapcsolata megszakadt. Újrapróbálás…");
  }
}
poll();
setInterval(poll, 1000);
setInterval(countdown,250);
