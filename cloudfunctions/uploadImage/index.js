const cloud = require('wx-server-sdk');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const db = cloud.database();
const {runUpload} = require('./image-upload');
const guard = require('./guard');
async function get(id) {return (await db.collection('images').where({_id:id}).limit(1).get()).data[0];}
const repo = {
  beginImageUpload:(id,data)=>db.collection('images').doc(id).set({data}),
  getImageUpload:get,
  putImageChunk:(id,index,data)=>db.collection('images').doc(id+'_'+index).set({data}),
  getImageChunk:(id,index)=>get(id+'_'+index),
  clearImageUpload:async(id,count)=>{await Promise.all(Array.from({length:count},(_,i)=>db.collection('images').doc(id+'_'+i).remove()));await db.collection('images').doc(id).remove();},
  addImage:fileId=>db.collection('images').add({data:{fileId,createdAt:Date.now()}})
};
const storage = {
  upload:async(cloudPath,fileContent)=>(await cloud.uploadFile({cloudPath,fileContent})).fileID,
  remove:fileID=>cloud.deleteFile({fileList:[fileID]})
};
exports.main = guard.wrap('uploadImage',cloud,db,(event)=>runUpload(repo,storage,event._actor.openid,event).then(data=>({code:0,data})));
