// web/api/_lib/auth.js (ESM)
export function getUserId(req) {
  // 1) Header 優先（フロントで付けられるならこれが確実）
  const h = req.headers || {};
  const cand =
    h['x-user-id'] ||
    h['x-line-user-id'] ||
    h['x-user'] ||
    h['x-uid'];
  if (cand && typeof cand === 'string') return cand;

  // 2) Cookie から uid= を拾う（LINEログインでクッキー運用している場合）
  const cookie = h.cookie || '';
  const m = /(?:^|;\s*)uid=([^;]+)/.exec(cookie);
  if (m) return decodeURIComponent(m[1]);

  return null;
}
