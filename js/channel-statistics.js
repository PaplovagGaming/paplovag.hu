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

  var controller = new AbortController();
  var timeout = window.setTimeout(function () { controller.abort(); }, 10000);
  fetch("/api/youtube?type=statistics&channel=paplovag", {
    credentials: "omit",
    headers: { Accept: "application/json" },
    signal: controller.signal
  }).then(function (response) {
    if (!response.ok) throw new Error("Channel statistics unavailable");
    return response.json();
  }).then(function (data) {
    counters.forEach(function (counter) {
      var value = data[counter.dataset.channelStat];
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
        counter.title = "Az aktuális adat átmenetileg nem elérhető.";
        return;
      }
      values.set(counter, value);
      if (counter.dataset.channelStat === "subscribers" && data.subscribersUpdatedAt) {
        var date = new Date(data.subscribersUpdatedAt);
        if (Number.isFinite(date.getTime())) {
          counter.title = "Frissítve: " + date.toLocaleDateString("hu-HU", { timeZone: "Europe/Budapest" });
        }
      }
      render(counter);
    });
  }).catch(function () {
    counters.forEach(function (counter) {
      counter.title = "Az aktuális adat átmenetileg nem elérhető.";
    });
  }).finally(function () { window.clearTimeout(timeout); });
}());
