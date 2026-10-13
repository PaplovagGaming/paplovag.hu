(function () {
  "use strict";
  // Ten days from launch, in Budapest time. No Gleam request after expiry.
  var startsAt = Date.parse("2026-10-13T17:50:00+02:00");
  var expiresAt = Date.parse("2026-10-23T17:50:00+02:00");
  var storageKey = "paplovag:giveaway:dBpTD:dismissed";
  var giveawayUrl = "https://gleam.io/dBpTD/hellraiser-revival-nyeremenyjatek";
  function active() { return Date.now() >= startsAt && Date.now() < expiresAt; }
  if (!active() || typeof HTMLDialogElement === "undefined") return;

  function today() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest" }).format(new Date());
  }
  var dismissed = false;
  try { dismissed = localStorage.getItem(storageKey) === today(); } catch (_) {}
  var dialog = document.createElement("dialog");
  dialog.id = "paplovag-giveaway";
  dialog.setAttribute("aria-labelledby", "paplovag-giveaway-title");
  dialog.innerHTML = '<div class="giveaway-header"><h2 id="paplovag-giveaway-title">Hellraiser Revival nyereményjáték!</h2><button class="giveaway-close" type="button" aria-label="Nyereményjáték bezárása" autofocus>&times;</button></div><div class="giveaway-body"><div class="giveaway-widget"></div><a class="giveaway-link" target="_blank" rel="nofollow noopener" href="' + giveawayUrl + '">Megnyitás a Gleam oldalán ↗</a></div>';
  var launcher = document.createElement("button");
  launcher.id = "paplovag-giveaway-launcher";
  launcher.type = "button";
  launcher.textContent = "🎁 Nyereményjáték";
  launcher.setAttribute("aria-haspopup", "dialog");
  launcher.setAttribute("aria-controls", dialog.id);
  document.body.append(launcher, dialog);
  var loaded = false;
  function open() {
    if (!active()) { expire(); return; }
    if (dialog.open) return;
    dialog.showModal();
    if (loaded) return;
    loaded = true;
    var anchor = document.createElement("a");
    anchor.className = "e-widget no-button";
    anchor.href = giveawayUrl;
    anchor.rel = "nofollow";
    anchor.textContent = "Hellraiser Revival nyereményjáték!";
    dialog.querySelector(".giveaway-widget").appendChild(anchor);
    var script = document.createElement("script");
    script.src = "https://widget.gleamjs.io/e.js";
    script.async = true;
    dialog.querySelector(".giveaway-widget").appendChild(script);
  }
  function dismiss() {
    try { localStorage.setItem(storageKey, today()); } catch (_) {}
    dialog.close();
    launcher.focus({ preventScroll: true });
  }
  launcher.addEventListener("click", open);
  dialog.querySelector(".giveaway-close").addEventListener("click", dismiss);
  dialog.addEventListener("cancel", function (event) { event.preventDefault(); dismiss(); });
  dialog.addEventListener("click", function (event) {
    if (event.target !== dialog) return;
    var rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dismiss();
  });
  var autoOpen = dismissed ? null : setTimeout(open, 1500);
  var expiryCheck = setInterval(function () { if (!active()) expire(); }, 1000);
  function expire() {
    clearTimeout(autoOpen);
    clearInterval(expiryCheck);
    if (dialog.open) dialog.close();
    dialog.remove();
    launcher.remove();
  }
})();
