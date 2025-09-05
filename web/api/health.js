// web/api/health.js (CommonJS)
module.exports = (req, res) => {
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('x-health-version', 'v5'); // ← 反映確認用
  res.end(JSON.stringify({
    ok: true,
    now: new Date().toISOString(),
    runtime: 'node-cjs'
  }));
};
