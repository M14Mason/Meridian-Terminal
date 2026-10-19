// M0 stub. M1 replaces this with pairing, allowlists, rate limits and the rest of the proxy.
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') {
      return Response.json({ ok: true, service: 'meridian-proxy', time: new Date().toISOString() });
    }
    return Response.json({ error: 'not found' }, { status: 404 });
  },
} satisfies ExportedHandler;
