import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import C from '../core.cjs';

test('unanchored comet orbit stays in the actual viewport for a full turn',()=>{
 const comet={body:'comet',p:[900,-700,40],size:7};
 const m=C.motionOf(comet);
 for(const ortho of [true,false])for(const zoom of [.2,5])for(const [width,height] of [[240,140],[860,320]]){
  const camera={yaw:.85,pitch:-.72,panX:950,panY:-320,zoom};
  const view={camera,width,height,ortho},frame={view};
  for(let i=0;i<=96;i++){
   const world=C.worldPoint(comet,frame,i*m.period/96);
   const p=C.project(world,camera,width,height,ortho);
   assert.ok(p.visible&&p.x>0&&p.x<width&&p.y>0&&p.y<height);
  }
 }
});

test('moving theme or ordinary idea is the geometric center of opposite comet positions',()=>{
 const theme={id:'theme',kind:'theme',p:[350,270,180]},idea={id:'text',display:'text',kind:'idea',p:[-260,30,50]};
 const visitor={id:'visitor',kind:'idea',body:'comet',arrivedAt:5,p:[22,80,170]};
 assert.equal(C.cometAnchor([visitor,idea,theme]),theme);
 assert.equal(C.cometAnchor([visitor,idea]),idea);
 assert.equal(C.cometAnchor([visitor]),undefined);
 const frame={center:idea.p,shift:[32,-18,14],centered:true};
 const start=C.worldPoint(visitor,frame,3),opposite=C.worldPoint(visitor,frame,3+C.motionOf(visitor).period/2);
 start.forEach((v,i)=>assert.ok(Math.abs((v+opposite[i])/2-frame.center[i]-frame.shift[i])<1e-8));
 const world=[-15,90,26],p=C.cometDrop(visitor,frame,world);
 C.worldPoint({...visitor,p},frame,0).forEach((v,i)=>assert.ok(Math.abs(v-world[i])<1e-8));
});

test('comet slows near a stationary pointer, stays clickable, resumes and turns its tail',()=>{
 const session=C.session(),root=session.nodes[0];
 const comet={id:'visitor',title:'访客',kind:'idea',body:'comet',size:7,p:[160,10,0]};
 root.p=[0,0,0];
 session.nodes.push(comet);
 const handlers=new Map(),painted=new Map(),effects=[],selected=[];
 let now=1000,request;
 const ctx=new Proxy({},{get:()=>()=>{}});
 const canvas={getContext:()=>ctx,getBoundingClientRect:()=>({width:900,height:640,left:0,top:0}),
  addEventListener:(name,fn)=>handlers.set(name,fn),focus(){},setPointerCapture(){}};
 const globals={C,R:{useRef:current=>({current}),useEffect:fn=>effects.push(fn)},
  h:(_,props)=>{props.ref.current=canvas;},performance:{now:()=>now},devicePixelRatio:1,
  ResizeObserver:class{observe(){}},requestAnimationFrame:fn=>{request=fn;},clearTimeout,
  circle(){},drawBody:(_,body)=>painted.set(body.node.id,body),drawLabels:()=>[],
  props:{session,selected:[],canvasRef:{},onSelect:id=>selected.push(id)}};
 runInNewContext(readFileSync(new URL('../src/map.js',import.meta.url),'utf8')+'\nStarMap(props)',globals);
 effects.forEach(fn=>fn());
 const advance=()=>{now+=40;request(now);return painted.get(comet.id);};
 const point=body=>({pointerType:'mouse',clientX:body.x,clientY:body.y,button:0,pointerId:1});
 let body=advance();
 handlers.get('pointermove')(point(body));
 for(let i=0;i<18;i++)body=advance();
 let previous=body;
 body=advance();
 assert.ok((body.orbitTime-previous.orbitTime)/.04<.15);
 const click=point(body);
 handlers.get('pointerdown')(click);
 handlers.get('pointerup')(click);
 assert.deepEqual(selected,[comet.id]);
 handlers.get('pointerleave')();
 for(let i=0;i<35;i++)body=advance();
 previous=body;body=advance();
 assert.ok((body.orbitTime-previous.orbitTime)/.04>.98);
 for(const reverse of [false,true]){
  comet.motion={reverse};body=advance();
  for(let i=0;i<220;i++){
   previous=body;body=advance();
   const dx=body.x-previous.x,dy=body.y-previous.y;
   // The tail image extends towards negative X before the canvas rotation.
   const alignment=(-Math.cos(body.tailAngle)*dx-Math.sin(body.tailAngle)*dy)/Math.hypot(dx,dy);
   assert.ok(alignment<-.999);
  }
 }
});
