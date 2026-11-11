import test from 'node:test';
import assert from 'node:assert/strict';
import C from '../core.cjs';
import {drift} from '../ai.js';

test('body defaults and per-body overrides on pre-motion saves',()=>{
 for(const [body,orbit] of Object.entries({blackhole:'none',neutron:'none',star:'none',planet:'circle',asteroid:'circle',comet:'ellipse'})){
  const m=C.motionOf({body});assert.equal(m.spin,true);assert.equal(m.orbit,orbit);
 }
 assert.equal(C.motionOf({direction:'联想'}).orbit,'circle');
 assert.equal(C.motionOf({body:'comet',motion:{orbit:'none',spin:false}}).spin,false);
});
test('comet follows a closed flattened ellipse and dragging inverts its moving frame',()=>{
 const theme={id:'root',body:'star',p:[0,0,0],motion:{orbit:'circle'}};
 const node={id:'comet',body:'comet',p:[200,0,0],motion:{tilt:0}};
 const m=C.motionOf(node);
 for(const [phase,expected] of [[0,[300,0,0]],[.25,[0,54,0]],[.5,[-300,0,0]],[1,[300,0,0]]]){
  const t=m.period*phase,frame=C.orbitalFrame(node,theme,t);
  const world=C.worldPoint(node,frame,t);
  for(let i=0;i<3;i++)assert.ok(Math.abs(world[i]-frame.shift[i]-expected[i])<1e-8);
  const drag=[world[0]+12,world[1]-7,world[2]+2];
  const anchor=C.anchorAfterDrag(node,frame,t,drag,world);
  const moved=C.worldPoint({...node,p:anchor},frame,t);
  moved.forEach((v,i)=>assert.ok(Math.abs(v-drag[i])<1e-8));
 }
});
test('lifetime changes apply to visitors, including their links and reviews, and leave permanent comets intact',()=>{
 const s=C.session();s.drift={enabled:false,interval:180,lifetime:5};
 const visitor={id:'visitor',arrivedAt:1000,body:'comet'},kept={id:'kept',body:'comet'};
 s.nodes.push(visitor,kept);s.edges=[{from:visitor.id,to:kept.id}];s.reviews=[{nodeId:visitor.id},{nodeId:kept.id}];
 assert.equal(C.expireComets(s,5999),s);
 const after=C.expireComets(s,6000);assert.ok(after.nodes.includes(kept));assert.ok(!after.nodes.includes(visitor));
 assert.equal(after.edges.length,0);assert.deepEqual(after.reviews,[{nodeId:'kept'}]);
 s.drift.lifetime=20;assert.equal(C.expireComets(s,6000),s);
});
test('reject invalid periods, arrival timestamps, and dwell settings',()=>{
 const s=C.session(),check=()=>C.valid({schema:2,current:s.id,sessions:[s]});
 s.nodes[0].motion={period:0};assert.throws(check);delete s.nodes[0].motion;
 s.nodes[0].arrivedAt=-1;assert.throws(check);delete s.nodes[0].arrivedAt;
 s.drift={...C.driftDefaults(),interval:1};assert.throws(check);
});
test('distant association sends only themes and random domain, rejects malformed model output',async()=>{
 let payload,answer='[{"title":"潮汐邮筒","text":"让潮水替人投递一封信。","reason":"潮差决定取件窗口。"}]';
 const services={agentDefaultModel:{currentSelection:()=>({provider:'fake',model:'fake'})},llm:{async *stream(opts){
  payload=JSON.parse(opts.messages[0].content[0].text);yield {type:'text-delta',text:answer};yield {type:'finish'};
 }}};
 const ctx={get:k=>services[k]},input={themes:['通信'],text:'private draft',query:'private search'};
 assert.equal((await drift(ctx,input)).title,'潮汐邮筒');assert.deepEqual(Object.keys(payload).sort(),['domain','themes']);
 answer='bad';await assert.rejects(()=>drift(ctx,input),/有效/);await assert.rejects(()=>drift(ctx,{themes:[]}),/主题/);
});

test('undo edits leaves independently arrived comets and later feedback stars on the map',()=>{
 const initial={id:'star',title:'旧标题'},edited={...initial,title:'新标题'};
 const arrival={id:'comet',arrivedAt:1000},feedback={id:'response'};
 const undo=C.historyRows([initial],[edited]);
 assert.deepEqual(C.restoreRows([edited,arrival,feedback],undo),[initial,arrival,feedback]);
 const deleted=C.historyRows([initial],[]);
 assert.deepEqual(C.restoreRows([arrival],deleted),[arrival,initial]);
});

test('association fading, review timer and explicit confirmation survive a save',()=>{
 const n={generated:true,viewedAt:10000},a={fadeDelay:5,fadeOpacity:.45};
 assert.equal(C.ideaOpacity(n,a,14000,0),1);
 assert.ok(Math.abs(C.ideaOpacity(n,a,17000,0)-.45)<1e-8);
 for(const p of [{favorite:true},{confirmed:true},{viewedAt:16900}])assert.equal(C.ideaOpacity({...n,...p},a,17000,0),1);
 assert.equal(C.ideaOpacity({},a,17000,0),1);
 assert.equal(C.ideaOpacity({generated:true,createdAt:1000},{},91000,0),1);
 assert.equal(C.ideaOpacity({generated:true,createdAt:1000},{},93000,0),.6);
 const s=C.session();Object.assign(s.nodes[0],n,{body:'star',finish:'giant',fx:false,fxSpeed:.6});
 const saved=C.valid(C.clone({schema:2,current:s.id,sessions:[s]}));
 assert.equal(C.finishOf(saved.sessions[0].nodes[0]),'giant');
});

test('fixed orbit centers keep their XYZ midpoint and radius through reload',()=>{
 const state={schema:2,sessions:[C.session()],current:null},s=state.sessions[0],n=s.nodes[0];
 state.current=s.id;n.body='planet';n.p=[30,75,130];
 const center=[-12,5,80],radius=Math.hypot(...n.p.map((v,i)=>v-center[i]));
 n.motion={center,orbit:'circle',period:20,tilt:35};
 assert.deepEqual(C.valid(C.clone(state)).sessions[0].nodes[0].motion.center,center);
 const frame=C.orbitalFrame(n,null,0);
 for(const t of [0,2,5,16]){
  const a=C.worldPoint(n,frame,t),b=C.worldPoint(n,frame,t+10);
  a.forEach((v,i)=>assert.ok(Math.abs((v+b[i])/2-center[i])<1e-8));
  assert.ok(Math.abs(Math.hypot(...a.map((v,i)=>v-center[i]))-radius)<1e-8);
 }
 n.motion.center=[1,2];assert.throws(()=>C.valid(state),/公转中心/);
});

test('sentence association labels are smaller, readable, and respect manual sizes',()=>{
 const a={fontSize:24},keyword={id:'example',body:'planet',generated:true,title:'声音地图'};
 const base=C.ideaFontSize(keyword,a);
 assert.equal(C.ideaFontSize({...keyword,associationFormat:'sentences'},a),Math.max(12,Math.round(base*.85)));
 assert.ok(C.ideaFontSize({...keyword,title:'把夜晚的城市声音收集成可借阅的书籍'},a)<base);
 assert.equal(C.ideaFontSize({...keyword,fontSize:27,associationFormat:'sentences'},a),27);
 assert.ok(C.ideaFontSize({...keyword,associationFormat:'sentences'},{fontSize:14})>=12);
 assert.equal(C.ideaFontSize({...keyword,display:'text',associationFormat:'sentences'},a),20);
});
