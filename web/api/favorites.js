// web/api/favorites.js (Edge runtime - ping)
export const runtime = 'edge';

export default function handler() {
  return new Response(
    JSON.stringify({ ok: true, ping: 'favorites', v: 'fav-v1' }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'x-handler': 'favorites-ping-edge',
      },
    }
  );
}
