// web/api/reserve.js
import proxy from './_proxy.js';
export default function handler(req, res) {
  return proxy(req, res, { pathRewrite: '/api/reserve' });
}
