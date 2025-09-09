// web/js/nearby.js  ← フロント用（ブラウザで実行）
import { apiJSON } from "./http.js";

// 共通ユーティリティ（先頭に追加）
const $one = (root, ...sels) => {
  for (const s of sels.flat()) {
    const el = root.querySelector(s);
    if (el) return el;
  }
  return null;
};
const setText = (el, v) => {
  if (el) el.textContent = v ?? "";
};
const showPill = (el, v) => {
  if (!el) return;
  const has = v != null && String(v).trim() !== "";
  el.hidden = !has;
  el.classList.toggle("show", has); // CSS が .show で表示するルールに対応
  if (has) el.textContent = v;
};
const yen = (v) => "¥" + Number(v).toLocaleString("ja-JP");
const safe = (v) => (v == null ? "" : String(v));
const fmtDistance = (m) =>
  !Number.isFinite(m)
    ? ""
    : m < 1000
    ? `${m} m`
    : `${(m / 1000).toFixed(1)} km`;

function fmtDistance(m) {
  if (!Number.isFinite(m)) return "";
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}

// "10:00–18:00" / "10:00-18:00" / "10:00〜18:00" に対応
function minutesUntilEnd(slot) {
  if (!slot) return Infinity;
  const m = String(slot).match(
    /(\d{1,2}):(\d{2})\s*[-–~〜]\s*(\d{1,2}):(\d{2})/
  );
  if (!m) return Infinity;
  const endH = +m[3],
    endMin = +m[4];
  const now = new Date();
  const end = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    endH,
    endMin,
    0,
    0
  );
  const diff = Math.floor((end - now) / 60000);
  return diff >= 0 ? diff : Infinity;
}

// 「終了間近」の閾値（分）
const SOON_MINUTES = 30;

// 既存の minutesUntilEnd(slot) をそのまま利用
function shouldShowSoon(slotLabel) {
  return minutesUntilEnd(slotLabel) <= SOON_MINUTES;
}

// .meta の中に <span class="soon"> を出し入れ
function upsertSoon(metaEl, slotLabel) {
  if (!metaEl) return;
  const show = shouldShowSoon(slotLabel);
  let tag = metaEl.querySelector(".soon");
  if (show) {
    if (!tag) {
      tag = document.createElement("span");
      tag.className = "soon";
      tag.textContent = "終了間近";
      metaEl.appendChild(tag);
    } else {
      tag.hidden = false;
    }
  } else {
    tag?.remove();
  }
}

// 既存の createCard を丸ごと置き換え
function createCard(s) {
  const tpl = document.getElementById("shop-card-template");
  if (!tpl) {
    const F = document.createElement("article");
    F.className = "shop-card";
    F.textContent = safe(s.name || "店舗");
    return F;
  }
  const el = tpl.content.firstElementChild.cloneNode(true);

  // --- 画像（旧/新どちらでも拾う）
  const thumbImg = $one(el, ".thumb img", ".card-hero img", "img");
  if (thumbImg) {
    thumbImg.src = s.photo_url || "./photo/noimg.jpg";
    thumbImg.alt = safe(s.name);
  }

  // --- お気に入りボタン（存在すれば）
  const favBtn = $one(el, ".fav-btn", ".heart");
  if (favBtn) favBtn.dataset.shopId = safe(s.id);

  // --- ヒーロー部：店名/カテゴリ/距離/住所（クラスの互換吸収）
  setText($one(el, ".thumb-title", ".card-title", ".shop-title"), safe(s.name));
  setText(
    $one(
      el,
      ".thumb-info .point",
      ".thumb-subline .point",
      ".card-head .category"
    ),
    safe(s.category)
  );
  setText(
    $one(
      el,
      ".thumb-info .status",
      ".thumb-subline .status",
      ".card-head .distance"
    ),
    fmtDistance(s.distance_m)
  );
  setText(
    $one(
      el,
      ".thumb-info .place",
      ".thumb-subline .place",
      ".card-head .place"
    ),
    safe(s.address)
  );

  // --- 商品概要（1件目＋2件目まで）
  const shopInfo = $one(el, ".shop-info", ".card-body", ".bundles");
  const firstSummary = $one(
    el,
    ".shop-info .product-summary",
    ".bundle",
    ".product"
  );
  const bundles = Array.isArray(s.bundles) ? s.bundles.slice(0, 2) : [];

  const fill = (summaryEl, b) => {
    // サムネ
    const pImg = $one(summaryEl, ".product-img", "img");
    if (pImg) {
      pImg.src = b.thumb_url || s.photo_url || "./photo/noimg.jpg";
      pImg.alt = `${safe(b.title ?? "おすすめセット")} の画像`;
    }
    // タイトル
    setText(
      $one(summaryEl, ".product-name", ".bundle-title", ".title"),
      b.title ?? "おすすめセット"
    );
    // 時間
    const slot = b.slot || b.slot_label || ""; // データ差異に耐性
    setText(
      $one(summaryEl, ".meta .time", ".product-meta .time", ".time"),
      slot
    );

    // 価格（bundle.price_min 優先 → 店の min_price）
    const pv = Number.isFinite(Number(b.price_min))
      ? Number(b.price_min)
      : Number.isFinite(Number(s.min_price))
      ? Number(s.min_price)
      : null;
    showPill(
      $one(summaryEl, ".price-inline", ".pill.price"),
      pv != null ? yen(pv) : ""
    );

    // 在庫（bundle.qty_available 優先 → shop 全体）
    const remain = Number.isFinite(Number(b.qty_available))
      ? Number(b.qty_available)
      : Number.isFinite(Number(s.stock_remain))
      ? Number(s.stock_remain)
      : 0;
    showPill(
      $one(summaryEl, ".stock-inline", ".pill.stock"),
      remain > 0 ? `残り${remain}個` : ""
    );
  };

  if (!bundles.length || !firstSummary) {
    if (shopInfo) shopInfo.remove();
  } else {
    fill(firstSummary, bundles[0]);
    if (bundles[1]) {
      const second = firstSummary.cloneNode(true);
      fill(second, bundles[1]);
      shopInfo.appendChild(second);
    }
  }

  return el;
}

export async function loadNearby({
  category = null,
  priceMax = null,
  radius = 3000,
  sort = "near", // 'near' | 'cheap'
} = {}) {
  const TARGET = 6;
  const row = document.getElementById("nearby-row");
  if (!row) return;
  row.innerHTML = `<article class="shop-card"><div class="body"><div class="title-line"><h4>読み込み中…</h4></div></div></article>`;

  // geolocation
  let lat, lng;
  try {
    const pos = await new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("no_geolocation"));
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 60000,
      });
    });
    lat = pos.coords.latitude;
    lng = pos.coords.longitude;
  } catch {
    row.innerHTML = `<article class="shop-card"><div class="body"><div class="title-line"><h4>現在地が取得できませんでした</h4></div></div></article>`;
    return;
  }

  const radii = [radius, 5000, 8000, 12000, 20000];
  const seen = new Set();
  let pool = [];
  for (const r of radii) {
    const qs = new URLSearchParams({
      lat,
      lng,
      radius: String(r),
      limit: String(TARGET),
    });
    if (category) qs.set("category", category);
    if (Number.isFinite(priceMax)) qs.set("priceMax", String(priceMax));
    try {
      const data = await apiJSON(`/api/nearby?${qs.toString()}`);
      for (const it of data.items || []) {
        if (seen.has(it.id)) continue;
        seen.add(it.id);
        pool.push(it);
      }
      pool.sort((a, b) => a.distance_m - b.distance_m);
      if (pool.length >= TARGET) {
        pool = pool.slice(0, TARGET);
        break;
      }
    } catch (e) {
      console.warn("[nearby] fetch failed @", r, e.status, e.body || e);
    }
  }

  row.innerHTML = "";
  if (!pool.length) {
    row.innerHTML = `<article class="shop-card"><div class="body"><div class="title-line"><h4>近くにお店が見つかりません</h4></div></div></article>`;
    return;
  }
  // 並び替え（近い / 安い / 終了間近）
  const priceOf = (shop) => {
    const p =
      Array.isArray(shop.bundles) && shop.bundles.length
        ? Number(
            shop.bundles.reduce(
              (m, b) => Math.min(m, Number(b.price_min) || Infinity),
              Infinity
            )
          )
        : Number(shop.min_price);
    return Number.isFinite(p) ? p : Infinity;
  };
  const minutesUntilEnd = (slot) => {
    if (!slot) return Infinity;
    // "10:00–18:00" / "10:00-18:00" / "10:00〜18:00" に対応
    const m = String(slot).match(
      /(\d{1,2}):(\d{2})\s*[-–~〜]\s*(\d{1,2}):(\d{2})/
    );
    if (!m) return Infinity;
    const endH = Number(m[3]),
      endM = Number(m[4]);
    const now = new Date();
    const end = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      endH,
      endM,
      0,
      0
    );
    const diffMin = Math.floor((end - now) / 60000);
    return diffMin >= 0 ? diffMin : Infinity; // もう終わってたら対象外
  };
  const soonestEnd = (shop) => {
    if (!Array.isArray(shop.bundles) || !shop.bundles.length) return Infinity;
    return shop.bundles.reduce(
      (min, b) => Math.min(min, minutesUntilEnd(b.slot)),
      Infinity
    );
  };
  if (sort === "cheap") {
    pool.sort((a, b) => priceOf(a) - priceOf(b) || a.distance_m - b.distance_m);
  } else if (sort === "urgent") {
    pool.sort((a, b) => {
      const sa = soonestEnd(a),
        sb = soonestEnd(b);
      return sa - sb || a.distance_m - b.distance_m;
    });
  } else {
    pool.sort((a, b) => a.distance_m - b.distance_m);
  }
  for (const s of pool.slice(0, TARGET)) row.appendChild(createCard(s));

  try {
    const fav = await import("./fav.js");
    fav.initAllFavButtons?.();
  } catch {}
}
