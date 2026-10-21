const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
for(const [source,destination]of [['project.config.example.json','project.config.json'],['miniprogram/config/local.example.js','miniprogram/config/local.js']]){
  const target=path.join(root,destination);
  if(!fs.existsSync(target))fs.copyFileSync(path.join(root,source),target);
}
console.log('本机配置已准备好；已有配置保持不变。请填写自己的AppID和云环境ID。');
