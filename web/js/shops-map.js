// web/js/shops-map.js
import { apiJSON } from "./http.js";
import { createMapAdapter } from "./map-adapter.js";

/* ===== 小ユーティリティ ===== */
const NOIMG = "./img/noimg.svg";
const yen = (v) => (Number.isFinite(+v) ? "¥" + Number(v).toLocaleString("ja-JP") : "");
const km = (m) =>
  Number.isFinite(m) ? (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`) : "";

/* 店オブジェクトから緯度経度を拾う（多様なキー名に対応） */
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
function pickLatLng(obj) {
  const lat =
    num(obj?.lat) ??
    num(obj?.latitude) ??
    num(obj?.lat_deg) ??
    num(obj?.location?.lat) ??
    num(obj?.coords?.lat) ??
    num(obj?.geo?.lat) ??
    null;

  const lng =
    num(obj?.lng) ??
    num(obj?.lon) ??
    num(obj?.longitude) ??
    num(obj?.lng_deg) ??
    num(obj?.location?.lng) ??
    num(obj?.location?.lon) ??
    num(obj?.coords?.lng) ??
    num(obj?.geo?.lng) ??
    null;

  return [lat, lng];
}

/* ===== Bottom sheet カード描画 ===== */
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

  // メタ行（カテゴリ / 距離 / 時間帯 など）
  const cat =
    shop.category_name || shop.category || shop.tags?.[0] || shop.genres?.[0] || "カテゴリ";
  const dist = km(shop.distance_m);
  const b0 = Array.isArray(shop.bundles) ? shop.bundles[0] : null;
  const time =
    b0?.slot_label || b0?.slot || b0?.time || (shop.start && shop.end ? `${shop.start}–${shop.end}` : "");

  meta.innerHTML = `
    <span class="chip chip--brand">${cat}</span>
    ${dist ? `<span class="chip">${dist}</span>` : ""}
    ${time ? `<span class="chip">🕒 ${time}</span>` : ""}
  `;

  // 商品があればひと言
  if (Array.isArray(shop.bundles) && shop.bundles.length) {
    const pVals = [shop.bundles[0]?.price_min, shop.bundles[0]?.price, shop.min_price]
      .map((x) => Number(x))
      .filter(Number.isFinite);
    const minP = pVals.length ? Math.min(...pVals) : null;
    note.textContent = minP != null ? `最安 ${yen(minP)} から` : "販売中のセットがあります";
  } else {
    note.textContent = "現在のレスキュー依頼はありません。";
  }

  link.href = `/shop.html?id=${encodeURIComponent(shop.id)}`;

  card.hidden = false;
  card.classList.add("is-open");
}

/* 閉じるボタン */
document.getElementById("mc-close")?.addEventListener("click", () => {
  const card = document.getElementById("map-card");
  if (card) {
    card.classList.remove("is-open");
    card.hidden = true;
  }
});

/* ===== メイン初期化 ===== */
(async function initShopsMap() {
  try {
    const mapAdp = createMapAdapter("leaflet");

    // デフォルト：東京駅
    let center = [35.681236, 139.767125];
    let gotGeo = false;

    // 現在地（許可されたら）
    try {
      const pos = await new Promise((res, rej) => {
        if (!navigator.geolocation) return rej(new Error("no_geolocation"));
        navigator.geolocation.getCurrentPosition(res, rej, {
          enableHighAccuracy: false,
          timeout: 9000,
          maximumAge: 60000,
        });
      });
      center = [pos.coords.latitude, pos.coords.longitude];
      gotGeo = true;
    } catch {
      /* 許可なしでも続行 */
    }

    // マップ起動
    await mapAdp.init("map", { center, zoom: 14 });

    // 現在地ピン（取得できた場合のみ）
    if (gotGeo && window.L) {
      // 目立つ青丸
      const me = window.L.circleMarker(center, {
        radius: 7,
        color: "#2a6ef0",
        weight: 2,
        fillColor: "#2a6ef0",
        fillOpacity: 1,
      }).addTo(mapAdp.layer);
      me.bindTooltip("現在地", { permanent: false });
    }

    // 店舗を取得（現在地ベース）。なければ新着でフォールバック
    let items = [];
    try {
      const qs = new URLSearchParams({
        lat: String(center[0]),
        lng: String(center[1]),
        radius: "3000",
        limit: "40",
      });
      const near = await apiJSON(`/api/nearby?${qs.toString()}`);
      items = Array.isArray(near?.items) ? near.items : [];
      if (items.length === 0) {
        const recent = await apiJSON(`/api/shops-recent?limit=20`);
        items = Array.isArray(recent?.items) ? recent.items : [];
      }
    } catch (e) {
      console.warn("[shops-map] list fetch failed", e);
    }

    // マーカー追加（座標が拾えるものだけ）
    const withCoords = items.filter((it) => {
      const [lat, lng] = pickLatLng(it);
      return Number.isFinite(lat) && Number.isFinite(lng);
    });

    const markers = mapAdp.addMarkers(withCoords);

    // クリックでカードを開く
    mapAdp.onMarkerClick((shop) => fillMapCard(shop));

    // 1件以上あれば全体にフィット、なければ中心据え置き
    if (markers.length) {
      mapAdp.fitToMarkers({ padding: 60 });
    } else {
      console.warn("[shops-map] no items with coordinates");
    }

    // 「現在地へ」ボタン
    document.getElementById("btnLocate")?.addEventListener("click", async () => {
      try {
        const pos = await new Promise((res, rej) => {
          if (!navigator.geolocation) return rej(new Error("no_geolocation"));
          navigator.geolocation.getCurrentPosition(res, rej, {
            enableHighAccuracy: true,
            timeout: 8000,
            maximumAge: 0,
          });
        });
        const c = [pos.coords.latitude, pos.coords.longitude];
        mapAdp.setCenter(c[0], c[1], 15);
      } catch {
        // 何もしない（権限NG等）
      }
    });
  } catch (e) {
    console.error("[shops-map] fatal", e);
  }
})();
