const cp=require('child_process'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
let report='执行时间：'+new Date().toISOString()+'\n运行环境：'+process.version+' '+process.platform+'\n';
for(const script of ['tests/core.js','tests/pages.js','tests/static.js']){
  const result=cp.spawnSync(process.execPath,[script],{cwd:root,encoding:'utf8'});
  report+='\n'+script+'\n'+result.stdout+result.stderr+'退出码：'+result.status+'\n';
  if(result.status!==0)process.exitCode=1;
}
report+='\n未执行用户AppID下的微信开发者工具编译、云部署、真机及跨设备验收。内存事务模拟不替代真实云事务测试。\n';
fs.writeFileSync(path.join(root,'TEST-RESULTS.txt'),report);process.stdout.write(report);
