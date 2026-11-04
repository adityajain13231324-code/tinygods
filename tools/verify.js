import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const checks=[
  ['regressions',['--test',...fs.readdirSync('tools').filter(n=>n.endsWith('.test.js')).map(n=>'tools/'+n)]],
  ['smoke',['tools/sim-smoke.js']],['parser',['tools/parse-test.js']],['orders',['tools/orders-test.js']],
  ['verbs',['tools/verbs-test.js']],['powers',['tools/powers-test.js']],['effects',['tools/effects-test.js']],
  ['network',['tools/net-test.js','6']],['fuzz',['tools/fuzz-test.js','12']],['build',['node_modules/vite/bin/vite.js','build']],
];
const report=process.argv[2];if(report)fs.mkdirSync(report,{recursive:true});
let failed=0;
for(const [name,args] of checks){const r=spawnSync(process.execPath,args,{encoding:'utf8',maxBuffer:20*1024*1024});if(report)fs.writeFileSync(path.join(report,name+'.txt'),(r.stdout??'')+(r.stderr??''));console.log(`${r.status===0?'PASS':'FAIL'} ${name}`);if(r.status!==0){failed++;console.error(r.stdout,r.stderr,r.error??'');}}
process.exitCode=failed?1:0;
