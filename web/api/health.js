// Edge でも Node でも可。Edge のまま軽量に。
export const runtime = 'edge';

export default async function handler() {
  return new Response(
    JSON.stringify({ ok: true, now: new Date().toISOString(), runtime: 'edge' }),
    {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    }
  );
}
