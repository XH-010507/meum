const config = require('./config/local');
App({onLaunch() {if (wx.cloud && config.envId) wx.cloud.init({env:config.envId,traceUser:false});},globalData:{userInfo:null}});
