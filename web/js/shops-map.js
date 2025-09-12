// web/js/shops-map.js
import { apiJSON } from "./http.js";

const NOIMG = "./img/noimg.svg";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

/** 地図・マーカーの状態 */
let map;
let markers = [];
let lastCenter;
let fetching = false;

/** 現在地（失敗時は東京駅） */
async function getInitialLatLng() {
  try {
    const pos = await new Promise((res, rej) => {
      if (!navigator.geolocation) return rej(new Error("no_geolocation"));
      navigator.geolocation.getCurrentPosition(res, rej, {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 60000,
      });
    });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return { lat: 35.681236, lng: 139.767125 }; // 東京駅
  }
}

function minPrice(shop) {
  const xs = (shop?.bundles || [])
    .map((b) => +b?.price_min ?? +b?.price ?? NaN)
    .filter(Number.isFinite);
  return xs.length ? Math.min(...xs) : +shop?.min_price || null;
}

function fmtYen(n) {
  return Number.isFinite(+n) ? "¥" + Number(n).toLocaleString("ja-JP") : "";
}

function extractPhoto(shop) {
  return (
    shop?.photo_url ||
    shop?.image ||
    shop?.images?.[0] ||
    (shop?.bundles || [])[0]?.thumb_url ||
    NOIMG
  );
}

/** 画面下のカードへ反映＆表示 */
function showCard(shop) {
  const card = document.getElementById("map-card");
  const img = document.getElementById("mc-img");
  const title = document.getElementById("mc-title");
  const note = document.getElementById("mc-note");
  const meta = document.getElementById("mc-meta");
  const link = document.getElementById("mc-link");

  img.src = extractPhoto(shop);
  img.alt = shop?.name || "店舗";
  title.textContent = shop?.name || "店舗";

  // NOTE: bundles が無ければ “現在のレスキュー依頼はありません。”
  const hasItems = Array.isArray(shop.bundles) && shop.bundles.length > 0;
  if (hasItems) {
    const p = minPrice(shop);
    note.textContent = p != null ? `最安 ${fmtYen(p)}〜` : "販売中のセットがあります";
  } else {
    note.textContent = "現在のレスキュー依頼はありません。";
  }

  // 簡易メタ（カテゴリ / 距離 / エリア）
  const cat =
    shop.category || shop.category_name || shop.tags?.[0] || shop.genres?.[0] || "カテゴリ";
  const place =
    shop.area || shop.city || shop.station || shop.address_short || shop.address || "";
  const dist =
    Number.isFinite(+shop.distance_km) ? `${(+shop.distance_km).toFixed(1)} km` : "";

  meta.innerHTML = `
    ${cat ? `<span class="chip">${cat}</span>` : ""}
    ${dist ? `<span class="chip">${dist}</span>` : ""}
    ${place ? `<span class="meta-place">${place}</span>` : ""}
  `;

  link.href = `/shop.html?id=${encodeURIComponent(shop.id)}`;
  card.hidden = false;
  card.classList.add("is-open");
}

function hideCard() {
  const card = document.getElementById("map-card");
  card.classList.remove("is-open");
  // CSSのトランジション後に hidden
  setTimeout(() => (card.hidden = true), 180);
}

/** マーカーを全部消す */
function clearMarkers() {
  markers.forEach((m) => m.setMap(null));
  markers = [];
}

/** 中心周辺を取得してマーカー描画 */
async function fetchAndRender(radius = 2500, hard = false) {
  if (!map || fetching) return;
  const c = map.getCenter();
  if (!hard && lastCenter && google.maps.geometry) {
    const dx = Math.abs(c.lat() - lastCenter.lat());
    const dy = Math.abs(c.lng() - lastCenter.lng());
    if (dx < 0.001 && dy < 0.001) return; // ごく近い移動は無視
  }

  fetching = true;
  lastCenter = { lat: c.lat(), lng: c.lng() };

  // API
  const qs = new URLSearchParams({
    lat: String(lastCenter.lat),
    lng: String(lastCenter.lng),
    radius: String(radius),
    limit: "60",
  });
  try {
    const data = await apiJSON(`/api/nearby?${qs.toString()}`);
    const items = data?.items || [];

    clearMarkers();
    const bounds = new google.maps.LatLngBounds();

    items.forEach((s) => {
      const lat = Number(s.lat ?? s.latitude ?? s.location?.lat);
      const lng = Number(s.lng ?? s.lon ?? s.longitude ?? s.location?.lng ?? s.location?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const marker = new google.maps.Marker({
        position: { lat, lng },
        map,
        title: s.name || "",
        // ブランド寄りの色
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#1a3a2d",
          fillOpacity: 0.95,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });
      marker.addListener("click", () => showCard(s));
      markers.push(marker);
      bounds.extend(marker.getPosition());
    });

    if (items.length) {
      // 初回など、極端にズームが広い場合は程よく調整
      if (!map.getBounds() || !map.getBounds().contains(bounds.getNorthEast())) {
        map.fitBounds(bounds, 48);
        const z = clamp(map.getZoom(), 11, 17);
        map.setZoom(z);
      }
    }
  } catch (e) {
    console.warn("[shops-map] fetch failed", e?.status, e?.body || e);
  } finally {
    fetching = false;
  }
}

/** Maps のコールバック（shops.html から呼ばれる） */
async function initShopsMap() {
  const start = await getInitialLatLng();

  map = new google.maps.Map(document.getElementById("gmap"), {
    center: start,
    zoom: 14,
    clickableIcons: false,
    disableDefaultUI: true,
  });

  // 動いたら再取得（idle を軽くデバウンス）
  let idleTimer;
  map.addListener("idle", () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => fetchAndRender(), 250);
  });

  // すぐ描画
  fetchAndRender(2500, true);

  // UI: 現在地へ
  document.getElementById("btnLocate")?.addEventListener("click", async () => {
    const p = await getInitialLatLng();
    map.panTo(p);
    map.setZoom(15);
    await sleep(150);
    fetchAndRender(2500, true);
  });

  // UI: 検索ボックス（簡易、Enterで geocode→中心移動）
  const q = document.getElementById("q");
  q?.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    const text = q.value.trim();
    if (!text) return;
    try {
      const r = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
          text
        )}&key=YOUR_GOOGLE_MAPS_API_KEY`
      ).then((r) => r.json());
      const loc = r?.results?.[0]?.geometry?.location;
      if (loc) {
        map.panTo(loc);
        map.setZoom(15);
      }
    } catch {}
  });

  // カードの閉じる
  document.getElementById("mc-close")?.addEventListener("click", hideCard);
  // 地図をタップしたらカードを閉じる
  map.addListener("click", hideCard);
}

// グローバルに公開（Mapsのcallbackが呼ぶ）
window.initShopsMap = initShopsMap;
