import {createServer} from 'node:http';
import {readFile,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {checkLayout} from './layout-check.mjs';
import {apply} from '../index.js';
const {chromium}=await import(process.env.PLAYWRIGHT_ENTRY);
const fixture=process.env.STAR_SEA_REACT_FIXTURE;
const home=await mkdtemp(path.join(tmpdir(),'star-sea-browser-'));
process.env.DSH_HOME=home;
const pageErrors=[];const calls=[];let delayReview=false, observedAbort=false, signalStarted;
const svc={
  connection:{requestRejection:req=>!req.headers['x-test-reject']&&req.headers.host?.startsWith('127.0.0.1:')?undefined:403},
  agentDefaultModel:{currentSelection:()=>({model:'模拟模型',provider:'fixture'})},
  agentPresets:{list:async()=>[{id:'standard'},{id:'reader',name:'读者'}],readDocument:async()=>({content:'- name: "@deepseek-ai/dsh-persona"\n  config:\n    prefix: 独立读者'})},
  llm:{resolveModelInfo:async()=>({inputModalities:['text','image']}),async *stream(opts){
    const review=opts.system.includes('想法点评'),drift=opts.system.includes('发散彗星');calls.push(drift?'drift':review?'review':'generate');if(drift&&calls.filter(c=>c==='drift').length===2)throw Error('模拟模型不可用');
    if(review&&delayReview){
     delayReview=false;signalStarted();
     await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('previous review was not stopped')),5000);
      opts.signal.addEventListener('abort',()=>{clearTimeout(timer);observedAbort=true;resolve();},{once:true});
     });
     return;
    }
    const ideas=['潮汐书架','借阅年轮','漂流索引','声音地图','夜航书签','记忆观测站'].map(title=>({title,text:title+'的创意设想',sourceIds:[1]}));
    yield {type:'text-delta',text:JSON.stringify(review?{questions:['谁在夜间借阅？','声音如何保存？'],intentions:['可能希望保存记忆'],appreciation:'可做一周声音采集实验。'}:drift?[{title:'迁徙信箱'+calls.filter(c=>c==='drift').length,text:'把邮件交给迁徙路线。',reason:'以季节约定送达时间。'}]:ideas)};yield {type:'finish',reason:{kind:'stop'}};
  }},web:{search:async({query})=>{assert.equal(query,'城市记忆');calls.push('search');return {sources:[{title:'测试资料',url:'https://example.org/article',snippet:'摘要'}]};},fetch:async()=>({url:'https://example.org/article',statusCode:200,body:{kind:'text',content:'样本文字'}})}
};
let handler;
const scope={get:n=>svc[n],effect:fn=>fn(),webServer:{register:r=>{handler=r.handler;return ()=>{};}}};
apply({inject:(_,fn)=>fn(scope)});
const serve=createServer(async(req,res)=>{
 try{
  if(req.url.startsWith('/dsh-idea-asterism/'))return await handler(req,res);
  if(req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');return res.end(`<!doctype html><meta charset=utf-8><style>html,body,#app{margin:0;height:100%}</style><div id=app></div><script type=module>import{React,DOM}from'/react-fixture.js';window.__ModuleLoader__={load:m=>m.factory(()=>React).apply({effect:f=>f(),slots:{inject:(_,f)=>f(),register:(slot,C)=>{if(slot.key==='dsh-idea-asterism')DOM.createRoot(document.getElementById('app')).render(React.createElement(C))}}})};await import('/client.js');</script>`);}
  if(!/^\/(client|react-fixture|vendor-[\w-]+)\.js$/.test(req.url)){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type','text/javascript');res.end(await readFile(req.url==='/client.js'?new URL('../client.js',import.meta.url):path.join(fixture,req.url.slice(1))));
 }catch(e){res.writeHead(500);res.end(String(e));}
});
await new Promise(r=>serve.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH,headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(6000);
 // Record only the star-map canvas to exercise a pointer click on rendered text.
 await page.addInitScript(()=>{
  const proto=CanvasRenderingContext2D.prototype,paint=proto.fillText,fill=proto.fillRect;
  proto.fillRect=function(...args){
   if(this.canvas.closest('.ss-space'))window.mapText=[];
   return fill.apply(this,args);
  };
  proto.fillText=function(text,x,y,...rest){
   if(this.canvas.closest('.ss-space'))window.mapText.push({text,x,y,width:this.measureText(text).width,height:parseFloat(this.font)});
   return paint.call(this,text,x,y,...rest);
  };
 });
 page.on('pageerror',e=>pageErrors.push(e.message));page.on('dialog',d=>d.accept());const origin='http://127.0.0.1:'+serve.address().port;
 const unauthorized=await fetch(origin+'/dsh-idea-asterism/api/load',{method:'POST',headers:{'x-test-reject':'1','content-type':'application/json','x-idea-asterism-request':'1'},body:'{}'});
 assert.equal(unauthorized.status,403);
 const missingHeader=await fetch(origin+'/dsh-idea-asterism/api/load',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
 assert.equal(missingHeader.status,403);
 await page.goto(origin);await page.getByText('创建星系',{exact:true}).click();
 await page.getByLabel('星系名称').fill('潮汐图书馆');await page.getByLabel('主题关键词').fill('记忆，城市');await page.getByLabel('输入想法').fill('让图书馆收集一座城市的声音');
 await page.locator('input[type=file][multiple]').setInputFiles({name:'草稿.txt',mimeType:'text/plain',buffer:Buffer.from('城区的环境声')});
 await page.locator('.ss-materials summary').filter({hasText:'草稿.txt'}).waitFor();
 await page.getByText('2 个想法 · 1 条连接').waitFor();
 await page.getByLabel('联网联想').check();await page.getByLabel('联网查询词').fill('城市记忆');await page.locator('footer').getByRole('button',{name:'进行联想',exact:true}).click();
 await page.getByText('9 个想法 · 8 条连接').waitFor();
 await page.waitForFunction(()=>window.mapText?.some(t=>t.text==='潮汐书架'));
 const placed=await page.evaluate(()=>window.mapText);
 for(let i=0;i<placed.length;i++)for(const b of placed.slice(i+1)){
  const a=placed[i];assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||Math.abs(a.y-b.y)>=(a.height+b.height)/2,'labels overlap');
 }
 const label=placed.find(t=>t.text==='潮汐书架');
 const canvas=page.locator('.ss-space canvas');
 await canvas.click({button:'right',position:{x:label.x+label.width/2,y:label.y}});
 assert.equal(await page.getByLabel('想法标题').inputValue(),'让图书馆收集一座城市的声音');
 async function labelPosition(title){
  await page.waitForFunction(t=>window.mapText?.some(v=>v.text===t),title);
  return page.evaluate(t=>{const b=window.mapText.find(v=>v.text===t);return {x:b.x+b.width/2,y:b.y};},title);
 }
 const inline=page.getByLabel('就地编辑想法标题');
 await canvas.dblclick({position:await labelPosition('潮汐书架')});
 await inline.fill('取消的名称');await inline.press('Escape');
 await canvas.dblclick({position:await labelPosition('潮汐书架')});
 await inline.fill('潮汐实验室');await inline.press('Enter');
 await labelPosition('潮汐实验室');
 await page.getByRole('button',{name:'撤销',exact:true}).click();
 assert.equal(calls.filter(c=>c==='review').length,0);
 // Select a generated association in addition to its selected source, then undo both together.
 await canvas.click({modifiers:['Shift'],position:await labelPosition('潮汐书架')});
 await page.getByRole('button',{name:'删除选中想法'}).waitFor();
 const batchPrompt=page.waitForEvent('dialog');
 await page.keyboard.press('Delete');
 const promptText=(await batchPrompt).message();
 assert.ok(promptText.includes('潮汐书架')&&promptText.includes('让图书馆收集一座城市的声音'));
 await page.getByText('已删除 2 个想法，可点击撤销恢复').waitFor();
 await page.getByRole('button',{name:'撤销',exact:true}).click();
 await canvas.click({position:await labelPosition('潮汐书架')});
 await page.waitForFunction(()=>document.querySelector('[aria-label="想法标题"]')?.value==='潮汐书架');
 assert.equal(await page.getByLabel('想法标题').inputValue(),'潮汐书架');await page.getByLabel('想法标题').waitFor();await page.getByRole('button',{name:'反馈',exact:true}).click();await page.getByText('可做一周声音采集实验。',{exact:false}).first().waitFor();
 // Start a slow repeat review, then immediately ask about a different star.
 const slowStarted=new Promise(r=>signalStarted=r);delayReview=true;
 await page.getByText('全部换一轮',{exact:true}).click();await slowStarted;
 await page.getByRole('button',{name:'想法',exact:true}).click();
 await page.locator('aside select').first().selectOption({label:'夜航书签'});await page.getByRole('button',{name:'反馈',exact:true}).click();
 await page.getByText('可做一周声音采集实验。',{exact:false}).first().waitFor();
 assert.equal(observedAbort,true);
 await page.getByRole('separator',{name:'调整左侧框体'}).press('ArrowRight');
 await page.waitForFunction(()=>{const c=document.querySelector('canvas'),ctx=c.getContext('2d');const b=ctx.getImageData(0,0,c.width,c.height).data;let stars=0;for(let i=0;i<b.length;i+=4)if(b[i]>70&&++stars>100)return true;return false;});
 await page.screenshot({path:path.join(process.cwd(),'preview.png')});
 const dl=page.waitForEvent('download');await page.getByText('备份全部',{exact:true}).click();const data=JSON.parse(await readFile(await(await dl).path(),'utf8'));
 const s=data.sessions[0];assert.deepEqual(s.reviews.map(r=>r.nodeTitle),['潮汐书架','夜航书签']);assert.equal(s.layout.left,220);assert.equal(s.assets[0].text,'城区的环境声');assert.ok(s.reviews[0].content.appreciation);assert.equal(s.nodes.find(x=>x.title==='潮汐书架').sources[0].read,'page');
 // Start a clean store, import through the file control, reload from disk and compare.
 await page.getByText('已保存',{exact:true}).waitFor();await page.close();
 const fs=await import('node:fs/promises');await fs.rename(path.join(home,'star-sea','galaxies.json'),path.join(home,'old-store.json'));
 const dest=await browser.newPage();dest.on('pageerror',e=>pageErrors.push(e.message));dest.setDefaultTimeout(6000);await dest.goto(origin);await dest.locator('input[accept=".json,.zip"]').setInputFiles({name:'思维星图全库.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await dest.getByText('已保存',{exact:true}).waitFor();await dest.reload();await dest.getByText('9 个想法 · 8 条连接').waitFor();
 const imported=JSON.parse(await readFile(path.join(home,'star-sea','galaxies.json'),'utf8')).state.sessions[0];
 for(const key of ['nodes','edges','views','layout','assets','reviews','camera','appearance','themes','online'])assert.deepEqual(imported[key],s[key],key);
 // Create, edit, link and delete without leaving the idea inspector.
 assert.ok(['blackhole','neutron','star'].includes(s.nodes[0].body));
 assert.ok(s.nodes.slice(3).every(n=>n.body==='planet'));
 assert.equal(await dest.getByLabel('新想法外观').inputValue(),'star');
 await dest.getByLabel('新想法外观').selectOption('text');
 await dest.evaluate(()=>{
  const fill=CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText=function(text,...args){
   if(this.canvas.closest('.ss-space')&&text==='独立实验')window.textPaint={font:this.font,transform:this.getTransform().toJSON()};
   return fill.call(this,text,...args);
  };
 });
 await dest.getByLabel('输入想法').fill('独立实验');await dest.getByRole('button',{name:'独立新想法'}).click();
 await dest.getByLabel('想法外观',{exact:true}).waitFor().catch(async error=>{console.error(await dest.locator('aside').allInnerTexts(),pageErrors);throw error;});
 assert.equal(await dest.getByLabel('想法外观',{exact:true}).inputValue(),'text');
 await dest.getByLabel('字体',{exact:true}).selectOption('kai');
 await dest.getByLabel('文字大小',{exact:true}).press('End');
 await dest.waitForFunction(()=>window.textPaint?.font.includes('72px')&&window.textPaint.font.includes('KaiTi'));
 const textPoint=await dest.evaluate(()=>{const t=window.textPaint.transform,el=document.querySelector('.ss-space canvas'),r=el.getBoundingClientRect();return {x:t.e*r.width/el.width,y:t.f*r.height/el.height};});
 const textCanvas=dest.locator('.ss-space canvas');
 await textCanvas.dblclick({position:textPoint});
 const textEditor=dest.getByLabel('就地编辑想法标题');
 await textEditor.fill('直接改名验证');await textEditor.press('Enter');
 assert.equal(await dest.getByLabel('想法标题').inputValue(),'直接改名验证');
 const beforeX=await dest.getByLabel('X 坐标').inputValue(),bounds=await textCanvas.boundingBox();
 await dest.mouse.move(bounds.x+textPoint.x,bounds.y+textPoint.y);
 await dest.mouse.down();await dest.mouse.move(bounds.x+textPoint.x+20,bounds.y+textPoint.y+5,{steps:4});await dest.mouse.up();
 assert.notEqual(await dest.getByLabel('X 坐标').inputValue(),beforeX);
 await dest.getByText('文字运动',{exact:true}).click();
 assert.equal(await dest.getByLabel('自转',{exact:true}).isChecked(),false);
 await dest.getByLabel('公转轨道').selectOption('circle');
 await dest.getByLabel('公转轨道').selectOption('none');
 await dest.getByRole('button',{name:'恢复此类星体的运动'}).click();
 await dest.getByText('文字运动',{exact:true}).click();
 await dest.getByLabel('文字大小',{exact:true}).press('Home');
 await dest.getByLabel('想法外观',{exact:true}).selectOption('star');
 assert.equal(await dest.getByLabel('星体样式').inputValue(),'star');
 await dest.getByLabel('新想法外观').selectOption('star');
 await dest.getByLabel('想法标题').fill('轨道实验');await dest.getByLabel('想法正文').fill('沿轨道收集声音');
 await dest.getByLabel('连接到',{exact:true}).selectOption({label:'潮汐书架'});
 await dest.getByText('10 个想法 · 9 条连接').waitFor();
 for(const type of ['blackhole','neutron','star','planet','asteroid','comet']){
  await dest.getByLabel('星体样式').selectOption(type);await dest.waitForTimeout(50);
 }
 await dest.getByText('星体运动',{exact:true}).click();
 assert.equal(await dest.getByLabel('公转轨道').inputValue(),'ellipse');
 await dest.getByLabel('公转周期（秒）').fill('41');await dest.getByLabel('公转周期（秒）').press('Enter');
 await dest.getByLabel('反向公转').check();await dest.getByLabel('自转',{exact:true}).uncheck();
 await dest.getByLabel('星体样式').selectOption('star');
 for(const finish of ['flare','giant'])await dest.getByLabel('星体外观').selectOption(finish);
 await dest.getByText('动态特效 · 日珥活动',{exact:true}).click();
 await dest.getByLabel('启用动态特效').uncheck();
 await dest.getByLabel('特效速度倍率').fill('2');await dest.getByLabel('特效速度倍率').press('Enter');
 await dest.getByLabel('星体样式').selectOption('planet');
 for(const finish of ['ocean','desert'])await dest.getByLabel('星体外观').selectOption(finish);
 await dest.getByLabel('星体样式').selectOption('comet');
 await dest.getByLabel('星体大小').press('End');
 await dest.getByRole('button',{name:'属性',exact:true}).click();
 for(const mode of ['bright','dim','pulse'])await dest.getByLabel('背景星光').selectOption(mode);
 await dest.getByText('已保存',{exact:true}).waitFor();
 const edited=JSON.parse(await readFile(path.join(home,'star-sea','galaxies.json'),'utf8')).state.sessions[0];
 const editedNode=edited.nodes.find(n=>n.title==='轨道实验');
 assert.deepEqual(editedNode.motion,{period:41,reverse:true,spin:false});assert.equal(editedNode.size,32);assert.equal(editedNode.body,'comet');assert.equal(editedNode.text,'沿轨道收集声音');assert.equal(edited.appearance.starLight,'pulse');
 assert.ok(edited.edges.some(e=>e.from===editedNode.id&&e.to===s.nodes.find(n=>n.title==='潮汐书架').id));
 await dest.getByRole('button',{name:'想法',exact:true}).click();dest.once('dialog',d=>d.accept());await dest.getByRole('button',{name:'删除想法'}).click();
 await dest.getByText('9 个想法 · 8 条连接').waitFor();
 await dest.getByRole('button',{name:'撤销',exact:true}).click();await dest.getByText('10 个想法 · 9 条连接').waitFor();
 // Deletion removes that star's reviews; undo restores them without another model call.
 await dest.getByRole('button',{name:'反馈',exact:true}).click();
 await dest.getByLabel('点击星点自动点评').uncheck();
 await dest.getByRole('button',{name:'想法',exact:true}).click();
 await dest.getByLabel('选择想法',{exact:true}).selectOption({label:'夜航书签'});
 dest.once('dialog',d=>d.accept());await dest.getByRole('button',{name:'删除想法',exact:true}).click();
 await dest.getByText('9 个想法 · 8 条连接').waitFor();
 await dest.getByText('已保存',{exact:true}).waitFor();
 const savedReviews=async()=>JSON.parse(await readFile(path.join(home,'star-sea','galaxies.json'),'utf8')).state.sessions[0].reviews;
 assert.equal((await savedReviews()).length,1);
 await dest.getByRole('button',{name:'撤销',exact:true}).click();
 await dest.getByText('已保存',{exact:true}).waitFor();
 assert.deepEqual((await savedReviews()).map(r=>r.id).sort(),s.reviews.map(r=>r.id).sort());
 await checkLayout(dest);
 // Keep immersive actions clear of the Windows menu and native window controls.
 for(const width of [1280,1024,640,390]){
  await dest.setViewportSize({width,height:820});
  await dest.evaluate(()=>{document.documentElement.setAttribute('data-windows-titlebar','');document.documentElement.style.setProperty('--dsh-windows-titlebar-height','40px');});
  await dest.getByRole('button',{name:'沉浸展开',exact:true}).click();
  const header=dest.locator('.ss-immersive > header');
  assert.ok((await header.boundingBox()).y>=40);
  for(const name of ['退出沉浸','恢复布局']){
   const button=header.getByRole('button',{name,exact:true});const box=await button.boundingBox();
   assert.ok(box.y>=40&&box.x>=0&&box.x+box.width<=width,name+' at '+width);
   assert.ok(await button.evaluate(el=>el.scrollWidth<=el.clientWidth));
  }
  await dest.evaluate(()=>document.documentElement.setAttribute('data-fullscreen',''));
  assert.equal((await dest.locator('.ss-immersive').boundingBox()).y,0);
  await dest.getByRole('button',{name:'退出沉浸',exact:true}).click();
  await dest.evaluate(()=>{document.documentElement.removeAttribute('data-windows-titlebar');document.documentElement.removeAttribute('data-fullscreen');});
 }
 await dest.setViewportSize({width:1440,height:900});
 // Exercise the downloadable formats, then read a freshly exported PDF and ZIP.
 await dest.getByText('管理与导出',{exact:true}).click();
 let exportedPdf,exportedZip;
 for(const [type,signature] of [['PNG','89504e47'],['PDF','25504446'],['ZIP','504b0304']]){
  const downloading=dest.waitForEvent('download');
  await dest.getByText('导出 '+type,{exact:true}).click();
  const bytes=await readFile(await(await downloading).path());
  assert.equal(bytes.subarray(0,4).toString('hex'),signature);
  if(type==='PDF')exportedPdf=bytes;
  if(type==='ZIP')exportedZip=bytes;
 }
 await dest.getByText('管理与导出',{exact:true}).click();
 await dest.locator('input[type=file][multiple]').setInputFiles({name:'导出图.pdf',mimeType:'application/pdf',buffer:exportedPdf});
 await dest.locator('.ss-materials summary').filter({hasText:'导出图.pdf'}).waitFor();
 const shortPdf=await dest.evaluate(async()=>{const doc=await PDFLib.PDFDocument.create();doc.addPage().drawText('Moon');return Array.from(await doc.save());});
 const shortDocx=await dest.evaluate(async()=>{const z=new JSZip();z.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>潮汐与记忆</w:t></w:r></w:p></w:document>');return Array.from(await z.generateAsync({type:'uint8array'}));});
 await dest.locator('input[type=file][multiple]').setInputFiles([{name:'短文.pdf',mimeType:'application/pdf',buffer:Buffer.from(shortPdf)},{name:'段落.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:Buffer.from(shortDocx)}]);
 await dest.locator('.ss-materials summary').filter({hasText:'短文.pdf'}).click();await dest.locator('pre').filter({hasText:'Moon'}).waitFor();
 await dest.locator('.ss-materials summary').filter({hasText:'段落.docx'}).click();await dest.getByText('[段落 1] 潮汐与记忆',{exact:true}).waitFor();
 const imageBytes=await dest.evaluate(()=>{
  const c=document.createElement('canvas');c.width=30;c.height=20;const ctx=c.getContext('2d');ctx.fillStyle='#21aa48';ctx.fillRect(0,0,30,20);
  const draw=CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage=function(img,...args){if(img instanceof HTMLImageElement&&img.src.startsWith('data:image/')&&this.canvas.closest('.ss-space'))window.materialPainted=true;return draw.call(this,img,...args);};
  return c.toDataURL().split(',')[1];
 });
 await dest.locator('input[type=file][multiple]').setInputFiles({name:'海岸.png',mimeType:'image/png',buffer:Buffer.from(imageBytes,'base64')});
 await dest.waitForFunction(()=>window.materialPainted);
 await dest.locator('input[accept=".json,.zip"]').setInputFiles({name:'迁移.ZIP',mimeType:'application/zip',buffer:exportedZip});
 await dest.getByLabel('星系名称').inputValue();await dest.getByText('潮汐图书馆（导入）',{exact:true}).waitFor();
 // A parent at the coordinate limit cannot accept a new offset child.
 const boundary=structuredClone(s);boundary.id='boundary';boundary.name='坐标边界';
 boundary.nodes=[{...boundary.nodes[0],p:[100000,0,0]}];boundary.edges=[];boundary.reviews=[];boundary.assets=[];boundary.online=false;
 await dest.locator('input[accept=".json,.zip"]').setInputFiles({name:'boundary.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({schema:2,current:boundary.id,sessions:[boundary]}))});
 await dest.getByText('坐标边界',{exact:true}).waitFor();
 await dest.getByLabel('输入想法').fill('边界处的草稿');await dest.locator('footer').getByRole('button',{name:'进行联想',exact:true}).click();
 await dest.getByText('想法内容或位置无效',{exact:true}).waitFor();
 assert.equal(await dest.getByLabel('输入想法').inputValue(),'边界处的草稿');
 await dest.locator('input[type=file][multiple]').setInputFiles([
  {name:'一.txt',mimeType:'text/plain',buffer:Buffer.from('a'.repeat(25000))},
  {name:'二.txt',mimeType:'text/plain',buffer:Buffer.from('b'.repeat(25000))}
 ]);
 await dest.locator('.ss-materials summary').filter({hasText:'二.txt'}).waitFor();await dest.locator('footer').getByRole('button',{name:'进行联想',exact:true}).click();
 await dest.getByText('组合素材超过40000字，请拆分或移除部分素材后重试').waitFor();
 assert.equal(await dest.getByLabel('输入想法').inputValue(),'边界处的草稿');
 await dest.getByText('3 个想法 · 2 条连接').waitFor();
 assert.deepEqual(calls,['search','generate','review','review','review']);console.log('PASS: sidebar page, text attachment, online associations, persona response, resize, whole-library backup and restore in empty store.');
 await dest.getByRole('button',{name:'+ 新建',exact:true}).click();
 await dest.bringToFront();await dest.getByRole('button',{name:'发散',exact:true}).click();
 assert.equal(await dest.getByLabel('自动发散彗星').isChecked(),false);
 for(const label of ['停留间隔（秒）','彗星寿命（秒）']){
  await dest.getByLabel(label).fill('5');await dest.getByLabel(label).press('Enter');
 }
 await dest.getByLabel('自动发散彗星').check();
 await dest.getByRole('button',{name:'坐标边界',exact:true}).click();
 await dest.waitForTimeout(5700);assert.equal(calls.filter(c=>c==='drift').length,0);
 await dest.getByRole('button',{name:'未命名星系',exact:true}).click();
 await dest.getByText('2 个想法 · 0 条连接').waitFor({timeout:12000});
 await dest.getByLabel('自动发散彗星').uncheck();
 await dest.getByText('1 个想法 · 0 条连接').waitFor({timeout:9000});
 assert.equal(calls.filter(c=>c==='drift').length,1);
 await dest.getByLabel('自动发散彗星').check();
 await dest.getByText('2 个想法 · 0 条连接').waitFor({timeout:10000});await dest.getByLabel('自动发散彗星').uncheck();
 await dest.getByRole('button',{name:'想法',exact:true}).click();
 const localComet=dest.locator('aside select').first().locator('option').filter({hasText:'借问'});await dest.locator('aside select').first().selectOption(await localComet.getAttribute('value'));
 await dest.getByText('保留为永久想法',{exact:true}).click();
 await dest.waitForTimeout(6100);await dest.reload();
 await dest.getByText('2 个想法 · 0 条连接').waitFor();
 assert.deepEqual(pageErrors,[]);console.log('PASS: motion editing, active dwell, generated comet expiry and permanent retention across reload.');
 // Saving a draft clears the composer but leaves the new node ready for associations.
 await dest.getByRole('button',{name:'+ 新建',exact:true}).click();
 const generateDraft=dest.locator('footer').getByRole('button',{name:'进行联想',exact:true});
 assert.equal(await generateDraft.isDisabled(),true);
 await dest.getByLabel('输入想法').fill('独立分支');
 await dest.getByRole('button',{name:'独立新想法',exact:true}).click();
 await dest.locator('footer').getByRole('button',{name:'进行联想',exact:true}).click();
 await dest.getByText('8 个想法 · 6 条连接',{exact:true}).waitFor();
 // Click a different star while another node is selected and there is an unsent draft.
 await dest.getByRole('button',{name:'+ 新建',exact:true}).click();
 await dest.getByLabel('输入想法').fill('之前选中的想法');
 await dest.getByRole('button',{name:'独立新想法',exact:true}).click();
 await dest.getByLabel('输入想法').fill('保留在输入区的草稿');
 const auto=dest.getByLabel('点击星点即联想');
 assert.equal(await auto.isChecked(),false);await auto.check();
 const map=dest.locator('.ss-space canvas'),rect=await map.boundingBox();
 await map.click({position:{x:rect.width/2,y:rect.height/2}});
 await dest.getByText('8 个想法 · 6 条连接',{exact:true}).waitFor();
 assert.equal(await dest.getByLabel('输入想法').inputValue(),'保留在输入区的草稿');
 await dest.getByText('已保存',{exact:true}).waitFor();
 const afterClick=JSON.parse(await readFile(path.join(home,'star-sea','galaxies.json'),'utf8')).state;
 const clicked=afterClick.sessions.find(s=>s.id===afterClick.current);
 assert.ok(clicked.edges.every(e=>e.from===clicked.nodes.find(n=>n.kind==='theme').id));
 assert.equal(clicked.clickAssociations,true);
 const theme=clicked.nodes.find(n=>n.kind==='theme');
 const manual=clicked.nodes.find(n=>n.title==='之前选中的想法');
 assert.equal(manual.motion.orbit,'circle');
 assert.equal(manual.motion.centerNodeId,theme.id);
 for(const n of clicked.nodes.filter(n=>n.generated))assert.equal(n.motion.centerNodeId,theme.id);
 assert.deepEqual(pageErrors,[]);
 console.log('PASS: associations from a saved idea and a single map click on a different idea.');
 await auto.uncheck();
 await dest.getByText('星体运动',{exact:true}).click();
 await dest.getByLabel('公转轨道').selectOption('circle');
 await dest.getByLabel('公转中心').selectOption('fixed');
 for(const axis of ['X','Y','Z']){
  const input=dest.getByLabel('中心 '+axis,{exact:true});await input.fill('0');await input.press('Enter');
 }
 const box=await map.boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height/2;
 await dest.mouse.move(cx,cy);await dest.mouse.down();await dest.mouse.move(cx+44,cy+18,{steps:8});await dest.mouse.up();
 await dest.waitForFunction(()=>Number(document.querySelector('input[aria-label="中心 X"]')?.value||[...document.querySelectorAll('label')].find(l=>l.innerText.trim()==='中心 X')?.querySelector('input')?.value)>20);
 await dest.getByText('已保存',{exact:true}).waitFor();await dest.reload();
 await dest.getByLabel('选择想法').selectOption(clicked.nodes.find(n=>n.kind==='theme').id);
 await dest.getByText('星体运动',{exact:true}).click();
 assert.ok(Number(await dest.getByLabel('中心 X',{exact:true}).inputValue())>20);
 await dest.getByLabel('公转中心').selectOption('auto');
 assert.equal(await dest.getByLabel('中心 X',{exact:true}).count(),0);
 assert.deepEqual(pageErrors,[]);
 console.log('PASS: orbit center XYZ, map drag, reload and automatic center.');
 await dest.getByRole('button',{name:'+ 新建',exact:true}).click();
 await dest.getByLabel('最少条数',{exact:true}).fill('1');await dest.getByLabel('最少条数',{exact:true}).press('Enter');
 await dest.getByLabel('最多条数',{exact:true}).fill('1');await dest.getByLabel('最多条数',{exact:true}).press('Enter');
 await dest.getByLabel('输入想法').fill('只要一条的想法');
 await dest.locator('footer').getByRole('button',{name:'进行联想',exact:true}).click();
 await dest.getByText('3 个想法 · 2 条连接',{exact:true}).waitFor();
 await dest.getByText('已保存',{exact:true}).waitFor();await dest.reload();
 assert.equal(await dest.getByLabel('最少条数',{exact:true}).inputValue(),'1');
 assert.equal(await dest.getByLabel('最多条数',{exact:true}).inputValue(),'1');
 console.log('PASS: editable association counts persist and generate one idea.');
}finally{await browser.close();serve.close();}
