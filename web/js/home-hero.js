// web/js/home-hero.js
import { apiJSON } from "./http.js";

const NOIMG = "./img/noimg.svg";
const yen = (v) => (Number.isFinite(+v) ? "¥" + Number(v).toLocaleString("ja-JP") : "");
const titleOf = (b) => b?.title ?? b?.name ?? b?.bundle_title ?? "おすすめセット";
const priceOf = (b, s) => b?.price_min ?? b?.price ?? s?.min_price ?? null;

/** カードへ反映 */
function setSmallCard(idx, item) {
  const root = document.getElementById(`hero-card-s${idx}`);
  if (!root) return;

  const imgEl = document.getElementById(`hero-s${idx}-img`);
  const capEl = document.getElementById(`hero-s${idx}-cap`);

  if (imgEl && item.img) {
    imgEl.src = item.img;
    imgEl.alt = `${item.shop ?? ""} ${item.title ?? ""}`.trim() || "おすすめ";
  }
  if (capEl) {
    const priceText = item.price != null ? `（${yen(item.price)}）` : "";
    capEl.textContent = `${item.title ?? "おすすめ"}${priceText}`;
  }
  if (root && item.href) {
    root.href = item.href;
  }
}

/** バンドル候補を shop配列 からプール化 */
function pushBundles(pool, shop) {
  if (!Array.isArray(shop?.bundles)) return;
  for (const b of shop.bundles) {
    const img = b?.thumb_url || shop?.photo_url || NOIMG;
    pool.push({
      title: titleOf(b),
      price: priceOf(b, shop),
      shop: shop?.name ?? "",
      img,
      href: shop?.id
        ? `/shop.html?id=${encodeURIComponent(shop.id)}${b?.id ? `#bundle-${encodeURIComponent(b.id)}` : ""}`
        : "#",
    });
  }
}

/** 配列からランダムにn件取り出す（重複なし） */
function pickN(arr, n) {
  const a = arr.slice();
  const out = [];
  for (let i = 0; i < n && a.length; i++) {
    const k = Math.floor(Math.random() * a.length);
    out.push(a.splice(k, 1)[0]);
  }
  return out;
}

export async function loadHeroMiniCards() {
  const pool = [];

  // 1st: 新着から候補収集
  try {
    const recent = await apiJSON("/api/shops-recent?limit=24");
    for (const s of recent.items || []) pushBundles(pool, s);
  } catch (e) {
    console.warn("[home-hero] recent fetch failed", e);
  }

  // 2nd: 足りなければ nearby で補完（位置情報がなくてもサーバ側で動く前提）
  if (pool.length < 2) {
    try {
      const near = await apiJSON("/api/nearby?limit=24");
      for (const s of near.items || []) pushBundles(pool, s);
    } catch (e) {
      console.warn("[home-hero] nearby fetch failed", e);
    }
  }

  // 画像のある候補を優先
  const candidates = pool.filter((p) => p.img && p.img !== NOIMG);
  if (!candidates.length) return; // 失敗時は既定テキストのまま

  const [c1, c2] = pickN(candidates, 2);
  if (c1) setSmallCard(1, c1);
  if (c2) setSmallCard(2, c2);
}

// 自動実行（ホームだけでOK）
document.addEventListener("DOMContentLoaded", () => {
  loadHeroMiniCards().catch((e) => console.warn("[home-hero] fatal", e));
});
