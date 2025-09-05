// web/api/favorites.js
export const runtime = 'edge';

export default async function handler(req) {
  try {
    const upstream =
      (globalThis.process && process.env && process.env.UPSTREAM_BASE) ||
      'https://line-food-mvp.vercel.app';

    const inUrl = new URL(req.url);
    const target =
      upstream.replace(/\/$/, '') + '/api/favorites' + (inUrl.search || '');

    // 転送ヘッダ
    const headers = new Headers(req.headers);
    headers.delete('host');
    headers.delete('accept-encoding');
    headers.delete('content-length');
    headers.set('x-forwarded-host', inUrl.host);
    headers.set('x-forwarded-proto', inUrl.protocol.replace(':', ''));

    const method = req.method || 'GET';
    const init = { method, headers };
    if (method !== 'GET' && method !== 'HEAD') {
      // EdgeはReadableStreamのまま渡せます
      init.body = req.body ?? undefined;
    }

    // ← ここで redirect は指定しない（manual は落ちやすい）
    const r = await fetch(target, init);

    const out = new Headers(r.headers);
    out.set('x-handler', 'edge-proxy');
    out.set('x-proxy-target', target);

    return new Response(r.body, { status: r.status, headers: out });
  } catch (e) {
    // 500を返さず 502 + 詳細
    const msg = (e && (e.stack || e.message)) || String(e);
    return new Response(JSON.stringify({
      ok: false, error: 'edge_proxy_failed', message: msg
    }), {
      status: 502,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
}
