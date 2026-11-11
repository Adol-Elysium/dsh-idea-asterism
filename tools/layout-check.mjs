import assert from 'node:assert/strict';

export async function checkLayout(page){
 const issues=[];
 const cases=[[1440,900,1440],[1024,600,1024],[960,540,745],[640,480,640],[390,600,390],[1280,720,420],[1366,420,1180],[800,450,775]];
 for(const [width,height,slot] of cases){
  await page.setViewportSize({width,height});
  await page.locator('#app').evaluate((el,w)=>el.style.width=w+'px',slot);
  const root=page.locator('.ss-root');
  await root.evaluate(el=>{
   el.style.setProperty('--ss-left','420px');el.style.setProperty('--ss-right','600px');
   el.style.setProperty('--ss-bottom','480px');
  });
  const context=width+'×'+height+' slot='+slot;
  await root.locator('.ss-work').evaluate(el=>el.scrollTop=0);
  await page.waitForFunction(()=>{
   const c=document.querySelector('.ss-space canvas'),pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
   let bright=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>85&&++bright>=60)return true;
   return false;
  });
  if(process.env.STAR_SEA_AUDIT_IMAGES&&[420,1440].includes(slot)){
   await page.screenshot({path:process.env.STAR_SEA_AUDIT_IMAGES+'/audit-'+slot+'.png'});
  }
  const geometry=await root.evaluate(el=>{
   const problems=[],bounds=e=>e.getBoundingClientRect(),rect=s=>bounds(el.querySelector(s));
   const left=rect('.ss-library'),right=rect('.ss-inspector'),main=rect('.ss-center'),outer=bounds(el);
   for(const [name,r] of [['列表',left],['编辑器',right],['星图',main]]){
    if(r.left<outer.left-1||r.right>outer.right+1)problems.push(name+' 超出插件边界');
   }
   const intersects=(a,b)=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;
   if(intersects(rect('.ss-map-controls'),rect('.ss-map-hint')))problems.push('视角按钮遮挡星体计数');
   if(intersects(rect('.ss-map-controls'),rect('.ss-map-help')))problems.push('视角按钮遮挡操作提示');
   if(rect('canvas').height<75)problems.push('星图画布高度不足');
   for(const panel of el.querySelectorAll('.ss-library,.ss-inspector,footer,.ss-tabs,.ss-toolbar')){
    if(panel.scrollWidth>panel.clientWidth+2)problems.push(panel.className+' 内容横向溢出');
   }
   for(const b of el.querySelectorAll('.ss-tabs button'))if(b.scrollWidth>b.clientWidth+1)problems.push('标签文字被裁切 '+b.textContent);
   return problems;
  });
  issues.push(...geometry.map(x=>context+' '+x));
  await page.getByText('管理与导出',{exact:true}).click();
  for(const text of ['复制星系','归档','移入回收站','导出 JSON','导出 MD','导出 PNG','导出 PDF','导出 ZIP']){
   const button=page.getByRole('button',{name:text,exact:true});await button.scrollIntoViewIfNeeded();
   const usable=await button.evaluate(b=>{
    const r=b.getBoundingClientRect();return [.12,.5,.88].every(f=>b.contains(document.elementFromPoint(r.left+r.width*f,r.top+r.height*.5)));
   });if(!usable)issues.push(context+' 导出菜单被遮挡 '+text);
  }
  await page.getByText('管理与导出',{exact:true}).click();
  await page.getByLabel('输入想法').click({trial:true});
  for(const name of ['想法','反馈','属性','发散']){
   await page.getByRole('button',{name,exact:true}).click();
   if(await page.locator('.ss-inspector').evaluate(el=>el.scrollWidth>el.clientWidth+2))issues.push(context+' '+name+'面板横向溢出');
  }
  await page.getByRole('button',{name:'想法',exact:true}).click();
 }
 await page.locator('#app').evaluate(el=>el.style.removeProperty('width'));
 await page.setViewportSize({width:1440,height:900});
 assert.deepEqual(issues,[],issues.join('\n'));
 console.log('PASS: layout, menu hit targets, maximum panels at eight viewport/container sizes.');
}
