export const runtime = 'edge';

export default async function handler(req) {
  try {
    // Edgeでも安全にenv読む（process未定義でもOK）
    const env = (globalThis.process && process.env) || {};
    const upstreamBase = env.UPSTREAM_BASE || env.MVP_API_BASE || 'https://line-food-mvp.vercel.app';

    const inUrl = new URL(req.url);
    const target = new URL('/api/favorites' + (inUrl.search || ''), upstreamBase);

    // 元のRequestを丸ごとクローンしてURLだけ差し替え（禁止ヘッダの扱いは実装に任せる）
    const upstreamReq = new Request(target.toString(), req);

    const r = await fetch(upstreamReq);

    // 返却ヘッダを調整（圧縮系を外し、診断用ヘッダを付与）
    const hdr = new Headers(r.headers);
    hdr.delete('content-encoding');
    hdr.delete('transfer-encoding');
    hdr.set('x-proxy-target', target.toString());

    return new Response(r.body, { status: r.status, headers: hdr });
  } catch (err) {
    // ここに来ても必ず Response を返す（Vercelの500=未捕捉エラーを防ぐ）
    const msg = (err && (err.stack || err.message)) || String(err);
    return new Response(JSON.stringify({ ok: false, where: 'favorites', error: msg }), {
      status: 502,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
}
