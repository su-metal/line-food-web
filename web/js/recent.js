// web/js/recent.js
import { apiJSON } from "./http.js";

// 共通ユーティリティ（先頭に追加）
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
const yen = (v) => "¥" + Number(v).toLocaleString("ja-JP");
const safe = (v) => (v == null ? "" : String(v));
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
    const F = document.createElement("article");
    F.className = "shop-card";
    F.textContent = safe(s.name || "店舗");
    return F;
  }
  const el = tpl.content.firstElementChild.cloneNode(true);

  const thumbImg = $one(el, ".thumb img", ".card-hero img", "img");
  if (thumbImg) {
    thumbImg.src = s.photo_url || "./photo/noimg.jpg";
    thumbImg.alt = safe(s.name);
  }
  const favBtn = $one(el, ".fav-btn", ".heart");
  if (favBtn) favBtn.dataset.shopId = safe(s.id);

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
    ""
  ); // recentは距離なし
  setText(
    $one(
      el,
      ".thumb-info .place",
      ".thumb-subline .place",
      ".card-head .place"
    ),
    safe(s.address)
  );

  const shopInfo = $one(el, ".shop-info", ".card-body", ".bundles");
  const firstSummary = $one(
    el,
    ".shop-info .product-summary",
    ".bundle",
    ".product"
  );
  const bundles = Array.isArray(s.bundles) ? s.bundles.slice(0, 2) : [];

  const fill = (summaryEl, b) => {
    const pImg = $one(summaryEl, ".product-img", "img");
    if (pImg) {
      pImg.src = b.thumb_url || s.photo_url || "./photo/noimg.jpg";
      pImg.alt = `${safe(b.title ?? "おすすめセット")} の画像`;
    }
    setText(
      $one(summaryEl, ".product-name", ".bundle-title", ".title"),
      b.title ?? "おすすめセット"
    );

    const slot = b.slot || b.slot_label || "";
    setText(
      $one(summaryEl, ".meta .time", ".product-meta .time", ".time"),
      slot
    );

    const pv = Number.isFinite(Number(b.price_min))
      ? Number(b.price_min)
      : Number.isFinite(Number(s.min_price))
      ? Number(s.min_price)
      : null;
    showPill(
      $one(summaryEl, ".price-inline", ".pill.price"),
      pv != null ? yen(pv) : ""
    );

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
