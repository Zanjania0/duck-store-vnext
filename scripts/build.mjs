import { mkdir, rm, cp } from 'node:fs/promises';
import { resolve } from 'node:path';
const root=resolve('.'); const dist=resolve('dist');
await rm(dist,{recursive:true,force:true}); await mkdir(dist,{recursive:true});
await cp('app',dist,{recursive:true});
await mkdir(resolve(dist,'admin'),{recursive:true}); await cp('admin',resolve(dist,'admin'),{recursive:true});
await cp('public',dist,{recursive:true});
console.log('Duck Store built to dist/');
