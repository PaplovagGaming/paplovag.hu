export async function onRequest({ next }) {
  const response = await next();
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store");
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-content-type-options", "nosniff");
  headers.set(
    "content-security-policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://static-cdn.jtvnw.net; connect-src 'self'; frame-src https://player.twitch.tv https://www.twitch.tv; object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
  );
  return new Response(response.body, { status: response.status, headers });
}
