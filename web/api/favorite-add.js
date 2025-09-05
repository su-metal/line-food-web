const proxy = require('./_proxy');
module.exports = (req, res) =>
  proxy(req, res, { pathRewrite: '/api/favorite-add' });// web/api/favorite-add.js (ESM)
import { getUserId } from './_lib/auth.js';
import { sbFetch } from './_lib/sb.js';

async function readJson(req) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('allow', 'POST');
      res.end('Method Not Allowed');
      return;
    }
    const uid = getUserId(req);
    if (!uid) {
      res.statusCode = 401;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
      return;
    }
    const body = await readJson(req);
    const { shopId } = body || {};
    if (!shopId) {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: false, error: 'shopId required' }));
      return;
    }

    const r = await sbFetch('/rest/v1/favorites', {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates', // upsert 的な挙動
      },
      body: JSON.stringify({ user_id: uid, shop_id: shopId }),
    });

    if (!r.ok && r.status !== 409) {
      throw new Error(`SB insert failed: ${r.status}`);
    }

    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: true }));
  } catch (e) {
    console.error('[favorite-add] error', e);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'internal_error' }));
  }
}
