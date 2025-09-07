// web/api/nearby.js  ← サーバ用
import { sbFetch } from './_lib/sb.js';

function haversine(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export default async function handler(req, res) {
  try {
    const u = new URL(req.url, 'http://x');
    const lat = Number(u.searchParams.get('lat'));
    const lng = Number(u.searchParams.get('lng'));
    const radius = Math.min(Number(u.searchParams.get('radius')) || 3000, 20000);
    const limit  = Math.min(Number(u.searchParams.get('limit'))  || 20, 100);
    const category = u.searchParams.get('category') || null;
    const priceMax = u.searchParams.get('priceMax') ? Number(u.searchParams.get('priceMax')) : null;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.statusCode = 400;
      res.setHeader('content-type','application/json; charset=utf-8');
      return res.end(JSON.stringify({ ok:false, error:'lat/lng required' }));
    }

    const latDelta = radius / 111_320;
    const lngDelta = radius / (111_320 * Math.cos((lat * Math.PI)/180) || 1e-6);
    const minLat = lat - latDelta, maxLat = lat + latDelta;
    const minLng = lng - lngDelta, maxLng = lng + lngDelta;

    const qs = new URLSearchParams();
    qs.set('select','id,name,address,photo_url,lat,lng,min_price,category');
    qs.append('lat', `gte.${minLat}`); qs.append('lat', `lte.${maxLat}`);
    qs.append('lng', `gte.${minLng}`); qs.append('lng', `lte.${maxLng}`);
    if (category) qs.append('category', `eq.${category}`);
    if (Number.isFinite(priceMax)) qs.append('min_price', `lte.${priceMax}`);
    qs.set('limit','1000'); // 多めに取得

    const r = await sbFetch(`/rest/v1/shops?${qs.toString()}`, { method:'GET' });
    if (!r.ok) throw new Error(`SB shops fetch failed: ${r.status}`);
    const rows = await r.json();

    const items = rows
      .filter(s => Number.isFinite(+s.lat) && Number.isFinite(+s.lng))
      .map(s => ({
        id: s.id, name: s.name || '', address: s.address || '',
        photo_url: s.photo_url || '', category: s.category || '',
        min_price: s.min_price ?? null, lat:+s.lat, lng:+s.lng,
        distance_m: Math.round(haversine(lat, lng, +s.lat, +s.lng)),
      }))
      .filter(s => s.distance_m <= radius)
      .sort((a,b)=>a.distance_m - b.distance_m)
      .slice(0, limit);

    res.statusCode = 200;
    res.setHeader('content-type','application/json; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    res.end(JSON.stringify({ ok:true, items }));
  } catch (e) {
    console.error('[nearby] error', e);
    res.statusCode = 500;
    res.setHeader('content-type','application/json; charset=utf-8');
    res.end(JSON.stringify({ ok:false, error:'internal_error' }));
  }
}
