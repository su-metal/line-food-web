// web/api/health.js
module.exports = (req, res) => {
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({
    ok: true,
    now: new Date().toISOString(),
    // どの環境変数が見えているかも表示（デバッグ用）
    upstream: process.env.UPSTREAM_BASE || process.env.MVP_API_BASE || null,
    env: process.env.VERCEL_ENV || 'unknown'
  }));
};
