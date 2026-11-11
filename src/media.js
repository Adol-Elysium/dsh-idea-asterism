const assetURL=name=>new URL('dsh-idea-asterism/assets/'+name,new URL('.',document.baseURI)).href;
const libs={};
function script(name,global){if(window[global])return Promise.resolve(window[global]);return libs[name]||(libs[name]=new Promise((resolve,reject)=>{const el=document.createElement('script');el.src=assetURL(name);el.onload=()=>resolve(window[global]);el.onerror=()=>{delete libs[name];reject(Error('素材解析组件加载失败'));};document.head.append(el);}));}
const readData=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});
function readZipText(entry,limit,message){
 if(!entry||entry._data?.uncompressedSize>limit)return Promise.reject(Error(message));
 return new Promise((resolve,reject)=>{
  let chunks=[],bytes=0,settled=false;
  const stream=entry.internalStream('uint8array');
  function fail(error){
   if(settled)return;
   settled=true;stream.pause();chunks=[];reject(error);
  }
  stream.on('data',chunk=>{
   if(settled)return;
   bytes+=chunk.byteLength;
   if(bytes>limit){fail(Error(message));return;}
   chunks.push(chunk);
  });
  stream.on('error',fail);
  stream.on('end',()=>{
   if(settled)return;
   settled=true;
   try{
    const result=new Uint8Array(bytes);let offset=0;
    for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.byteLength;}
    chunks=[];resolve(new TextDecoder().decode(result));
   }catch(error){chunks=[];reject(error);}
  });
  stream.resume();
 });
}
async function imagePreview(url){const img=new Image();img.src=url;await img.decode();const c=document.createElement('canvas'),scale=Math.min(1,1400/Math.max(img.width,img.height));c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.86);}
async function parseFile(file){
 if(file.size>8*1024*1024)throw Error(file.name+' 超过8MB，请拆分后导入');
 const item={id:C.uid(),name:file.name.slice(0,200),type:file.type,bytes:file.size,text:'',note:'',createdAt:new Date().toISOString()};
 if(/^image\/(png|jpeg|webp|gif)$/.test(file.type)){item.image=await imagePreview(await readData(file));item.data=await readData(file);item.note='图片已在本机缩至最长1400像素；生成时将发送给视觉模型';return item;}
 const ext=file.name.split('.').pop().toLowerCase();
 if(['txt','md','csv'].includes(ext)){item.text=await file.text();item.note='已读取文本';}
 else if(ext==='docx'){
  const JSZip=await script('jszip.min.js','JSZip'),zip=await JSZip.loadAsync(await file.arrayBuffer());const entry=zip.file('word/document.xml');if(!entry)throw Error('不是有效的 DOCX 文档');const xml=await readZipText(entry,10_000_000,'DOCX 解压后过大');if(xml.length>10_000_000)throw Error('DOCX 内容过大');const doc=new DOMParser().parseFromString(xml,'text/xml');if(doc.querySelector('parsererror'))throw Error('文档 XML 解析失败');item.text=Array.from(doc.getElementsByTagNameNS('*','p')).map((p,i)=>'[段落 '+(i+1)+'] '+Array.from(p.getElementsByTagNameNS('*','t')).map(t=>t.textContent).join('')).join('\n');item.note='已提取正文段落；图片、批注和页眉未读取';
 }else if(ext==='pdf'){
  const pdfjs=await import(assetURL('pdf.min.mjs'));pdfjs.GlobalWorkerOptions.workerSrc=assetURL('pdf.worker.min.mjs');const doc=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useSystemFonts:true}).promise;
  try{const count=Math.min(doc.numPages,60);const pages=[];for(let i=1;i<=count;i++){const page=await doc.getPage(i);const content=await page.getTextContent();pages.push('[第 '+i+' 页]\n'+content.items.map(x=>x.str||'').join(' '));}item.text=pages.join('\n\n');item.note='已读取 '+count+'/'+doc.numPages+' 页；页内图表未自动解读';if(item.text.replace(/\[第 \d+ 页\]/g,'').trim().length===0){const page=await doc.getPage(1),unit=page.getViewport({scale:1}),v=page.getViewport({scale:Math.min(1.5,1400/Math.max(1,unit.width,unit.height))}),canvas=document.createElement('canvas');canvas.width=v.width;canvas.height=v.height;await page.render({canvasContext:canvas.getContext('2d'),viewport:v}).promise;item.image=await imagePreview(canvas.toDataURL());item.note='扫描型PDF：仅第1页已转为图片，需视觉模型读取；其他页尚未解析';item.text='';}}finally{await doc.destroy();}
 }else throw Error('支持 PNG/JPEG/WebP/GIF、PDF、DOCX、TXT、Markdown');
 if(item.text.length>39000){item.text=item.text.slice(0,39000);item.note+='；仅保留前39000字，内容已截断';}
 item.data=await readData(file);return item;
}
function download(name,body,type){const url=URL.createObjectURL(body instanceof Blob?body:new Blob([body],{type}));const a=document.createElement('a');a.href=url;a.download=name.replace(/[\\/:*?"<>|]/g,'_');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function pdfExport(s,mapCanvas){
 const PDFLib=await script('pdf-lib.min.js','PDFLib');const doc=await PDFLib.PDFDocument.create();
 if(mapCanvas){const img=await doc.embedPng(mapCanvas.toDataURL('image/png'));const p=doc.addPage([842,595]);const scale=Math.min(802/img.width,555/img.height);p.drawImage(img,{x:20,y:(595-img.height*scale)/2,width:img.width*scale,height:img.height*scale});}
 const text=C.markdown(s);const canvas=document.createElement('canvas');canvas.width=1240;canvas.height=1754;const ctx=canvas.getContext('2d');const lines=[];ctx.font='24px "Microsoft YaHei",sans-serif';for(const para of text.split('\n')){let line='';for(const ch of para){if(ctx.measureText(line+ch).width>1080){lines.push(line);line='';}line+=ch;}lines.push(line);}
 for(let offset=0;offset<lines.length;offset+=43){ctx.fillStyle='#fff';ctx.fillRect(0,0,1240,1754);ctx.fillStyle='#152330';ctx.font='24px "Microsoft YaHei",sans-serif';lines.slice(offset,offset+43).forEach((l,i)=>ctx.fillText(l,80,100+i*36));ctx.font='18px sans-serif';ctx.fillText(String(Math.floor(offset/43)+1),600,1690);const img=await doc.embedPng(canvas.toDataURL());const page=doc.addPage([595,842]);page.drawImage(img,{x:0,y:0,width:595,height:842});}
 download(s.name+'.pdf',await doc.save(),'application/pdf');
}
function safeLink(url){try{const u=new URL(url);return['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}}
function richText(text){return String(text).split('\n').map((line,i)=>h('div',{key:i},line.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).map((part,j)=>part.startsWith('**')?h('strong',{key:j},part.slice(2,-2)):part.startsWith('*')?h('em',{key:j},part.slice(1,-1)):part.startsWith('`')?h('code',{key:j},part.slice(1,-1)):part),line?'':h('br')));}
