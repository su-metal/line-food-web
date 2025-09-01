// api/my-reservations.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*')
  .split(',').map(s => s.trim());

const LINE_LOGIN_CHANNEL_ID = process.env.LINE_LOGIN_CHANNEL_ID; // LIFF親（LINE Login）
const LINE_MSG_CHANNEL_ID   = process.env.LINE_CHANNEL_ID;       // Messaging API

function applyCors(req, res) {
  const origin = req.headers.origin;
  const ok = ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Origin', ok ? origin : (ALLOWED_ORIGINS[0] || '*'));
}

async function getUserIdFromIdToken(req) {
  const auth = req.headers.authorization || '';
  const idToken = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!idToken) throw new Error('no_id_token');

  async function verifyWith(clientId) {
    if (!clientId) return null;
    const resp = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type':'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: clientId })
    });
    const v = await resp.json().catch(() => null);
    return (resp.ok && v && v.sub) ? v : null;
  }
  let v = await verifyWith(LINE_LOGIN_CHANNEL_ID);
  if (!v) v = await verifyWith(LINE_MSG_CHANNEL_ID);
  if (!v) throw new Error('verify_failed');
  return v.sub; // "U..."
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET')     return res.status(405).json({ ok:false, error:'method_not_allowed' });

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return res.status(500).json({ ok:false, error:'env_missing' });
  }

  try {
    const user_liff_id = await getUserIdFromIdToken(req);
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth:{ persistSession:false } });
    const { data, error } = await supabase
      .from('reservations')
      .select('id, offer_id, status')
      .eq('user_liff_id', user_liff_id)
      .in('status', ['reserved', 'paid']);

    if (error) {
      console.error(error);
      return res.status(500).json({ ok:false, error:'internal_error', detail:error.message });
    }
    return res.status(200).json({ ok:true, items: data || [] });
  } catch (e) {
    console.error(e);
    return res.status(401).json({ ok:false, error:'auth_or_internal_error', detail:e.message });
  }
}
