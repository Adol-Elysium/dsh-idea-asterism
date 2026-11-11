// Use the production painter and packaged textures for a close-up reference.
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_ENTRY);
const root=new URL('../',import.meta.url);
const [core,sky,bodies]=await Promise.all(['core.cjs','src/sky.js','src/bodies.js'].map(f=>readFile(new URL(f,root),'utf8')));
const server=createServer(async(req,res)=>{
 if(req.url==='/'){res.setHeader('content-type','text/html;charset=utf-8');res.end('<style>*{margin:0}canvas{display:block}</style><canvas width="1080" height="586"></canvas>');return;}
 if(!/^\/(?:body|near)-(?:vortex|magnetar|flare|giant|ocean|desert|emission)(?:-\d{1,2})?\.webp$/.test(req.url)){res.writeHead(404);res.end();return;}
 res.setHeader('content-type','image/webp');res.end(await readFile(new URL('assets'+req.url,root)));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
 browser=await chromium.launch({executablePath:process.env.EDGE_PATH});
 const page=await browser.newPage({viewport:{width:1080,height:586},deviceScaleFactor:1.5});
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.addScriptTag({content:'const module={exports:{}};'+core+';const C=module.exports;const assetURL=name=>"/"+name;'+sky+bodies});
 await page.evaluate(async()=>{
  const types=['blackhole','neutron','star','star','planet','planet'];const skins=['vortex','magnetar','flare','giant','ocean','desert'];
  await Promise.all([...skins,'emission'].map(t=>bodyAtlas(t).decode()));
  const c=document.querySelector('canvas'),ctx=c.getContext('2d');
  c.width*=devicePixelRatio;c.height*=devicePixelRatio;c.style.width='1080px';c.style.height='586px';
  ctx.scale(devicePixelRatio,devicePixelRatio);ctx.fillStyle='#070c12';ctx.fillRect(0,0,1080,586);
  for(let i=1;i<290;i++){
   ctx.fillStyle=i%9===0?'#28343f':'#161e26';circle(ctx,(i*739.53)%1080,(i*i*53.13)%586,i%7===0?.85:.55);
  }
  ctx.font='20px "Microsoft YaHei UI"';ctx.fillStyle='#ddcfb8';ctx.fillText('思维星图  /  新增星体外观',42,43);
  ctx.strokeStyle='#26323e';ctx.beginPath();ctx.moveTo(42,63);ctx.lineTo(1038,63);ctx.stroke();
  const appearance=C.appearance();
  await Promise.all(skins.map(async(key,i)=>{
   const seed=C.seed('atlas-'+typeId(i)),angle=.6+(seed%48)*2*Math.PI/48;
   const frame=Math.floor(((angle/(2*Math.PI))%1)*16);
   nearImage(key,frame);await nearFrames.get('near-'+key+'-'+frame).decode();
  }));
  function typeId(i){return types[i];}
  types.forEach((type,i)=>{
   const x=180+i%3*359,y=174+Math.floor(i/3)*237;
   drawBody(ctx,{x,y,scale:2,node:{id:'atlas-'+type,body:type,size:24,finish:skins[i]},time:4,spinAngle:.6,tailAngle:.20},appearance,false);
   ctx.textAlign='center';ctx.fillStyle='#c4cbd0';ctx.font='16px "Microsoft YaHei UI"';ctx.fillText(C.finishes[type][skins[i]],x,y+94);
  });
 });
 const sprites=await page.evaluate(()=>[...bodyAtlases.values()].every(img=>img.naturalWidth===1280||img.naturalWidth===512));
 assert.ok(sprites);await page.screenshot({path:new URL('../preview-variants.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1')});
}finally{await browser?.close();server.close();}

