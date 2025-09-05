export const runtime = 'edge';
export default async function handler() {
  return new Response(JSON.stringify({ ok: true, ping: 'favorites' }), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
