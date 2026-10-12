const token = location.hash.slice(1);
history.replaceState(null, "", location.pathname + location.search);
const demo = new URLSearchParams(location.search).get("demo") === "1";
let lastId = sessionStorage.getItem("paplovag-overlay-last") || "",
  playing = false;
function status(text) {
  const el = document.querySelector("#connection");
  el.textContent = text;
  el.hidden = !text;
}
async function reveal(draw) {
  playing = true;
  const result = document.querySelector("#result");
  result.hidden = false;
  result.classList.add("rolling");
  document.querySelector("#prize").textContent = draw.prize;
  document.querySelector("#moderator").textContent = "";
  const names = ["✦", "A következő szerencsés…", "✦"];
  let i = 0;
  const interval = setInterval(
    () =>
      (document.querySelector("#winner").textContent =
        names[i++ % names.length]),
    180,
  );
  await new Promise((r) => setTimeout(r, 2400));
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
}
async function poll() {
  if (playing) return;
  if (demo) {
    if (!lastId) {
      lastId = "demo";
      reveal({
        prize: "Steam játékkulcs",
        winner: { display_name: "TavernaLovag", platform: "twitch" },
        actor_name: "Paplovag MOD",
      });
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
    if (!r.ok) throw new Error();
    const { draw } = await r.json();
    status("");
    if (draw && draw.id !== lastId) {
      lastId = draw.id;
      sessionStorage.setItem("paplovag-overlay-last", lastId);
      reveal(draw);
    }
  } catch {
    status("Az overlay kapcsolata megszakadt. Újrapróbálás…");
  }
}
poll();
setInterval(poll, 3000);
