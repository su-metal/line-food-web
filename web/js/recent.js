// web/js/recent.js
import { apiJSON } from "./http.js";

/* ===== Utils ===== */
const NOIMG = "./img/noimg.svg";
const yen = (v) => "¥" + Number(v).toLocaleString("ja-JP");
const safe = (v) => (v == null ? "" : String(v));
const fmtDistance = (m) =>
  Number.isFinite(m)
    ? m < 1000
      ? `${Math.round(m)} m`
      : `${(m / 1000).toFixed(1)} km`
    : "";
const titleOf = (b) => b?.title ?? b?.name ?? b?.bundle_title ?? "";
const priceOf = (b, s) => b?.price ?? b?.price_min ?? s?.min_price ?? null;
const stockOf = (b, s) =>
  b?.qty_available ?? b?.stock ?? s?.stock_remain ?? null;
const slotOf = (b) => b?.slot_label ?? b?.slot ?? b?.time ?? "";

// 既存の createCard を丸ごと置き換え
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

/* ===== API loader ===== */
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

    // お気に入りの初期化
    try {
      const fav = await import("./fav.js");
      fav.initAllFavButtons?.();
    } catch {}
  } catch (e) {
    console.warn("[recent] failed", e?.status, e?.body || e);
    row.innerHTML = `<article class="shop-card"><div class="body"><div class="title-line"><h4>読み込みに失敗しました</h4></div></div></article>`;
  }
}
