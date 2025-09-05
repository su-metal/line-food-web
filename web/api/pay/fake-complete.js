const proxy = require('../_proxy');
module.exports = (req, res) =>
  proxy(req, res, { pathRewrite: '/api/pay/fake-complete' });