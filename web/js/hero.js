// web/js/hero.js
import { apiJSON } from "./http.js";

const NOIMG = "./img/noimg.svg";

/**
 * 候補データから画像候補の配列を作る
 * @param {Array<any>} items
 * @returns {Array<{src:string, alt:string, href:string}>}
 */
function extractImageCandidates(items = []) {
  const cands = [];
  for (const s of items) {
    const shopName = s?.name ?? "";
    // 店の写真
    if (s?.photo_url) {
      cands.push({
        src: s.photo_url,
        alt: shopName ? `${shopName} の写真` : "お店の写真",
        href: s?.id ? `/shop.html?id=${encodeURIComponent(s.id)}` : "#",
      });
    }
    // バンドルの写真
    if (Array.isArray(s?.bundles)) {
      for (const b of s.bundles) {
        if (b?.thumb_url) {
          const title = b?.title ?? b?.name ?? b?.bundle_title ?? "おすすめ";
          cands.push({
            src: b.thumb_url,
            alt: `${title} の画像`,
            href:
              b?.id
                ? `/bundle.html?id=${encodeURIComponent(b.id)}`
                : s?.id
                ? `/shop.html?id=${encodeURIComponent(s.id)}`
                : "#",
          });
        }
      }
    }
  }
  return cands;
}

/**
 * 可能なら現在地つきで新着を取得 → 画像候補をランダム表示
 */
async function loadHeroRandom() {
  const imgEl = document.getElementById("hero-img-main");
  const cardEl = document.getElementById("hero-card-main");
  const titleEl = document.getElementById("hero-title");
  const subEl = document.getElementById("hero-sub");
  if (!imgEl || !cardEl) return;

  // 1) 位置情報（任意）
  let lat, lng;
  try {
    const pos = await new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("no_geolocation"));
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 60000,
      });
    });
    lat = pos.coords.latitude;
    lng = pos.coords.longitude;
  } catch {
    // 取得できない場合はそのまま続行
  }

  // 2) API から候補を取得
  const qs = new URLSearchParams({ limit: "12" });
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    qs.set("lat", String(lat));
    qs.set("lng", String(lng));
  }

  let items = [];
  try {
    const data = await apiJSON(`/api/shops-recent?${qs.toString()}`);
    items = data?.items ?? [];
  } catch (e) {
    // だめならノー位置で再トライ
    try {
      const data = await apiJSON(`/api/shops-recent?limit=12`);
      items = data?.items ?? [];
    } catch {}
  }

  // 3) 画像候補を作ってランダム採用
  const cands = extractImageCandidates(items);
  const pick = cands.length
    ? cands[Math.floor(Math.random() * cands.length)]
    : { src: NOIMG, alt: "おすすめ画像", href: "#" };

  // 4) 反映
  imgEl.src = pick.src || NOIMG;
  imgEl.alt = pick.alt || "おすすめ";
  cardEl.href = pick.href || "#";

  // 5) 見出し（任意で軽く更新）
  if (titleEl) titleEl.textContent = "HELLO!";
  if (subEl) subEl.textContent = "本日のおすすめ";
}

// ページ表示時に実行
document.addEventListener("DOMContentLoaded", loadHeroRandom);
