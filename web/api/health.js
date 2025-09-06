export default function handler(req, res) {
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({
    ok: true,
    now: new Date().toISOString(),
    node: process.versions.node,   // ← 実際の Node バージョン
    module: 'esm'                  // ← 自己申告
  }));
}
