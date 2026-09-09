(() => {
  const labels = {
    en: {
      title: "Latest 5 Shorts",
      sub: "The five most recent short-form uploads."
    },
    hu: {
      title: "Legutóbbi 5 Shorts",
      sub: "Az öt legfrissebb rövid formátumú videó."
    },
    de: {
      title: "Neueste 5 Shorts",
      sub: "Die fünf neuesten Kurzformat-Videos."
    }
  };

  if (typeof paintGrid !== "function" || typeof videoCard !== "function") return;

  const originalPaintGrid = paintGrid;

  function updateShortsCopy() {
    const lang = typeof currentLang === "string" && labels[currentLang] ? currentLang : "en";
    const title = document.querySelector('[data-i18n="content.shortsTitle"]');
    const sub = document.querySelector('[data-i18n="content.shortsSub"]');
    if (title) title.textContent = labels[lang].title;
    if (sub) sub.textContent = labels[lang].sub;
  }

  paintGrid = function(id, items, options = {}) {
    if (id !== "shorts-grid") {
      return originalPaintGrid(id, items, options);
    }

    const grid = document.getElementById(id);
    if (!grid) return;
    grid.innerHTML = "";

    if (!Array.isArray(items) || !items.length) {
      const empty = document.createElement("div");
      empty.className = "tp-video-empty";
      empty.textContent = typeof t === "function" ? t("content.empty") : "Videos are being updated.";
      grid.appendChild(empty);
      updateShortsCopy();
      return;
    }

    items.slice(0, 5).forEach((item) => {
      grid.appendChild(videoCard(item, { ...options, portrait: true, rank: null }));
    });

    updateShortsCopy();
  };
})();
