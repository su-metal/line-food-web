// web/api/favorites.js  — Edgeで落ちない最小プロキシ
export const runtime = 'edge';

export default async function handler(req) {
  try {
    // EdgeでもReferenceErrorにならないように安全に読む
    const upstream =
      (globalThis.process && process.env && process.env.UPSTREAM_BASE) ||
      'https://line-food-mvp.vercel.app';

    const inUrl = new URL(req.url);
    const target =
      upstream.replace(/\/$/, '') + '/api/favorites' + (inUrl.search || '');

    // 転送ヘッダ（落ちやすいものは削る）
    const fwdHeaders = new Headers(req.headers);
    fwdHeaders.delete('host');
    fwdHeaders.delete('accept-encoding');
    // 逆プロキシ情報が必要なら（任意）
    fwdHeaders.set('x-forwarded-host', inUrl.host);
    fwdHeaders.set('x-forwarded-proto', inUrl.protocol.replace(':', ''));

    // GET/HEAD以外だけボディを渡す（EdgeはそのままストリームでOK）
    const method = req.method || 'GET';
    const body = method === 'GET' || method === 'HEAD' ? undefined : req.body;

    const r = await fetch(target, { method, headers: fwdHeaders, body, redirect: 'manual' });

    // デバッグ用ヘッダを付与（どこへ飛ばしたか見える）
    const outHeaders = new Headers(r.headers);
    outHeaders.set('x-handler', 'edge-proxy');
    outHeaders.set('x-proxy-target', target);

    return new Response(r.body, { status: r.status, headers: outHeaders });
  } catch (e) {
    // 例外で500を返す代わりに、原因を見やすく返す（暫定）
    const msg = (e && (e.stack || e.message)) || String(e);
    return new Response(JSON.stringify({ ok: false, error: 'edge_proxy_failed', message: msg }), {
      status: 502,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
}
