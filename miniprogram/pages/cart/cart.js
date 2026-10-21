const api = require('../../utils/api');
// pages/cart/cart.js
Page({
  data: {
    cart: [],
    totalCount: 0
  },

  onLoad() {
    this.loadCart()
  },

  onShow() {
    this.loadCart()
  },

  async loadCart() {
    const cart = wx.getStorageSync('cart') || []
    const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0)
    this.setData({ cart, totalCount })
    if(cart.length){
      try {
        const response=await api.callFunction({name:'getDishes',data:{}});
        // 刷新可能过期的图片链接；以当前点菜篮为准，避免覆盖等待期间的增减操作。
        const current=wx.getStorageSync('cart')||[];
        const refreshed=current.map(item=>{
          const latest=response.result.data.find(dish=>dish._id===item._id);
          return {...item,imageUrl:latest?latest.imageUrl:'/images/default-dish.png'};
        });
        wx.setStorageSync('cart',refreshed);
        this.setData({cart:refreshed,totalCount:refreshed.reduce((sum,item)=>sum+item.quantity,0)});
      }catch(error){/* 断网时保留点菜篮，提交时仍由云端验证。 */}
    }
  },

  // 增加数量
  increaseQuantity(e) {
    const index = e.currentTarget.dataset.index
    const { cart } = this.data
    cart[index].quantity += 1
    this.updateCart(cart)
  },

  // 减少数量
  decreaseQuantity(e) {
    const index = e.currentTarget.dataset.index
    const { cart } = this.data
    
    if (cart[index].quantity > 1) {
      cart[index].quantity -= 1
      this.updateCart(cart)
    } else {
      // 数量为1时，弹出确认删除
      this.removeItem(e)
    }
  },

  // 删除项目
  removeItem(e) {
    const index = e.currentTarget.dataset.index
    const { cart } = this.data
    
    wx.showModal({
      title: '提示',
      content: '确定要删除这道菜吗？',
      success: (res) => {
        if (res.confirm) {
          cart.splice(index, 1)
          this.updateCart(cart)
          wx.showToast({
            title: '已删除',
            icon: 'success'
          })
        }
      }
    })
  },

  // 更新购物车
  updateCart(cart) {
    const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0)
    this.setData({ cart, totalCount })
    wx.setStorageSync('cart', cart)
  },

  // 清空购物车
  clearCart() {
    wx.showModal({
      title: '提示',
      content: '确定要清空购物车吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({ cart: [], totalCount: 0 })
          wx.setStorageSync('cart', [])
          wx.showToast({
            title: '已清空',
            icon: 'success'
          })
        }
      }
    })
  },

  // 提交订单
  submitOrder() {
    if (this.data.totalCount === 0) {
      wx.showToast({
        title: '购物车是空的',
        icon: 'none'
      })
      return
    }

    wx.navigateTo({
      url: '/pages/orderConfirm/orderConfirm'
    })
  }
})
