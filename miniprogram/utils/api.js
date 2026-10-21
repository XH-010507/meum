const config = require('../config/local');
async function callFunction(options) {
  if (!config.envId || !wx.cloud) throw Error('请先配置自己的云环境ID，并部署云函数。操作尚未提交。');
  const response = await wx.cloud.callFunction(options);
  if (!response.result || response.result.code !== 0) throw Error(response.result && response.result.message || '服务返回异常，请重试');
  return response;
}
module.exports = {callFunction};
