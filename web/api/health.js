// web/api/health.js (ESM, Node runtime)
export default function handler(req, res) {
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('x-health-version', 'v3'); // ← 反映確認用の目印
  res.end(JSON.stringify({
    ok: true,
    now: new Date().toISOString(),
    runtime: 'node'
  }));
}
