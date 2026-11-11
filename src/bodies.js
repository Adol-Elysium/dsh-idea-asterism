const atlasTiles=8,atlasFrames=48,tileSize=160;
const bodyAtlases=new Map(),tintedTiles=new Map(),bodyLayers=new Map();
const materialFor=type=>type==='comet'?'asteroid':type;
function bodyAtlas(type){
 const key=materialFor(type);
 if(!bodyAtlases.has(key)){
  const img=new Image();img.src=assetURL('body-'+key+'.webp');bodyAtlases.set(key,img);
 }
 return bodyAtlases.get(key);
}
const nearFrames=new Map();
function nearImage(key,index){
 const name='near-'+key+'-'+index;
 let img=nearFrames.get(name);
 if(!img){img=new Image();img.src=assetURL(name+'.webp');}
 else nearFrames.delete(name);
 nearFrames.set(name,img);
 if(nearFrames.size>24)nearFrames.delete(nearFrames.keys().next().value);
 return img.complete&&img.naturalWidth?img:null;
}
function paintMaterial(ctx,type,finish,angle,tint,r){
 const key=finish==='classic'?materialFor(type):finish;
 const half=type==='blackhole'?1/.37:type==='comet'?.70:1/.9;
 const phase=((angle/(2*Math.PI))%1+1)%1;
 const frames=finish==='classic'?atlasFrames:16;
 const index=Math.floor(phase*frames);
 let img=bodyAtlas(key),size=tileSize,x=index%8*size,y=Math.floor(index/8)*size;
 let id=key+':small:'+index;
 if(2*r*half*(window.devicePixelRatio||1)>132){
  const frame=Math.floor(phase*16);
  const detail=nearImage(key,frame);
  if(detail){img=detail;size=detail.naturalWidth;x=y=0;id=key+':near:'+frame;}
 }
 if(!img.complete||!img.naturalWidth){ctx.fillStyle=tint;circle(ctx,0,0,.8);return;}
 if(tint==='#b8d1df'){ctx.drawImage(img,x,y,size,size,-half,-half,half*2,half*2);return;}
 id+=':'+tint;
 let tile=tintedTiles.get(id);
 if(!tile){
  tile=document.createElement('canvas');tile.width=tile.height=size;
  const brush=tile.getContext('2d');brush.drawImage(img,x,y,size,size,0,0,size,size);
  brush.globalCompositeOperation='multiply';brush.fillStyle=tint;brush.fillRect(0,0,size,size);
  brush.globalCompositeOperation='destination-in';brush.drawImage(img,x,y,size,size,0,0,size,size);
  if(tintedTiles.size>=24)tintedTiles.delete(tintedTiles.keys().next().value);
  tintedTiles.set(id,tile);
 }
 ctx.drawImage(tile,-half,-half,half*2,half*2);
}
function paintActivity(ctx,node,type,finish,time,alpha){
 const strength=node.fxPower??.65;
 if(node.fx===false||strength<=0||!['blackhole','star','neutron'].includes(type))return;
 const phase=time*(node.fxSpeed??1)*.24+C.seed(node.id)%37;
 ctx.save();ctx.lineCap='round';ctx.globalAlpha=alpha*strength;
 if(type==='blackhole'){
  if(finish==='vortex')ctx.rotate(-.49);
  for(let i=0;i<9;i++){
   const t=(phase*.27+i/9)%1,a=i*2.4+t*1.45,r=2.24-t*1.3;
   ctx.beginPath();
   for(let k=0;k<8;k++){const f=k/7,dist=r+.19*(1-f),theta=a-.21*(1-f);
    const x=dist*Math.cos(theta),y=dist*Math.sin(theta)*.35;
    if(k)ctx.lineTo(x,y);else ctx.moveTo(x,y);}
   ctx.strokeStyle=finish==='vortex'?'#c4e8ff':'#ffe3ae';ctx.lineWidth=.022;
   ctx.globalAlpha=alpha*strength*Math.sin(Math.PI*t)*Math.min(1,Math.max(0,(r-1)*4));ctx.stroke();
  }
 }else if(type==='star'){
  const count=finish==='flare'?9:5;
  for(let i=0;i<count;i++){
   const t=(phase*.17+i/count)%1,angle=i*2.4+phase*.035;
   ctx.save();ctx.rotate(angle);const height=(finish==='flare'?.53:.30)*Math.sin(Math.PI*t);
   ctx.globalAlpha=alpha*strength*Math.sin(Math.PI*t);ctx.strokeStyle=finish==='giant'?'#ff9959':'#ffbd6c';ctx.lineWidth=.018;
   ctx.beginPath();ctx.moveTo(.98,-.12);ctx.bezierCurveTo(1+height,-.27,1+height,.25,.98,.12);ctx.stroke();ctx.restore();
  }
 }else{
  const pulse=.5+.5*Math.sin(phase*4);
  ctx.strokeStyle=finish==='magnetar'?'#c9aaf8':'#b5eaff';ctx.globalAlpha=alpha*strength*(.2+.7*pulse);ctx.lineWidth=.015;
  for(const side of [-1,1]){
   ctx.beginPath();ctx.moveTo(0,-.76);ctx.bezierCurveTo(side*(1.15+.45*pulse),-1.55,side*(1.15+.45*pulse),1.55,0,.76);ctx.stroke();
  }
 }
 ctx.restore();
}
function paintRings(ctx,front){
 const start=front?0:Math.PI,end=start+Math.PI;
 for(let i=0;i<30;i++){
  const radius=1.22+i*.022;
  if(i===18||i===19)continue;
  const alpha=(.25+.38*Math.pow(Math.sin(i*.79),2))*(front?1:.74);
  ctx.strokeStyle='rgba(203,187,156,'+alpha+')';ctx.lineWidth=.026;
  ctx.beginPath();ctx.ellipse(0,0,radius,radius*.225,0,start,end);ctx.stroke();
 }
}
function paintBodyLayer(ctx,layer){
 const emissionIndex=['tail','poles','corona'].indexOf(layer);
 if(emissionIndex>=0){
  const image=bodyAtlas('emission');
  if(image.complete&&image.naturalWidth)ctx.drawImage(image,0,emissionIndex*384,512,384,-256/49,-192/49,512/49,384/49);
  return;
 }
 if(!bodyLayers.has(layer)){
  const image=document.createElement('canvas');image.width=512;image.height=384;
  const brush=image.getContext('2d');brush.translate(256,192);brush.scale(49,49);
  paintRings(brush,layer==='ring-front');
  bodyLayers.set(layer,image);
 }
 ctx.drawImage(bodyLayers.get(layer),-256/49,-192/49,512/49,384/49);
}
const materialImages=new Map();
function drawMediaNode(ctx,p,selected){
 const a=p.asset,r=Math.max(5,(p.node.size||20)*p.scale);
 const isPhoto=a.image&&(/^image\//.test(a.type)||/\.(png|jpe?g|gif|webp)$/i.test(a.name));
 ctx.save();ctx.translate(p.x,p.y);ctx.scale(r,r);ctx.globalAlpha=p.opacity??1;
 ctx.fillStyle='#1d3242';ctx.strokeStyle=selected?'#e8c891':'#99acb5';ctx.lineWidth=.08;
 if(isPhoto){
  let img=materialImages.get(a.id);
  if(!img||img.src!==a.image){img=new Image();img.src=a.image;materialImages.set(a.id,img);
   if(materialImages.size>60)materialImages.delete(materialImages.keys().next().value);}
  ctx.fillRect(-1,-1,2,2);
  if(img.complete&&img.naturalWidth){
   const scale=2/Math.max(img.naturalWidth,img.naturalHeight),w=img.naturalWidth*scale,h=img.naturalHeight*scale;
   ctx.drawImage(img,-w/2,-h/2,w,h);
  }
  ctx.strokeRect(-1,-1,2,2);
 }else{
  ctx.beginPath();ctx.moveTo(-.72,-1);ctx.lineTo(.25,-1);ctx.lineTo(.77,-.5);ctx.lineTo(.77,1);ctx.lineTo(-.72,1);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.moveTo(.25,-1);ctx.lineTo(.25,-.5);ctx.lineTo(.77,-.5);
  for(const y of [-.15,.19,.53]){ctx.moveTo(-.47,y);ctx.lineTo(y===.53?.12:.47,y);}ctx.stroke();
 }
 ctx.restore();
}
function drawBody(ctx,p,appearance,selected){
 if(p.asset){drawMediaNode(ctx,p,selected);return;}
 const n=p.node,type=C.bodyOf(n),r=Math.max(2,(n.size||3)*p.scale);
 const tint=[n.color,appearance.color].find(c=>/^#[0-9a-f]{6}$/i.test(c))||'#b8d1df';
 const seed=C.seed(n.id),tilt=(seed%35-17)*Math.PI/180;
 const angle=(p.spinAngle||0)+(seed%atlasFrames)*2*Math.PI/atlasFrames;
 ctx.save();ctx.translate(p.x,p.y);ctx.rotate(type==='comet'?0:tilt);ctx.scale(r,r);
 const opacity=p.opacity??1,brightness=opacity*(.65+.35*appearance.brightness),finish=C.finishOf(n);
 const rings=type==='planet'&&finish==='classic';
 ctx.imageSmoothingQuality='high';
 ctx.globalAlpha=brightness;
 if(appearance.glow>0&&['star','neutron','comet'].includes(type)){
  const outer=1.15+appearance.glow*.055;
  const halo=ctx.createRadialGradient(0,0,.42,0,0,outer);
  const glow=tint==='#b8d1df'?({star:'#efac57',neutron:'#a5d8ff',comet:'#b6d9dd'})[type]:tint;
  halo.addColorStop(0,glow+'70');halo.addColorStop(.48,glow+'30');halo.addColorStop(1,glow+'00');
  ctx.globalAlpha=brightness*appearance.brightness;ctx.fillStyle=halo;circle(ctx,0,0,outer);ctx.globalAlpha=brightness;
 }
 if(rings){if(r>28)paintRings(ctx,false);else paintBodyLayer(ctx,'ring-back');}
 if(type==='star'&&appearance.glow>0){
  ctx.globalAlpha=opacity*Math.min(1,appearance.glow/9)*appearance.brightness;paintBodyLayer(ctx,'corona');ctx.globalAlpha=brightness;
 }
 if(type==='comet'&&Number.isFinite(p.tailAngle)){
  // The tail sprite extends left. Align its positive X axis with forward motion.
  ctx.save();ctx.rotate(p.tailAngle);paintBodyLayer(ctx,'tail');ctx.restore();
 }
 if(type==='neutron'){ctx.globalAlpha=brightness*(n.fx===false?1:.85+.15*(n.fxPower??.65)*Math.cos((p.time||0)*(n.fxSpeed??1)));paintBodyLayer(ctx,'poles');ctx.globalAlpha=brightness;}
 if(type==='neutron')ctx.scale(.78,.78);
 // Opaque surfaces occult the rear rings and jets even with subdued lighting.
 if(['neutron','planet','blackhole'].includes(type)){ctx.globalAlpha=opacity;ctx.fillStyle='#05090d';circle(ctx,0,0,type==='blackhole'?.91:.98);}
 ctx.globalAlpha=brightness;paintMaterial(ctx,type,finish,angle,tint,r);
 if(rings){if(r>28)paintRings(ctx,true);else paintBodyLayer(ctx,'ring-front');}
 paintActivity(ctx,n,type,finish,p.time||0,brightness);
 ctx.restore();
 if(selected){ctx.strokeStyle='#b7a17c';ctx.lineWidth=.8;ctx.beginPath();ctx.arc(p.x,p.y,r+5,0,Math.PI*2);ctx.stroke();}
}
