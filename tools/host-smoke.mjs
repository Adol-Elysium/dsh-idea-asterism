import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_ENTRY);
const base=process.env.DSH_INSTALL||'D:/DeepseekH';
const child=spawn(resolve(base,'DeepSeek Harness.exe'),['--expose-internals',resolve(base,'resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js'),'--profile',process.env.STAR_SEA_TEST_PROFILE||'star-sea-check','--no-open','--host','127.0.0.1','--port','0'],{windowsHide:true,env:{...process.env,ELECTRON_RUN_AS_NODE:'1',DSH_HOME:resolve('tools/.test-profile')}});
let browser;const errors=[];
try{
 const url=await new Promise((ok,fail)=>{const timer=setTimeout(()=>fail(Error('Test host launch timeout')),15000);const match=d=>{const link=String(d).match(/http:\/\/127\.0\.0\.1:[^\s]+/);if(link){clearTimeout(timer);ok(link[0]);}};child.stdout.on('data',match);child.stderr.on('data',match);child.once('exit',()=>{clearTimeout(timer);fail(Error('Test host exited'));});});
 browser=await chromium.launch({executablePath:process.env.EDGE_PATH});
 const page=await browser.newPage({viewport:{width:1440,height:950}});page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/dsh-idea-asterism/api/'))console.log(new URL(r.url()).pathname,r.status())});await page.goto(url);
 // Compare the new route with the existing isolated profile before editing the map.
 const prior=await readFile(resolve('tools/.test-profile/star-sea/galaxies.json'),'utf8').catch(e=>{
  if(e.code!=='ENOENT')throw e;
 });
 if(prior){
  const expected=JSON.parse(prior);
  const result=await page.evaluate(async()=>{
   const response=await fetch(new URL('dsh-idea-asterism/api/load',document.baseURI),{method:'POST',
    headers:{'content-type':'application/json','x-idea-asterism-request':'1'},body:'{}'});
   return response.json();
  });
  assert.equal(result.ok,true);
  assert.deepEqual(result.value.state,expected.state);
 }
 const entry=page.getByRole('button',{name:/思维星图/}).or(page.getByTitle('思维星图')).or(page.getByText('思维星图',{exact:true})).first();
 try{await page.getByText('继续',{exact:true}).click({timeout:2200}).catch(()=>{});await page.getByRole('button',{name:'关闭',exact:true}).click({timeout:2500}).catch(()=>{});await entry.click();}catch(e){console.log(String(e).slice(0,600));console.log((await page.locator('body').innerText()).slice(0,500));console.log(await page.locator('button').evaluateAll(bs=>bs.slice(0,25).map(b=>[b.title,b.getAttribute('aria-label')])));throw Error('Cannot open sidebar entry');}
 await page.getByRole('button',{name:'+ 新建',exact:true}).click();await page.getByLabel('输入想法').fill('隔离宿主验证');await page.getByText('独立新想法',{exact:true}).click();await page.getByLabel('想法标题').fill('实机编辑验证');
 await page.getByLabel('星体样式').selectOption('comet');
 await page.evaluate(async()=>{
  for(const body of ['star','neutron','planet','asteroid','blackhole','emission']){
   const url=new URL('dsh-idea-asterism/assets/body-'+body+'.webp',new URL('.',document.baseURI));
   const response=await fetch(url);
   if(!response.ok||response.headers.get('content-type')!=='image/webp')throw Error('Material unavailable: '+body);
   const bitmap=await createImageBitmap(await response.blob());
   if(bitmap.width!==(body==='emission'?512:1280))throw Error('Material dimensions: '+body);
   bitmap.close();
  }
 });
 await page.getByText('星体运动',{exact:true}).click();
 if(await page.getByLabel('公转轨道').inputValue()!=='ellipse')throw Error('Missing comet orbit');
 await page.getByLabel('公转周期（秒）').fill('48');await page.getByLabel('公转周期（秒）').press('Enter');
 await page.getByRole('button',{name:'发散',exact:true}).click();
 if(await page.getByLabel('停留间隔（秒）').inputValue()!=='180')throw Error('Missing dwell settings');
 await page.getByRole('button',{name:'想法',exact:true}).click();
 await page.getByLabel('连接到',{exact:true}).selectOption({label:'灵感'});
 await page.getByText('2 个想法 · 1 条连接').waitFor();
 const titleInput=page.getByLabel('想法标题');await titleInput.fill('实机编辑验证字');await titleInput.press('End');await titleInput.press('ArrowLeft');await titleInput.press('Delete');
 if(await titleInput.inputValue()!=='实机编辑验证')throw Error('Delete did not edit text');
 const map=page.locator('.ss-space canvas');await map.focus();
 const cancel=page.waitForEvent('dialog').then(async d=>{const msg=d.message();await d.dismiss();return msg;});
 await page.keyboard.press('Delete');if(!(await cancel).includes('实机编辑验证'))throw Error('Missing target in delete confirmation');
 await page.getByText('2 个想法 · 1 条连接').waitFor();
 page.once('dialog',d=>d.accept());await page.keyboard.press('Delete');await page.getByText('1 个想法 · 0 条连接').waitFor();
 await page.getByRole('button',{name:'撤销',exact:true}).click();await page.getByText('2 个想法 · 1 条连接').waitFor();
 await page.getByText('已保存',{exact:true}).waitFor();await page.setViewportSize({width:850,height:620});
 await page.getByText('管理与导出',{exact:true}).click();
 await page.getByRole('button',{name:'导出 ZIP',exact:true}).click({trial:true});
 await page.getByText('管理与导出',{exact:true}).click();
 await page.getByRole('button',{name:'沉浸展开',exact:true}).click();
 await page.getByRole('button',{name:'退出沉浸',exact:true}).click();
 if(errors.length)throw Error(errors.join(' | '));
 await page.getByRole('button',{name:'发散',exact:true}).click();
 await page.getByRole('button',{name:'投放一颗本地彗星'}).click();
 await page.getByText('3 个想法 · 1 条连接').waitFor();
 await page.locator('input[type=file][multiple]').setInputFiles({name:'参考笔记.txt',mimeType:'text/plain',buffer:Buffer.from('实机素材验证')});
 await page.getByText('4 个想法 · 2 条连接').waitFor();
 console.log('PASS: actual DSH sidebar, authenticated plugin, editable star map and local persistence.');
}finally{await browser?.close();child.kill();}
