function NumericField({label,value,min,max,step=1,change}){
 const [draft,setDraft]=R.useState(String(value));
 R.useEffect(()=>setDraft(String(value)),[value]);
 function apply(){
  const n=Number(draft);
  if(!draft.trim()||!Number.isFinite(n)){setDraft(String(value));return;}
  const result=Math.max(min,Math.min(max,Math.round(n/step)*step));
  const rounded=Number(result.toFixed(2));
  setDraft(String(rounded));if(rounded!==value)change(rounded);
 }
 return field(label,h('input',{type:'number',min,max,step,value:draft,onChange:e=>setDraft(e.target.value),
  onBlur:apply,onKeyDown:e=>{if(e.key==='Enter')e.currentTarget.blur();}}));
}
function MotionPanel({node,change}){
 const m=C.motionOf(node);
 const edit=(key,value)=>change({...node.motion,[key]:value});
 const numeric=(label,key,min,max,step=1)=>h(NumericField,{label,value:m[key],min,max,step,change:v=>edit(key,v)});
 const toggle=(label,key)=>field(label,h('input',{type:'checkbox',checked:m[key],onChange:e=>edit(key,e.target.checked)}));
 return h('details',null,h('summary',null,node.display==='text'?'文字运动':'星体运动'),toggle('自转','spin'),
  m.spin&&h(R.Fragment,null,numeric('自转周期（秒）','spinPeriod',1,600),toggle('反向自转','spinReverse')),
  field('公转轨道',options(m.orbit,[['none','无公转'],['circle','圆形'],['ellipse','椭圆']],v=>edit('orbit',v))),
  m.orbit!=='none'&&h(R.Fragment,null,numeric('公转周期（秒）','period',2,1200),toggle('反向公转','reverse'),
   numeric('轨道半径倍率','radius',.1,4,.01),numeric('轨道倾角（度）','tilt',-90,90),
   m.orbit==='ellipse'&&numeric('短轴 / 长轴','ratio',.05,1,.01),toggle('显示轨道线','trail')),
  btn('恢复此类星体的运动',()=>change(undefined)));
}
function localDriftIdea(s){
     const prompts=[['候鸟迁徙','让一次迁移决定它何时出现'],['潮汐窗口','把使用机会安排在一个短暂的周期里'],['剧场换景','允许参与者在中途交换角色'],['发酵时间','把等待本身设计成一个有价值的步骤'],['织物经纬','把两个互不相干的线索交叉编排'],['接力游戏','让每位参与者只能修改前一个人留下的一小部分']];
     const available=prompts.filter(([name])=>!s.nodes.some(n=>n.title==='借问'+name));
     const choices=available.length?available:prompts;
     const [name,question]=choices[Math.floor(Math.random()*choices.length)];
     return {title:available.length?'借问'+name:'借问'+name+' · '+Date.now().toString(36),text:'如果围绕「'+s.themes[0]+'」'+question+'，会出现什么新的可能？',reason:'本地跨领域发散提示 · '+name};
}
function addComet(target,idea,mutate){
    const origin=C.cometAnchor(target.nodes)?.p||[0,0,0];
    const angle=Math.random()*Math.PI*2,radius=160+Math.random()*95;
    const offset=[radius*Math.cos(angle),radius*Math.sin(angle),0];
    const p=origin.map((v,i)=>Math.max(-100000,Math.min(100000,v+offset[i])));
    return mutate(target.id,d=>d.nodes.push({id:C.uid(),kind:'idea',body:'comet',size:7,format:'plain',generated:true,arrivedAt:Date.now(),p,
     title:idea.title,text:idea.text,reason:idea.reason}));
}
function DriftPanel({session,update,progress,onLocal}){
 const d={...C.driftDefaults(),...session.drift};
 const set=(key,value)=>update(s=>{s.drift={...C.driftDefaults(),...s.drift,[key]:value};});
 return h(R.Fragment,null,h('h3',null,'发散彗星'),
  field('自动发散彗星',h('input',{type:'checkbox',checked:d.enabled,onChange:e=>set('enabled',e.target.checked)})),
  btn('投放一颗本地彗星',onLocal,session.archived||session.deleted||session.nodes.length>=C.LIMITS.nodes||session.nodes.filter(n=>n.arrivedAt!=null).length>=4),
  h('small',null,'本地投放立即生效，不使用模型额度。'),
  h('p',{role:'status'},d.enabled?(progress||'正在启动计时'):'自动发散已关闭'),h('small',null,'在本星系可见时停留足够久后，每轮用 DSH 模型生成一颗彗星，可能消耗额度。只发送主题词。模型不可用时会标注并使用本地发散提示；重新开启可重试模型。'),
  h(NumericField,{label:'停留间隔（秒）',value:d.interval,min:5,max:86400,change:v=>set('interval',v)}),
  h(NumericField,{label:'彗星寿命（秒）',value:d.lifetime,min:5,max:86400,change:v=>set('lifetime',v)}),
  h('small',null,'切走后重新计时。寿命从出现时算起，调整后也适用于已有的临时彗星。选中喜欢的彗星，可以将它永久保留。'));
}
function pruneLibrary(state,now=Date.now()){
 const sessions=state.sessions.map(s=>C.expireComets(s,now));
 return sessions.some((s,i)=>s!==state.sessions[i])?{...state,sessions}:state;
}
function useComets({session,current,canvas,blocked,requests,mutate,commit,setMessage,setProgress}){
 const sid=session?.id,enabled=!!session?.drift?.enabled&&!session.archived&&!session.deleted;
 R.useEffect(()=>{
  function prune(){
   if(!current.current)return;
   const next=pruneLibrary(current.current);if(next!==current.current)commit(next);
  }
  const timer=setInterval(prune,1000);document.addEventListener('visibilitychange',prune);
  return ()=>{clearInterval(timer);document.removeEventListener('visibilitychange',prune);};
 },[]);
 R.useEffect(()=>{
  if(!enabled)return;
  let since=performance.now(),job=null,disposed=false,localOnly=false;setProgress('正在计时');
  function visible(){return document.visibilityState==='visible'&&canvas.current?.isConnected&&canvas.current.getClientRects().length>0;}
  function active(){
   const state=current.current;
   if(disposed||state?.current!==sid||!visible()||blocked.current)return;
   const s=state.sessions.find(x=>x.id===sid);
   if(s?.drift?.enabled&&!s.deleted&&!s.archived)return s;
  }
  function restart(){since=performance.now();if(!visible())job?.abort();}
  async function tick(){
   const s=active();
   if(!s){restart();return;}
   if(job)return;
   if(requests.current.size){setProgress('等待当前联想或点评完成');return;}
   if(s.nodes.length>=C.LIMITS.nodes||s.nodes.filter(n=>n.arrivedAt!=null).length>=4){setProgress('已达到星点或临时彗星上限');return;}
   const remaining=Math.ceil(s.drift.interval-(performance.now()-since)/1000);
   if(remaining>0){setProgress((localOnly?'本地发散 · ':'')+remaining+' 秒后生成');return;}
   const controller=new AbortController();job=controller;requests.current.add(controller);
   try{
    setProgress('正在生成发散彗星…');
    let idea;
    if(!localOnly){
     try{idea=await api('drift',{themes:s.themes},controller.signal);}
     catch(e){if(controller.signal.aborted)return;localOnly=true;setMessage('模型发散未完成，已切换本地提示：'+e.message);}
    }
    if(controller.signal.aborted)return;
    if(!idea||s.nodes.some(n=>C.textKey(n.title)===C.textKey(idea.title))){
     idea=localDriftIdea(s);
    }
    const target=active();
    if(controller.signal.aborted||!target||JSON.stringify(target.themes)!==JSON.stringify(s.themes)||
     target.nodes.length>=C.LIMITS.nodes||target.nodes.some(n=>C.textKey(n.title)===C.textKey(idea.title)))return;
    if(addComet(target,idea,mutate))setMessage('发散彗星到达：'+idea.title);
   }catch(e){if(!controller.signal.aborted&&active()){
    mutate(sid,d=>{d.drift={...d.drift,enabled:false};});setMessage('自动发散已暂停：'+e.message);
   }}finally{requests.current.delete(controller);job=null;since=performance.now();}
  }
  const timer=setInterval(tick,500);
  document.addEventListener('visibilitychange',restart);
  return ()=>{disposed=true;clearInterval(timer);job?.abort();document.removeEventListener('visibilitychange',restart);};
 },[sid,enabled]);
}

function BodyOptions({node,change}){
 const type=C.bodyOf(node),variants=Object.entries(C.finishes[type]);
 const fxName={blackhole:'光流内旋',neutron:'磁极脉冲',star:'日珥活动'}[type];
 return h(R.Fragment,null,
  node.display!=='text'&&variants.length>1&&field('星体外观',options(C.finishOf(node),variants,v=>change('finish',v))),
  node.display!=='text'&&fxName&&h('details',null,h('summary',null,'动态特效 · '+fxName),
   field('启用动态特效',h('input',{type:'checkbox',checked:node.fx!==false,onChange:e=>change('fx',e.target.checked)})),
   h(NumericField,{label:'特效强度',min:0,max:1,step:.05,value:node.fxPower??.65,change:v=>change('fxPower',v)}),
   h(NumericField,{label:'特效速度倍率',min:.1,max:3,step:.1,value:node.fxSpeed??1,change:v=>change('fxSpeed',v)})),
  C.generatedIdea(node)&&field('已确认想法',h('input',{type:'checkbox',checked:!!node.confirmed,onChange:e=>change('confirmed',e.target.checked)})));
}
function FadeOptions({appearance:a,change}){
 return h('details',null,h('summary',null,'联想淡化'),
  field('淡化未确认联想',h('input',{type:'checkbox',checked:a.fadeIdeas!==false,onChange:e=>change('fadeIdeas',e.target.checked)})),
  h(NumericField,{label:'未点击时长（秒）',min:5,max:86400,value:a.fadeDelay??90,change:v=>change('fadeDelay',v)}),
  h(NumericField,{label:'淡化后不透明度（%）',min:40,max:50,value:Math.round((a.fadeOpacity??.45)*100),change:v=>change('fadeOpacity',v/100)}),
  h('small',null,'点击联想可重新计时，已确认或收藏的想法会保持清晰。'));
}
