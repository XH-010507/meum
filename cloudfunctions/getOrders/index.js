// 云函数 - 获取订单列表
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  try {
    const { date, status } = event
    
    // 构建查询条件
    let query = event._owner ? {owner:event._owner} : {}
    if(event.orderId) query._id=event.orderId
    
    if (date) {
      query.visitDate = date
    }
    
    if (status) {
      query.status = status
    }
    
    // 查询订单
    const result = await guard.all(db.collection('order').where(query).orderBy('createTime','desc'),500)
    
    return {
      code: 0,
      message: 'success',
      data: result.data,
      admin: event._actor.admin
    }
  } catch (error) {
    console.error('获取订单列表失败:', error)
    return {
      code: -2,
      message: '数据库错误',
      error: error.message
    }
  }
}

const guard = require('./guard');
exports.main = guard.wrap('getOrders',cloud,db,exports.main);
