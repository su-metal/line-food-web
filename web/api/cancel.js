// web/api/cancel.js
import proxy from './_proxy.js';
export default function handler(req, res) {
  return proxy(req, res, { pathRewrite: '/api/cancel' });
}
