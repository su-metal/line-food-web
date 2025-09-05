export const config = { runtime: 'nodejs20.x' };
import proxy from './_proxy.js';
export default (req, res) =>
  proxy(req, res, { pathRewrite: '/api/reserve' });
