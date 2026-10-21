const cloud = require('wx-server-sdk');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const db = cloud.database();
exports.main = require('./guard').wrap('checkAdmin',cloud,db,async()=>({code:0,data:{admin:true}}));
