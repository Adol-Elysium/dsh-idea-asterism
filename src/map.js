function StarMap({session,selected,onSelect,onEdge,onMove,onCamera,onRename,onCenter,canvasRef}){
 const localRef=R.useRef(null),latest=R.useRef(),cam=R.useRef(session.camera),positions=R.useRef(null);latest.current={session,selected,onSelect,onEdge,onMove,onCamera,onRename,onCenter};
 R.useEffect(()=>{cam.current={...session.camera};},[session.camera]);
 R.useEffect(()=>{
  const opened=Date.now();const el=localRef.current;canvasRef.current=el;const ctx=el.getContext('2d');let w=1,height=1,frame,lastFrame=0,gesture=null,projected=[],labels=[],edgeHits=[],wheelTimer,spinCommit=0,seconds=0;
  let editor=null,pendingLabel=null,labelTimer,pointer=null;
  let backgroundKey=null,backgroundPoints=[];
  const comets=new Map(),phaseStart=new Map(),centers=new Map();
  let handle=null;
  el.orbitCenter=id=>centers.get(id)?.slice();
  function clearLabelTimer(){clearTimeout(labelTimer);pendingLabel=null;}
  el.consumeLabelClick=()=>{const id=pendingLabel;clearLabelTimer();return id;};
  function finishEdit(save){
   if(!editor)return;
   const {input,id,original}=editor;editor=null;
   const value=input.value.trim();input.remove();
   if(save&&value&&value!==original)latest.current.onRename(id,value);
  }
  function placeEditor(box){
   if(!editor)return;
   const width=Math.min(w,Math.max(150,Math.min(320,box.w+36)));
   const left=el.offsetLeft+Math.max(0,Math.min(w-width,box.x));
   const top=el.offsetTop+Math.max(0,Math.min(height-32,box.y+box.h/2-16));
   editor.input.style.cssText='width:'+width+'px;left:'+left+'px;top:'+top+'px';
  }
  function editLabel(box){
   finishEdit(true);
   const input=document.createElement('input');
   input.className='ss-inline-title';input.type='text';input.maxLength=100;
   input.setAttribute('aria-label','就地编辑想法标题');input.value=box.node.title;
   editor={input,id:box.node.id,original:input.value};
   el.parentElement.append(input);placeEditor(box);
   input.addEventListener('keydown',e=>{
    e.stopPropagation();if(e.isComposing||e.keyCode===229)return;
    if(e.key==='Escape'||e.key==='Enter'){e.preventDefault();finishEdit(e.key==='Enter');el.focus({preventScroll:true});}
   });
   input.addEventListener('blur',()=>finishEdit(true),{once:true});
   input.focus({preventScroll:true});input.select();
  }
  const resize=()=>{const r=el.getBoundingClientRect();w=Math.max(1,r.width);height=Math.max(1,r.height);const d=Math.min(devicePixelRatio,2);const pixelWidth=Math.max(1,Math.round(w*d)),pixelHeight=Math.max(1,Math.round(height*d));if(el.width===pixelWidth&&el.height===pixelHeight)return;el.width=pixelWidth;el.height=pixelHeight;ctx.setTransform(d,0,0,d,0,0);paint(performance.now());};const observer=new ResizeObserver(resize);observer.observe(el);resize();
  el.focusOffset=id=>{const p=projected.find(q=>q.node.id===id);return p&&{x:p.x-w/2,y:p.y-height/2};};
  function point(e){const r=el.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
  function draw(now){frame=requestAnimationFrame(draw);if(now-lastFrame>=30)paint(now);}
  function paint(now){
   const elapsed=lastFrame&&!gesture?.hit&&!pendingLabel&&!editor?Math.max(0,Math.min(.12,(now-lastFrame)/1000)):0;
   seconds+=elapsed;lastFrame=now;const{session:s,selected}=latest.current,a={...C.appearance(),...s.appearance};
   if(a.autoRotate&&!gesture&&!pendingLabel&&!editor){cam.current.yaw+=a.rotationSpeed||.002;if(now-spinCommit>2000){spinCommit=now;latest.current.onCamera({...cam.current});}}
   ctx.fillStyle=a.background;ctx.fillRect(0,0,w,height);
   const glow=i=>a.starLight==='bright'?2.8:a.starLight==='pulse'?1.75+1.05*Math.sin(now*.0013+i*.73):1;
   const key=a.starDistribution+':'+a.stars;
   if(backgroundKey!==key){backgroundPoints=C.backgroundStars(a.stars,a.starDistribution);backgroundKey=key;}
   for(let i=0;i<backgroundPoints.length;i++){
    const q=C.project(backgroundPoints[i],cam.current,w,height,a.orthographic);
    if(!q.visible||q.x<0||q.x>w||q.y<0||q.y>height)continue;
    ctx.globalAlpha=(.08+.12*a.brightness)*Math.min(1,q.scale)*glow(i);
    ctx.fillStyle=i%7===0?'#cfb58e':'#9eb9cf';
    circle(ctx,q.x,q.y,Math.min(2.2,Math.max(.45,.85*q.scale)));
   }ctx.globalAlpha=1;
   const nodes=gesture?.pivot&&gesture.moved?s.nodes.map(n=>{
    if(n.id!==gesture.pivot||!n.motion?.center)return n;
    return {...n,p:n.p.map((v,i)=>v+gesture.point[i]-n.motion.center[i]),motion:{...n.motion,center:gesture.point}};
   }):s.nodes;
   const assets=new Map(s.assets.map(a=>[a.id,a]));const wallTime=Date.now();const theme=nodes.find(n=>n.kind==='theme');
   const liveComets=new Set();
   for(const node of s.nodes){
    if(C.bodyOf(node)!=='comet')continue;
    liveComets.add(node.id);
    let state=comets.get(node.id);
    if(!state){state={time:seconds-elapsed,rate:1,world:null,angle:null};comets.set(node.id,state);}
    let target=1;
    if(pointer&&state.world){
     const last=C.project(state.world,cam.current,w,height,a.orthographic);
     if(last.visible){
      const distance=Math.hypot(pointer.x-last.x,pointer.y-last.y);
      const gap=Math.max(0,distance-Math.max(12,(node.size||3)*last.scale));
      const t=Math.min(1,gap/90);
      target=.08+.92*t*t*(3-2*t);
     }
    }
    state.rate+=(target-state.rate)*(1-Math.exp(-elapsed/(target < state.rate ? .10 : .28)));
    state.time+=elapsed*state.rate;
   }
   for(const id of comets.keys())if(!liveComets.has(id))comets.delete(id);
   const timeFor=n=>comets.get(n?.id)?.time??(seconds-(phaseStart.get(n?.id)||0));
   const themeTime=timeFor(theme);
   const anchor=C.cometAnchor(nodes);
   const viewportFrame={view:{camera:cam.current,width:w,height,ortho:a.orthographic}};
   const worldCache=new Map(),resolving=new Set();
   function worldFor(node){
    if(worldCache.has(node.id))return worldCache.get(node.id);
    if(resolving.has(node.id))return node.p;
    resolving.add(node.id);
    const world=positions.current?.id===node.id?positions.current.p:C.worldPoint(node,frameFor(node),timeFor(node));
    resolving.delete(node.id);worldCache.set(node.id,world);return world;
   }
   function frameFor(node){
    const parent=!node.motion?.center&&nodes.find(n=>n.id===node.motion?.centerNodeId);
    if(parent)return {center:parent.p,shift:worldFor(parent).map((v,i)=>v-parent.p[i]),centered:true};
    if(node.motion?.center||C.bodyOf(node)!=='comet')return C.orbitalFrame(node,theme,themeTime);
    if(!anchor||anchor.id===node.id)return viewportFrame;
    return {center:anchor.p,shift:anchorWorld.map((v,i)=>v-anchor.p[i]),centered:true};
   }
   const anchorWorld=anchor&&worldFor(anchor);
   centers.clear();handle=null;
   projected=nodes.map(node=>{
    const comet=comets.get(node.id),orbitTime=timeFor(node);
    const motion=C.motionOf(node),frame=frameFor(node);
    const center=frame.view?C.moveScreen([0,0,0],-cam.current.panX||0,-cam.current.panY||0,cam.current,C.project([0,0,0],cam.current,w,height,a.orthographic).scale):frame.center.map((v,i)=>v+frame.shift[i]);
    centers.set(node.id,center);
    if(motion.center&&motion.orbit!=='none'&&selected.length===1&&selected[0]===node.id){
     const point=gesture?.pivot===node.id?gesture.point:center;
     const screen=C.project(point,cam.current,w,height,a.orthographic);
     if(screen.visible)handle={...screen,id:node.id,point};
    }
    const world=worldFor(node);
    if((motion.trail||gesture?.pivot===node.id)&&motion.orbit!=='none'){
     ctx.beginPath();let visible=false;
     for(let i=0;i<=64;i++){
      const at=C.worldPoint(node,frame,i*motion.period/64,motion);
      const q=C.project(at,cam.current,w,height,a.orthographic);
      if(q.visible){if(visible)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y);}visible=q.visible;
     }
     ctx.strokeStyle='#30404e';ctx.lineWidth=.65;ctx.stroke();
    }
    const spinAngle=motion.spin?seconds*2*Math.PI/motion.spinPeriod*(motion.spinReverse?-1:1):0;
    const screen=C.project(world,cam.current,w,height,a.orthographic);
    if(comet){
     // Project both positions with the current camera so camera motion adds no velocity.
     if(comet.world){
      const last=C.project(comet.world,cam.current,w,height,a.orthographic);
      const dx=screen.x-last.x,dy=screen.y-last.y;
      if(last.visible&&screen.visible&&Math.hypot(dx,dy)>.00001)comet.angle=Math.atan2(dy,dx);
     }
     comet.world=world;
    }
    return {...screen,world,frame,orbitTime,node,asset:node.kind==='material'?assets.get(node.assetIds?.[0]):null,spinAngle,tailAngle:comet?.angle,time:seconds,opacity:C.ideaOpacity(node,a,wallTime,opened)};
   }).filter(p=>p.visible);const byId=new Map(projected.map(p=>[p.node.id,p]));edgeHits=[];
   for(const e of s.edges){const p=byId.get(e.from),q=byId.get(e.to);if(!p||!q)continue;ctx.globalAlpha=Math.min(p.opacity,q.opacity);const dx=q.x-p.x,dy=q.y-p.y,len=Math.hypot(dx,dy)||1,curve=e.curve||0,control={x:(p.x+q.x)/2-dy/len*curve,y:(p.y+q.y)/2+dx/len*curve};ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.quadraticCurveTo(control.x,control.y,q.x,q.y);ctx.strokeStyle=e.color||'#344c60';ctx.lineWidth=e.width||1;ctx.setLineDash(e.dashed?[5,5]:[]);ctx.stroke();ctx.setLineDash([]);const mx=(p.x+2*control.x+q.x)/4,my=(p.y+2*control.y+q.y)/4;edgeHits.push({id:e.id,x:mx,y:my});if(e.label){ctx.font='11px "Microsoft YaHei"';ctx.fillStyle='#8d9fae';ctx.fillText(e.relation,mx+5,my-5);}if(e.directed){const angle=Math.atan2(q.y-control.y,q.x-control.x);ctx.beginPath();ctx.moveTo(q.x-7*Math.cos(angle-.5),q.y-7*Math.sin(angle-.5));ctx.lineTo(q.x,q.y);ctx.lineTo(q.x-7*Math.cos(angle+.5),q.y-7*Math.sin(angle+.5));ctx.stroke();}}
   ctx.globalAlpha=1;
   projected.sort((a,b)=>b.z-a.z);
   for(const p of projected){if(p.node.display==='text')continue;const margin=Math.max(12,(p.node.size||3)*p.scale*5);if(p.x>=-margin&&p.x<=w+margin&&p.y>=-margin&&p.y<=height+margin)drawBody(ctx,p,a,selected.includes(p.node.id));}
   labels=drawLabels(ctx,projected,selected,a,w,height,editor?.id);
   if(handle){
    const {x,y}=handle;ctx.save();ctx.strokeStyle='#ffcc72';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,8,0,2*Math.PI);
    ctx.moveTo(x-13,y);ctx.lineTo(x+13,y);ctx.moveTo(x,y-13);ctx.lineTo(x,y+13);ctx.stroke();ctx.restore();
   }
   if(editor){const box=labels.find(b=>b.node.id===editor.id);if(box)placeEditor(box);else finishEdit(false);}
  }
  const down=e=>{
   if(e.button!==0&&e.button!==2)return;
   el.focus({preventScroll:true});
   const p=point(e);
   if(handle&&e.button===0&&!e.shiftKey&&Math.hypot(p.x-handle.x,p.y-handle.y)<=14){
    clearLabelTimer();gesture={pivot:handle.id,point:handle.point,original:handle.point,scale:handle.scale,start:p,depth:e.altKey};
    el.setPointerCapture(e.pointerId);return;
   }
   const bodyHit=[...projected].reverse().find(q=>Math.hypot(q.x-p.x,q.y-p.y)<Math.max(12,(q.node.size||3)*q.scale+3));
   const labelHit=labels.find(b=>labelContains(b,p));
   const hit=e.button===2?null:(labelHit&&projected.find(q=>q.node===labelHit.node))||bodyHit;
   const repeat=e.button===0&&!e.shiftKey&&labelHit&&pendingLabel===labelHit.node.id;
   clearLabelTimer();
   gesture={start:p,last:p,hit,labelHit,repeat,moved:false,pan:e.button===2||(!hit&&e.shiftKey),multi:e.shiftKey,depth:e.altKey,original:hit?[...hit.world]:null};el.setPointerCapture(e.pointerId);};
  const track=e=>{pointer=e.pointerType==='touch'?null:point(e);};
  const leave=()=>{pointer=null;};
  const move=e=>{track(e);if(!gesture)return;const p=point(e);
   if(gesture.pivot){
    const dx=p.x-gesture.start.x,dy=p.y-gesture.start.y;
    if(Math.hypot(dx,dy)>3||gesture.moved){
     gesture.moved=true;const origin=gesture.original;
     gesture.point=gesture.depth?[origin[0],origin[1],origin[2]+dy/gesture.scale]:C.moveScreen(origin,dx,dy,cam.current,gesture.scale);
    }
    return;
   }
   const dx=p.x-gesture.last.x,dy=p.y-gesture.last.y;gesture.moved ||= Math.hypot(p.x-gesture.start.x,p.y-gesture.start.y)>4;if(gesture.moved){if(gesture.hit){const n=gesture.hit.node;const start=positions.current?.id===n.id?positions.current.p:gesture.original;positions.current={id:n.id,p:gesture.depth?[start[0],start[1],start[2]+dy/gesture.hit.scale]:C.moveScreen(start,dx,dy,cam.current,gesture.hit.scale)};}else if(gesture.pan){cam.current.panX=(cam.current.panX||0)+dx;cam.current.panY=(cam.current.panY||0)+dy;}else{cam.current.yaw+=dx*.006;cam.current.pitch=Math.max(-1.5,Math.min(1.5,cam.current.pitch+dy*.006));}}gesture.last=p;};
  const up=e=>{if(!gesture)return;if(gesture.pivot){
    if(gesture.moved)latest.current.onCenter(gesture.pivot,gesture.point);
    gesture=null;return;
   }if(gesture.moved){if(positions.current){
    const hit=gesture.hit,comet=comets.get(hit.node.id),world=positions.current.p;
    let anchor;
    if((comet||hit.node.motion?.center||hit.node.motion?.centerNodeId)&&C.motionOf(hit.node).orbit!=='none'){anchor=C.cometDrop(hit.node,hit.frame,world);if(comet)comet.time=0;else phaseStart.set(hit.node.id,seconds);}
    else anchor=C.anchorAfterDrag(hit.node,hit.frame,hit.orbitTime,world,hit.world);
    latest.current.onMove(hit.node.id,anchor);positions.current=null;
   }else latest.current.onCamera({...cam.current});}else if(gesture.pan){/* A stationary pan gesture leaves selection alone. */}else if(gesture.labelHit&&!gesture.multi){
    const box=gesture.labelHit;
    if(gesture.repeat)editLabel(box);
    else{pendingLabel=box.node.id;labelTimer=setTimeout(()=>{clearLabelTimer();if(latest.current.session.nodes.some(n=>n.id===box.node.id))latest.current.onSelect(box.node.id,false);},460);}
   }else if(gesture.hit)latest.current.onSelect(gesture.hit.node.id,gesture.multi);else{const p=point(e),edge=edgeHits.find(q=>Math.hypot(q.x-p.x,q.y-p.y)<15);if(edge)latest.current.onEdge(edge.id);else latest.current.onSelect(null,false);}gesture=null;};
  const cancel=()=>{leave();gesture=null;positions.current=null;};const wheel=e=>{e.preventDefault();cam.current.zoom=Math.max(.2,Math.min(5,cam.current.zoom*Math.exp(-e.deltaY*.001)));clearTimeout(wheelTimer);wheelTimer=setTimeout(()=>latest.current.onCamera({...cam.current}),180);};const context=e=>e.preventDefault();
  el.addEventListener('pointerdown',down);el.addEventListener('pointerenter',track);el.addEventListener('pointerleave',leave);el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',cancel);el.addEventListener('wheel',wheel,{passive:false});el.addEventListener('contextmenu',context);frame=requestAnimationFrame(draw);
  return()=>{cancelAnimationFrame(frame);clearLabelTimer();finishEdit(false);clearTimeout(wheelTimer);observer.disconnect();el.removeEventListener('pointerdown',down);el.removeEventListener('pointerenter',track);el.removeEventListener('pointerleave',leave);el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',cancel);el.removeEventListener('wheel',wheel);el.removeEventListener('contextmenu',context);};
 },[session.id]);
 return h('canvas',{ref:localRef,tabIndex:0,'aria-label':'三维星图。双击文字编辑标题。拖空白旋转，右键拖动平移，滚轮缩放；拖动星点移动，Alt拖动调整深度。节点也可通过右侧列表选择。'});
}
