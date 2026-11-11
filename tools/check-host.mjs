import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {open} from 'node:fs/promises';

// Read the installed archive in place. This command never loads host code.
const base=resolve(process.argv[2]||process.env.DSH_INSTALL||'D:/DeepseekH');
const f=await open(join(base,'resources/app.asar'),'r');
async function bytes(pos,size){
  const data=Buffer.alloc(size);
  const {bytesRead}=await f.read(data,0,size,pos);
  if(bytesRead!==size)throw Error('DSH archive truncated');
  return data;
}
try{
  const header=await bytes(0,16);
  const tree=JSON.parse(await bytes(16,header.readUInt32LE(12)));
  const start=8+header.readUInt32LE(4);
  async function contents(path){
    let leaf=tree;
    for(const part of path.split('/'))leaf=leaf?.files?.[part];
    if(leaf?.offset===undefined)throw Error('Missing host module: '+path);
    return bytes(start+Number(leaf.offset),leaf.size);
  }
  const prefix='dsh/node_modules/@deepseek-ai/';
  const version=JSON.parse(await contents(prefix+'dsh-llm/package.json')).version;
  const baselinePath=process.argv[3]||process.env.DSH_BASELINE_PATH;
  let known;
  try {
    known=JSON.parse(await readFile(baselinePath||new URL('./.host-baseline.json',import.meta.url),'utf8'));
  } catch(error) {
    if(error.code!=='ENOENT')throw error;
    console.log('No local baseline. Copy tools/host-baseline.example.json to tools/.host-baseline.json and record reviewed local module hashes.');
    await f.close();process.exit(2);
  }
  if(!known.version||!Object.keys(known.modules||{}).length){
    console.log('Local baseline is empty. Record reviewed local module hashes before checking compatibility.');
    await f.close();process.exit(2);
  }
  console.log('DSH '+version);
  let changed=0;
  for(const [module,hash] of Object.entries(known.modules)){
    try {
      const current=createHash('sha256').update(await contents(prefix+module+'/lib/index.js')).digest('hex');
      if(current!==hash){console.log('REVIEW '+module);changed++;}
    }catch(error){console.log(error.message);changed++;}
  }
  const testedVersion=version===known.version;
  console.log(changed||!testedVersion?'Review affected interfaces and test on the new host before extending engines.dsh.':'Host modules match the recorded build. Run functional tests for runtime behavior.');
  process.exitCode=changed||!testedVersion?2:0;
}finally{await f.close();}
