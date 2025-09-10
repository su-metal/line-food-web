// web/js/home-hero.js
// 上段＝最適な1店舗（距離×時間×在庫でスコア）
// 下段＝同店舗の商品2件（残りわずか/買いやすい優先）＋距離/時間表示を強化
import { apiJSON } from "./http.js";

const NOIMG = "./img/noimg.svg";
const yen = (v) => (Number.isFinite(+v) ? "¥" + Number(v).toLocaleString("ja-JP") : "");

/* ---------- utils ---------- */
const pick = (o, keys) => keys.map(k => o?.[k]).find(v => v != null && v !== "");
const SHOP_IMG_KEYS  = ["photo_url","cover_url","imageUrl","image","thumbnail","heroImage","img"];
const SHOP_NAME_KEYS = ["name","store_name","title"];
const SHOP_AREA_KEYS = ["area","station","city","address_short","place","ward"];
const SHOP_DIST_KEYS = ["distance_km","distanceKm","distance_km_text","distance"];
const PROD_IMG_KEYS  = ["thumb_url","image_url","image","thumbnail","photo_url"];
const PROD_TITLE_KEYS= ["title","name","bundle_title"];
const PROD_PRICE_KEYS= ["price_min","price","min_price","sale_price"];
const PROD_STOCK_KEYS= ["remaining","stock","left","available","qty","quantity"];
const PROD_START_KEYS= ["pickup_start_at","start_at","available_from","window_start","startTime","start"];
const PROD_END_KEYS  = ["pickup_end_at","end_at","available_to","window_end","endTime","end"];

const shopId   = (s) => s?.id ?? s?.shop_id ?? s?.shopId ?? s?._id;
const prodId   = (p) => p?.id ?? p?.bundle_id ?? p?.product_id ?? p?._id;

const shopName = (s) => pick(s, SHOP_NAME_KEYS) || "お店";
const shopArea = (s) => pick(s, SHOP_AREA_KEYS) || null;
const shopImg  = (s) => pick(s, SHOP_IMG_KEYS)  || NOIMG;
const prodTitle= (p) => pick(p, PROD_TITLE_KEYS) || "おすすめ";
const prodPrice= (p, s) => pick(p, PROD_PRICE_KEYS) ?? s?.min_price ?? null;
const prodImg  = (p, s) => pick(p, PROD_IMG_KEYS) || shopImg(s);
const isFav    = (s) => !!(s?.is_favorite || s?.favorite || s?.fav);

function distanceKmOf(s){
  const raw = pick(s, SHOP_DIST_KEYS);
  if (raw == null) return null;
  if (typeof raw === "number") return raw;
  const m = String(raw).match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : null;
}
function remainingOf(p){
  const n = Number(pick(p, PROD_STOCK_KEYS));
  return Number.isFinite(n) ? n : null;
}
function toDateMaybe(x){
  if (!x) return null;
  if (typeof x === "number") return new Date(x);
  if (/^\d{1,2}:\d{2}/.test(x)) {
    const [h,m] = x.split(":").map(n=>parseInt(n,10));
    const d=new Date(); d.setHours(h,m||0,0,0); return d;
  }
  const d = new Date(x);
  return isNaN(+d) ? null : d;
}
function windowOf(p){
  let start = toDateMaybe(pick(p, PROD_START_KEYS));
  let end   = toDateMaybe(pick(p, PROD_END_KEYS));
  if (!start || !end) {
    const txt = [p?.window,p?.time,p?.slot].find(t => typeof t === "string" && /[:：]\d{2}.+[-–—].+[:：]\d{2}/.test(t||""));
    if (txt){
      const m = txt.replace(/[：]/g,":").replace(/[—–]/g,"-").match(/(\d{1,2}):(\d{2}).*?(\d{1,2}):(\d{2})/);
      if (m){
        const d=new Date();
        start=new Date(d.getFullYear(),d.getMonth(),d.getDate(),+m[1],+m[2],0,0);
        end=new Date(d.getFullYear(),d.getMonth(),d.getDate(),+m[3],+m[4],0,0);
      }
    }
  }
  return {start,end};
}
const hhmm = (d)=> String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");

function etaLabel({start,end}){
  const now = Date.now();
  if (start && end && now >= +start && now <= +end) return "受付中";
  if (start && now < +start){
    const m = Math.max(0, Math.round((+start - now)/60000));
    return `最短 ${m}分`;
  }
  if (end && now < +end) return `〜${hhmm(end)}`;
  return null;
}

/* ---------- scoring ---------- */
function scoreShop(shop, products){
  const dist = distanceKmOf(shop);
  const distScore = dist == null ? 0.6 : Math.max(0, Math.min(1, 1 - dist/5)); // <=5km満点

  let soonMin = null;
  for (const p of products){
    const {start,end} = windowOf(p);
    const m = start && end && Date.now()>=+start && Date.now()<=+end ? 0 : (start? Math.round((+start - Date.now())/60000): null);
    if (m!=null) soonMin = soonMin==null ? m : Math.min(soonMin,m);
  }
  const timeScore = soonMin==null ? 0.5 : Math.max(0, Math.min(1, 1 - soonMin/180)); // 3h基準

  const hasStock = products.some(p => (remainingOf(p) ?? 1) > 0);
  const stockScore = hasStock ? 1 : 0;

  const favScore = isFav(shop) ? 1 : 0;

  return distScore*0.4 + timeScore*0.4 + stockScore*0.15 + favScore*0.05;
}

/* ---------- fetch ---------- */
async function safeList(url){
  try{
    const json = await apiJSON(url);
    if (Array.isArray(json)) return json;
    if (Array.isArray(json?.items)) return json.items;
    if (json) return [json];
  }catch(e){ console.warn("[home-hero] fetch fail:",url,e); }
  return [];
}
async function fetchCandidateShops(){
  let shops = await safeList("/api/nearby?limit=24");
  if (!shops.length) shops = await safeList("/api/shops-recent?limit=24");
  return shops;
}
async function fetchProductsOfShop(shop){
  const embedded = (Array.isArray(shop?.bundles) && shop.bundles.length && shop.bundles)
                || (Array.isArray(shop?.products) && shop.products.length && shop.products) || [];
  if (embedded.length) return embedded;

  const id = shopId(shop);
  if (!id) return [];
  const urls = [
    `/api/shops/${encodeURIComponent(id)}/products?limit=20&random=1`,
    `/api/stores/${encodeURIComponent(id)}/products?limit=20&random=1`,
    `/api/products?shopId=${encodeURIComponent(id)}&limit=20&random=1`,
    `/api/bundles?shopId=${encodeURIComponent(id)}&limit=20`,
  ];
  for (const u of urls){
    const list = await safeList(u);
    if (list.length) return list;
  }
  return [];
}

/* ---------- choose ---------- */
async function chooseHeroShop(){
  const base = await fetchCandidateShops();
  if (!base.length) return null;
  const candidates = base.slice(0, 8);
  const enriched = await Promise.all(candidates.map(async s=>{
    const products = await fetchProductsOfShop(s);
    return { shop:s, products, score: scoreShop(s, products) };
  }));
  enriched.sort((a,b)=> b.score - a.score);
  return enriched[0] ?? null;
}

/* ---------- icons ---------- */
function icon(name){
  const path = {
    loc:   "M12 21s-6-4.6-6-10a6 6 0 1 1 12 0c0 5.4-6 10-6 10Zm0-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
    clock: "M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Zm0-14v4l3 2",
    bolt:  "M13 2L3 14h7l-1 8 10-12h-7l1-8Z",
    box:   "M21 8l-9 4-9-4 9-4 9 4Zm0 0v8l-9 4-9-4V8",
    yen:   "M12 3v6M8 6h8M6 12h12M8 16h8",
  }[name] || "";
  return `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/* ---------- DOM helpers ---------- */
function ensure(container, sel, create){
  let el = container.querySelector(sel);
  if (!el){ el = create(); container.appendChild(el); }
  return el;
}

function pillHTML(text, cls=""){
  return `<span class="pill ${cls}">${text}</span>`;
}

function setMainHero(shop, products){
  const a = document.querySelector("#hero-card-main");
  if (a) a.href = shopId(shop) ? `/shop.html?id=${encodeURIComponent(shopId(shop))}` : "#";

  const name = shopName(shop);
  const area = shopArea(shop);
  const img  = shopImg(shop);

  const title = document.querySelector("#hero-title"); if (title) title.textContent = name;
  const sub   = document.querySelector("#hero-sub");
  const first = products.map(p=>({ ...windowOf(p), p })).filter(x=>x.start).sort((x,y)=> +x.start - +y.start)[0];
  if (sub){
    if (first?.start && first?.end){
      sub.textContent = area ? `${area}・${hhmm(first.start)}–${hhmm(first.end)}` : `${hhmm(first.start)}–${hhmm(first.end)}`;
    } else {
      sub.textContent = area ?? "本日のおすすめ";
    }
  }

  const im = document.querySelector("#hero-img-main");
  if (im && img){ im.src = img; im.alt = name; im.loading="eager"; im.decoding="async"; }

  // 左上メタピル（距離 / 受け取り時間 / ETA / 在庫希少）
  const meta = ensure(a, ".hero-meta", ()=>{ const d=document.createElement("div"); d.className="hero-meta"; return d; });
  meta.innerHTML = "";
  const dk = distanceKmOf(shop);
  if (dk!=null) meta.insertAdjacentHTML("beforeend", pillHTML(`${icon("loc")}${dk.toFixed(1)} km`));
  if (first?.start && first?.end) meta.insertAdjacentHTML("beforeend", pillHTML(`${icon("clock")}${hhmm(first.start)}–${hhmm(first.end)}`));

  const eta = etaLabel(first || {});
  if (eta) meta.insertAdjacentHTML("beforeend", pillHTML(`${icon("bolt")}${eta}`, "dark"));

  const scarce = products.map(remainingOf).filter(n=>n!=null).sort((a,b)=>a-b)[0];
  if (scarce!=null) meta.insertAdjacentHTML("beforeend", pillHTML(`${icon("box")}残り${scarce}個`, "warn"));
}

function ensureTags(root){
  return ensure(root, ".hero-tags", ()=>{ const d=document.createElement("div"); d.className="hero-tags"; return d; });
}

function setSmallCard(idx, item){
  const root  = document.getElementById(`hero-card-s${idx}`);
  const imgEl = document.getElementById(`hero-s${idx}-img`);
  const capEl = document.getElementById(`hero-s${idx}-cap`);
  if (!root) return;

  if (imgEl && item.img){
    imgEl.src = item.img;
    imgEl.alt = `${item.shop ?? ""} ${item.title ?? ""}`.trim() || "おすすめ";
    imgEl.loading="lazy"; imgEl.decoding="async";
  }
  if (capEl){
    const priceText = item.price != null ? `（${yen(item.price)}）` : "";
    capEl.textContent = `${item.title ?? "おすすめ"}${priceText}`;
  }
  if (item.href) root.href = item.href;

  // 右下のタグ群（価格 / ETA / 残数）
  const tags = ensureTags(root);
  tags.innerHTML = "";
  if (item.price != null) tags.insertAdjacentHTML("beforeend", `<span class="tag price">${icon("yen")}${yen(item.price)}</span>`);
  if (item.eta)            tags.insertAdjacentHTML("beforeend", `<span class="tag eta">${icon("bolt")}${item.eta}</span>`);
  if (item.rem != null)    tags.insertAdjacentHTML("beforeend", `<span class="tag stock">${icon("box")}残${item.rem}</span>`);
}

/* 2件選ぶ（残りわずか→価格安い→画像あり） */
function chooseTwoProducts(products, shop){
  const sP = (p)=>{
    const rem = remainingOf(p);
    const price = prodPrice(p, shop);
    const img = !!prodImg(p, shop);
    const r = rem == null ? 0.2 : (rem<=0 ? 0 : 1/(rem+1));
    const pc = Number.isFinite(+price) ? 1/(Number(price)+1) : 0.3;
    return r*0.6 + pc*0.3 + (img?0.1:0);
  };
  const arr = products.slice().sort((a,b)=> sP(b)-sP(a));
  return [arr[0], arr[1] ?? arr[0]].filter(Boolean);
}

/* ---------- main ---------- */
async function initSmartHero(){
  try{
    const chosen = await chooseHeroShop();
    if (!chosen) return;

    const { shop, products } = chosen;
    setMainHero(shop, products);

    const [p1, p2] = chooseTwoProducts(products, shop);
    const decorate = (p) => {
      const win = windowOf(p);
      return {
        title: prodTitle(p),
        price: prodPrice(p, shop),
        shop: shopName(shop),
        img:   prodImg(p, shop),
        href:  prodId(p) ? `/product.html?id=${encodeURIComponent(prodId(p))}`
                          : `/shop.html?id=${encodeURIComponent(shopId(shop))}`,
        rem:   remainingOf(p),
        eta:   etaLabel(win),
      };
    };
    if (p1) setSmallCard(1, decorate(p1));
    if (p2) setSmallCard(2, decorate(p2));
  }catch(e){
    console.warn("[home-hero] fatal", e);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initSmartHero();
});
