const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const guard = require('./guard');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const db = cloud.database();
exports.main = guard.wrap('createOrder',cloud,db,async event => {
  const requestId = guard.text(event.requestId,80,true);
  const orderId = crypto.createHash('sha256').update(event._actor.openid+'|'+requestId).digest('hex');
  const previous = await db.collection('order').where({_id:orderId}).limit(1).get();
  if (previous.data.length) return {code:0,data:{_id:orderId,reused:true}};
  const date = guard.text(event.visitDate,10,true);
  const parsed = new Date(date+'T00:00:00+08:00');
  const today = new Date(Date.now()+8*3600000).toISOString().slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(+parsed) || new Date(+parsed+8*3600000).toISOString().slice(0,10)!==date || date<today || +parsed>Date.now()+90*86400000) throw Error('请选择今天起90天内的有效日期');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(event.visitTime || '')) throw Error('请选择有效的用餐时间');
  if (!Array.isArray(event.dishes) || !event.dishes.length || event.dishes.length>30) throw Error('请选择1至30道菜');
  const seen = new Set();
  const dishes = [];
  for (const item of event.dishes) {
    const dishId = guard.text(item.dishId,128,true);
    if (seen.has(dishId) || !Number.isInteger(item.quantity) || item.quantity<1 || item.quantity>20) throw Error('菜品不能重复，每道菜数量须为1至20份');
    seen.add(dishId);
    const found = (await db.collection('dish').where({_id:dishId}).limit(1).get()).data[0];
    if (!found || found.isAvailable===false) throw Error('菜品已下架，请刷新菜单');
    dishes.push({dishId,dishName:found.name,quantity:item.quantity,ingredients:found.ingredients || []});
  }
  const totalDishes = dishes.reduce((sum,d)=>sum+d.quantity,0);
  if (totalDishes>100) throw Error('每次点菜总量不能超过100份');
  const data = {owner:event._actor.openid,requestId,guestName:guard.text(event.guestName,40),guestPhone:guard.text(event.guestPhone,30),
    visitDate:date,visitTime:event.visitTime,specialRequests:guard.text(event.specialRequests,200),dishes,totalDishes,
    status:'pending',createTime:new Date(),updateTime:new Date()};
  await db.runTransaction(async tx => {
    const existing = await tx.collection('order').doc(orderId).get().catch(error => {
      if (/not exist|not found|不存在/i.test(error.message)) return {data:null};
      throw error;
    });
    if (!existing.data) await tx.collection('order').doc(orderId).set({data});
  });
  return {code:0,message:'点菜已提交',data:{_id:orderId}};
});
