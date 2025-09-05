// web/api/favorites.js  ← ESM
export const runtime = 'edge';

export default function handler() {
  return new Response(
    JSON.stringify({ ok: true, ping: 'favorites', runtime: 'edge' }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
}
