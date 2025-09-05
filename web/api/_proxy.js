// web/api/_proxy.js  (ESM)
export default async function proxy(req, res, { pathRewrite } = {}) {
  const upstream =
    process.env.UPSTREAM_BASE ||
    process.env.MVP_API_BASE ||
    'https://line-food-mvp.vercel.app';

  const url = new URL(req.url, `https://${req.headers.host}`);
  const target =
    upstream.replace(/\/$/, '') +
    (pathRewrite || url.pathname) +
    (url.search || '');

  // デバッグしやすいように転送先を必ず付ける
  res.setHeader('x-proxy-target', target);

  // 転送ヘッダ（Host/Content-Length/Accept-Encoding は外す）
  const headers = { ...req.headers };
  delete headers.host;
  delete headers['content-length'];
  delete headers['accept-encoding'];
  headers['x-forwarded-host'] = req.headers.host;
  headers['x-forwarded-proto'] = 'https';

  // ボディ読み込み（GET/HEADは null）
  const body = await new Promise((resolve) => {
    if (req.method === 'GET' || req.method === 'HEAD') return resolve(null);
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => resolve(null));
  });

  try {
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
  } catch (err) {
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('x-proxy-error', String(err?.message || err));
    res.end(
      JSON.stringify({
        ok: false,
        error: 'proxy_failed',
        message: String(err?.message || err),
        target,
      })
    );
  }
}
