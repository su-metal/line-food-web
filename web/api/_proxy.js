// web/api/_proxy.js  (ESM / Node runtime)
import { URL as NodeURL } from 'url';

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.method === 'GET' || req.method === 'HEAD') return resolve(null);
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function proxy(req, res, { pathRewrite } = {}) {
  // 上流のベースURL。line-food-web では UPSTREAM_BASE を使う想定
  const upstream = process.env.UPSTREAM_BASE || process.env.MVP_API_BASE;
  if (!upstream) {
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'UPSTREAM_BASE not set' }));
    return;
  }

  const incoming = new NodeURL(req.url, `https://${req.headers.host}`);
  const path = pathRewrite ?? incoming.pathname;
  const targetURL = new NodeURL(
    upstream.replace(/\/$/, '') + path + (incoming.search || ''),
    upstream
  );

  // ループ防止（同じホストへ向けてしまう設定だと 508 を返す）
  if (targetURL.host === req.headers.host) {
    res.statusCode = 508;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('x-proxy-target', targetURL.toString());
    res.end(JSON.stringify({ ok: false, error: 'loop_detected', target: targetURL.toString() }));
    return;
  }

  const headers = { ...req.headers };
  delete headers.host;
  delete headers['content-length'];
  delete headers['accept-encoding'];
  headers['x-forwarded-host'] = req.headers.host;
  headers['x-forwarded-proto'] = 'https';

  let body = null;
  try { body = await readBody(req); } catch { /* ignore */ }

  try {
    const r = await fetch(targetURL, {
      method: req.method || 'GET',
      headers,
      body,
      redirect: 'manual',
    });

    res.statusCode = r.status;
    res.setHeader('x-proxy-target', targetURL.toString());
    r.headers.forEach((v, k) => {
      const key = k.toLowerCase();
      if (key === 'content-encoding' || key === 'transfer-encoding') return;
      res.setHeader(k, v);
    });
    const buf = Buffer.from(await r.arrayBuffer());
    res.end(buf);
  } catch (e) {
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('x-proxy-target', targetURL.toString());
    res.end(JSON.stringify({ ok: false, error: 'fetch_failed', message: String(e) }));
  }
}
