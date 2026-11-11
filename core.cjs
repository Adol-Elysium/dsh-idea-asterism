'use strict';
const LIMITS={sessions:100,nodes:500,edges:2000,assets:30,reviews:1000};
const clone=x=>JSON.parse(JSON.stringify(x));
const uid=()=>globalThis.crypto.randomUUID();
const defaults=()=>({left:210,right:330,bottom:180,hideLeft:false,hideRight:false,immersive:false});
const bodies={blackhole:'黑洞',neutron:'中子星',star:'恒星',planet:'行星',asteroid:'小行星',comet:'彗星'};
function seed(id){let hash=2166136261;for(const ch of String(id))hash=Math.imul(hash^ch.charCodeAt(0),16777619);return hash>>>0;}
function bodyOf(n){
 if(Object.hasOwn(bodies,n.body))return n.body;
 if(n.kind==='theme')return ['blackhole','neutron','star'][seed(n.id)%3];
 return n.sourceIds||n.direction?'planet':'star';
}
const finishes={
 blackhole:{classic:'吸积盘',vortex:'旋涡黑洞'},neutron:{classic:'极区喷流',magnetar:'磁星'},
 star:{classic:'光球',flare:'耀斑恒星',giant:'红巨星'},planet:{classic:'环状气态行星',ocean:'海洋行星',desert:'沙漠行星'},
 asteroid:{classic:'岩质'},comet:{classic:'冰尘彗核'}
};
function finishOf(n){return Object.hasOwn(finishes[bodyOf(n)],n.finish)?n.finish:'classic';}
function generatedIdea(n){return n.generated===true||n.arrivedAt!=null||!!(n.direction||Array.isArray(n.sourceIds));}
function backgroundStars(count,distribution='plane'){
 if(distribution==='none'||count===0)return [];
 if(distribution==='volume'){
  return Array.from({length:count*4},(_,i)=>{
   const random=suffix=>seed('background-'+i+suffix)/4294967296;
   const radius=Math.cbrt(random('radius')),vertical=2*random('height')-1,angle=random('angle')*2*Math.PI;
   const horizontal=Math.sqrt(1-vertical*vertical);
   return [1000*radius*horizontal*Math.cos(angle),750*radius*vertical,850*radius*horizontal*Math.sin(angle)];
  });
 }
 const points=Array.from({length:count},(_,i)=>[Math.sin(i*67.3)*1000,Math.sin(i*8.7)*450*.27,Math.sin(i*8.7)*450]);
 for(let i=1;i<=count*3;i++){
  const radius=20+Math.sqrt(i/(count*3))*780,angle=radius*.0065+i%3*2.0944+Math.sin(i*68.7)*.33;
  const x=Math.cos(angle)*radius,z=Math.sin(angle)*radius;
  points.push([x,z*.27,z]);
 }
 return points;
}
function ideaFontSize(n,a){
 if(n.fontSize)return n.fontSize;
 const base=n.display==='text'?a.fontSize:Math.max(10,a.fontSize+(bodyOf(n)==='planet'?seed(n.id)%5-2:0));
 const title=n.title||'';
 const sentence=n.associationFormat==='sentences'||(n.associationFormat!=='keywords'&&
  (Array.from(title).length>=14||title.trim().split(/\s+/).length>=5||/[。！？!?；;]/.test(title)));
 return generatedIdea(n)&&sentence?Math.min(base,Math.max(12,Math.round(base*.85))):base;
}
function ideaOpacity(n,a,now,opened){
 if(n.confirmed||n.favorite||a.fadeIdeas===false||!generatedIdea(n))return 1;
 const created=typeof n.createdAt==='string'?Date.parse(n.createdAt):n.createdAt;
 const last=n.viewedAt??n.arrivedAt??(Number.isFinite(created)?created:opened);
 const elapsed=now-last-(a.fadeDelay??90)*1000;
 const progress=Math.max(0,Math.min(1,elapsed/1200));
 return 1-progress*(1-(a.fadeOpacity??.6));
}
const driftDefaults=()=>({enabled:false,interval:180,lifetime:120});
const textFonts={sans:'微软雅黑',serif:'宋体',kai:'楷体',mono:'等宽'};
function cometAnchor(nodes){
 return nodes.find(n=>n.kind==='theme')||nodes.find(n=>n.arrivedAt==null&&n.kind!=='material'&&bodyOf(n)!=='comet')
  ||nodes.find(n=>n.arrivedAt==null&&n.kind!=='material');
}
function motionOf(node){
 const body=bodyOf(node);
 return {spin:node.display!=='text',spinPeriod:24,spinReverse:false,
  orbit:body==='comet'?'ellipse':['planet','asteroid'].includes(body)?'circle':'none',
  period:body==='comet'?32:115,reverse:false,ratio:body==='comet'?.18:.6,
  radius:body==='comet'?1.5:1,tilt:18,trail:body==='comet',...node.motion};
}
// Rotate in a tilted plane. The saved position defines the major axis.
// Inverting the same transform keeps a dragged body under the pointer.
function orbitPoint(point,center,m,seconds,inverse=false,centered=false){
 if(m.orbit==='none')return point.slice();
 const tilt=m.tilt*Math.PI/180,c=Math.cos(tilt),s=Math.sin(tilt);
 const dx=point[0]-center[0],dy=point[1]-center[1],dz=point[2]-center[2];
 const v=dy*c+dz*s,normal=-dy*s+dz*c;
 const phase=2*Math.PI*seconds/m.period*(m.reverse?-1:1);
 const a=Math.cos(phase)*m.radius,b=Math.sin(phase)*m.radius*(m.orbit==='ellipse'?m.ratio:1);
 if(centered&&(m.center||m.centerNodeId)){
  // The second axis is tangent to the tilt plane and perpendicular to the radius.
  const planar=Math.hypot(dx,v),length=Math.hypot(dx,dy,dz);
  const tangentX=planar>1e-9?-v/planar:1,tangentV=planar>1e-9?dx/planar:0;
  return [center[0]+a*dx+b*length*tangentX,center[1]+a*dy+b*length*tangentV*c,center[2]+a*dz+b*length*tangentV*s];
 }
 const d=inverse?a*a+b*b:1;
 const x=(a*dx+(inverse?b:-b)*v)/d,y=(a*v+(inverse?-b:b)*dx)/d;
 const depth=centered?normal*a:normal;
 return [center[0]+x,center[1]+y*c-depth*s,center[2]+y*s+depth*c];
}
function orbitalFrame(node,theme,seconds){
 if(node.motion?.center)return {center:node.motion.center,shift:[0,0,0],centered:true};
 if(!theme||node.id===theme.id){
  return {center:[node.p[0]-120,node.p[1],node.p[2]],shift:[0,0,0],local:true};
 }
 const center=theme.p;
 const themeWorld=worldPoint(theme,orbitalFrame(theme,null,seconds),seconds);
 return {center,shift:themeWorld.map((v,i)=>v-center[i]),local:false};
}
function worldPoint(node,frame,seconds,m=motionOf(node)){
 if(m.orbit==='none')return node.p;
 if(frame.view){
  const {camera,width,height,ortho}=frame.view;
  const scale=project([0,0,0],camera,width,height,ortho).scale;
  const phase=seconds*2*Math.PI/m.period*(m.reverse?-1:1)+Math.atan2(node.p[1],node.p[0]);
  const tilt=m.tilt*Math.PI/180,ratio=m.orbit==='ellipse'?m.ratio:1;
  const padding=Math.min(width*.18,height*.18,Math.max(12,(node.size||3)*scale*4));
  const extent=(span,factor)=>Math.max(0,span/2-padding)/Math.max(.001,factor);
  const c=Math.cos(tilt),s=Math.sin(tilt);
  const radius=Math.min(Math.max(20,Math.hypot(node.p[0],node.p[1]))*m.radius*scale,
   extent(width,Math.hypot(c,ratio*s)),extent(height,Math.hypot(s,ratio*c)));
  const x=radius*Math.cos(phase),y=radius*ratio*Math.sin(phase);
  return moveScreen([0,0,0],x*c-y*s-(camera.panX||0),x*s+y*c-(camera.panY||0),camera,scale);
 }
 return orbitPoint(node.p,frame.center,m,seconds,false,frame.centered).map((x,i)=>x+frame.shift[i]);
}
// Comet drags restart at the dropped position, including at an ellipse's turning points.
function cometDrop(node,frame,world){
 const m=motionOf(node);
 if(frame.view){
  const {camera,width,height,ortho}=frame.view;
  const p=project(world,camera,width,height,ortho),dx=p.x-width/2,dy=p.y-height/2;
  const angle=m.tilt*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),ratio=m.orbit==='ellipse'?m.ratio:1;
  return [(dx*c+dy*s)/(p.scale*m.radius),(-dx*s+dy*c)/(ratio*p.scale*m.radius),0];
 }
 return world.map((v,i)=>frame.center[i]+(v-frame.center[i]-frame.shift[i])/m.radius);
}
function anchorAfterDrag(node,frame,seconds,newWorld,oldWorld){
 const m=motionOf(node);
 if(frame.local||m.orbit==='none')return node.p.map((v,i)=>v+newWorld[i]-oldWorld[i]);
 return orbitPoint(newWorld.map((v,i)=>v-frame.shift[i]),frame.center,m,seconds,true);
}
// History entries own only the rows changed by the original action.
function historyRows(before,after){
 const previous=new Map(before.map(row=>[row.id,row]));
 const changed=new Set(previous.keys());
 for(const row of after){
  const old=previous.get(row.id);
  if(old&&Object.keys(old).length===Object.keys(row).length&&Object.keys(row).every(k=>Object.is(old[k],row[k])))changed.delete(row.id);
  else changed.add(row.id);
 }
 return {changed,prior:before.filter(row=>changed.has(row.id)),order:before.map(row=>row.id)};
}
function restoreRows(live,patch){
 const replacements=new Map(patch.prior.map(row=>[row.id,row]));
 const result=[];
 for(const row of live){
  if(!patch.changed.has(row.id))result.push(row);
  else if(replacements.has(row.id)){result.push(replacements.get(row.id));replacements.delete(row.id);}
 }
 if(!replacements.size)return result;
 // Reinsert deleted rows before their next surviving original neighbour.
 const present=new Set(result.map(row=>row.id)),groups=new Map();let anchor=null;
 for(let i=patch.order.length-1;i>=0;i--){
  const id=patch.order[i];
  if(present.has(id))anchor=id;
  else if(replacements.has(id)){
   if(!groups.has(anchor))groups.set(anchor,[]);
   groups.get(anchor).push(replacements.get(id));
  }
 }
 const restored=[];
 for(const row of result){if(groups.has(row.id))restored.push(...groups.get(row.id).reverse());restored.push(row);}
 if(groups.has(null))restored.push(...groups.get(null).reverse());
 return restored;
}
function expireComets(session,now){
 const life=(session.drift?.lifetime??120)*1000;
 const ids=new Set(session.nodes.filter(n=>n.arrivedAt!=null&&now-n.arrivedAt>=life).map(n=>n.id));
 if(!ids.size)return session;
 return {...session,nodes:session.nodes.filter(n=>!ids.has(n.id)),
  edges:session.edges.filter(e=>!ids.has(e.from)&&!ids.has(e.to)),
  reviews:session.reviews.filter(r=>!ids.has(r.nodeId))};
}

const appearance=()=>({starDistribution:'plane',starLight:'dim',brightness:.45,glow:9,color:'#b8d1df',background:'#05090e',stars:120,fontSize:14,labels:'all',orthographic:false,autoRotate:false,rotationSpeed:.002});
function session(name='未命名星系',themes=['灵感']){const id=uid();return{id,name,themes,favorite:false,archived:false,deleted:false,createdAt:new Date().toISOString(),nodes:[{id:uid(),kind:'theme',body:['blackhole','neutron','star'][Math.floor(Math.random()*3)],title:themes.join(' · '),text:'本次思维风暴的主题星核',p:[0,0,0],color:'#dbbe86',size:8,format:'plain'}],edges:[],assets:[],reviews:[],camera:{yaw:-.35,pitch:.2,zoom:1,panX:0,panY:0},layout:defaults(),appearance:appearance(),views:[],online:false,query:'',autoReview:true,disabledPersonas:[]};}
function migrate(state){const out=clone(state);if(out.schema===1){out.schema=2;for(const s of out.sessions){s.edges=s.edges||s.nodes.filter(n=>n.parent!==null&&n.parent!==undefined).map(n=>({id:uid(),from:String(n.parent),to:String(n.id),relation:'延伸',color:'#486077',width:1,curve:0,dashed:false}));s.nodes=s.nodes.map(n=>({...n,id:String(n.id),kind:n.kind||'idea',format:'plain'}));s.assets=s.assets||[];s.reviews=s.reviews||[];s.appearance={...appearance(),brightness:s.brightness??.45,color:s.color||'#b8d1df'};s.layout={...defaults(),...s.layout};s.camera=s.camera||{yaw:-.35,pitch:.2,zoom:1,panX:0,panY:0};s.views=[];s.autoReview=true;s.disabledPersonas=[];}}return out;}
function valid(state){
 const fail=m=>{throw Error(m);};const str=(v,max)=>typeof v==='string'&&v.length<=max;const num=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
 if(!state||state.schema!==2||!Array.isArray(state.sessions)||state.sessions.length>LIMITS.sessions)fail('星图文件格式无效');
 function checkAppearance(a){
  if(!a)return;
  if(a.fadeIdeas!=null&&typeof a.fadeIdeas!=='boolean'||a.fadeDelay!=null&&!num(a.fadeDelay,5,86400)||a.fadeOpacity!=null&&!num(a.fadeOpacity,.4,.6))fail('联想淡化设置无效');
  if(a.starDistribution!=null&&!['none','plane','volume'].includes(a.starDistribution))fail('背景星分布无效');
  if(a.starLight!=null&&!['dim','bright','pulse'].includes(a.starLight))fail('背景星光模式无效');
  for(const [key,min,max] of [['brightness',0,1],['glow',0,30],['stars',0,400],['fontSize',10,24],['rotationSpeed',.0005,.01]])if(a[key]!=null&&!num(a[key],min,max))fail('外观设置超出范围');
 }
 function camera(c){if(!c||!num(c.zoom,.2,5)||!num(c.yaw,-100000,100000)||!num(c.pitch,-100000,100000)||!num(c.panX??0,-1000000,1000000)||!num(c.panY??0,-1000000,1000000))fail('视角无效');}
 checkAppearance(state.defaultAppearance);
 const ids=new Set();for(const s of state.sessions){
  if(!str(s.id,100)||ids.has(s.id)||!str(s.name,100)||!s.name.trim())fail('星图标识或名称无效');ids.add(s.id);
  if(!Array.isArray(s.themes)||s.themes.length<1||s.themes.length>3||s.themes.some(t=>!str(t,40)||!t.trim()))fail('每次需要 1—3 个主题关键词');
  if(!Array.isArray(s.nodes)||s.nodes.length>LIMITS.nodes||!Array.isArray(s.edges)||s.edges.length>LIMITS.edges)fail('节点或连线数量超过限制');
  const nodes=new Set();for(const n of s.nodes){if(!str(n.id,100)||nodes.has(n.id)||!str(n.title,100)||!str(n.text,30000)||!Array.isArray(n.p)||n.p.length!==3||n.p.some(v=>!num(v,-100000,100000)))fail('想法内容或位置无效');nodes.add(n.id);}
  const edges=new Set();for(const e of s.edges){if(!str(e.id,100)||edges.has(e.id)||!nodes.has(e.from)||!nodes.has(e.to)||e.from===e.to||!str(e.relation,50)||!num(e.curve??0,-200,200)||!num(e.width??1,.2,8))fail('连接数据无效');edges.add(e.id);}
  if(!Array.isArray(s.assets)||s.assets.length>LIMITS.assets||!Array.isArray(s.reviews)||s.reviews.length>LIMITS.reviews)fail('素材或反馈数量超过限制');
  for(const a of s.assets){if(!str(a.id,100)||!str(a.name,200)||!str(a.text||'',200000)||!str(a.data||'',16000000))fail('素材数据无效');if(a.image&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(a.image))fail('图片格式无效');}
  checkAppearance(s.appearance);camera(s.camera);
  if(s.drift!=null){const d=s.drift;if(typeof d.enabled!=='boolean'||!num(d.interval,5,86400)||!num(d.lifetime,5,86400))fail('彗星计时设置无效');}
  for(const n of s.nodes){
   if(n.associationFormat!=null&&!['mixed','keywords','sentences'].includes(n.associationFormat))fail('联想形式无效');
   if(n.display!=null&&!['star','text'].includes(n.display)||n.fontFamily!=null&&!Object.hasOwn(textFonts,n.fontFamily))fail('想法显示样式无效');
   if(n.finish!=null&&!Object.values(finishes).some(group=>Object.hasOwn(group,n.finish)))fail('星体外观无效');
   if(n.fx!=null&&typeof n.fx!=='boolean'||n.fxPower!=null&&!num(n.fxPower,0,1)||n.fxSpeed!=null&&!num(n.fxSpeed,.1,3))fail('星体特效设置无效');
   if(n.confirmed!=null&&typeof n.confirmed!=='boolean'||n.generated!=null&&typeof n.generated!=='boolean'||n.viewedAt!=null&&!num(n.viewedAt,0,8640000000000000))fail('想法识别状态无效');
   if(n.arrivedAt!=null&&!num(n.arrivedAt,0,8640000000000000))fail('彗星到访时间无效');
   if(n.motion!=null){if(typeof n.motion!=='object'||Array.isArray(n.motion))fail('星体运动设置无效');const m=motionOf(n);
    if(m.centerNodeId!==undefined){
     if(!str(m.centerNodeId,100))fail('公转中心想法无效');
     const seen=new Set([n.id]);let id=m.centerNodeId;
     while(id){if(seen.has(id))fail('公转中心不可循环引用');seen.add(id);const parent=s.nodes.find(p=>p.id===id);id=parent?.motion?.center?undefined:parent?.motion?.centerNodeId;}
    }
    if(m.center!==undefined&&(!Array.isArray(m.center)||m.center.length!==3||!m.center.every(v=>num(v,-100000,100000))))fail('公转中心坐标无效');
    if(!['circle','ellipse','none'].includes(m.orbit)||![m.spin,m.spinReverse,m.reverse,m.trail].every(v=>typeof v==='boolean')||
     !num(m.spinPeriod,1,600)||!num(m.period,2,1200)||!num(m.radius,.1,4)||!num(m.ratio,.05,1)||!num(m.tilt,-90,90))fail('星体运动设置无效');
   }
  }
  if(!Number.isInteger(s.associationMin??5)||!Number.isInteger(s.associationMax??8)||(s.associationMin??5)<1||(s.associationMax??8)>20||(s.associationMin??5)>(s.associationMax??8))fail('联想数量范围无效');
  if(s.disabledPersonas!=null&&(!Array.isArray(s.disabledPersonas)||s.disabledPersonas.some(x=>!str(x,200))))fail('人格选择无效');
  if(s.clickAssociations!=null&&typeof s.clickAssociations!=='boolean')fail('点击星点联想设置无效');
  if(s.autoReview!=null&&typeof s.autoReview!=='boolean'||s.online!=null&&typeof s.online!=='boolean'||s.query!=null&&!str(s.query,400))fail('模型或联网设置无效');
  for(const n of s.nodes)if(n.reason!=null&&!str(n.reason,2000)||n.group!=null&&!str(n.group,200))fail('想法说明无效');
  if(s.views&&(!Array.isArray(s.views)||s.views.length>20))fail('视角书签无效');for(const v of s.views||[]){if(!str(v.name,50))fail('视角名称无效');camera(v.camera);}
  for(const n of s.nodes){
   if(n.body!=null&&!Object.hasOwn(bodies,n.body))fail('星体样式无效');
   if(n.size!=null&&!num(n.size,1,32)||n.fontSize!=null&&!num(n.fontSize,10,72))fail('星点样式无效');
   if(n.sources&&(!Array.isArray(n.sources)||n.sources.length>5||n.sources.some(x=>!x||!str(x.title,250)||!str(x.url,8192))))fail('来源无效');
   if(n.assetIds&&(!Array.isArray(n.assetIds)||n.assetIds.some(id=>!s.assets.some(a=>a.id===id))))fail('找不到关联素材');
  }
  for(const a of s.assets)if(typeof a.text!=='string'||a.note!=null&&!str(a.note,1000))fail('素材说明无效');
  for(const r of s.reviews){
   if(!str(r.id,100)||!str(r.personaName,500)||!str(r.nodeId,100))fail('反馈记录无效');
   if(r.error!=null&&!str(r.error,3000))fail('反馈错误说明无效');
   if(!r.error&&(!r.content||!Array.isArray(r.content.questions)||!Array.isArray(r.content.intentions)||![...r.content.questions,...r.content.intentions,r.content.appreciation].every(x=>str(x,3000))))fail('反馈内容无效');
  }
  if(s.layout){for(const [k,min,max]of[['left',150,420],['right',220,600],['bottom',120,480]])if(!num(s.layout[k],min,max))fail('框体尺寸无效');}
  if(s.camera){for(const k of ['yaw','pitch','zoom'])if(!num(s.camera[k],-100000,100000))fail('视角无效');if(s.camera.zoom<=0)fail('缩放无效');}
 }
 if(state.current!==null&&!ids.has(state.current))fail('当前星图不存在');return state;
}
function textKey(s){return s.normalize('NFKC').replace(/[\s\p{P}]/gu,'').toLowerCase();}
function ideas(text){const arr=JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));if(!Array.isArray(arr))throw Error('模型未返回联想列表');const seen=new Set();return arr.filter(x=>x&&typeof x.title==='string'&&typeof x.text==='string'&&x.title.trim()&&x.text.trim()).map(x=>({title:x.title.trim().slice(0,100),text:x.text.trim().slice(0,1200),direction:String(x.direction||'延伸').slice(0,40),reason:String(x.reason||'').slice(0,500),sourceIds:Array.isArray(x.sourceIds)?x.sourceIds.filter(Number.isInteger):[]})).filter(x=>{const k=textKey(x.title);if(seen.has(k))return false;seen.add(k);return true;});}
function project(p,c,w,h,ortho=false){const a=Math.cos(c.yaw),b=Math.sin(c.yaw),d=Math.cos(c.pitch),e=Math.sin(c.pitch),x=p[0]*a-p[2]*b,z=p[0]*b+p[2]*a,y=p[1]*d-z*e,depth=p[1]*e+z*d;const scale=(ortho?.8:650/Math.max(100,850+depth))*c.zoom;return{x:w/2+x*scale+(c.panX||0),y:h/2+y*scale+(c.panY||0),z:depth,scale,visible:ortho||depth>-740};}
function moveScreen(p,dx,dy,c,scale){const xx=dx/scale,yy=dy/scale,a=Math.cos(c.yaw),b=Math.sin(c.yaw),d=Math.cos(c.pitch),f=Math.sin(c.pitch);return[p[0]+a*xx-b*f*yy,p[1]+d*yy,p[2]-b*xx-a*f*yy];}
function resizeLayout(layout,key,value){const ranges={left:[150,420],right:[220,600],bottom:[120,480]};const[min,max]=ranges[key];return{...layout,[key]:Math.max(min,Math.min(max,value))};}
function markdown(s){return'# '+s.name+'\n\n主题：'+s.themes.join('、')+'\n\n'+s.nodes.map(n=>'## '+n.title+'\n\n'+n.text+'\n\n'+(n.sources||[]).map(x=>'来源：['+x.title+']('+x.url+')').join('\n')).join('\n\n')+'\n\n## 关系\n\n'+s.edges.map(e=>(s.nodes.find(n=>n.id===e.from)?.title||'')+' — '+e.relation+' → '+(s.nodes.find(n=>n.id===e.to)?.title||'')).join('\n')+'\n\n## 人格反馈\n\n'+s.reviews.map(r=>'### '+r.personaName+' · '+r.createdAt+'\n\n'+(r.error||JSON.stringify(r.content,null,2))).join('\n\n');}
module.exports={backgroundStars,ideaFontSize,textFonts,cometAnchor,cometDrop,finishes,finishOf,generatedIdea,ideaOpacity,historyRows,restoreRows,driftDefaults,motionOf,orbitalFrame,worldPoint,anchorAfterDrag,expireComets,bodies,bodyOf,seed,LIMITS,clone,uid,defaults,appearance,session,migrate,valid,ideas,textKey,project,moveScreen,resizeLayout,markdown};
