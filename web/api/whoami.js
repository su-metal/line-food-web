// web/api/whoami.js
import { getUserId } from './_lib/auth.js';

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  const debug = url.searchParams.has('debug');

  const ret = await getUserId(req);              // 文字列 or {userId,reason}
  const userId = typeof ret === 'string' ? ret : ret?.userId || null;
  const reason = typeof ret === 'string' ? null : ret?.reason || null;

  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (!userId) {
    res.statusCode = 401;
    const body = { ok:false, error:'unauthorized' };
    if (debug) body.reason = reason || 'unknown';
    return res.end(JSON.stringify(body));
  }

  res.statusCode = 200;
  res.end(JSON.stringify({ ok:true, userId }));
}
