// web/js/nearby.js  ← フロント用（ブラウザで実行）
import { apiJSON } from './http.js';

function fmtDistance(m){ if(!Number.isFinite(m))return ''; return m<1000?`${m} m`:`${(m/1000).toFixed(1)} km`; }

function createCard(s){
  const el=document.createElement('article');
  el.className='shop-card';
  el.innerHTML=`
    <div class="thumb">
      <img src="${s.photo_url || './photo/noimg.jpg'}" alt="${s.name ?? ''}" />
      ${Number.isFinite(s.min_price) ? `<span class="price">¥${s.min_price}</span>` : ''}
    </div>
    <div class="body">
      <div class="title-line">
        <h4>${s.name ?? ''}</h4>
        <button class="heart fav-btn" data-shop-id="${s.id}" aria-pressed="false" aria-label="お気に入りを切り替え">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 21s-6.7-4.2-9.2-8C1.2 10 2.1 7.2 4.6 6c1.9-1 4.3-.5 5.6 1.2C11.5 5.5 13.9 5 15.8 6c2.5 1.2 3.4 4 1.8 7-2.5 3.8-9.6 8-9.6 8Z"
              fill="none" stroke="currentColor" stroke-width="1.8"/>
          </svg>
        </button>
      </div>
      <div class="subline">
        <span class="point">${s.category ?? ''}</span>
        <span class="status">${fmtDistance(s.distance_m)}</span>
      </div>
      <div class="meta"><span class="address">${s.address ?? ''}</span></div>
    </div>`;
  return el;
}

export async function loadNearby({ category=null, priceMax=null, radius=3000 } = {}){
  const TARGET=6;
  const row=document.getElementById('nearby-row');
  if(!row) return;
  row.innerHTML = `<article class="shop-card"><div class="body"><div class="title-line"><h4>読み込み中…</h4></div></div></article>`;

  // geolocation
  let lat,lng;
  try{
    const pos = await new Promise((resolve,reject)=>{
      if(!navigator.geolocation) return reject(new Error('no_geolocation'));
      navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:false,timeout:8000,maximumAge:60000});
    });
    lat=pos.coords.latitude; lng=pos.coords.longitude;
  }catch{
    row.innerHTML = `<article class="shop-card"><div class="body"><div class="title-line"><h4>現在地が取得できませんでした</h4></div></div></article>`;
    return;
  }

  const radii=[radius,5000,8000,12000,20000];
  const seen=new Set(); let pool=[];
  for(const r of radii){
    const qs=new URLSearchParams({lat,lng,radius:String(r),limit:String(TARGET)});
    if(category) qs.set('category',category);
    if(Number.isFinite(priceMax)) qs.set('priceMax',String(priceMax));
    try{
      const data=await apiJSON(`/api/nearby?${qs.toString()}`);
      for(const it of data.items||[]){ if(seen.has(it.id)) continue; seen.add(it.id); pool.push(it); }
      pool.sort((a,b)=>a.distance_m-b.distance_m);
      if(pool.length>=TARGET){ pool=pool.slice(0,TARGET); break; }
    }catch(e){ console.warn('[nearby] fetch failed @', r, e.status, e.body||e); }
  }

  row.innerHTML='';
  if(!pool.length){
    row.innerHTML = `<article class="shop-card"><div class="body"><div class="title-line"><h4>近くにお店が見つかりません</h4></div></div></article>`;
    return;
  }
  for(const s of pool.slice(0,TARGET)) row.appendChild(createCard(s));

  try{ const fav=await import('./fav.js'); fav.initAllFavButtons?.(); }catch{}
}
