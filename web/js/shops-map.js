// web/js/shops-map.js
import { apiJSON } from "./http.js";
import { createMapAdapter } from "./map-adapter.js";

const engine = new URLSearchParams(location.search).get("engine") || "leaflet";
// 後で Google に切り替える場合は ?engine=google を付けるか、↑のデフォルトを "google" に変更
const mapAdp = createMapAdapter(engine);

/* ===== Helpers ===== */
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
function extractLatLng(obj) {
  const lat =
    num(obj?.lat) ?? num(obj?.latitude) ?? num(obj?.lat_deg) ??
    num(obj?.location?.lat) ?? num(obj?.coords?.lat) ?? num(obj?.geo?.lat);
  const lng =
    num(obj?.lng) ?? num(obj?.lon) ?? num(obj?.longitude) ?? num(obj?.lng_deg) ??
    num(obj?.location?.lng) ?? num(obj?.location?.lon) ??
    num(obj?.coords?.lng) ?? num(obj?.geo?.lng);
  return [lat, lng];
}
function metersToHuman(m) {
  return Number.isFinite(m) ? (m < 1000 ? `${Math.round(m)} m` : `${(m/1000).toFixed(1)} km`) : "";
}
async function getCenterFromGeolocation() {
  try {
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation?.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false, timeout: 6000, maximumAge: 60000
      });
    });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return { lat: 35.681236, lng: 139.767125 }; // 東京駅
  }
}
function normalizeShop(raw, userCenter) {
  const [lat, lng] = extractLatLng(raw);
  const title =
    raw?.name || raw?.shop_name || raw?.title || "店舗";
  const address =
    raw?.address_short || raw?.address || raw?.area || raw?.city || "";
  const thumb =
    raw?.photo_url || raw?.thumb_url || (Array.isArray(raw?.bundles) && raw.bundles[0]?.thumb_url) || "./img/noimg.svg";

  // distance_m (サーバ返却が無ければ簡易に補完：haversine）
  let dist = num(raw?.distance_m);
  if (!Number.isFinite(dist) && userCenter && Number.isFinite(lat) && Number.isFinite(lng)) {
    dist = haversineMeters(userCenter.lat, userCenter.lng, lat, lng);
  }
  return { id: raw?.id, title, address, lat, lng, thumb, distance_m: dist };
}
function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat/2)**2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/* ===== Bottom sheet UI (地図エンジン非依存) ===== */
function openBottomSheet(shop) {
  const s = document.getElementById("sheet");
  if (!s) return;
  s.querySelector(".title") && (s.querySelector(".title").textContent = shop.title || "");
  s.querySelector(".addr") && (s.querySelector(".addr").textContent = shop.address || "");
  s.querySelector(".dist") && (s.querySelector(".dist").textContent = metersToHuman(shop.distance_m));
  const img = s.querySelector("img");
  if (img) img.src = shop.thumb || "./img/noimg.svg";
  s.classList.add("is-open");
}
function closeBottomSheet() {
  document.getElementById("sheet")?.classList.remove("is-open");
}

/* ===== Entry ===== */
export async function initShopsMap() {
  const mapEl = document.getElementById("map");
  if (!mapEl) return;

  const center = await getCenterFromGeolocation();
  await mapAdp.init(mapEl, { center, zoom: 14 });

  let shops = [];
  try {
    const qs = new URLSearchParams({
      lat: String(center.lat),
      lng: String(center.lng),
      radius: "5000",
      limit: "60",
    });
    const res = await apiJSON(`/api/nearby?${qs}`);
    shops = (res.items || [])
      .map((r) => normalizeShop(r, center))
      .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
  } catch {
    // fallback: 最近追加
    const res = await apiJSON(`/api/shops-recent?limit=40`);
    shops = (res.items || [])
      .map((r) => normalizeShop(r, center))
      .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
  }

  mapAdp.addMarkers(shops, { onClick: (s) => openBottomSheet(s) });
  mapAdp.fitBounds(shops);

  // 下部シートの閉じる動作（任意）
  document.getElementById("sheet-close")?.addEventListener("click", closeBottomSheet);
}

document.addEventListener("DOMContentLoaded", () =>
  initShopsMap().catch((e) => console.warn("[shops-map] fatal", e))
);
