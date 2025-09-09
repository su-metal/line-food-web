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
  const el = tpl
    ? tpl.content.firstElementChild.cloneNode(true)
    : document.createElement("article");
  if (!tpl) el.className = "shop-card card-v3";

  // --- ヘッダ（店名・チップ・お気に入り） ---
  const name = safe(s.name || "");
  const titleNode = el.querySelector(".store-name, .thumb-title, h4");
  if (titleNode) titleNode.textContent = name;

  // --- 背景写真（ショップ写真 or 最初のバンドル画像を利用） ---
  const head = el.querySelector(".card-head");
  if (head) {
    const bg =
      s.photo_url ||
      (Array.isArray(s.bundles) && s.bundles[0]?.thumb_url) ||
      "";
    if (bg) {
      head.style.setProperty("--head-bg", `url("${bg}")`);
      head.classList.add("has-photo");
    } else {
      head.style.removeProperty("--head-bg");
      head.classList.remove("has-photo");
    }
  }

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
  <div class="thumb-wrap">
    <img class="product-img" alt="">
    <span class="soon-overlay" hidden>終了間近</span>
  </div>
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
    rowEl.dataset.slot = slotLabel;

    // 終了間近（画像左下のバッジを出す）
    const overlay = rowEl.querySelector(".soon-overlay");
    if (overlay) overlay.hidden = !(minutesUntilEnd(slotLabel) <= SOON_MINUTES);

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

  // --- geolocation（フォールバック付き） ---
  let lat, lng;
  let usedLastLoc = false;

  try {
    const pos = await new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("no_geolocation"));
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 10000, // 少しだけ余裕
        maximumAge: 60000,
      });
    });
    lat = pos.coords.latitude;
    lng = pos.coords.longitude;

    // 成功したら“前回の位置”として保持
    try {
      localStorage.setItem(
        "lastLoc",
        JSON.stringify({ lat, lng, ts: Date.now() })
      );
    } catch {}
  } catch {
    // 1) 直近の位置が保存されていればそれで続行（近い順はだいたい成立）
    try {
      const last = JSON.parse(localStorage.getItem("lastLoc") || "null");
      if (last && Number.isFinite(last.lat) && Number.isFinite(last.lng)) {
        lat = last.lat;
        lng = last.lng;
        usedLastLoc = true;
        console.warn("[nearby] geolocation failed; use last known location");
      }
    } catch {}

    // 2) それも無ければ“新着おすすめ”で代替（近い順は不可）
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      console.warn("[nearby] no location; fallback to recent items");
      row.innerHTML = `
      <article class="shop-card"><div class="body">
        <div class="title-line">
          <h4>現在地が取得できませんでした</h4>
          <p class="note">近い順は使えないため、新着おすすめを表示します。</p>
          <button class="retry-loc" type="button" style="margin-top:.4rem;padding:.28rem .6rem;border:1px solid var(--line);border-radius:999px;background:#fff;">位置情報を再取得</button>
        </div>
      </div></article>`;

      try {
        const data = await apiJSON(`/api/shops-recent?limit=${TARGET}`);
        row.innerHTML = "";
        (data.items || [])
          .slice(0, TARGET)
          .forEach((s) => row.appendChild(createCard(s)));
      } catch (e) {
        row.innerHTML = `<article class="shop-card"><div class="body"><div class="title-line"><h4>おすすめの取得にも失敗しました</h4></div></div></article>`;
      }

      // 再試行ボタン
      row.querySelector(".retry-loc")?.addEventListener("click", () => {
        loadNearby({ category, priceMax, radius, sort });
      });
      return; // ← ここで終了（フォールバック表示済み）
    }
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
