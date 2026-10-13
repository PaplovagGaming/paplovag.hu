const UPSTREAM = "https://kingdom.paplovag.hu";
export async function onRequest({ request }) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/mod/"))
    return new Response("Not found", { status: 404 });
  const target = new URL(url.pathname + url.search, UPSTREAM);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("x-forwarded-host");
  headers.delete("x-forwarded-proto");
  const cookies = (headers.get("cookie") || "")
    .split(";")
    .map((v) => v.trim())
    .filter(
      (v) =>
        v.startsWith("__Host-mod_session=") ||
        v.startsWith("__Host-mod_oauth="),
    );
  headers.delete("cookie");
  if (cookies.length) headers.set("cookie", cookies.join("; "));
  try {
    const response = await fetch(target, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "manual",
      signal: AbortSignal.timeout(url.pathname.startsWith('/api/mod/stream')?45000:20000),
    });
    const resultHeaders = new Headers(response.headers);
    resultHeaders.set("cache-control", "no-store");
    resultHeaders.set("x-content-type-options", "nosniff");
    return new Response(response.body, {
      status: response.status,
      headers: resultHeaders,
    });
  } catch {
    return new Response(JSON.stringify({ error: "mod_service_unavailable" }), {
      status: 503,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  }
}
