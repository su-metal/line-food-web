const proxy = require ? require('./_proxy') : (await import('./_proxy.js')).default;

module.exports = async (req, res) => {
  const u = new URL(req.url, `https://${req.headers.host}`);
  const shopId = u.searchParams.get('shopId') || '';
  const q = new URLSearchParams({
    select: '*',
    ...(shopId ? { 'shop_id': `eq.${shopId}` } : {})
  }).toString();

  return proxy(req, res, {
    // ← _proxy が SUPABASE_URL を upstream に選ぶので
    //    /rest/v1/... を素直に連結すればOK
    pathRewrite: `/rest/v1/reservations?${q}`,
    injectHeaders: {
      apikey: process.env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      Prefer: 'count=exact',
    },
  });
};
