const cloud = require('wx-server-sdk');
const guard = require('./guard');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const db = cloud.database();
exports.main = guard.wrap('getIngredients',cloud,db,async event => {
  const date = guard.text(event.date,10,true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error('请选择日期');
  const orders = (await guard.all(db.collection('order').where({visitDate:date,status:db.command.neq('cancelled')}),500)).data;
  const ingredients = new Map();
  const cache = new Map();
  for (const order of orders) for (const dish of order.dishes) {
    let source = dish.ingredients;
    if (!source) {
      if (!cache.has(dish.dishId)) cache.set(dish.dishId,(await db.collection('dish').where({_id:dish.dishId}).limit(1).get()).data[0]);
      source = (cache.get(dish.dishId)||{}).ingredients || [];
    }
    for (const value of source) {
      const name = typeof value==='string' ? value : value.name;
      if (!name) continue;
      const current = ingredients.get(name) || {name,count:0,dishes:[]};
      current.count += dish.quantity;
      if (!current.dishes.includes(dish.dishName)) current.dishes.push(dish.dishName);
      ingredients.set(name,current);
    }
  }
  return {code:0,data:{date,totalOrders:orders.length,ingredients:[...ingredients.values()].map(value=>({...value,totalAmount:'用于'+value.count+'份菜（具体用量按口味准备）',unit:''}))}};
});
