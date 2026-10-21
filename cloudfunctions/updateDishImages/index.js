const cloud = require('wx-server-sdk');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
// 保留旧接口名称；默认图改为随项目携带，无需批量改写所有菜品记录。
exports.main = require('./guard').wrap('updateDishImages',cloud,cloud.database(),async()=>({code:0,message:'默认图片已改为本地资源，无需批量更新',data:{updated:0}}));
