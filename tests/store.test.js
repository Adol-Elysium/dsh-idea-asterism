import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore,validateState} from '../store.js';
import core from '../core.cjs';
const data=()=>core.migrate({schema:1,current:'one',sessions:[{id:'one',name:'星系',themes:['自然'],layout:{left:220,right:320,bottom:200},camera:{yaw:1,pitch:.5,zoom:1.3},nodes:[{id:0,title:'原始想法',text:'内容',p:[0,0,0],parent:null},{id:1,title:'联想',text:'说明',p:[20,30,-40],parent:0}]}]});
test('round trip preserves positions, layout and camera independently',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'star-sea-test-'));try{const store=createStore(dir);assert.equal((await store.load()).revision,0);const original=data();await store.save(original,0);assert.deepEqual((await createStore(dir).load()).state,original);}finally{await rm(dir,{recursive:true,force:true});}
});
test('simultaneous stale saves do not overwrite newer state',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'star-sea-test-'));try{const store=createStore(dir);const results=await Promise.allSettled([store.save(data(),0),store.save(data(),0)]);assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');assert.equal((await store.load()).revision,1);}finally{await rm(dir,{recursive:true,force:true});}
});
test('invalid theme counts, positions and dangling edges are rejected',()=>{
 let v=data();v.sessions[0].themes=[];assert.throws(()=>validateState(v));v=data();v.sessions[0].nodes[1].p[2]=Infinity;assert.throws(()=>validateState(v));v=data();v.sessions[0].edges[0].from="missing";assert.throws(()=>validateState(v));
});

test('separate hosts sharing a directory cannot both commit the same revision',async()=>{
 const {fork}=await import('node:child_process');
 const {once}=await import('node:events');
 const {writeFile}=await import('node:fs/promises');
 const dir=await mkdtemp(join(tmpdir(),'star-sea-parallel-'));
 const children=[];
 try{
  const worker=join(dir,'writer.mjs');
  await writeFile(worker,`import {createStore} from ${JSON.stringify(new URL('../store.js',import.meta.url).href)};const store=createStore(process.argv[2]);process.on('message',async({state,revision})=>{try{await store.save(state,revision);process.send(true)}catch{process.send(false)}});process.send('ready');`);
  for(let i=0;i<2;i++){const child=fork(worker,[dir],{stdio:['ignore','ignore','ignore','ipc']});children.push(child);await once(child,'message');}
  for(let revision=0;revision<20;revision++){
   const states=children.map((_,i)=>{const state=data();state.sessions[0].name='writer-'+i;return state;});
   const outcomes=await Promise.all(children.map(async(child,i)=>{const done=once(child,'message');child.send({state:states[i],revision});return (await done)[0];}));
   assert.equal(outcomes.filter(Boolean).length,1);
   const doc=await createStore(dir).load();assert.equal(doc.revision,revision+1);assert.deepEqual(doc.state,states[outcomes.indexOf(true)]);
  }
 }finally{await Promise.all(children.map(async child=>{const stopped=once(child,'exit');child.kill();await stopped;}));await rm(dir,{recursive:true,force:true});}
});

test('invalid imported settings cannot enable model calls or break the roster',()=>{
 for(const patch of [{online:'false'},{autoReview:'false'},{disabledPersonas:{}},{query:{}}]){
  const state=data();Object.assign(state.sessions[0],patch);assert.throws(()=>validateState(state));
 }
});
