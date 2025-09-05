// ESM proxy for Node runtime
export default async function proxy(req, res, { pathRewrite } = {}) {
  try {
    const upstream =
      process.env.UPSTREAM_BASE ||
      process.env.MVP_API_BASE ||
      'https://line-food-mvp.vercel.app';

    const incoming = new URL(req.url, 'https://dummy.local');
    const target =
      upstream.replace(/\/$/, '') +
      (pathRewrite || incoming.pathname) +
      (incoming.search || '');

    const headers = { ...req.headers };
    delete headers.host;
    delete headers['content-length'];
    delete headers['accept-encoding'];
    headers['x-forwarded-host'] = req.headers.host || '';
    headers['x-forwarded-proto'] = 'https';

    const chunks = [];
    await new Promise((ok) => {
      req.on('data', (c) => chunks.push(c));
      req.on('end', ok);
      req.on('error', ok);
    });
    const body = chunks.length ? Buffer.concat(chunks) : undefined;

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
    res.setHeader('x-proxy-target', target);

    const buf = Buffer.from(await r.arrayBuffer());
    res.end(buf);
  } catch (e) {
    console.error('[proxy] error', e);
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
  }
}
