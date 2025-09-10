// web/js/hero.js
import { apiJSON } from "./http.js";

const NOIMG = "./img/noimg.svg";

/**
 * 候補データから画像候補の配列を作る
 * @param {Array<any>} items
 * @returns {Array<{src:string, alt:string, href:string}>}
 */
// 旧: extractImageCandidates(items)
// 新: ショップ写真だけを候補にする
function extractImageCandidates(items = []) {
  const seen = new Set();
  const cands = [];
  for (const s of items) {
    const src = s?.photo_url;
    if (!src || seen.has(src)) continue; // 空や重複を除外
    seen.add(src);
    const name = s?.name ?? "お店";
    cands.push({
      src,
      alt: `${name} の写真`,
      href: s?.id ? `/shop.html?id=${encodeURIComponent(s.id)}` : "#",
      _weight: Number.isFinite(s?.distance_m)
        ? Math.max(1, 20000 - s.distance_m)
        : 1, // 近い店を少しだけ優先（任意）
    });
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
  const qs = new URLSearchParams({ limit: "20" });
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
