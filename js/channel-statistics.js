(function () {
  "use strict";
  var counters = Array.from(document.querySelectorAll("[data-channel-stat]"));
  if (!counters.length) return;
  var values = new Map();
  var visible = new Set();
  var animated = new Set();
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function render(counter) {
    if (!visible.has(counter) || !values.has(counter) || animated.has(counter)) return;
    animated.add(counter);
    var value = values.get(counter);
    if (reducedMotion) {
      counter.textContent = String(value);
      return;
    }
    var start;
    function tick(now) {
      if (start === undefined) start = now;
      var progress = Math.min(1, (now - start) / 1500);
      counter.textContent = String(Math.round(value * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) window.requestAnimationFrame(tick);
    }
    window.requestAnimationFrame(tick);
  }

  var observer;
  if ("IntersectionObserver" in window) {
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        visible.add(entry.target);
        observer.unobserve(entry.target);
        render(entry.target);
      });
    }, { rootMargin: "0px 0px -10% 0px" });
    counters.forEach(function (counter) { observer.observe(counter); });
  } else {
    counters.forEach(function (counter) { visible.add(counter); });
  }

  function load(platform, endpoint) {
    var selected = counters.filter(function (counter) {
      return (counter.dataset.statPlatform || "youtube") === platform;
    });
    if (!selected.length) return;
    var controller = new AbortController();
    var timeout = window.setTimeout(function () { controller.abort(); }, platform === "twitch" ? 25000 : 15000);
    fetch(endpoint, {
      credentials: "omit",
      headers: { Accept: "application/json" },
      signal: controller.signal
    }).then(function (response) {
      if (!response.ok) {
        var error = new Error("Channel statistics unavailable");
        error.status = response.status;
        throw error;
      }
      return response.json();
    }).then(function (data) {
      selected.forEach(function (counter) {
        var value = data[counter.dataset.channelStat];
        if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
          counter.title = "Az aktuális adat átmenetileg nem elérhető.";
          return;
        }
        values.set(counter, value);
        counter.title = "";
        var updatedAt = platform === "twitch" ? data.updatedAt :
          (counter.dataset.channelStat === "subscribers" ? data.subscribersUpdatedAt : null);
        if (updatedAt) {
          var date = new Date(updatedAt);
          if (Number.isFinite(date.getTime())) {
            counter.title = (data.stale ? "Utolsó sikeres frissítés: " : "Frissítve: ") +
              date.toLocaleString("hu-HU", { timeZone: "Europe/Budapest" });
          }
        }
        render(counter);
      });
    }).catch(function (error) {
      selected.forEach(function (counter) {
        if (platform === "twitch") {
          counter.title = error.status === 503 ?
            "Korábban megadott érték; a Twitch-adatkapcsolat aktiválásra vár." :
            "Korábban megadott érték; az aktuális Twitch-adat átmenetileg nem elérhető.";
        } else {
          counter.title = "Az aktuális adat átmenetileg nem elérhető.";
        }
      });
    }).finally(function () { window.clearTimeout(timeout); });
  }
  load("youtube", "/api/youtube?type=statistics&channel=paplovag");
  load("twitch", "https://kingdom.paplovag.hu/api/creator/twitch/public");
}());
