// web/js/shops-map.js
import { apiJSON } from "./http.js";
import { createMapAdapter } from "./map-adapter.js";

/* ===== 小ユーティリティ ===== */
const NOIMG = "./img/noimg.svg";
const yen = (v) => (Number.isFinite(+v) ? "¥" + Number(v).toLocaleString("ja-JP") : "");
const km = (m) =>
  Number.isFinite(m) ? (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`) : "";

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
function pickLatLng(obj) {
  const lat = num(obj?.lat) ?? num(obj?.latitude) ?? num(obj?.lat_deg) ??
              num(obj?.location?.lat) ?? num(obj?.coords?.lat) ?? num(obj?.geo?.lat);
  const lng = num(obj?.lng) ?? num(obj?.lon) ?? num(obj?.longitude) ?? num(obj?.lng_deg) ??
              num(obj?.location?.lng) ?? num(obj?.location?.lon) ??
              num(obj?.coords?.lng) ?? num(obj?.geo?.lng);
  return [lat, lng];
}

/* ===== Bottom sheet ===== */
function fillMapCard(shop = {}) {
  const card = document.getElementById("map-card");
  if (!card) return;
  const title = document.getElementById("mc-title");
  const note  = document.getElementById("mc-note");
  const meta  = document.getElementById("mc-meta");
  const img   = document.getElementById("mc-img");
  const link  = document.getElementById("mc-link");

  title.textContent = shop.name || "店舗";
  img.src = shop.photo_url || shop.thumb_url || NOIMG;
  img.alt = shop.name || "店舗";

  const cat  = shop.category_name || shop.category || shop.tags?.[0] || shop.genres?.[0] || "カテゴリ";
  const dist = km(shop.distance_m);
  const b0   = Array.isArray(shop.bundles) ? shop.bundles[0] : null;
  const time = b0?.slot_label || b0?.slot || b0?.time ||
               (shop.start && shop.end ? `${shop.start}–${shop.end}` : "");
  meta.innerHTML = `
    <span class="chip chip--brand">${cat}</span>
    ${dist ? `<span class="chip">${dist}</span>` : ""}
    ${time ? `<span class="chip">🕒 ${time}</span>` : ""}
  `;

  if (Array.isArray(shop.bundles) && shop.bundles.length) {
    const pVals = [shop.bundles[0]?.price_min, shop.bundles[0]?.price, shop.min_price]
      .map(Number).filter(Number.isFinite);
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

const getLastCenter = () => {
  try {
    const o = JSON.parse(localStorage.getItem(LS_LAST_CENTER) || "null");
    if (!o) return null;
    if (!Number.isFinite(o.lat) || !Number.isFinite(o.lng)) return null;
    return [o.lat, o.lng];
  } catch { return null; }
};
const setLastCenter = (lat, lng) => {
  try { localStorage.setItem(LS_LAST_CENTER, JSON.stringify({ lat, lng, ts: Date.now() })); } catch {}
};
const getCachedItems = () => {
  try { const a = JSON.parse(sessionStorage.getItem(SS_LAST_ITEMS) || "[]"); return Array.isArray(a) ? a : []; }
  catch { return []; }
};
const setCachedItems = (items) => {
  try { sessionStorage.setItem(SS_LAST_ITEMS, JSON.stringify(items || [])); } catch {}
};

/* ===== ジオコーディング（Nominatim / OSM） ===== */
async function geocodeJP(q) {
  if (!q) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=jp&accept-language=ja&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!r.ok) return null;
  const arr = await r.json();
  if (!Array.isArray(arr) || !arr.length) return null;
  const { lat, lon, display_name } = arr[0] || {};
  const la = Number(lat), lo = Number(lon);
  return Number.isFinite(la) && Number.isFinite(lo) ? [la, lo, display_name] : null;
}

/* ===== メイン ===== */
(async function initShopsMap() {
  try {
    const mapAdp = createMapAdapter("leaflet");

    // 0) URLパラメータ
    const params = new URLSearchParams(location.search);
    const qParam = (params.get("q") || "").trim();
    const searchInput = document.getElementById("q");
    if (searchInput && qParam) searchInput.value = qParam;

    // 1) 楽観的センター（前回 or 東京駅）でまず地図を出す
    let center = getLastCenter() || [35.681236, 139.767125];
    await mapAdp.init("map", { center, zoom: 13 });

    // 2) キャッシュで即マーカー（体感高速化）
    const cached = getCachedItems().map((it) => {
      const [lat, lng] = pickLatLng(it);
      return Number.isFinite(lat) && Number.isFinite(lng) ? { ...it, __lat: lat, __lng: lng } : null;
    }).filter(Boolean);
    if (cached.length) {
      await mapAdp.setMarkers(cached, { chunk: 80, delay: 8 });
      mapAdp.fitToMarkers({ padding: 56 });
    }

    // 3) 検索（q=）が指定されていればジオコーディング → その座標で読み込み
    const reloadAt = async (lat, lng) => {
      center = [lat, lng];
      setLastCenter(lat, lng);
      // 近隣店舗を取得
      let items = [];
      try {
        const qs = new URLSearchParams({ lat: String(lat), lng: String(lng), radius: "3000", limit: "60" });
        const near = await apiJSON(`/api/nearby?${qs.toString()}`);
        items = Array.isArray(near?.items) ? near.items : [];
        if (!items.length) {
          const recent = await apiJSON(`/api/shops-recent?limit=30`);
          items = Array.isArray(recent?.items) ? recent.items : [];
        }
      } catch (e) { console.warn("[shops-map] list fetch failed", e); }

      const withCoords = items.map((it) => {
        const [la, lo] = pickLatLng(it);
        return Number.isFinite(la) && Number.isFinite(lo) ? { ...it, __lat: la, __lng: lo } : null;
      }).filter(Boolean);

      await mapAdp.setMarkers(withCoords, { chunk: 80, delay: 8 });
      setCachedItems(items);

      if (withCoords.length) {
        mapAdp.fitToMarkers({ padding: 56 });
      } else {
        mapAdp.setCenter(lat, lng, 14);
      }
    };

    if (qParam) {
      try {
        const hit = await geocodeJP(qParam);
        if (hit) {
          const [la, lo] = hit;
          await reloadAt(la, lo);
          mapAdp.addCurrentDot?.(la, lo); // 検索地点を見失わないよう表示
        }
      } catch (e) {
        console.warn("[shops-map] geocode failed", e);
      }
    } else {
      // 4) 位置情報は並列で取得（成功時は現在地で上書き）
      (async () => {
        try {
          const pos = await new Promise((res, rej) => {
            if (!navigator.geolocation) return rej(new Error("no_geolocation"));
            navigator.geolocation.getCurrentPosition(res, rej, {
              enableHighAccuracy: false, timeout: 8000, maximumAge: 60000
            });
          });
          const la = pos.coords.latitude, lo = pos.coords.longitude;
          mapAdp.addCurrentDot?.(la, lo);
          await reloadAt(la, lo);
        } catch {/* noop */}
      })();
    }

    // 5) マーカークリック → カード
    mapAdp.onMarkerClick((shop) => fillMapCard(shop));

    // 6) 検索ボックス（マップ上）でも Enter で検索
    if (searchInput) {
      const doSearch = async () => {
        const q = searchInput.value.trim();
        if (!q) return;
        try {
          const hit = await geocodeJP(q);
          if (hit) {
            const [la, lo] = hit;
            await reloadAt(la, lo);
            mapAdp.addCurrentDot?.(la, lo);
          }
        } catch (e) { console.warn("[shops-map] geocode failed", e); }
      };
      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); doSearch(); }
      });
    }

    // 7) 「現在地へ」：現在地 + 最寄り1件が同画面に入るようフィット
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
        mapAdp.addCurrentDot?.(me[0], me[1]);
      } catch {/* 権限NGでも last center を使用 */}

      // 現在のマーカー群から最寄り1件を計算（adapter が保持する lastMarkers を参照）
      const items = (mapAdp.getMarkerData?.() || []);
      let nearest = null, best = Infinity;
      for (const it of items) {
        const dLat = (it.__lat - me[0]) * Math.PI / 180;
        const dLng = (it.__lng - me[1]) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 + Math.cos(me[0]*Math.PI/180)*Math.cos(it.__lat*Math.PI/180)*Math.sin(dLng/2)**2;
        const d = 2 * 6371000 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        if (d < best) { best = d; nearest = it; }
      }
      if (nearest && window.L) {
        const b = window.L.latLngBounds([me, [nearest.__lat, nearest.__lng]]);
        if (b.isValid()) mapAdp.map.fitBounds(b, { padding: [60, 60], maxZoom: 17 });
      } else {
        mapAdp.setCenter(me[0], me[1], 15);
      }
    });

  } catch (e) {
    console.error("[shops-map] fatal", e);
  }
})();
