import { spawn } from 'node:child_process';
console.log('Static frontend: run `npm run build` then serve dist/.');
console.log('API: run `npm run worker:dev` in another terminal.');
const p=spawn(process.platform==='win32'?'npx':'npx',['serve','dist','-l','5173'],{stdio:'inherit',shell:process.platform==='win32'});
p.on('exit',code=>process.exit(code||0));
