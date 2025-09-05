export const runtime = 'nodejs';        // Node ランタイムで req/res を使う
import proxy from './_proxy.js';        // ← ESM import。拡張子 .js が必須！

export default async function handler(req, res) {
  return proxy(req, res, { pathRewrite: '/api/favorites' });
}
