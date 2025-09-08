// web/js/recent.js
import { apiJSON } from "./http.js";

function minutesUntilEnd(slot) {
  if (!slot) return Infinity;
  const m = String(slot).match(
    /(\d{1,2}):(\d{2})\s*[-–~〜]\s*(\d{1,2}):(\d{2})/
  );
  if (!m) return Infinity;
  const endH = Number(m[3]),
    endMin = Number(m[4]);
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

// 既存の createCard(s) をこの版で置き換え
function createCard(s) {
  const tpl = document.getElementById("shop-card-template");
  const yen = (v) => "¥" + Number(v).toLocaleString("ja-JP");
  const safe = (v) => (v == null ? "" : String(v));

  if (!tpl) {
    const fallback = document.createElement("article");
    fallback.className = "shop-card";
    fallback.textContent = safe(s.name || "店舗");
    return fallback;
  }

  const el = tpl.content.firstElementChild.cloneNode(true);

  // 画像
  const thumbImg = el.querySelector(".thumb img");
  if (thumbImg) {
    thumbImg.src = s.photo_url || "./photo/noimg.jpg";
    thumbImg.alt = safe(s.name);
  }

  // お気に入り
  const favBtn = el.querySelector(".thumb .heart.fav-btn");
  if (favBtn) favBtn.dataset.shopId = safe(s.id);

  // ★ オーバーレイ内のテキスト
  el.querySelector(".thumb-info .thumb-title").textContent = safe(s.name);
  const point = el.querySelector(".thumb-info .point");
  const status = el.querySelector(".thumb-info .status");
  const place = el.querySelector(".thumb-info .place");
  if (point) point.textContent = safe(s.category);
  if (status) status.textContent = ""; // recentは距離なし
  if (place) place.textContent = safe(s.address);

  // ▼ 商品概要（bundles 最大2件）
  const shopInfo = el.querySelector(".shop-info");
  const firstSummary = el.querySelector(".shop-info .product-summary");
  const bundles = Array.isArray(s.bundles) ? s.bundles.slice(0, 1) : [];
  // ▼ これで置き換え（nearby.js / recent.js 共通）
  const fill = (summaryEl, b, s) => {
    const safe = (v) => (v == null ? "" : String(v));
    const yen = (v) => "¥" + Number(v).toLocaleString("ja-JP");

    // 画像
    const pImg = summaryEl.querySelector(".product-img");
    if (pImg) {
      pImg.src = b.thumb_url || s.photo_url || "./photo/noimg.jpg";
      pImg.alt = `${safe(b.title ?? "おすすめセット")} の画像`;
    }

    // タイトル
    const pName = summaryEl.querySelector(".product-name");
    if (pName) pName.textContent = b.title ?? "おすすめセット";

    // 時間帯（slot_label/slot どちらでも対応）
    const time = summaryEl.querySelector(".meta .time");
    const slotLabel = b.slot || b.slot_label || "";
    if (time) time.textContent = slotLabel ? `🕒 ${slotLabel}` : "";

    // 「終了間近」バッジ（あるなら minutesUntilEnd を利用）
    const metaBox = summaryEl.querySelector(".meta");
    if (typeof minutesUntilEnd === "function" && metaBox) {
      const SOON_MINUTES = 30;
      const mins = minutesUntilEnd(slotLabel);
      // 既存の .soon を出し入れ
      let soon = metaBox.querySelector(".soon");
      if (mins <= SOON_MINUTES) {
        if (!soon) {
          soon = document.createElement("span");
          soon.className = "soon";
          soon.textContent = "終了間近";
          metaBox.appendChild(soon);
        }
      } else {
        soon?.remove();
      }
    }

    // 右端：在庫ピル（まずはバンドル単位 → 無ければ店舗合算）
    const stockInline = summaryEl.querySelector(".ps-aside .stock-inline");
    if (stockInline) {
      const remain = Number.isFinite(Number(b.qty_available))
        ? Number(b.qty_available)
        : Number.isFinite(Number(s.stock_remain))
        ? Number(s.stock_remain)
        : null;

      if (Number.isFinite(remain) && remain > 0) {
        stockInline.textContent = `残り${remain}個`;
        stockInline.classList.add("show");
        stockInline.hidden = false;
      } else {
        stockInline.classList.remove("show");
        stockInline.hidden = true;
      }
    }

    // 右端：価格ピル（バンドルの price / price_min → 無ければ店の min_price）
    const priceInline = summaryEl.querySelector(".ps-aside .price-inline");
    if (priceInline) {
      const priceVal = Number.isFinite(Number(b.price))
        ? Number(b.price)
        : Number.isFinite(Number(b.price_min))
        ? Number(b.price_min)
        : Number.isFinite(Number(s.min_price))
        ? Number(s.min_price)
        : null;

      if (priceVal != null) {
        priceInline.textContent = yen(priceVal); // 「〜」は付けない
        priceInline.classList.add("show");
        priceInline.hidden = false;
      } else {
        priceInline.classList.remove("show");
        priceInline.hidden = true;
      }
    }
  };

  if (!bundles.length) {
    if (shopInfo) shopInfo.remove();
  } else {
    fill(firstSummary, bundles[0], s);
    const total = Array.isArray(s.bundles) ? s.bundles.length : 0;
    if (total > 1 && shopInfo) {
      const moreWrap = document.createElement("div");
      moreWrap.className = "more-wrap";
      const chip = document.createElement("span");
      chip.className = "more-bundles";
      chip.textContent = `他 ${total - 1} セット`;
      moreWrap.appendChild(chip);
      shopInfo.appendChild(moreWrap);
    }
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
