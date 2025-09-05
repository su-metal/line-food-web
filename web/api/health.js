// web/api/health.js (Edge runtime)
export const runtime = 'edge';

export default function handler() {
  return new Response(
    JSON.stringify({
      ok: true,
      now: new Date().toISOString(),
      runtime: 'edge',
      v: 'health-v4',
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'x-health-version': 'v4',
      },
    }
  );
}
