// web/js/shops-map.js
import { apiJSON } from "./http.js";
import { createMapAdapter } from "./map-adapter.js";

/* ===== 小ユーティリティ ===== */
const NOIMG = "./img/noimg.svg";
const yen = (v) => (Number.isFinite(+v) ? "¥" + Number(v).toLocaleString("ja-JP") : "");
const km = (m) => Number.isFinite(m) ? (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`) : "";

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
function pickLatLng(obj) {
  const lat = num(obj?.lat) ?? num(obj?.latitude) ?? num(obj?.lat_deg) ?? num(obj?.location?.lat) ?? num(obj?.coords?.lat) ?? num(obj?.geo?.lat);
  const lng = num(obj?.lng) ?? num(obj?.lon) ?? num(obj?.longitude) ?? num(obj?.lng_deg) ?? num(obj?.location?.lng) ?? num(obj?.location?.lon) ?? num(obj?.coords?.lng) ?? num(obj?.geo?.lng);
  return [lat, lng];
}

/* ===== Bottom sheet ===== */
function fillMapCard(shop = {}) {
  const card = document.getElementById("map-card");
  if (!card) return;
  const title = document.getElementById("mc-title");
  const note = document.getElementById("mc-note");
  const meta = document.getElementById("mc-meta");
  const img = document.getElementById("mc-img");
  const link = document.getElementById("mc-link");

  title.textContent = shop.name || "店舗";
  img.src = shop.photo_url || shop.thumb_url || NOIMG;
  img.alt = shop.name || "店舗";

  const cat = shop.category_name || shop.category || shop.tags?.[0] || shop.genres?.[0] || "カテゴリ";
  const dist = km(shop.distance_m);
  const b0 = Array.isArray(shop.bundles) ? shop.bundles[0] : null;
  const time = b0?.slot_label || b0?.slot || b0?.time || (shop.start && shop.end ? `${shop.start}–${shop.end}` : "");
  meta.innerHTML = `
    <span class="chip chip--brand">${cat}</span>
    ${dist ? `<span class="chip">${dist}</span>` : ""}
    ${time ? `<span class="chip">🕒 ${time}</span>` : ""}
  `;

  if (Array.isArray(shop.bundles) && shop.bundles.length) {
    const pVals = [shop.bundles[0]?.price_min, shop.bundles[0]?.price, shop.min_price].map(Number).filter(Number.isFinite);
    const minP = pVals.length ? Math.min(...pVals) : null;
    note.textContent = minP != null ? `最安 ${yen(minP)} から` : "販売中のセットがあります";
  } else {
    note.textContent = "現在のレスキュー依頼はありません。";
  }
  link.href = `/shop.html?id=${encodeURIComponent(shop.id)}`;
  card.hidden = false;
  card.classList.add("is-open");
}
document.getElementById("mc-close")?.addEventListener("click", () => {
  const card = document.getElementById("map-card");
  if (card) { card.classList.remove("is-open"); card.hidden = true; }
});

/* ===== キャッシュ（楽観レンダ用） ===== */
const LS_LAST_CENTER = "map:lastCenter";     // {lat,lng,ts}
const SS_LAST_ITEMS  = "map:lastItems";      // JSON: items[]

function getLastCenter() {
  try { const o = JSON.parse(localStorage.getItem(LS_LAST_CENTER) || "null"); if (!o) return null;
    if (!Number.isFinite(o.lat) || !Number.isFinite(o.lng)) return null; return [o.lat, o.lng];
  } catch { return null; }
}
function setLastCenter(lat, lng) {
  try { localStorage.setItem(LS_LAST_CENTER, JSON.stringify({ lat, lng, ts: Date.now() })); } catch {}
}
function getCachedItems() {
  try { const a = JSON.parse(sessionStorage.getItem(SS_LAST_ITEMS) || "[]"); return Array.isArray(a) ? a : []; } catch { return []; }
}
function setCachedItems(items) {
  try { sessionStorage.setItem(SS_LAST_ITEMS, JSON.stringify(items || [])); } catch {}
}

/* ===== メイン ===== */
(async function initShopsMap() {
  try {
    const mapAdp = createMapAdapter("leaflet");

    // 1) 楽観的センター（前回 or 東京駅）
    let center = getLastCenter() || [35.681236, 139.767125];
    let gotGeo = false;

    // 2) まず地図だけ即起動（ユーザーに“面”を出す）
    await mapAdp.init("map", { center, zoom: 13 });

    // 3) キャッシュがあれば即描画（体感を速く）
    const cached = getCachedItems().map((it) => {
      const [lat, lng] = pickLatLng(it);
      return Number.isFinite(lat) && Number.isFinite(lng) ? { ...it, __lat: lat, __lng: lng } : null;
    }).filter(Boolean);
    if (cached.length) {
      await mapAdp.addMarkers(cached, { chunk: 80, delay: 8 });
      mapAdp.fitToMarkers({ padding: 56 });
    }

    // 4) 位置情報は並列で取りに行く（成功したら最近傍で上書き）
    (async () => {
      try {
        const pos = await new Promise((res, rej) => {
          if (!navigator.geolocation) return rej(new Error("no_geolocation"));
          navigator.geolocation.getCurrentPosition(res, rej, {
            enableHighAccuracy: false, timeout: 8000, maximumAge: 60000
          });
        });
        center = [pos.coords.latitude, pos.coords.longitude];
        gotGeo = true;
        setLastCenter(center[0], center[1]);
        mapAdp.addCurrentDot(center[0], center[1]); // 現在地ドットも同レイヤーに
      } catch {/* noop */}
    })();

    // 5) 最新データを取得 → 一気に入れ替え
    let items = [];
    try {
      const qs = new URLSearchParams({
        lat: String(center[0]), lng: String(center[1]), radius: "3000", limit: "60"
      });
      const near = await apiJSON(`/api/nearby?${qs.toString()}`);
      items = Array.isArray(near?.items) ? near.items : [];
      if (!items.length) {
        const recent = await apiJSON(`/api/shops-recent?limit=30`);
        items = Array.isArray(recent?.items) ? recent.items : [];
      }
    } catch (e) { console.warn("[shops-map] list fetch failed", e); }

    const withCoords = items.map((it) => {
      const [lat, lng] = pickLatLng(it);
      return Number.isFinite(lat) && Number.isFinite(lng) ? { ...it, __lat: lat, __lng: lng } : null;
    }).filter(Boolean);

    await mapAdp.addMarkers(withCoords, { chunk: 80, delay: 8 });
    setCachedItems(items);

    // 6) マーカーがあればフィット
    if (withCoords.length) {
      mapAdp.fitToMarkers({ padding: 56 });
    }

    // 7) クリックでカード
    mapAdp.onMarkerClick((shop) => fillMapCard(shop));

    // 8) 「現在地へ」：現在地 + 最寄り1件が同画面に入るようフィット
    document.getElementById("btnLocate")?.addEventListener("click", async () => {
      let me = center;
      try {
        const pos = await new Promise((res, rej) => {
          if (!navigator.geolocation) return rej(new Error("no_geolocation"));
          navigator.geolocation.getCurrentPosition(res, rej, {
            enableHighAccuracy: true, timeout: 8000, maximumAge: 0
          });
        });
        me = [pos.coords.latitude, pos.coords.longitude];
        setLastCenter(me[0], me[1]);
        mapAdp.addCurrentDot(me[0], me[1]);
      } catch {/* 権限NGでも last center を使用 */}

      // 最寄りを探す
      let nearest = null, best = Infinity;
      for (const it of withCoords) {
        const dLat = (it.__lat - me[0]) * Math.PI / 180;
        const dLng = (it.__lng - me[1]) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 + Math.cos(me[0]*Math.PI/180)*Math.cos(it.__lat*Math.PI/180)*Math.sin(dLng/2)**2;
        const d = 2 * 6371000 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        if (d < best) { best = d; nearest = it; }
      }

      // 現在地のみ or 現在地+最寄り にフィット
      if (nearest) {
        const L = window.L;
        const b = L.latLngBounds([me, [nearest.__lat, nearest.__lng]]);
        if (b.isValid()) mapAdp.map.fitBounds(b, { padding: [60, 60], maxZoom: 17 });
      } else {
        mapAdp.setCenter(me[0], me[1], 15);
      }
    });

  } catch (e) {
    console.error("[shops-map] fatal", e);
  }
})();
