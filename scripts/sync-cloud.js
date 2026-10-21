const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname,'..');
const source = fs.readFileSync(path.join(root,'server/guard.js'));
for (const entry of fs.readdirSync(path.join(root,'cloudfunctions'),{withFileTypes:true})) {
  if (entry.isDirectory()) fs.writeFileSync(path.join(root,'cloudfunctions',entry.name,'guard.js'),source);
}
console.log('已同步各云函数的家庭权限与校验代码');
