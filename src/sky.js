function galaxyIcon(){
 // Filled, tapered arms retain their silhouette at the sidebar's small icon size.
 const arm='M2 14.3C.9 9.5 3.6 4.7 8.3 3.1c4.6-1.6 9.4.2 11 3.8 1.2 2.8.2 5.9-2.6 7.3-1.1.5-2.3.6-3.3.3 2.8-.7 4.2-2.7 3.8-4.8-.5-2.6-3.7-4.2-7.3-3.7-3.7.5-6.8 3.4-7.9 8.3Z';
 return h('svg',{viewBox:'0 0 24 24',width:20,height:20,fill:'currentColor',stroke:'none','aria-hidden':true},
  h('g',{transform:'translate(12 12) rotate(-24) scale(1 .85) translate(-12 -12)'},
   h('path',{d:arm}),h('path',{d:arm,transform:'rotate(180 12 12)'}),
   h('circle',{cx:12,cy:12,r:2.2})),
  h('path',{d:'M20.3 1.3l.65 1.8 1.8.65-1.8.65-.65 1.8-.65-1.8-1.8-.65 1.8-.65Z'}));
}
function circle(ctx,x,y,r){
 ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
}
function labelContains(box,p){
 if(p.x<box.x||p.x>box.x+box.w||p.y<box.y||p.y>box.y+box.h)return false;
 if(!box.textArea)return true;
 const {cx,cy,c,s,halfW,halfH}=box.textArea,dx=p.x-cx,dy=p.y-cy;
 return Math.abs(dx*c+dy*s)<=halfW&&Math.abs(dy*c-dx*s)<=halfH;
}
function drawTextIdea(ctx,p,selected,a,width,editingId){
 const n=p.node,size=C.ideaFontSize(n,a);
 const fonts={sans:'"Microsoft YaHei UI",sans-serif',serif:'SimSun,serif',kai:'KaiTi,STKaiti,serif',mono:'Consolas,"Microsoft YaHei UI",monospace'};
 ctx.save();ctx.font=size+'px '+(fonts[n.fontFamily]||fonts.sans);
 const maxWidth=Math.min(360,Math.max(24,width-12)),lines=[];
 for(const paragraph of (n.title||'未命名想法').split(/\r?\n/)){
  let line='';
  for(const ch of paragraph){
   if(line&&ctx.measureText(line+ch).width>maxWidth){lines.push(line);line='';}
   line+=ch;
  }
  lines.push(line);
 }
 const lineHeight=size*1.28,halfH=lines.length*lineHeight/2+2;
 const halfW=Math.max(...lines.map(line=>ctx.measureText(line).width))/2+4;
 const c=Math.cos(p.spinAngle),s=Math.sin(p.spinAngle);
 const w=2*(Math.abs(c)*halfW+Math.abs(s)*halfH),h=2*(Math.abs(s)*halfW+Math.abs(c)*halfH);
 ctx.translate(p.x,p.y);ctx.rotate(p.spinAngle);ctx.textAlign='center';ctx.textBaseline='middle';
 ctx.globalAlpha=p.opacity??1;ctx.fillStyle=n.color||a.color;
 if(editingId!==n.id)lines.forEach((line,i)=>ctx.fillText(line,0,(i-(lines.length-1)/2)*lineHeight));
 if(selected.includes(n.id)){ctx.strokeStyle='#b7a17c';ctx.lineWidth=1;ctx.strokeRect(-halfW,-halfH,halfW*2,halfH*2);}
 ctx.restore();
 return {node:n,x:p.x-w/2,y:p.y-h/2,w,h,textArea:{cx:p.x,cy:p.y,c,s,halfW,halfH}};
}
function drawLabels(ctx,points,selected,a,width,height,editingId){
 const visible=points.filter(p=>p.x>=0&&p.y>=0&&p.x<=width&&p.y<=height);
 // Give selected and nearer objects first choice of label positions.
 const ordered=visible.slice().reverse().sort((p,q)=>Number(selected.includes(q.node.id))-Number(selected.includes(p.node.id)));
 const labels=[],obstacles=[];
 for(const p of points){
  if(p.node.display!=='text')continue;
  const box=drawTextIdea(ctx,p,selected,a,width,editingId);
  labels.unshift(box);obstacles.push(box);
 }
 for(const p of visible){
  if(p.node.display==='text')continue;
  const r=Math.max(3,(p.node.size||3)*p.scale);
  obstacles.push({x:p.x-r,y:p.y-r,w:2*r,h:2*r,body:p});
  const type=C.bodyOf(p.node),tilt=(C.seed(p.node.id)%35-17)*Math.PI/180;
  const angle=type==='comet'?p.tailAngle:type==='neutron'?tilt+Math.PI/2:tilt;
  const extent=type==='planet'&&C.finishOf(p.node)==='classic'?1.9:type==='blackhole'?2.4:type==='comet'?3.8:type==='neutron'?2.2:0;
  for(let d=1;d<=extent;d+=.5){
   for(const sign of type==='comet'?[-1]:[-1,1]){
    const x=p.x+Math.cos(angle)*sign*d*r,y=p.y+Math.sin(angle)*sign*d*r;
    obstacles.push({x:x-r*.25,y:y-r*.25,w:r*.5,h:r*.5});
   }
  }
 }
 for(const p of ordered){
  const n=p.node,active=selected.includes(n.id);
  if(n.display==='text')continue;
  if(!active&&a.labels!=='all'&&!(a.labels==='near'&&p.scale>.85))continue;
  const size=C.ideaFontSize(n,a);
  ctx.font=size+'px "Microsoft YaHei UI",sans-serif';ctx.textBaseline='middle';
  const text=(n.favorite?'☆ ':'')+(n.title.length>23?n.title.slice(0,22)+'…':n.title||'未命名想法');
  const w=ctx.measureText(text).width+6,h=size+5;
  const type=C.bodyOf(n);
  const radius=Math.max(2,(n.size||3)*p.scale)*(type==='comet'?.58:type==='neutron'?.78:type==='asteroid'?.89:1);
  let box,anchor;
  // Each trial starts at the projected limb with a constant screen-space gap.
  for(const extra of [0,7,16]){
   for(const degrees of [0,180,-90,90,-45,45,-135,135,-22,22,158,-158]){
    const angle=degrees*Math.PI/180,dx=Math.cos(angle),dy=Math.sin(angle);
    const ax=p.x+dx*(radius+3+extra),ay=p.y+dy*(radius+3+extra);
    const x=Math.max(0,Math.min(width-w,ax-(dx<-.1?w:dx>.1?0:w/2)));
    const y=Math.max(0,Math.min(height-h,ay-(dy<-.1?h:dy>.1?0:h/2)));
    const nearX=Math.max(x,Math.min(x+w,p.x)),nearY=Math.max(y,Math.min(y+h,p.y));
    const dist=Math.hypot(nearX-p.x,nearY-p.y);
    if(w>width||h>height||dist<radius+1||obstacles.some(b=>b.body!==p&&x<b.x+b.w&&x+w>b.x&&y<b.y+b.h&&y+h>b.y))continue;
    box={x,y,w,h,node:n};anchor={x:nearX,y:nearY,dist};break;
   }if(box)break;
  }
  if(!box)continue;
  ctx.globalAlpha=p.opacity??1;
  if(anchor.dist>radius+7){
   ctx.strokeStyle='#62798c';ctx.lineWidth=.7;ctx.beginPath();
   ctx.moveTo(p.x+(anchor.x-p.x)*radius/anchor.dist,p.y+(anchor.y-p.y)*radius/anchor.dist);
   ctx.lineTo(anchor.x,anchor.y);ctx.stroke();
  }
  ctx.fillStyle=active?'#efdfc5':'#b4c4d0';if(n.id!==editingId)ctx.fillText(text,box.x+3,box.y+h/2);labels.push(box);obstacles.push(box);
 }
 ctx.globalAlpha=1;ctx.textBaseline='alphabetic';return labels;
}
