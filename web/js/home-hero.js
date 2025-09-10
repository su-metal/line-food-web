// web/js/home-hero.js  — Spotlight Hero (shop 1 + product 2)
import { apiJSON } from "./http.js";

const NOIMG = "./img/noimg.svg";
const yen = (v) => (Number.isFinite(+v) ? "¥" + Number(v).toLocaleString("ja-JP") : "");

/* ---- generic getters ---- */
const pick = (o, ks) => ks.map(k=>o?.[k]).find(v=>v!=null && v!=="");
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
const shopImg  = (s) => pick(s, SHOP_IMG_KEYS) || NOIMG;
const prodTitle= (p) => pick(p, PROD_TITLE_KEYS) || "おすすめ";
const prodPrice= (p, s) => pick(p, PROD_PRICE_KEYS) ?? s?.min_price ?? null;
const prodImg  = (p, s) => pick(p, PROD_IMG_KEYS) || shopImg(s);

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
  if (/^\d{1,2}:\d{2}/.test(x)){
    const [h,m] = x.split(":").map(n=>parseInt(n,10));
    const d=new Date(); d.setHours(h,m||0,0,0); return d;
  }
  const d = new Date(x);
  return isNaN(+d) ? null : d;
}
function windowOf(p){
  let start = toDateMaybe(pick(p, PROD_START_KEYS));
  let end   = toDateMaybe(pick(p, PROD_END_KEYS));
  if (!start || !end){
    const t = [p?.window,p?.time,p?.slot].find(s=>typeof s==="string" && /[:：]\d{2}.+[-–—].+[:：]\d{2}/.test(s||""));
    if (t){
      const m = t.replace(/[：]/g,":").replace(/[—–]/g,"-").match(/(\d{1,2}):(\d{2}).*?(\d{1,2}):(\d{2})/);
      if (m){
        const d=new Date();
        start=new Date(d.getFullYear(),d.getMonth(),d.getDate(),+m[1],+m[2],0,0);
        end  =new Date(d.getFullYear(),d.getMonth(),d.getDate(),+m[3],+m[4],0,0);
      }
    }
  }
  return {start,end};
}
const hhmm = (d)=> String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");

function etaLabel({start,end}){
  const now = Date.now();
  if (start && end && now>=+start && now<=+end) return "受付中";
  if (start && now < +start){
    const m = Math.max(0, Math.round((+start - now)/60000));
    return `最短 ${m}分`;
  }
  if (end && now < +end) return `〜${hhmm(end)}`;
  return null;
}

/* ---- scoring to pick a shop ---- */
function scoreShop(shop, products){
  const dist = distanceKmOf(shop);
  const distScore = dist == null ? 0.6 : Math.max(0, Math.min(1, 1 - dist/5)); // <=5km 満点
  let soonMin=null;
  for (const p of products){
    const {start,end} = windowOf(p);
    const m = start && end && Date.now()>=+start && Date.now()<=+end ? 0 : (start? Math.round((+start - Date.now())/60000): null);
    if (m!=null) soonMin = soonMin==null ? m : Math.min(soonMin,m);
  }
  const timeScore  = soonMin==null ? 0.5 : Math.max(0, Math.min(1, 1 - soonMin/180));
  const stockScore = products.some(p => (remainingOf(p) ?? 1) > 0) ? 1 : 0;
  return distScore*0.5 + timeScore*0.35 + stockScore*0.15;
}

/* ---- fetch ---- */
async function safeList(u){
  try{
    const j = await apiJSON(u);
    if (Array.isArray(j)) return j;
    if (Array.isArray(j?.items)) return j.items;
    if (j) return [j];
  }catch(e){ console.warn("[spotlight] fetch fail:", u, e); }
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

/* ---- DOM helpers ---- */
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
function pill(text, cls=""){ return `<span class="pill ${cls}">${text}</span>`; }
function chip(text, cls=""){ return `<span class="chip ${cls}">${text}</span>`; }

/* ---- paint tiles ---- */
function paintShopTile(shop, products){
  // link
  const a = document.getElementById("tile-shop");
  if (a) a.href = shopId(shop) ? `/shop.html?id=${encodeURIComponent(shopId(shop))}` : "#";

  // image
  const img = document.getElementById("tile-shop-img");
  if (img){ img.src = shopImg(shop); img.alt = shopName(shop); img.loading="eager"; img.decoding="async"; }

  // title/sub
  const name = shopName(shop);
  const area = shopArea(shop);
  const t = document.getElementById("tile-shop-name"); if (t) t.textContent = name;

  const first = products.map(p=>({ ...windowOf(p), p })).filter(x=>x.start).sort((x,y)=> +x.start - +y.start)[0];
  const s = document.getElementById("tile-shop-sub");
  if (s){
    s.textContent = (first?.start && first?.end)
      ? (area ? `${area}・${hhmm(first.start)}–${hhmm(first.end)}` : `${hhmm(first.start)}–${hhmm(first.end)}`)
      : (area ?? "本日のおすすめ");
  }

  // badges
  const row = document.getElementById("tile-shop-badges");
  if (row){
    row.innerHTML = "";
    const dk = distanceKmOf(shop);
    if (dk!=null) row.insertAdjacentHTML("beforeend", pill(`${icon("loc")}${dk.toFixed(1)} km`));
    if (first?.start && first?.end) row.insertAdjacentHTML("beforeend", pill(`${icon("clock")}${hhmm(first.start)}–${hhmm(first.end)}`));
    const eta = etaLabel(first || {});
    if (eta) row.insertAdjacentHTML("beforeend", pill(`${icon("bolt")}${eta}`));
    const scarce = products.map(remainingOf).filter(n=>n!=null).sort((a,b)=>a-b)[0];
    if (scarce!=null) row.insertAdjacentHTML("beforeend", pill(`${icon("box")}残り${scarce}個`, "warn"));
  }
}

function paintProductTile(idx, p, shop){
  const root  = document.getElementById(`tile-p${idx}`);
  const imgEl = document.getElementById(`tile-p${idx}-img`);
  const title = document.getElementById(`tile-p${idx}-title`);
  const chips = document.getElementById(`tile-p${idx}-chips`);
  if (!root) return;

  root.href = prodId(p) ? `/product.html?id=${encodeURIComponent(prodId(p))}`
                        : `/shop.html?id=${encodeURIComponent(shopId(shop))}`;
  if (imgEl){ imgEl.src = prodImg(p, shop); imgEl.alt = prodTitle(p); imgEl.loading="lazy"; imgEl.decoding="async"; }
  if (title) title.textContent = prodTitle(p);

  if (chips){
    const win = windowOf(p);
    const eta = etaLabel(win);
    const rem = remainingOf(p);
    const price = prodPrice(p, shop);

    chips.innerHTML = "";
    if (price != null) chips.insertAdjacentHTML("beforeend", chip(`${icon("yen")}${yen(price)}`, "price"));
    if (eta)          chips.insertAdjacentHTML("beforeend", chip(`${icon("bolt")}${eta}`, "eta"));
    if (rem != null)  chips.insertAdjacentHTML("beforeend", chip(`${icon("box")}残${rem}`, "stock"));
  }
}

/* 商品2件を選ぶ（残りわずか→安い→画像あり） */
function chooseTwo(products, shop){
  const score = (p)=>{
    const rem = remainingOf(p);
    const price = prodPrice(p, shop);
    const img = !!prodImg(p, shop);
    const r = rem==null ? 0.2 : (rem<=0 ? 0 : 1/(rem+1));
    const pc = Number.isFinite(+price) ? 1/(Number(price)+1) : 0.3;
    return r*0.6 + pc*0.3 + (img?0.1:0);
  };
  const arr = products.slice().sort((a,b)=> score(b)-score(a));
  return [arr[0], arr[1] ?? arr[0]].filter(Boolean);
}

/* ---- main ---- */
async function initSpotlight(){
  const shops = await fetchCandidateShops();
  if (!shops.length) return;

  // 候補最大8店 → 各商品の情報を見てスコア
  const enriched = await Promise.all(
    shops.slice(0,8).map(async s=>{
      const products = await fetchProductsOfShop(s);
      return { shop:s, products, score: scoreShop(s, products) };
    })
  );
  enriched.sort((a,b)=> b.score - a.score);
  const chosen = enriched[0];
  if (!chosen) return;

  const { shop, products } = chosen;
  paintShopTile(shop, products);

  const [p1, p2] = chooseTwo(products, shop);
  if (p1) paintProductTile(1, p1, shop);
  if (p2) paintProductTile(2, p2, shop);
}

document.addEventListener("DOMContentLoaded", initSpotlight);
