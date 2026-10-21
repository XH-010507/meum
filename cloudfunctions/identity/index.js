const cloud = require('wx-server-sdk');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
exports.main = async () => {
  const openid = cloud.getWXContext().OPENID;
  return openid ? {code:0,data:{openid}} : {code:-1,message:'无法获取微信身份，请用自己的AppID运行'};
};
