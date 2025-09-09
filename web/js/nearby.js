// web/js/nearby.js  ← フロント用（ブラウザで実行）
import { apiJSON } from "./http.js";

// ==== Utils: このブロックを nearby.js / recent.js の先頭に1回だけ ====

// 404や欠損時に使うフォールバック画像
const NOIMG = "./img/noimg.svg"; // 例: "./photo/noimg.jpg" にしてもOK

// 価格の整形
const yen = (v) => "¥" + Number(v).toLocaleString("ja-JP");

// null/undefinedを空文字にする
const safe = (v) => (v == null ? "" : String(v));

// 距離の整形（m→"850 m" / km→"1.2 km"）
const fmtDistance = (m) =>
  Number.isFinite(m)
    ? m < 1000
      ? `${Math.round(m)} m`
      : `${(m / 1000).toFixed(1)} km`
    : "";

// バンドル（商品）から安全に値を取るためのヘルパ
const titleOf = (b) => b?.title ?? b?.name ?? b?.bundle_title ?? "";
const priceOf = (b, s) => b?.price ?? b?.price_min ?? s?.min_price ?? null;
const stockOf = (b, s) =>
  b?.stock_remain ?? b?.stock ?? s?.stock_remain ?? null;
const slotOf = (b) => b?.slot_label ?? b?.slot ?? b?.time ?? "";

// 共通ユーティリティ（先頭に置く）
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
  el.classList.toggle("show", has);
  if (has) el.textContent = v;
};

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


// === 置き換え: createCard(s) 全体 ===
function createCard(s) {
  const tpl = document.getElementById("shop-card-template");
  if (!tpl) {
    const a = document.createElement("article");
    a.className = "shop-card";
    a.textContent = safe(s.name || "店舗");
    return a;
  }
  const el = tpl.content.firstElementChild.cloneNode(true);

  // dataset
  el.dataset.shopId = safe(s.id || "");

  // 画像
  const imgEl = el.querySelector(".thumb img");
  if (imgEl) {
    imgEl.src = s.photo_url || NOIMG;
    imgEl.alt = safe(s.name || "");
  }

  // お気に入り
  const favBtn = el.querySelector(".heart.fav-btn");
  if (favBtn) favBtn.dataset.shopId = safe(s.id || "");

  // サムネ内テキスト
  const titleEl = el.querySelector(".thumb-title");
  if (titleEl) titleEl.textContent = safe(s.name || "");
  const catEl = el.querySelector(".thumb-subline .point");
  if (catEl) catEl.textContent = safe(s.category || "");
  const distEl = el.querySelector(".thumb-subline .status");
  if (distEl) distEl.textContent = fmtDistance(s.distance_m);
  const placeEl = el.querySelector(".thumb-subline .place");
  if (placeEl) placeEl.textContent = safe(s.address || "");

  // -------- 商品概要（最大2件） --------
  const shopInfo = el.querySelector(".shop-info");
  const rowTpl = el.querySelector(".shop-info .product-summary");
  const bundles = Array.isArray(s.bundles) ? s.bundles.slice(0, 2) : [];

  const fillRow = (row, b) => {
    const pImg = row.querySelector(".product-img");
    if (pImg) {
      pImg.src = b.thumb_url || s.photo_url || NOIMG;
      pImg.alt = `${safe(b.title ?? "おすすめセット")} の画像`;
    }
    const pName = row.querySelector(".product-name");
    if (pName) pName.textContent = safe(b.title ?? "おすすめセット");

    const slotLabel = b.slot_label || b.slot || b.time || "";
    const timeEl = row.querySelector(".time");
    if (timeEl) timeEl.textContent = slotLabel ? `🕒 ${slotLabel}` : "";

    // 価格: bundle優先 → shop
    const pv = [b.price_min, b.price, s.min_price]
      .map(Number)
      .find((v) => Number.isFinite(v));
    const priceEl = row.querySelector(".price-inline");
    if (priceEl) {
      if (Number.isFinite(pv)) {
        priceEl.textContent = yen(pv);
        priceEl.hidden = false;
        priceEl.classList.add("show");
      } else {
        priceEl.hidden = true;
        priceEl.classList.remove("show");
      }
    }

    // 在庫: bundle.qty_available → b.stock → shop.stock_remain
    const remain = [b.qty_available, b.stock, s.stock_remain]
      .map((v) => Number(v))
      .find((v) => Number.isFinite(v));
    const stockEl = row.querySelector(".stock-inline");
    if (stockEl) {
      if (Number.isFinite(remain) && remain > 0) {
        stockEl.textContent = `残り${remain}個`;
        stockEl.hidden = false;
        stockEl.classList.add("show");
      } else {
        stockEl.hidden = true;
        stockEl.classList.remove("show");
      }
    }
  };

  if (shopInfo && rowTpl) {
    // いったん空にしてから埋める
    shopInfo.innerHTML = "";
    if (bundles[0]) {
      const r1 = rowTpl.cloneNode(true);
      fillRow(r1, bundles[0]);
      shopInfo.appendChild(r1);
    }
    if (bundles[1]) {
      const r2 = rowTpl.cloneNode(true);
      fillRow(r2, bundles[1]);
      shopInfo.appendChild(r2);
    }
    // 3件以上なら「他 n セット」
    const remainCnt =
      (Array.isArray(s.bundles) ? s.bundles.length : 0) - bundles.length;
    if (remainCnt > 0) {
      const moreWrap = document.createElement("div");
      moreWrap.className = "more-wrap";
      moreWrap.innerHTML = `<button class="more-bundles">他 ${remainCnt} セット</button>`;
      shopInfo.appendChild(moreWrap);
    }
  }

  return el;
}

// === ここまで createCard ===

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
