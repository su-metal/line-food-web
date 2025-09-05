// web/api/my-reservations.js  (temporary fallback)
export default function handler(req, res) {
  // 認証が入るまでの暫定（必要なら 401 にしてもOK）
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('x-fallback', 'my-reservations');
  res.end(JSON.stringify({
    ok: true,
    reservations: [],   // ← ここに空配列を返す
  }));
}
