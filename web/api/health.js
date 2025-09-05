// web/api/health.js
export default (req, res) => {
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ ok: true, now: new Date().toISOString(), runtime: 'node-esm' }));
};
