// web/js/nearby.js  ← フロント用（ブラウザで実行）
import { apiJSON } from "./http.js";

// ==== Utils: このブロックを nearby.js / recent.js の先頭に1回だけ ====

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

// ▼ 商品概要（bundles 最大2件・moreボタン廃止）
const info = el.querySelector(".shop-info");
const row1 = info?.querySelector(".product-summary");

// バンドル（商品）配列を安全に取得
const bundles = Array.isArray(s.bundles) ? s.bundles : [];

// ユーティリティ：1行ぶんを埋める
const fillRow = (rowEl, b) => {
  // 画像
  const pImg = rowEl.querySelector(".product-img");
  if (pImg) {
    pImg.src = (b && b.thumb_url) || s.photo_url || NOIMG;
    pImg.alt = `${safe(titleOf(b) || "セット")} の画像`;
    pImg.onerror = () => {
      pImg.onerror = null;
      pImg.src = NOIMG;
    };
  }

  // タイトル（商品名）
  const pName = rowEl.querySelector(".product-name");
  if (pName) pName.textContent = safe(titleOf(b) || "セット");

  // 提供時間帯
  const timeEl = rowEl.querySelector(".time");
  const slotLabel = slotOf(b);
  if (timeEl) timeEl.textContent = slotLabel ? `🕒 ${slotLabel}` : "";

  // 価格ピル（bundle.price / price_min → shop.min_price の順で拾う）
  const priceEl = rowEl.querySelector(".price-inline");
  const pv = priceOf(b, s);
  if (priceEl) {
    if (pv != null && pv !== "" && Number.isFinite(Number(pv))) {
      priceEl.textContent = yen(pv);
      priceEl.hidden = false;
      priceEl.classList.add("show");
    } else {
      priceEl.hidden = true;
      priceEl.classList.remove("show");
    }
  }

  // 在庫ピル（bundle.qty_available / stock → shop.stock_remain）
  const stockEl = rowEl.querySelector(".stock-inline");
  const sv = stockOf(b, s);
  if (stockEl) {
    if (sv != null && Number(sv) > 0) {
      stockEl.textContent = `残り${Number(sv)}個`;
      stockEl.hidden = false;
      stockEl.classList.add("show");
    } else {
      stockEl.hidden = true;
      stockEl.classList.remove("show");
    }
  }
};

// バンドルが無いなら info ごと外す
if (!info || !row1 || bundles.length === 0) {
  info?.remove();
} else {
  // 1件目：テンプレの最初の .product-summary を“そのまま”使って埋める
  fillRow(row1, bundles[0]);

  // 2件目：クローンしてから初期化→埋める→追加
  if (bundles[1]) {
    const row2 = row1.cloneNode(true);
    // 表示状態を一度リセットしてから
    row2.querySelectorAll(".stock-inline,.price-inline").forEach((e) => {
      e.hidden = true;
      e.classList.remove("show");
      e.textContent = "";
    });
    fillRow(row2, bundles[1]);
    info.appendChild(row2);
  }

  // 3件目以降の “他 n セット” は出さない（旧 more-wrap があれば削除）
  info.querySelector(".more-wrap")?.remove();
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
