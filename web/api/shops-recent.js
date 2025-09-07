// web/api/shops-recent.js
import { sbFetch } from './_lib/sb.js';

export default async function handler(req, res) {
  try {
    const u = new URL(req.url, 'http://x');
    const limit = Math.min(Math.max(Number(u.searchParams.get('limit')) || 6, 1), 24);
    const category = u.searchParams.get('category') || null;
    const priceMax = u.searchParams.get('priceMax') ? Number(u.searchParams.get('priceMax')) : null;

    const qs = new URLSearchParams();
    qs.set('select', 'id,name,address,photo_url,min_price,category,created_at');
    if (category) qs.append('category', `eq.${category}`);
    if (Number.isFinite(priceMax)) qs.append('min_price', `lte.${priceMax}`);
    qs.set('order', 'created_at.desc'); // nulls last はPostgREST 10系以降は無視されがちなので省略
    qs.set('limit', String(limit));

    const r = await sbFetch(`/rest/v1/shops?${qs.toString()}`, { method: 'GET' });
    if (!r.ok) throw new Error(`SB shops fetch failed: ${r.status}`);
    const rows = await r.json();

    const items = rows.map(s => ({
      id: s.id,
      name: s.name || '',
      address: s.address || '',
      photo_url: s.photo_url || '',
      category: s.category || '',
      min_price: s.min_price ?? null,
      created_at: s.created_at || null,
    }));

    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ ok: true, items }));
  } catch (e) {
    console.error('[shops-recent] error', e);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'internal_error' }));
  }
}
