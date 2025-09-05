// web/api/_proxy.js  (ESM / Node runtime)
import { URL } from 'node:url';

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.method === 'GET' || req.method === 'HEAD') return resolve(null);
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res, { pathRewrite } = {}) {
  try {
    // 1) 上流の決定（※自分自身はダメ）
    const upstream =
      process.env.UPSTREAM_BASE || process.env.MVP_API_BASE || '';

    // 要求URL
    const incoming = new URL(req.url, `https://${req.headers.host}`);
    const path = pathRewrite || incoming.pathname;
    const target = (upstream || '').replace(/\/$/, '') + path + (incoming.search || '');

    // デバッグ用に常に転送先を出す
    res.setHeader('x-proxy-target', target || '(none)');

    // ★自己ループの明示遮断（upstream 未設定 or 自分自身）
    if (!upstream) {
      res.statusCode = 502;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: false, error: 'UPSTREAM_BASE not set' }));
      return;
    }
    const tgtHost = new URL(target).host;
    const selfHost = req.headers.host;
    if (tgtHost === selfHost) {
      res.statusCode = 508; // ループ検出
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: false, error: 'proxy loop: upstream equals self', host: selfHost }));
      return;
    }

    // 転送ヘッダ（Host / Content-Length / Accept-Encoding は外す）
    const headers = { ...req.headers };
    delete headers.host;
    delete headers['content-length'];
    delete headers['accept-encoding'];
    headers['x-forwarded-host'] = selfHost;
    headers['x-forwarded-proto'] = 'https';

    const body = await readBody(req);

    const r = await fetch(target, {
      method: req.method || 'GET',
      headers,
      body,
      redirect: 'manual',
    });

    res.statusCode = r.status;
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
    res.end(JSON.stringify({ ok: false, error: String(e && e.message || e) }));
  }
}
