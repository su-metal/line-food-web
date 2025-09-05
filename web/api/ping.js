// web/api/ping.js (Edge runtime)
export const runtime = 'edge';
export default () =>
  new Response('pong', {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'x-route': 'ping-edge' },
  });
