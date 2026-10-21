'use strict';
// 此文件由 scripts/sync-cloud.js 复制到各云函数，保证每个函数可以独立部署。
const ADMIN_ACTIONS = new Set(['addDish','updateDish','deleteDish','deleteOrder','getIngredients','updateDishImages','uploadImage','checkAdmin']);
async function authorize(cloud, db, adminOnly = false) {
  const openid = cloud.getWXContext().OPENID;
  if (!openid) throw Error('无法获取微信身份，请使用自己的AppID运行');
  const result = await db.collection('family_config').where({_id:'main'}).limit(1).get();
  const config = result.data[0];
  if (!config || !Array.isArray(config.admins) || !config.admins.length) throw Error('请先在云控制台配置家庭管理员和成员');
  const admin = config.admins.includes(openid);
  const member = Array.isArray(config.members) && config.members.some(value => value === openid || value.openid === openid);
  if (!admin && !member) throw Error('你尚未加入本家庭，请将本人身份码交给管理员');
  if (adminOnly && !admin) throw Error('仅家庭管理员可以执行此操作');
  return {openid, admin};
}
function text(value, max, required = false) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw Error('填写内容不完整或过长');
  return value.trim();
}
async function validateImage(db, fileId) {
  if (!fileId || fileId === 'default' || fileId === '/images/default-dish.png') return;
  if (typeof fileId !== 'string' || fileId.length > 300 || !fileId.startsWith('cloud://')) throw Error('请选择本家庭上传的图片');
  const rows = await db.collection('images').where({fileId}).limit(1).get();
  if (!rows.data.length) throw Error('图片未通过上传校验，请重新选择');
}
async function sanitizeDish(db, event, partial) {
  const clean = {};
  for (const [key, max] of [['name',40],['cuisine_code',80],['category_code',80],['description',500]]) {
    if (!partial || event[key] !== undefined) clean[key] = text(event[key], max, key !== 'description');
  }
  if (!partial || event.ingredients !== undefined) {
    if (!Array.isArray(event.ingredients) || !event.ingredients.length || event.ingredients.length > 50) throw Error('请填写1至50种食材');
    clean.ingredients = event.ingredients.map(value => text(value, 60, true));
  }
  if (event.image !== undefined) {await validateImage(db, event.image); clean.image = event.image || 'default';}
  if (event.isAvailable !== undefined) {
    if (typeof event.isAvailable !== 'boolean') throw Error('上架状态无效');
    clean.isAvailable = event.isAvailable;
  }
  if (partial) clean.dishId = text(event.dishId, 128, true);
  return clean;
}
async function all(query, max = 1000) {
  const rows = [];
  for (let skip = 0; skip < max; skip += 100) {
    const result = await query.skip(skip).limit(Math.min(100, max-skip)).get();
    rows.push(...result.data);
    if (result.data.length < 100) break;
  }
  return {data: rows};
}
async function resolveImages(cloud, dishes) {
  const ids = [...new Set(dishes.map(d => d.image).filter(value => typeof value === 'string' && value.startsWith('cloud://')))];
  const urls = {};
  for (let i = 0; i < ids.length; i += 50) {
    const result = await cloud.getTempFileURL({fileList: ids.slice(i,i+50)});
    for (const value of result.fileList) if (value.tempFileURL) urls[value.fileID] = value.tempFileURL;
  }
  return dishes.map(d => ({...d, imageUrl: urls[d.image] || '/images/default-dish.png'}));
}
function wrap(name, cloud, db, handler) {
  return async (event = {}, context) => {
    try {
      const actor = await authorize(cloud, db, ADMIN_ACTIONS.has(name));
      let input = {...event, _actor:actor};
      if (name === 'addDish' || name === 'updateDish') input = await sanitizeDish(db, event, name === 'updateDish');
      if (name === 'getDishes' && !actor.admin) input.isAvailable = true;
      if (name === 'getOrders') input._owner = actor.admin ? null : actor.openid;
      if (name === 'getDishes' && input.keyword) {
        input.keyword = text(input.keyword,80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
      const result = await handler(input, context);
      if (result.code === 0 && name === 'getDishes') result.data = await resolveImages(cloud,result.data);
      if (result.code === 0 && name === 'getDishDetail') {
        if (!actor.admin && result.data.isAvailable === false) throw Error('菜品已下架');
        result.data = (await resolveImages(cloud,[result.data]))[0];
      }
      return result;
    } catch (error) { return {code:-1,message:error.message || '操作失败，请重试'}; }
  };
}
module.exports = {authorize,validateImage,sanitizeDish,all,wrap,text};
