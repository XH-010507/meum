const api = require('../../utils/api');
Page({
  data:{appName:'家庭小厨房'},
  startOrdering(){wx.navigateTo({url:'/pages/dishList/dishList'});},
  myOrders(){wx.navigateTo({url:'/pages/orderList/orderList'});},
  async goToAdmin(){
    try {await api.callFunction({name:'checkAdmin',data:{}}); wx.navigateTo({url:'/pages/admin/admin'});}
    catch(error){wx.showModal({title:'暂时无法进入',content:error.message,showCancel:false});}
  },
  async identity(){
    try {const r=await api.callFunction({name:'identity',data:{}});
      wx.showModal({title:'本人身份码（私下交给管理员）',content:r.result.data.openid,confirmText:'复制',success:result=>{if(result.confirm)wx.setClipboardData({data:r.result.data.openid});}});
    }catch(error){wx.showModal({title:'无法获取身份码',content:error.message,showCancel:false});}
  }
});
