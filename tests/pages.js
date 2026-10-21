const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {png}=require('./image-fixtures');
let passes=0;
function loadPage(name,wx,api){
  let page;
  const filename=path.resolve(__dirname,'../miniprogram/pages',name,name+'.js');
  global.wx=wx;
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{require:id=>id==='../../utils/api'?api:require(path.resolve(path.dirname(filename),id)),
    Page:value=>{page=value;page.setData=function(data){for(const [key,value]of Object.entries(data)){let target=this.data;const keys=key.split('.');while(keys.length>1)target=target[keys.shift()];target[keys[0]]=value;}};},wx,console:{...console,error(){}},Date,setTimeout:()=>{}},{filename});
  return page;
}
(async()=>{
  let bytes=png(600*1024),size=bytes.length,modal='',uploads=0,cancel=false;
  const wx={chooseMedia:o=>cancel?o.fail({errMsg:'chooseMedia:fail cancel'}):o.success({tempFiles:[{tempFilePath:'selected.png',size}]}),
    getFileSystemManager:()=>({getFileInfo:o=>o.success({size:bytes.length}),readFile:o=>o.success({data:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)})}),
    arrayBufferToBase64:value=>Buffer.from(value).toString('base64'),showModal:o=>{modal=o.content;},showToast(){},previewImage(){}};
  const api={callFunction:async options=>{uploads++;return {result:{code:0,data:options.data.action==='beginImageUpload'?{uploadId:'upload-test'}:{fileId:'cloud://test/new'}}};}};
  const page=loadPage('dishEdit',wx,api);page.data.formData.image='old-image';page.data.previewImage='old-preview';
  for(const boundary of [5*1024*1024,5*1024*1024+1]){
    size=boundary;await page.chooseImage();assert.match(modal,/小于5MB/);assert.equal(uploads,0);assert.equal(page.data.formData.image,'old-image');assert.equal(page.data.previewImage,'old-preview');assert.equal(page.data.uploading,false);passes++;
  }
  cancel=true;modal='';await page.chooseImage();assert.equal(modal,'');assert.equal(uploads,0);passes++;
  cancel=false;size=bytes.length;await page.chooseImage();assert.equal(page.data.formData.image,'cloud://test/new');assert.equal(page.data.previewImage,'selected.png');assert.equal(page.data.uploading,false);passes++;
  page.data.uploading=true;const before=uploads;await page.chooseImage();await page.saveDish();page.removeImage();assert.equal(uploads,before);assert.equal(page.data.formData.image,'cloud://test/new');passes++;
  page.data.uploading=false;api.callFunction=async()=>{throw Error('断网了');};modal='';await page.chooseImage();assert.equal(page.data.formData.image,'cloud://test/new');assert.match(modal,/断网/);passes++;
  page.removeImage();assert.equal(page.data.formData.image,'/images/default-dish.png');passes++;

  const cache=new Map([['cart',[{_id:'d1',name:'青菜',quantity:1}]]]);let submitted=0,message='';
  const orderWx={getStorageSync:key=>cache.get(key),setStorageSync:(key,value)=>cache.set(key,value),removeStorageSync:key=>cache.delete(key),showLoading(){},hideLoading(){},showToast(){},showModal:o=>{message=o.title;},reLaunch(){}};
  const requests=[];
  const orderApi={callFunction:async options=>{submitted++;requests.push(options.data.requestId);throw Error('网络失败');}};
  const orderPage=loadPage('orderConfirm',orderWx,orderApi);orderPage.onLoad();
  await orderPage.submitOrder();assert.equal(message,'未能确认提交成功');assert.equal(cache.get('cart').length,1);assert.equal(orderPage.data.submitting,false);passes++;
  await orderPage.submitOrder();assert.equal(requests[0],requests[1]);assert.equal(submitted,2);passes++;
  orderApi.callFunction=async options=>{requests.push(options.data.requestId);return {result:{code:0}};};await orderPage.submitOrder();assert.equal(message,'提交成功');assert.equal(cache.get('cart').length,0);assert.equal(cache.has('pending-order'),false);passes++;
  console.log('页面回归通过：'+passes+'组（模拟微信API；超限/取消/失败保留旧图、上传互斥、断网保留点菜篮及幂等重试）');
})().catch(error=>{console.error(error);process.exitCode=1;});
