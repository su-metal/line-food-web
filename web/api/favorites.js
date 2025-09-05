// web/api/favorites.js
export const config = { runtime: 'nodejs20.x' };

import proxy from './_proxy.js';

export default async function handler(req, res) {
  // まず「ここまで来た」印を付ける（落ちてもわかる）
  res.setHeader('x-handler', 'favorites');

  try {
    await proxy(req, res, { pathRewrite: '/api/favorites' });
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      ok: false,
      where: 'favorites_handler',
      message: String(e?.message || e),
    }));
  }
}
