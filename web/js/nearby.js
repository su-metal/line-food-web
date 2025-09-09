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

// 既存の createCard を丸ごと置き換え
// === ここから createCard をまるごと貼り替え ===
function createCard(s) {
  const tpl = document.getElementById("shop-card-template");
  if (!tpl) {
    const a = document.createElement("article");
    a.className = "shop-card";
    a.textContent = safe(s.name || "店舗");
    return a;
  }

  const el = tpl.content.firstElementChild.cloneNode(true);

  // お気に入り
  const favBtn = el.querySelector(".fav-btn, .heart");
  if (favBtn) favBtn.dataset.shopId = safe(s.id);

  // サムネ画像
  const imgEl = el.querySelector(".thumb img, .avatar img");
  if (imgEl) {
    imgEl.src = s.photo_url || NOIMG;
    imgEl.alt = safe(s.name || "店舗画像");
    imgEl.onerror = () => {
      imgEl.onerror = null;
      imgEl.src = NOIMG;
    };
  }

  // 見出し・メタ
  const titleEl = el.querySelector(
    ".thumb-title, .title, .shop-title, .product-name, h4"
  );
  if (titleEl) titleEl.textContent = safe(s.name || "");

  const catEl = el.querySelector(".point, .chip.cat, .cat, .category");
  if (catEl) catEl.textContent = safe(s.category || "");

  const distEl = el.querySelector(".status, .chip.distance, .distance");
  if (distEl) distEl.textContent = fmtDistance(s.distance_m);

  const placeEl = el.querySelector(".place, .chip.place, .addr, .address");
  if (placeEl) placeEl.textContent = safe(s.address || "");

  // ---------- 商品概要（bundles 最大2件）
  const bundles = Array.isArray(s.bundles) ? s.bundles.slice(0, 2) : [];

  // コンテナ（なければ生成）
  let info = el.querySelector(".shop-info, .variants, .list, .body");
  if (!info) {
    info = document.createElement("div");
    info.className = "shop-info";
    el.appendChild(info);
  }

  // 1行テンプレ（なければ生成）
  const existingRow = el.querySelector(".shop-info .product-summary");
  const makeRow = () => {
    if (existingRow) return existingRow.cloneNode(true);
    const row = document.createElement("div");
    row.className = "product-summary";
    row.innerHTML = `
      <img class="product-img" alt="">
      <div class="product-main">
        <div class="product-name"></div>
        <div class="product-meta">
          <span class="time"></span>
          <span class="eta" hidden></span>
        </div>
      </div>
      <div class="ps-aside">
        <span class="stock-inline" hidden></span>
        <span class="price-inline" hidden></span>
      </div>`;
    return row;
  };

  const setRow = (rowEl, b) => {
    const pImg = rowEl.querySelector(".product-img");
    if (pImg) {
      pImg.src = b.thumb_url || s.photo_url || NOIMG;
      pImg.alt = `${safe(titleOf(b) || "おすすめセット")} の画像`;
      pImg.onerror = () => {
        pImg.onerror = null;
        pImg.src = NOIMG;
      };
    }

    const pName = rowEl.querySelector(".product-name");
    if (pName) pName.textContent = safe(titleOf(b) || "おすすめセット");

    const slotLabel = slotOf(b);
    const timeEl = rowEl.querySelector(".time");
    if (timeEl) timeEl.textContent = slotLabel ? `🕒 ${slotLabel}` : "";

    const priceVal = priceOf(b, s);
    const priceEl = rowEl.querySelector(".price-inline");
    if (priceEl) {
      if (Number.isFinite(Number(priceVal))) {
        priceEl.textContent = yen(priceVal);
        priceEl.hidden = false;
        priceEl.classList.add("show");
      } else {
        priceEl.hidden = true;
        priceEl.classList.remove("show");
      }
    }

    const remain = stockOf(b, s);
    const stockEl = rowEl.querySelector(".stock-inline");
    if (stockEl) {
      if (Number.isFinite(Number(remain)) && Number(remain) > 0) {
        stockEl.textContent = `残り${Number(remain)}個`;
        stockEl.hidden = false;
        stockEl.classList.add("show");
      } else {
        stockEl.hidden = true;
        stockEl.classList.remove("show");
      }
    }
  };

  // 反映
  const slot = el.querySelector(".shop-info") || info;
  slot.innerHTML = "";
  if (bundles.length) {
    const first = makeRow();
    setRow(first, bundles[0]);
    slot.appendChild(first);

    if (bundles[1]) {
      const second = makeRow();
      setRow(second, bundles[1]);
      slot.appendChild(second);
    }

    const remainCnt =
      (Array.isArray(s.bundles) ? s.bundles.length : 0) - bundles.length;
    if (remainCnt > 0) {
      const moreWrap = document.createElement("div");
      moreWrap.className = "more-wrap";
      moreWrap.innerHTML = `<button class="more-bundles">他 ${remainCnt} セット</button>`;
      slot.appendChild(moreWrap);
    }
  } else {
    slot.remove();
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
