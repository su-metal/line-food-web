import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

async function sb(path, method='GET', body){
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return res;
}

app.get('/api/health', (req,res)=>res.json({ok:true}));

// 予約API
app.post('/api/reserve', async (req,res)=>{
  const { offer_id, user_liff_id } = req.body;
  if(!offer_id || !user_liff_id) return res.status(400).json({error:'missing_params'});
  const oR = await sb(`offers?select=*&id=eq.${offer_id}`);
  const offers = await oR.json();
  const offer = offers[0];
  if(!offer || offer.status!=='active' || offer.qty_available<1) return res.status(400).json({error:'sold_out'});
  const pickup_code = Math.random().toString(36).slice(2,8).toUpperCase();
  const rR = await sb('reservations','POST',{offer_id,user_liff_id,qty:1,status:'reserved',pickup_code});
  const created = await rR.json();
  await sb(`offers?id=eq.${offer_id}`,'PATCH',{qty_available:offer.qty_available-1});
  res.json({ok:true,reservation:{id:created[0].id,pickup_code}});
});

// 受取消込API
app.post('/api/pickup', async (req,res)=>{
  const { pickup_code } = req.body;
  const r = await sb(`reservations?select=*&pickup_code=eq.${pickup_code}&status=eq.reserved`);
  const rows = await r.json();
  const rv = rows[0];
  if(!rv) return res.status(400).json({error:'invalid_or_used'});
  await sb(`reservations?id=eq.${rv.id}`,'PATCH',{status:'picked_up',picked_up_at:new Date().toISOString()});
  res.json({ok:true});
});

// ✅ Vercel用エクスポート
export default app;

