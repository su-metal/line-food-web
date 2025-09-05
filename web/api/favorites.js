// web/api/favorites.js
export const config = { runtime: 'nodejs20.x' };

import proxy from './_proxy.js';

export default async function handler(req, res) {
  res.setHeader('x-handler', 'favorites');     // ← 起動印
  await proxy(req, res, { pathRewrite: '/api/favorites' });
}
