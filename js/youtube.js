var currentPlaylistIndex = 0;
var playlists = [];

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  let data;
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    const reason = data.reason ? ` (${data.reason})` : "";
    throw new Error(`A YouTube-adatok lekérése sikertelen${reason}.`);
  }

  return data;
}

async function loadPlaylists() {
  try {
    const data = await fetchJson("/api/youtube?type=playlists");
    playlists = Array.isArray(data.items) ? data.items : [];
    currentPlaylistIndex = 0;
    updatePlaylistDOM();
  } catch (error) {
    console.error("Playlist loading error:", error);
  }
}

function updatePlaylistDOM() {
  const list = document.getElementById("playlist");
  if (!list) return;

  list.replaceChildren();

  playlists.forEach((playlist, index) => {
    let className = "item";

    if (index === currentPlaylistIndex) {
      className = "active";
    } else if (index === currentPlaylistIndex - 1) {
      className = "prev";
    } else if (index === currentPlaylistIndex + 1) {
      className = "next";
    } else if (index === currentPlaylistIndex + 2) {
      className = "next2";
    }

    const listItem = document.createElement("li");
    listItem.className = className;
    listItem.dataset.index = String(index + 1);

    const clickable = document.createElement("div");
    clickable.className = "item";
    clickable.style.cursor = "pointer";
    clickable.setAttribute("role", "link");
    clickable.tabIndex = 0;

    const openPlaylist = () => redirectToYouTube(playlist.id);
    clickable.addEventListener("click", openPlaylist);
    clickable.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPlaylist();
      }
    });

    const image = document.createElement("img");
    image.src = playlist.thumbnailUrl || "img/1x1.jpg";
    image.alt = playlist.title || "YouTube lejátszási lista";
    image.loading = "lazy";

    const itemInner = document.createElement("div");
    itemInner.className = "item_in";

    const background = document.createElement("div");
    background.className = "img";
    if (playlist.thumbnailUrl) {
      background.style.backgroundImage = `url("${playlist.thumbnailUrl}")`;
    }

    itemInner.appendChild(background);
    clickable.append(image, itemInner);
    listItem.appendChild(clickable);
    list.appendChild(listItem);
  });
}

function previousPlaylist() {
  if (currentPlaylistIndex > 0) {
    currentPlaylistIndex -= 1;
    updatePlaylistDOM();
  }
}

function nextPlaylist() {
  if (currentPlaylistIndex < playlists.length - 1) {
    currentPlaylistIndex += 1;
    updatePlaylistDOM();
  }
}

function redirectToYouTube(playlistId) {
  if (!playlistId) return;
  window.open(
    `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`,
    "_blank",
    "noopener"
  );
}

function closeLiveModal() {
  const modal = document.getElementById("myModal");
  const iframe = document.getElementById("liveVideo");

  if (modal) modal.style.display = "none";
  if (iframe) iframe.src = "";
}

async function checkLiveStatus() {
  try {
    const data = await fetchJson("/api/youtube?type=live");
    const modal = document.getElementById("myModal");
    const iframe = document.getElementById("liveVideo");

    if (!modal || !iframe) return;

    if (data.liveVideoId) {
      iframe.src =
        `https://www.youtube.com/embed/${encodeURIComponent(data.liveVideoId)}` +
        "?autoplay=1&mute=1";
      modal.style.display = "block";
    } else {
      closeLiveModal();
    }
  } catch (error) {
    console.error("Live-status error:", error);
    closeLiveModal();
  }
}

// A meglévő HTML onclick attribútumai miatt legyenek globálisan elérhetők.
window.previousPlaylist = previousPlaylist;
window.nextPlaylist = nextPlaylist;
window.redirectToYouTube = redirectToYouTube;

document.addEventListener("DOMContentLoaded", function () {
  const closeButton = document.querySelector("#myModal .close");
  if (closeButton) {
    closeButton.addEventListener("click", closeLiveModal);
  }

  loadPlaylists();
  checkLiveStatus();
  window.setInterval(checkLiveStatus, 300000);
});
