// web/js/recent.js
import { apiJSON } from "./http.js";

const yen = (v) => "¥" + Number(v).toLocaleString("ja-JP");
const safe = (v) => (v == null ? "" : String(v));
function fmtDistance(m) {
  if (!Number.isFinite(m)) return "";
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

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

function createCard(s) {
  const tpl = document.getElementById("shop-card-template");
  if (!tpl) {
    const a = document.createElement("article");
    a.className = "shop-card";
    a.textContent = safe(s.name || "店舗");
    return a;
  }
  const el = tpl.content.firstElementChild.cloneNode(true);

  // ---------- 共通: お気に入り ----------
  const favBtn = el.querySelector(".fav-btn, .heart");
  if (favBtn) favBtn.dataset.shopId = safe(s.id);

  // ---------- 画像/アバター ----------
  // 旧テンプレ: .thumb img、新テンプレ: .avatar 内
  const imgEl = el.querySelector(".thumb img, .avatar img");
  if (imgEl) {
    imgEl.src = s.photo_url || "./photo/noimg.jpg";
    imgEl.alt = safe(s.name || "店舗画像");
  } else {
    // 画像ノードが無い場合は頭文字アバター（Sなど）
    const avatarText = el.querySelector(".avatar .initial, .avatar");
    if (avatarText && !avatarText.querySelector("img")) {
      avatarText.textContent =
        safe(s.name || "")
          .trim()
          .slice(0, 1) || "S";
    }
  }

  // ---------- タイトル ----------
  const titleEl = el.querySelector(
    ".thumb-title, .title, .shop-title, .product-name, h4"
  );
  if (titleEl) titleEl.textContent = safe(s.name || "");

  // ---------- チップ: カテゴリ・距離・住所 ----------
  const catEl = el.querySelector(".point, .chip.cat, .cat, .category");
  if (catEl) catEl.textContent = safe(s.category || "");

  const distEl = el.querySelector(".status, .chip.distance, .distance");
  if (distEl) distEl.textContent = fmtDistance(s.distance_m);

  const placeEl = el.querySelector(".place, .chip.place, .addr, .address");
  if (placeEl) placeEl.textContent = safe(s.address || "");

  // ---------- 商品概要（bundles を最大2件）
  const bundles = Array.isArray(s.bundles) ? s.bundles.slice(0, 2) : [];

  // コンテナ確保（旧: .shop-info、新: .variants / .list など）
  let info = el.querySelector(".shop-info, .variants, .list, .body");
  if (!info) {
    info = document.createElement("div");
    info.className = "shop-info";
    el.appendChild(info);
  }

  // 行テンプレ（無ければ作る）
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
      pImg.src = b.thumb_url || s.photo_url || "./photo/noimg.jpg";
      pImg.alt = `${safe(b.title ?? "おすすめセット")} の画像`;
    }
    const pName = rowEl.querySelector(".product-name");
    if (pName) pName.textContent = safe(b.title ?? "おすすめセット");

    // time/slot/slot_label どれでも拾う
    const slotLabel = b.slot_label || b.slot || b.time || "";
    const timeEl = rowEl.querySelector(".time");
    if (timeEl) timeEl.textContent = slotLabel ? `🕒 ${slotLabel}` : "";

    // 価格: bundle → shop の順
    const priceVal = [b.price_min, b.price, s.min_price]
      .map(Number)
      .find((v) => Number.isFinite(v));
    const priceEl = rowEl.querySelector(".price-inline");
    if (priceEl) {
      if (Number.isFinite(priceVal)) {
        priceEl.textContent = yen(priceVal);
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
    const stockEl = rowEl.querySelector(".stock-inline");
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

  // 反映
  if (bundles.length) {
    // 最初の1件
    const first = makeRow();
    setRow(first, bundles[0]);
    // 既存があれば差し替え、無ければ追加
    const slot = el.querySelector(".shop-info");
    slot.innerHTML = ""; // いったん空
    slot.appendChild(first);

    // 2件目
    if (bundles[1]) {
      const second = makeRow();
      setRow(second, bundles[1]);
      slot.appendChild(second);
    }

    // もっと見る（他 n セット）
    const remainCnt =
      (Array.isArray(s.bundles) ? s.bundles.length : 0) - bundles.length;
    if (remainCnt > 0) {
      const moreWrap = document.createElement("div");
      moreWrap.className = "more-wrap";
      moreWrap.innerHTML = `<button class="more-bundles">他 ${remainCnt} セット</button>`;
      slot.appendChild(moreWrap);
    }
  } else {
    // バンドルが無いなら空の .shop-info は消す
    const slot = el.querySelector(".shop-info");
    if (slot) slot.remove();
  }

  return el;
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
