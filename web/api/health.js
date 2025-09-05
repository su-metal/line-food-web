module.exports = (req, res) => {
  res.setHeader('content-type','application/json; charset=utf-8');
  res.end(JSON.stringify({
    ok: true,
    node: process.version,
    upstream: process.env.UPSTREAM_BASE || process.env.MVP_API_BASE || null,
    url: req.url
  }));
};
