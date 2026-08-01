var currentPlaylistIndex = 0;
var playlists = [];

async function fetchYouTubeData(type) {
  const response = await fetch(
    `/api/youtube?type=${encodeURIComponent(type)}`,
    {
      headers: { Accept: "application/json" },
    }
  );

  let data = {};
  try {
    data = await response.json();
  } catch {
    // Egységes hibaüzenet lent.
  }

  if (!response.ok) {
    const reason = data.reason ? ` (${data.reason})` : "";
    throw new Error(`A YouTube-adatok lekérése sikertelen${reason}.`);
  }

  return data;
}

async function execute() {
  try {
    const response = await fetchYouTubeData("playlists");
    playlists = Array.isArray(response.items) ? response.items : [];
    currentPlaylistIndex = 0;
    updatePlaylistDOM();
  } catch (error) {
    console.error("Playlist loading error:", error);
  }
}

function updatePlaylistDOM() {
  const playlistElement = document.getElementById("playlist");
  if (!playlistElement) return;

  playlistElement.replaceChildren();

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

    const playlistElementItem = document.createElement("li");
    playlistElementItem.className = className;
    playlistElementItem.dataset.index = String(index + 1);

    const clickable = document.createElement("div");
    clickable.className = "item";
    clickable.style.cursor = "pointer";
    clickable.setAttribute("role", "link");
    clickable.tabIndex = 0;

    const openPlaylist = function () {
      redirectToYouTube(playlist.id);
    };

    clickable.addEventListener("click", openPlaylist);
    clickable.addEventListener("keydown", function (event) {
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

    const backgroundImage = document.createElement("div");
    backgroundImage.className = "img";

    if (playlist.thumbnailUrl) {
      backgroundImage.style.backgroundImage =
        `url("${playlist.thumbnailUrl}")`;
    }

    itemInner.appendChild(backgroundImage);
    clickable.append(image, itemInner);
    playlistElementItem.appendChild(clickable);
    playlistElement.appendChild(playlistElementItem);
  });
}

function previousPlaylist() {
  if (currentPlaylistIndex > 0) {
    currentPlaylistIndex--;
    updatePlaylistDOM();
  }
}

function nextPlaylist() {
  if (currentPlaylistIndex < playlists.length - 1) {
    currentPlaylistIndex++;
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
  const liveVideo = document.getElementById("liveVideo");

  if (modal) modal.style.display = "none";
  if (liveVideo) liveVideo.src = "";
}

async function checkLiveStatus() {
  try {
    const data = await fetchYouTubeData("live");
    const modal = document.getElementById("myModal");
    const liveVideo = document.getElementById("liveVideo");

    if (!modal || !liveVideo) return;

    if (data.liveVideoId) {
      liveVideo.src =
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

// A meglévő HTML onclick attribútumai miatt globálisan elérhetők maradnak.
window.previousPlaylist = previousPlaylist;
window.nextPlaylist = nextPlaylist;
window.redirectToYouTube = redirectToYouTube;

document.addEventListener("DOMContentLoaded", function () {
  const closeButton = document.querySelector("#myModal .close");

  if (closeButton) {
    closeButton.addEventListener("click", closeLiveModal);
  }

  execute();
  checkLiveStatus();

  // A Cloudflare végpont 30 percig cache-eli az élő állapotot.
  window.setInterval(checkLiveStatus, 300000);
});
