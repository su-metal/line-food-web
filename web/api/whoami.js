import { getUserId } from './_lib/auth.js';
export default async function handler(req, res) {
  const uid = await getUserId(req);
  if (!uid) {
    res.statusCode = 401;
    res.setHeader('content-type','application/json; charset=utf-8');
    res.setHeader('Cache-Control','no-store, no-cache, must-revalidate');
    res.end(JSON.stringify({ ok:false, error:'unauthorized' }));
    return;
  }
  res.statusCode = 200;
  res.setHeader('content-type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store, no-cache, must-revalidate');
  res.end(JSON.stringify({ ok:true, userId: uid }));
}
