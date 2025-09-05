// web/api/ping.js  （Node runtime / ESM）
export default function handler(req, res) {
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('x-handler', 'ping-node'); // デバッグ用目印
  res.end(JSON.stringify({
    ok: true,
    pong: true,
    now: new Date().toISOString(),
    runtime: 'node'
  }));
}
