// web/api/_proxy.js (CommonJS)
const { URL } = require('url');

function readBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return null;
  const chunks = [];
  return new Promise((resolve, reject) => {
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async function proxy(req, res, { pathRewrite } = {}) {
  const upstream =
    process.env.UPSTREAM_BASE ||
    process.env.MVP_API_BASE ||
    'https://line-food-mvp.vercel.app';

  const incoming = new URL(req.url, `https://${req.headers.host}`);
  const path = pathRewrite || incoming.pathname;
  const target = upstream.replace(/\/$/, '') + path + (incoming.search || '');

  const headers = { ...req.headers };
  delete headers.host;
  delete headers['content-length'];
  delete headers['accept-encoding'];
  headers['x-forwarded-host'] = req.headers.host;
  headers['x-forwarded-proto'] = 'https';

  res.setHeader('x-proxy-target', target);

  try {
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
  } catch (err) {
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('x-proxy-error', String(err?.message || err));
    res.end(JSON.stringify({ ok: false, error: 'fetch_failed', target }));
  }
};
