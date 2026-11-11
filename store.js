import { mkdir, readFile, writeFile, rename, unlink, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';

import core from './core.cjs';
export const validateState=core.valid;
// A Windows named pipe is released when its owner exits, even after a crash.
async function withWriter(directory, write) {
  await mkdir(directory,{recursive:true});
  const canonical=await realpath(directory);
  const windows=process.platform==='win32';
  const hash=createHash('sha256').update(windows?canonical.toLowerCase():canonical).digest('hex').slice(0,40);
  const name='dsh-star-sea-'+hash;
  const address=windows?'\\\\.\\pipe\\'+name:process.platform==='linux'?'\0'+name:join(tmpdir(),name+'.sock');
  const lock=createServer(socket=>socket.destroy());
  try {
    await new Promise((resolve,reject)=>{lock.once('error',reject);lock.listen(address,resolve);});
  } catch(error) {
    if(error.code==='EADDRINUSE')throw Error('另一个工作区正在保存星图，请稍后重试');
    throw error;
  }
  try{return await write();}finally{await new Promise(resolve=>lock.close(resolve));}
}
export function createStore(directory) {
  const file=join(directory,'galaxies.json');let queue=Promise.resolve();
  async function read(){try{const doc=JSON.parse(await readFile(file,'utf8'));doc.state=validateState(core.migrate(doc.state));if(!Number.isSafeInteger(doc.revision)||doc.revision<0)throw Error('revision');return doc;}catch(e){if(e.code==='ENOENT')return{revision:0,state:{schema:2,sessions:[],current:null}};throw Error('存档读取失败，未覆盖原文件');}}
  return {
    load(){return queue.then(read);},
    save(state,expectedRevision){
      const snapshot=structuredClone(validateState(state));
      const serialized=JSON.stringify(snapshot);if(Buffer.byteLength(serialized)>64_000_000)throw Error('存档超过 64MB 限制');
      const run=queue.then(()=>withWriter(directory,async()=>{
        const previous=await read();if(previous.revision!==expectedRevision)throw Error('存档已在其他窗口更新，请重新载入');
        await mkdir(directory,{recursive:true});
        const result={revision:previous.revision+1,state:snapshot},tmp=join(directory,randomUUID()+'.tmp');
        try {await writeFile(tmp,JSON.stringify(result),'utf8');await rename(tmp,file);}finally{await unlink(tmp).catch(()=>{});}
        return {revision:result.revision};
      }));queue=run.catch(()=>{});return run;
    }
  };
}
