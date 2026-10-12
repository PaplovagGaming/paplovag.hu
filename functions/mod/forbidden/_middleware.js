export async function onRequest({ next }) {
  const r = await next();
  return new Response(r.body, { status: 403, headers: r.headers });
}
