const form = document.getElementById("media-kit-login-form");
const passwordInput = document.getElementById("media-kit-password");
const statusEl = document.getElementById("media-kit-login-status");

function setStatus(message, type = "") {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `tp-status ${type}`.trim();
}

function safeNextPath() {
  try {
    const raw = new URL(window.location.href).searchParams.get("next") || "/tuzproba/media-kit/";
    if (raw.startsWith("/tuzproba/media-kit")) return raw;
  } catch {}
  return "/tuzproba/media-kit/";
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Checking password…");

  try {
    const response = await fetch("/api/tuzproba-media-kit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action: "login", password: passwordInput?.value || "" })
    });

    let payload = {};
    try { payload = await response.json(); } catch {}

    if (!response.ok) {
      if (payload.error === "invalid_password") {
        setStatus("Incorrect password · Hibás jelszó · Falsches Passwort", "error");
        passwordInput?.select();
        return;
      }
      if (payload.error === "password_not_configured") {
        setStatus("Password protection is not configured yet.", "error");
        return;
      }
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    setStatus("Access granted.", "ok");
    window.location.replace(safeNextPath());
  } catch (error) {
    setStatus(`Login failed: ${error.message}`, "error");
  }
});
