// web/api/favorites.js
export const config = { runtime: 'nodejs20.x' };

export default async function handler(req, res) {
  res.setHeader('x-handler', 'favorites'); // ← 起動印
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ ok: true, stub: true }));
}
