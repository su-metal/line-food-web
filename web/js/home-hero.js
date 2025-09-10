// web/js/home-hero.js
import { apiJSON } from "./http.js";

const NOIMG = "./img/noimg.svg";
const yen = (v) =>
  Number.isFinite(+v) ? "¥" + Number(v).toLocaleString("ja-JP") : "";

// ----- key helpers -----
const pick = (obj, keys) =>
  keys.map((k) => obj?.[k]).find((v) => v != null && v !== "");

const SHOP_IMG_KEYS = [
  "photo_url",
  "cover_url",
  "heroImage",
  "imageUrl",
  "image",
  "thumbnail",
  "img",
];
const SHOP_NAME_KEYS = ["name", "store_name", "title"];
const SHOP_AREA_KEYS = ["area", "station", "city", "address_short", "place"];

const PROD_IMG_KEYS = [
  "thumb_url",
  "image_url",
  "image",
  "thumbnail",
  "photo_url",
];
const PROD_TITLE_KEYS = ["title", "name", "bundle_title"];
const PROD_PRICE_KEYS = ["price_min", "price", "min_price", "sale_price"];

const shopId = (s) => s?.id ?? s?.shop_id ?? s?.shopId ?? s?._id;
const prodId = (p) => p?.id ?? p?.bundle_id ?? p?.product_id ?? p?._id;

const shopName = (s) => pick(s, SHOP_NAME_KEYS) || "お店";
const shopArea = (s) => pick(s, SHOP_AREA_KEYS) || null;
const shopImg = (s) => pick(s, SHOP_IMG_KEYS) || NOIMG;

const prodTitle = (p) => pick(p, PROD_TITLE_KEYS) || "おすすめ";
const prodPrice = (p, s) => pick(p, PROD_PRICE_KEYS) ?? s?.min_price ?? null;
const prodImg = (p, s) => pick(p, PROD_IMG_KEYS) || shopImg(s);

const shopHref = (s) => {
  const id = shopId(s);
  return id ? `/shop.html?id=${encodeURIComponent(id)}` : "#";
};
const productHref = (p, s) => {
  const pid = prodId(p);
  if (pid) return `/product.html?id=${encodeURIComponent(pid)}`;
  const sid = shopId(s);
  return sid
    ? `/shop.html?id=${encodeURIComponent(sid)}${
        pid ? `#bundle-${encodeURIComponent(pid)}` : ""
      }`
    : "#";
};

// ----- DOM apply helpers -----
function setMainHero(shop) {
  const name = shopName(shop);
  const area = shopArea(shop);
  const img = shopImg(shop);

  const a = document.querySelector("#hero-card-main");
  if (a) a.href = shopHref(shop);

  const t = document.querySelector("#hero-title");
  if (t) t.textContent = name;

  const sub = document.querySelector("#hero-sub");
  if (sub) sub.textContent = area ?? "本日のおすすめ";

  const im = document.querySelector("#hero-img-main");
  if (im && img) {
    im.src = img;
    im.alt = name;
    im.loading = "eager";
    im.decoding = "async";
  }
}

function setSmallCard(idx, item) {
  const root = document.getElementById(`hero-card-s${idx}`);
  const imgEl = document.getElementById(`hero-s${idx}-img`);
  const capEl = document.getElementById(`hero-s${idx}-cap`);
  if (!root) return;

  if (imgEl && item.img) {
    imgEl.src = item.img;
    imgEl.alt = `${item.shop ?? ""} ${item.title ?? ""}`.trim() || "おすすめ";
    imgEl.loading = "lazy";
    imgEl.decoding = "async";
  }
  if (capEl) {
    const priceText = item.price != null ? `（${yen(item.price)}）` : "";
    capEl.textContent = `${item.title ?? "おすすめ"}${priceText}`;
  }
  if (item.href) root.href = item.href;
}

// ----- fetch helpers -----
async function safeFetch(url) {
  try {
    const json = await apiJSON(url);
    if (Array.isArray(json)) return json;
    if (Array.isArray(json?.items)) return json.items;
    if (json) return [json];
  } catch (e) {
    console.warn("[home-hero] fetch fail:", url, e);
  }
  return [];
}

async function pickRandomShop() {
  // まず新着 → だめなら近隣
  let shops = await safeFetch("/api/shops-recent?limit=24");
  if (!shops.length) shops = await safeFetch("/api/nearby?limit=24");
  if (!shops.length) return null;

  const k = (Math.random() * shops.length) | 0;
  return shops[k];
}

async function fetchProductsOfShop(shop) {
  // 1) 店舗JSON内に bundles/products があればそれを使う
  const embedded =
    (Array.isArray(shop?.bundles) && shop.bundles.length && shop.bundles) ||
    (Array.isArray(shop?.products) && shop.products.length && shop.products) ||
    [];
  if (embedded.length) return embedded;

  // 2) APIに問い合わせ（どれか当たる想定）
  const id = shopId(shop);
  if (!id) return [];
  const candidates = [
    `/api/shops/${encodeURIComponent(id)}/products?limit=20&random=1`,
    `/api/stores/${encodeURIComponent(id)}/products?limit=20&random=1`,
    `/api/products?shopId=${encodeURIComponent(id)}&limit=20&random=1`,
    `/api/bundles?shopId=${encodeURIComponent(id)}&limit=20`,
  ];
  for (const u of candidates) {
    const items = await safeFetch(u);
    if (items.length) return items;
  }
  return [];
}

// ----- util -----
function pickN(arr, n) {
  const a = arr.slice();
  const out = [];
  for (let i = 0; i < n && a.length; i++) {
    const k = (Math.random() * a.length) | 0;
    out.push(a.splice(k, 1)[0]);
  }
  return out;
}

// ----- main -----
async function initHomeHero() {
  try {
    // 上段：ランダム店舗
    const shop = await pickRandomShop();
    if (!shop) return;
    setMainHero(shop);

    // 下段：同じ店舗の商品2件
    const products = await fetchProductsOfShop(shop);
    const [p1, p2] = pickN(products, 2);

    if (p1) {
      setSmallCard(1, {
        title: prodTitle(p1),
        price: prodPrice(p1, shop),
        shop: shopName(shop),
        img: prodImg(p1, shop),
        href: productHref(p1, shop),
      });
    }
    if (p2 || p1) {
      const p = p2 || p1;
      setSmallCard(2, {
        title: prodTitle(p),
        price: prodPrice(p, shop),
        shop: shopName(shop),
        img: prodImg(p, shop),
        href: productHref(p, shop),
      });
    }
  } catch (e) {
    console.warn("[home-hero] fatal", e);
  }
}

// 自動実行
document.addEventListener("DOMContentLoaded", () => {
  initHomeHero();
});
