// web/api/health.js
export const config = { runtime: 'edge' };

export default function handler() {
  return new Response(
    JSON.stringify({ ok: true, now: new Date().toISOString(), runtime: 'edge' }),
    {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    }
  );
}
