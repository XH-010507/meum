const assert=require('assert/strict');
const {createMock}=require('./cloud-mock');
const image=require('../miniprogram/utils/image');
const serverImage=require('../cloudfunctions/uploadImage/image-upload');
const {png}=require('./image-fixtures');
const MAX=5*1024*1024;
let count=0;async function test(name,fn){await fn();count++;console.log('PASS '+name);}
global.wx={arrayBufferToBase64:buffer=>Buffer.from(buffer).toString('base64')};
const toArray=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
async function send(mock,buffer){return image.uploadImage(toArray(buffer),async(action,data)=>{assert.ok(Buffer.byteLength(JSON.stringify(data))<300000);const result=await mock.call('uploadImage',{action,...data});if(result.code!==0)throw Error(result.message);return result.data;});}
(async()=>{
  await test('单图严格小于5MB，边界及无效大小拒绝',()=>{
    assert.equal(image.MAX_IMAGE_BYTES,MAX);assert.equal(serverImage.MAX_IMAGE_BYTES,MAX);image.checkSize(MAX-1);
    for(const size of [MAX,MAX+1,0,-1,NaN,undefined,'100'])assert.throws(()=>image.checkSize(size));
    for(const size of [MAX,MAX+1])assert.throws(()=>serverImage.image(png(size).toString('base64')));
  });
  await test('接近5MB完整图片分段上传，合并后逐字节一致',async()=>{
    const mock=createMock(),buffer=png(MAX-1);const result=await send(mock,buffer);
    assert.deepEqual(mock.files.get(result.fileId),buffer);
    assert.equal(mock.rows('images').size,1);assert.equal([...mock.rows('images').values()][0].fileId,result.fileId);
  });
  await test('超限/虚报分段/非法格式不会写入云存储',async()=>{
    const mock=createMock();
    for(const size of [MAX,MAX+1])assert.notEqual((await mock.call('uploadImage',{action:'beginImageUpload',size})).code,0);
    const {data}=await mock.call('uploadImage',{action:'beginImageUpload',size:24});
    for(const index of [-1,1,0.5,'0'])assert.notEqual((await mock.call('uploadImage',{action:'uploadImageChunk',uploadId:data.uploadId,index,base64:Buffer.alloc(24).toString('base64')})).code,0);
    assert.notEqual((await mock.call('uploadImage',{action:'uploadImageChunk',uploadId:data.uploadId,index:0,base64:Buffer.alloc(25).toString('base64')})).code,0);
    assert.notEqual((await mock.call('uploadImage',{action:'finishImageUpload',uploadId:data.uploadId})).code,0);
    await mock.call('uploadImage',{action:'uploadImageChunk',uploadId:data.uploadId,index:0,base64:Buffer.alloc(24).toString('base64')});
    assert.notEqual((await mock.call('uploadImage',{action:'finishImageUpload',uploadId:data.uploadId})).code,0);
    assert.equal(mock.files.size,0);
  });
  await test('图片会话绑定管理员身份且有过期校验',async()=>{
    const mock=createMock();const {data}=await mock.call('uploadImage',{action:'beginImageUpload',size:100});
    mock.setUser('admin2');assert.notEqual((await mock.call('uploadImage',{action:'abortImageUpload',uploadId:data.uploadId})).code,0);
    mock.setUser('admin');mock.rows('images').get(data.uploadId).expiresAt=0;
    assert.notEqual((await mock.call('uploadImage',{action:'finishImageUpload',uploadId:data.uploadId})).code,0);
    assert.equal((await mock.call('uploadImage',{action:'abortImageUpload',uploadId:data.uploadId})).code,0);
  });
  await test('所有业务拒绝陌生人；身份接口仅返回本人',async()=>{
    const mock=createMock();mock.setUser('stranger');
    for(const action of ['getDishes','getDishDetail','getCategories','getCuisines','getOrders','getIngredients','addDish','updateDish','deleteDish','deleteOrder','createOrder','updateDishImages','uploadImage','checkAdmin'])assert.notEqual((await mock.call(action,{})).code,0,action);
    assert.equal((await mock.call('identity')).data.openid,'stranger');
  });
  await test('普通家人不能绕过前端访问管理员动作',async()=>{
    const mock=createMock();mock.setUser('member');
    for(const action of ['getIngredients','addDish','updateDish','deleteDish','deleteOrder','updateDishImages','uploadImage','checkAdmin'])assert.notEqual((await mock.call(action,{admin:true,owner:'admin'})).code,0,action);
  });
  await test('空家庭配置不会把首位访问者设为管理员',async()=>{
    const mock=createMock();mock.rows('family_config').clear();assert.notEqual((await mock.call('checkAdmin')).code,0);
  });
  await test('图片登记后添加/编辑/显示/移除菜品图片，拒绝任意外部ID',async()=>{
    const mock=createMock();const uploaded=await send(mock,png(600*1024));
    const dish={name:'青菜',cuisine_code:'CN',category_code:'CN_VEG',description:'少盐',ingredients:['青菜','盐'],image:uploaded.fileId,isAvailable:true};
    const added=await mock.call('addDish',dish);assert.equal(added.code,0);const id=added.data._id;
    const detail=await mock.call('getDishDetail',{dishId:id});assert.equal(detail.data.image,uploaded.fileId);assert.match(detail.data.imageUrl,/^https:/);
    assert.notEqual((await mock.call('updateDish',{dishId:id,image:'cloud://someone-else/picture'})).code,0);
    assert.equal((await mock.call('updateDish',{dishId:id,image:'/images/default-dish.png'})).code,0);
    assert.equal((await mock.call('getDishDetail',{dishId:id})).data.imageUrl,'/images/default-dish.png');
    assert.equal(mock.files.size,1,'移除引用不会误删云文件');
  });
  await test('分页读取超过100道菜；家人看不到下架菜',async()=>{
    const mock=createMock();for(let i=0;i<254;i++)mock.rows('dish').set('d'+i,{name:'菜'+i,isAvailable:i!==0,image:'default'});
    assert.equal((await mock.call('getDishes')).data.length,254);mock.setUser('member');
    assert.equal((await mock.call('getDishes',{isAvailable:false})).data.length,253);
    assert.notEqual((await mock.call('getDishDetail',{dishId:'d0'})).code,0);
  });
  await test('点菜保存真实菜名/身份，重复提交一次，家人订单隔离',async()=>{
    const mock=createMock();mock.rows('dish').set('d1',{name:'番茄炒蛋',isAvailable:true,ingredients:['番茄','鸡蛋']});mock.setUser('member');
    const data={requestId:'request-one',guestName:'家人',visitDate:new Date(Date.now()+8*3600000).toISOString().slice(0,10),visitTime:'18:00',specialRequests:'少盐',dishes:[{dishId:'d1',dishName:'伪造',quantity:2}],owner:'admin'};
    assert.equal((await mock.call('createOrder',data)).code,0);assert.equal((await mock.call('createOrder',data)).code,0);assert.equal(mock.rows('order').size,1);
    let record=[...mock.rows('order').values()][0];assert.equal(record.owner,'member');assert.equal(record.dishes[0].dishName,'番茄炒蛋');
    mock.setUser('member2');assert.equal((await mock.call('getOrders',{_owner:'member',_actor:{admin:true}})).data.length,0);
    mock.setUser('admin');assert.equal((await mock.call('getOrders')).data.length,1);
    const ingredients=await mock.call('getIngredients',{date:data.visitDate});assert.equal(ingredients.code,0);assert.deepEqual(Array.from(ingredients.data.ingredients,x=>x.name),['番茄','鸡蛋']);assert.match(ingredients.data.ingredients[0].totalAmount,/2份菜/);
    mock.setUser('member');for(const quantity of [0,21,-1,1.5,'1'])assert.notEqual((await mock.call('createOrder',{...data,requestId:'bad'+quantity,dishes:[{dishId:'d1',quantity}]})).code,0);
  });
  await test('客户端加载实际文件检查大小，无法确认大小或读取失败不放行',async()=>{
    const buffer=png(600*1024);let size=buffer.length,bytes=buffer;
    global.wx.getFileSystemManager=()=>({getFileInfo:o=>o.success({size}),readFile:o=>o.success({data:toArray(bytes)})});
    assert.equal((await image.readImage({tempFilePath:'file'})).byteLength,buffer.length);
    size=MAX;await assert.rejects(()=>image.readImage({tempFilePath:'file',size:100}));
    size=buffer.length;bytes=png(MAX);await assert.rejects(()=>image.readImage({tempFilePath:'file',size:100}));
    size=undefined;await assert.rejects(()=>image.readImage({tempFilePath:'file'}));
  });
  console.log('云端/图片业务验证通过：'+count+'组（模拟SDK和内存仓储，非真实云验收）');
})().catch(error=>{console.error(error);process.exitCode=1;});
