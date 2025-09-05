export const runtime = 'nodejs';
import proxy from './_proxy.js';

export default async function handler(req, res) {
  // デバッグ用：このヘッダが返ってきたらこのハンドラまで到達
  res.setHeader('x-handler', 'favorites');
  return proxy(req, res, { pathRewrite: '/api/favorites' });
}
