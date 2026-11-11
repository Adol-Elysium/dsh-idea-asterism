import {createStore} from './store.js';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {drift,generate,review,personas,research,PublicError} from './ai.js';
export {extractPersona,parseIdeas} from './ai.js';
export const name='dsh-idea-asterism';
export const discover=ctx=>personas(ctx);
const assets=new Set(['pdf.min.mjs','pdf.worker.min.mjs','jszip.min.js','pdf-lib.min.js',...['planet','star','asteroid','neutron','blackhole','emission'].map(type=>'body-'+type+'.webp')]);
const detailedBodies=['blackhole','vortex','star','giant','flare','neutron','magnetar','planet','ocean','desert','asteroid'];
for(const body of detailedBodies){
 assets.add('body-'+body+'.webp');
 for(let i=0;i<16;i++)assets.add('near-'+body+'-'+i+'.webp');
}
export function apply(ctx){
 const storage=createStore(join(process.env.DSH_HOME?.trim()||join(homedir(),'.dsh'),'star-sea'));
 ctx.inject(['webServer','connection'],scope=>{
  const active=new Set();let jobs=0;
  scope.effect(()=>()=>{for(const c of active)c.abort();},'dsh-idea-asterism: abort jobs');
  scope.effect(()=>scope.webServer.register({kind:'prefix',path:'/dsh-idea-asterism',handler:async(req,res)=>{
   const json=(status,body)=>{if(!res.destroyed&&!res.writableEnded){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(body));}};
   let controller,isJob=false;
   try{
    const gate=scope.get('connection');if(typeof gate?.requestRejection!=='function'||gate.requestRejection(req)!==undefined)return json(403,{ok:false,error:'连接未经授权'});
    const path=new URL(req.url,'http://local').pathname;
    if(req.method==='GET'&&path.startsWith('/dsh-idea-asterism/assets/')){const file=path.slice('/dsh-idea-asterism/assets/'.length);if(!assets.has(file))return json(404,{ok:false,error:'资源不存在'});const bytes=await readFile(join(fileURLToPath(new URL('./assets/',import.meta.url)),file));res.writeHead(200,{'content-type':file.endsWith('.webp')?'image/webp':'text/javascript; charset=utf-8','x-content-type-options':'nosniff','cache-control':'private, max-age=3600'});res.end(bytes);return;}
    if(req.method!=='POST')return json(405,{ok:false,error:'仅支持 POST'});
    if(req.headers['x-idea-asterism-request']!=='1'||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return json(403,{ok:false,error:'请求格式未经授权'});
    let size=0;const chunks=[];for await(const b of req){size+=b.length;if(size>65_000_000)throw new PublicError('请求超过64MB限制');chunks.push(Buffer.from(b));}
    let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{throw new PublicError('JSON 格式错误');}if(!input||typeof input!=='object'||Array.isArray(input))throw new PublicError('请求格式错误');
    if(!path.startsWith('/dsh-idea-asterism/api/'))return json(404,{ok:false,error:'未知接口'});
    const method=path.slice('/dsh-idea-asterism/api/'.length);let value;
    if(method==='load')value=await storage.load();
    else if(method==='save'){try{value=await storage.save(input.state,input.revision);}catch(e){throw new PublicError(e.message);}}
    else if(method==='status'){const m=scope.get('agentDefaultModel')?.currentSelection?.();let roster=[],personaError;try{roster=await personas(scope);}catch{personaError='当前 DSH 的人格服务未就绪或接口已变化，请检查预设后刷新名单';}value={personas:roster,personaError,model:m?.model||null,provider:m?.provider||null,webServicePresent:!!scope.get('web'),imagesSupported:null};if(m?.provider&&m?.model){try{const info=await scope.get('llm')?.resolveModelInfo(m.provider,m.model);value.imagesSupported=info?.inputModalities?.includes('image')??null;}catch{}}}
    else if(['generate','review','research','drift'].includes(method)){
     if(jobs>=3)throw new PublicError('已有三个生成任务，请稍后重试');jobs++;isJob=true;controller=new AbortController();active.add(controller);res.once('close',()=>controller.abort());const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(180000)]);
     value=await(method==='drift'?drift(scope,input,signal):method==='generate'?generate(scope,input,signal):method==='review'?review(scope,input,signal):research(scope,input.query,signal));
    }else return json(404,{ok:false,error:'未知接口'});
    json(200,{ok:true,value});
   }catch(e){json(400,{ok:false,error:e instanceof PublicError?e.message:'服务请求失败；原有存档未被覆盖，请检查 DSH 状态'});}
   finally{if(isJob)jobs--;if(controller)active.delete(controller);}
  }}),'dsh-idea-asterism: HTTP');
 });
}
