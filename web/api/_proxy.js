// web/api/_proxy.js (ESM, Node runtime)
function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.method === 'GET' || req.method === 'HEAD') return resolve(null);
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res, { pathRewrite } = {}) {
  // 上流の決定（環境変数のどれかが入っていればOK）
  const upstream =
    process.env.UPSTREAM_BASE ||
    process.env.SUPABASE_URL ||
    process.env.MVP_API_BASE;

  if (!upstream) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'no upstream configured' }));
    return;
  }

  const incoming = new URL(req.url, `https://${req.headers.host}`);
  const path = pathRewrite || incoming.pathname; // ラッパーから書き換え指定があれば使う
  const target = upstream.replace(/\/$/, '') + path + (incoming.search || '');

  // 転送ヘッダ（Host/Length/Encodingは外す）
  const fwdHeaders = { ...req.headers };
  delete fwdHeaders.host;
  delete fwdHeaders['content-length'];
  delete fwdHeaders['accept-encoding'];

  // 便利ヘッダ
  fwdHeaders['x-forwarded-host'] = req.headers.host;
  fwdHeaders['x-forwarded-proto'] = 'https';

  const body = await readBody(req);

  const r = await fetch(target, {
    method: req.method || 'GET',
    headers: fwdHeaders,
    body,
    redirect: 'manual',
  });

  // ステータス & デバッグ用ヘッダ
  res.statusCode = r.status;
  res.setHeader('x-proxy-target', target);

  // 通常ヘッダのコピー（圧縮系は除外）
  for (const [k, v] of r.headers) {
    const key = k.toLowerCase();
    if (key === 'content-encoding' || key === 'transfer-encoding' || key === 'content-length' || key === 'set-cookie')
      continue;
    res.setHeader(k, v);
  }

  // ★ Set-Cookie を現在ホストに書き換えて中継 ★
  const host = req.headers.host;
  const rawCookies =
    r.headers.getSetCookie?.() ??
    r.headers.raw?.()['set-cookie'] ??
    (r.headers.get('set-cookie') ? [r.headers.get('set-cookie')] : []);

  if (rawCookies && rawCookies.length) {
    const rewritten = rawCookies.map((c) => {
      // Domain を現在のホストに差し替え（なければ付与）
      if (/;?\s*Domain=/i.test(c)) {
        c = c.replace(/Domain=[^;]+/i, `Domain=${host}`);
      } else {
        c = `${c}; Domain=${host}`;
      }
      // Path/Secure/HttpOnly/SameSite を整える（不足分を足す）
      if (!/;?\s*Path=/i.test(c)) c += '; Path=/';
      if (!/;?\s*Secure/i.test(c)) c += '; Secure';
      if (!/;?\s*HttpOnly/i.test(c)) c += '; HttpOnly';
      // cross-site でないので Lax で十分
      if (/;?\s*SameSite=/i.test(c)) {
        c = c.replace(/SameSite=[^;]+/i, 'SameSite=Lax');
      } else {
        c += '; SameSite=Lax';
      }
      return c;
    });
    res.setHeader('Set-Cookie', rewritten);
  }

  const buf = Buffer.from(await r.arrayBuffer());
  res.end(buf);
}
