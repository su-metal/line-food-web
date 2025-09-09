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
  const el = tpl
    ? tpl.content.firstElementChild.cloneNode(true)
    : document.createElement("article");
  if (!tpl) el.className = "shop-card card-v3";

  // --- ヘッダ（店名・チップ・お気に入り） ---
  const name = safe(s.name || "");
  const titleNode = el.querySelector(".store-name, .thumb-title, h4");
  if (titleNode) titleNode.textContent = name;

  const avatar = el.querySelector(".avatar");
  if (avatar && !avatar.querySelector("img")) {
    avatar.textContent = name.trim()[0] || "S";
  }

  el.querySelector(".point, .chip.cat, .category")?.replaceChildren(
    document.createTextNode(safe(s.category || ""))
  );
  el.querySelector(".status, .chip.distance")?.replaceChildren(
    document.createTextNode(fmtDistance(s.distance_m))
  );
  el.querySelector(".place, .chip.place, .address")?.replaceChildren(
    document.createTextNode(safe(s.address || ""))
  );

  const favBtn = el.querySelector(".fav-btn, .heart");
  if (favBtn) favBtn.dataset.shopId = safe(s.id);

  // --- 本文（商品 最大2件） ---
  const body = el.querySelector(".card-body");
  if (body) body.innerHTML = ""; // ダミーを必ず空にする

  const bundles = Array.isArray(s.bundles) ? s.bundles.slice(0, 2) : [];

  const makeRow = () => {
    const row = document.createElement("div");
    row.className = "product-summary";
    row.innerHTML = `
      <img class="product-img" alt="">
      <div class="product-main">
        <div class="product-name"></div>
        <div class="product-meta">
          <span class="time"></span>
          <span class="eta" hidden></span>
          <span class="soon" hidden></span>
        </div>
      </div>
      <div class="ps-aside">
        <span class="stock-inline" hidden></span>
        <span class="price-inline" hidden></span>
      </div>`;
    return row;
  };

  const FallbackImg = "./img/noimg.svg";

  const setRow = (rowEl, b) => {
    // 画像
    const img = rowEl.querySelector(".product-img");
    if (img) {
      img.src = b?.thumb_url || s.photo_url || FallbackImg;
      img.alt = `${safe(b?.title ?? b?.name ?? "おすすめセット")} の画像`;
    }

    // タイトル
    const nameEl = rowEl.querySelector(".product-name");
    if (nameEl) {
      nameEl.textContent = safe(
        b?.title ?? b?.name ?? b?.bundle_title ?? "おすすめセット"
      );
    }

    // 時間
    const slotLabel = b?.slot_label || b?.slot || b?.time || "";
    const t = rowEl.querySelector(".time");
    if (t) t.textContent = slotLabel ? `🕒 ${slotLabel}` : "";

    // 終了間近
    const soon = rowEl.querySelector(".soon");
    if (soon) {
      const left = minutesUntilEnd(slotLabel);
      if (left <= 30) {
        soon.textContent = "終了間近";
        soon.hidden = false;
      } else {
        soon.hidden = true;
      }
    }

    // 価格（bundle優先）
    const priceVal = [b?.price_min, b?.price]
      .map(Number)
      .find((v) => Number.isFinite(v));
    const priceEl = rowEl.querySelector(".price-inline");
    if (priceEl) {
      if (Number.isFinite(priceVal)) {
        priceEl.textContent = "¥" + Number(priceVal).toLocaleString("ja-JP");
        priceEl.hidden = false;
        priceEl.classList.add("show");
      } else {
        priceEl.hidden = true;
        priceEl.classList.remove("show");
      }
    }

    // 在庫（bundle優先）
    const remain = [b?.qty_available, b?.stock, s?.stock_remain]
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

  if (body && bundles.length) {
    const r1 = makeRow();
    setRow(r1, bundles[0]);
    body.appendChild(r1);
    if (bundles[1]) {
      const r2 = makeRow();
      setRow(r2, bundles[1]);
      body.appendChild(r2);
    }

    const remain = (s.bundles?.length || 0) - bundles.length;
    if (remain > 0) {
      const wrap = document.createElement("div");
      wrap.className = "more-wrap";
      wrap.innerHTML = `<button class="more-bundles">他 ${remain} セット</button>`;
      body.appendChild(wrap);
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
