// web/js/recent.js
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

// ※ fmtDistance は既存の関数をそのまま使う

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

export async function loadRecent({
  category = null,
  priceMax = null,
  limit = 6,
} = {}) {
  const row = document.getElementById("recent-row");
  if (!row) return;
  row.innerHTML = `<article class="shop-card"><div class="body"><div class="title-line"><h4>読み込み中…</h4></div></div></article>`;

  const qs = new URLSearchParams();
  if (category) qs.set("category", category);
  if (Number.isFinite(priceMax)) qs.set("priceMax", String(priceMax));
  qs.set("limit", String(limit));

  try {
    const data = await apiJSON(`/api/shops-recent?${qs.toString()}`);
    row.innerHTML = "";
    const items = (data.items || []).slice(0, limit);
    if (!items.length) {
      row.innerHTML = `<article class="shop-card"><div class="body"><div class="title-line"><h4>新着がありません</h4></div></div></article>`;
      return;
    }
    for (const s of items) row.appendChild(createCard(s));
    // お気に入りボタンの初期化
    try {
      const fav = await import("./fav.js");
      fav.initAllFavButtons?.();
    } catch {}
  } catch (e) {
    row.innerHTML = `<article class="shop-card"><div class="body"><div class="title-line"><h4>読み込みに失敗しました</h4></div></div></article>`;
    console.warn("[recent] failed", e.status, e.body || e);
  }
}
