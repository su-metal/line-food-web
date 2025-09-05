// web/api/my-reservations.js  ← 一時スタブ（Node/ESM）
export default function handler(req, res) {
  res.statusCode = 401; // 認証想定なので 401 を返す（200でも可）
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('x-stub', 'my-reservations');
  res.end(JSON.stringify({ ok: false, reason: 'stubbed on web to avoid 508 loop' }));
}
