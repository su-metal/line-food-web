// web/api/favorite-add.js
import { getUserId } from './_lib/auth.js';
import { sbFetch, noStore } from './_lib/sb.js';

async function readJson(req){ return await new Promise((ok, ng)=>{ const b=[]; req.on('data',c=>b.push(c)); req.on('end',()=>{ try{ ok(b.length?JSON.parse(Buffer.concat(b).toString('utf8')):{}) }catch(e){ ng(e) } }); req.on('error',ng); }); }

export default async function handler(req,res){
  try{
    if (req.method!=='POST'){ res.statusCode=405; res.setHeader('allow','POST'); return res.end('Method Not Allowed'); }
    const uid = await getUserId(req).then(r=>r.userId ?? r);
    if (!uid){ res.statusCode=401; noStore(res); res.setHeader('content-type','application/json; charset=utf-8'); return res.end(JSON.stringify({ok:false,error:'unauthorized'})); }
    const { shopId } = await readJson(req);
    if (!shopId){ res.statusCode=400; noStore(res); res.setHeader('content-type','application/json; charset=utf-8'); return res.end(JSON.stringify({ok:false,error:'shopId required'})); }

    const r = await sbFetch('/rest/v1/favorites', {
      method:'POST',
      headers:{ Prefer:'resolution=merge-duplicates' },
      body: JSON.stringify({ user_id: uid, shop_id: shopId })
    });
    if (!r.ok && r.status!==409) throw new Error(`SB insert failed: ${r.status}`);

    res.statusCode=200; noStore(res);
    res.setHeader('content-type','application/json; charset=utf-8');
    res.end(JSON.stringify({ ok:true, isFav:true }));
  }catch(e){
    console.error('[favorite-add] error', e);
    res.statusCode=500; noStore(res);
    res.setHeader('content-type','application/json; charset=utf-8');
    res.end(JSON.stringify({ ok:false, error:'internal_error' }));
  }
}
