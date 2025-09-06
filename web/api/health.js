export default function handler(req, res) {
  try {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      ok: true,
      now: new Date().toISOString(),
      node: process.versions.node,
      module: 'esm'
    }));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok:false, error: String(e && e.message || e) }));
  }
}
