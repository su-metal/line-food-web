export const runtime = 'edge';

export default async function handler(req) {
  return new Response(JSON.stringify({ ok: true, ping: 'favorites' }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-handler': 'favorites-ping'
    }
  });
}
