import {test} from 'node:test';
import assert from 'node:assert/strict';
import {discover,extractPersona,parseIdeas} from '../index.js';
import {review} from '../ai.js';
test('review sends only the requested persona prompt to the configured model',async()=>{
 const prompts={first:'test-only prompt A',second:'test-only prompt B'};
 const calls=[];
 const services={
  agentPresets:{list:async()=>Object.keys(prompts).map(id=>({id})),
   readDocument:async id=>({content:JSON.stringify([{name:'@deepseek-ai/dsh-persona',config:{prefix:prompts[id]}}])})},
  agentDefaultModel:{currentSelection:()=>({provider:'fixture',model:'fixture'})},
  llm:{async *stream(input){
   calls.push(input);
   yield {type:'text-delta',text:JSON.stringify({questions:['Q1','Q2'],intentions:['I'],appreciation:'A'})};
   yield {type:'finish'};
  }}
 };
 const ctx={get:name=>services[name]},list=await discover(ctx);
 assert.deepEqual(list.map(p=>Object.keys(p).sort()),Array(2).fill(['id','name','revision']));
 assert.equal(calls.length,0);
 await review(ctx,{personaId:'second',text:'fixture idea',themes:['fixture theme']});
 assert.equal(calls.length,1);
 assert.ok(calls[0].system.includes(prompts.second));
 assert.ok(!JSON.stringify(calls[0]).includes(prompts.first));
});
test('exclude built-in modes, failed presets, and do not invent personas',async()=>{
 const entries=['standard','custom'].map(id=>({options:{name:'@deepseek-ai/dsh-agent-preset',config:{id,plugins:[{name:'@deepseek-ai/dsh-persona',config:{prefix:'角色身份'}}]}}}));
 const ctx={get:n=>n==='agentPresets'?{list:async()=>[{id:'standard'},{id:'ptc'},{id:'minimal'},{id:'cordis'},{id:'custom'},{id:'failed',broken:'failure'},{id:'unknown'}]}:{entries:()=>entries}};
 const list=await discover(ctx);assert.deepEqual(list.map(x=>x.id),['custom']);assert.ok(!JSON.stringify(list).includes('角色身份'));
});
test('disabled persona does not count',()=>assert.equal(extractPersona([{name:'@deepseek-ai/dsh-persona',disabled:true,config:{prefix:'test'}}]),''));
test('refuse fewer than five or repeated titles',()=>{assert.throws(()=>parseIdeas(JSON.stringify(Array(6).fill({title:'same',text:'text'}))));assert.equal(parseIdeas(JSON.stringify(Array.from({length:6},(_,i)=>({title:'想法'+i,text:'内容'})))).length,6);});

test('an unreadable persona document does not hide healthy presets',async()=>{
 const ctx={get:name=>name==='agentPresets'?{
  list:async()=>[{id:'bad'},{id:'reader'}],
  readDocument:async id=>{if(id==='bad')throw Error('unavailable');return {content:'- name: "@deepseek-ai/dsh-persona"\n  config:\n    prefix: 独立读者'};}
 }:undefined};
 assert.deepEqual((await discover(ctx)).map(p=>p.id),['reader']);
});
