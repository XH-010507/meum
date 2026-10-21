const fs=require('fs'),path=require('path'),cp=require('child_process'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');let count=0;
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>['.git','node_modules','fixtures'].includes(e.name)?[]:e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
for(const file of walk(root)){
  if(file.endsWith('.js')){
    cp.execFileSync(process.execPath,['--check',file]);count++;
    for(const match of fs.readFileSync(file,'utf8').matchAll(/require\(['"](\.[^'"]+)['"]\)/g)){
      const target=path.resolve(path.dirname(file),match[1]);assert.ok(fs.existsSync(target)||fs.existsSync(target+'.js'),file+': missing '+match[1]);
    }
  }
  if(file.endsWith('.json')){
    const text=fs.readFileSync(file,'utf8').trim();
    if(file.includes('database_init')&&!path.basename(file).includes('rules')&&!path.basename(file).includes('example')) text.split(/\r?\n/).filter(Boolean).forEach(line=>JSON.parse(line));
    else JSON.parse(text);count++;
  }
}
const app=JSON.parse(fs.readFileSync(path.join(root,'miniprogram/app.json'),'utf8'));
for(const page of app.pages){
  for(const ext of ['.js','.json','.wxml','.wxss'])assert.ok(fs.existsSync(path.join(root,'miniprogram',page+ext)));
  const source=fs.readFileSync(path.join(root,'miniprogram',page+'.js'),'utf8');
  const wxml=fs.readFileSync(path.join(root,'miniprogram',page+'.wxml'),'utf8');
  for(const match of wxml.matchAll(/(?:bind|catch)\w+="([\w]+)"/g))assert.match(source,new RegExp('\\b'+match[1]+'\\s*\\('),'missing event handler '+page+' '+match[1]);
  const stack=[];
  for(const match of wxml.replace(/<!--[\s\S]*?-->/g,'').matchAll(/<(\/)?([\w-]+)\b(?:"[^"]*"|'[^']*'|[^'">])*?(\/?)>/g)){
    if(match[1])assert.equal(stack.pop(),match[2],page);else if(!match[3])stack.push(match[2]);
  }
  assert.equal(stack.length,0,page);
}
const guard=fs.readFileSync(path.join(root,'server/guard.js'),'utf8');
for(const dir of fs.readdirSync(path.join(root,'cloudfunctions'))){
  assert.equal(fs.readFileSync(path.join(root,'cloudfunctions',dir,'guard.js'),'utf8'),guard);
  const entry=fs.readFileSync(path.join(root,'cloudfunctions',dir,'index.js'),'utf8');
  if(dir!=='identity')assert.match(entry,/\.wrap\(/,'all business functions must be authorized');
}
assert.equal(JSON.parse(fs.readFileSync(path.join(root,'project.config.example.json'),'utf8')).appid,'');
console.log('静态检查通过：'+count+'个JS/JSON；11个页面、事件绑定、WXML标签、资源引用、独立部署鉴权副本。非微信编译器验收。');
