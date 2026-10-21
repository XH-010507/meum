const fs=require('fs'),path=require('path'),vm=require('vm');
function createMock(){
  const collections=new Map(),files=new Map();let current='admin',sequence=0,queue=Promise.resolve();
  const rows=name=>{if(!collections.has(name))collections.set(name,new Map());return collections.get(name);};
  const db={
    collection(name){
      function query(where={},skip=0,limit=100,sort){
        return {
          where:condition=>query(condition,skip,limit,sort),skip:n=>query(where,n,limit,sort),limit:n=>query(where,skip,n,sort),orderBy:(field,direction)=>query(where,skip,limit,[field,direction]),
          async get(){let result=[...rows(name)].map(([id,value])=>({_id:id,...value})).filter(row=>Object.entries(where).every(([key,value])=>value&&value.operator==='neq'?row[key]!==value.value:row[key]===value));
            if(sort)result.sort((a,b)=>(a[sort[0]]<b[sort[0]]?-1:1)*(sort[1]==='desc'?-1:1));return {data:result.slice(skip,skip+limit)};},
          doc(id){return {
            async get(){if(!rows(name).has(id))throw Error('document not found');return {data:{_id:id,...rows(name).get(id)}};},
            async set({data}){rows(name).set(id,structuredClone(data));return {};},
            async update({data}){if(!rows(name).has(id))return {stats:{updated:0}};rows(name).set(id,{...rows(name).get(id),...structuredClone(data)});return {stats:{updated:1}};},
            async remove(){return {stats:{removed:Number(rows(name).delete(id))}};}
          };},
          async add({data}){const id='doc'+(++sequence);rows(name).set(id,structuredClone(data));return {_id:id};}
        };
      }
      return query();
    },
    command:{neq:value=>({operator:'neq',value})},
    RegExp:value=>value,
    runTransaction(fn){const result=queue.then(()=>fn(db));queue=result.catch(()=>{});return result;}
  };
  const cloud={DYNAMIC_CURRENT_ENV:'test',init(){},database:()=>db,getWXContext:()=>({OPENID:current}),
    async uploadFile({cloudPath,fileContent}){const fileID='cloud://test/'+cloudPath;files.set(fileID,Buffer.from(fileContent));return {fileID};},
    async deleteFile({fileList}){fileList.forEach(id=>files.delete(id));return {};},
    async getTempFileURL({fileList}){return {fileList:fileList.map(fileID=>({fileID,tempFileURL:'https://example.invalid/temporary/'+encodeURIComponent(fileID)}))};}
  };
  const handlers={};
  function load(name){if(handlers[name])return handlers[name];const filename=path.resolve(__dirname,'../cloudfunctions',name,'index.js');const module={exports:{}};
    vm.runInNewContext(fs.readFileSync(filename,'utf8'),{require:id=>id==='wx-server-sdk'?cloud:id.startsWith('.')?require(path.resolve(path.dirname(filename),id)):require(id),module,exports:module.exports,console,Buffer,Date,Set,Map},{filename});
    handlers[name]=module.exports.main;return handlers[name];}
  rows('family_config').set('main',{admins:['admin','admin2'],members:['member','member2']});
  return {db,rows,files,cloud,setUser:user=>{current=user;},call:(name,event={})=>load(name)(event)};
}
module.exports={createMock};
