// Cloudflare Pages Function：餐點修改申請的 Email 通知。
// 沿用現有 RESEND_API_KEY、RESEND_FROM、FIREBASE_WEB_API_KEY、FIREBASE_PROJECT_ID。
// Mail 本身不能直接修改資料；審核必須回到網頁並以 Superuser Google 帳號登入。
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const str=(r,key)=>r?.fields?.[key]?.stringValue??r?.fields?.[key]?.integerValue??'';
const timestamp=(r,key)=>r?.fields?.[key]?.timestampValue||'';
const length=r=>r?.fields?.images?.arrayValue?.values?.length||0;
const titles={
 'jiangcui-sunday':'江翠主日','jiangcui-youth':'江翠青、晚崇','jiangcui-evening':'江翠晚崇',
 'xinzhuang-sunday':'新莊主日','xinzhuang-youth':'新莊青崇',
 'linkou-sunday':'林口主日','linkou-youth':'林口青崇'
};
async function load(env,path){
 const url=`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents/christmas2026/main/${path}?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`;
 const r=await fetch(url,{headers:{Accept:'application/json'}});return r.ok?await r.json():null;
}
export async function onRequestPost({request,env}){
 const origin=new URL(request.url).origin;
 if(request.headers.get('Origin')&&request.headers.get('Origin')!==origin)return reply({sent:false,error:'Cross-origin denied'},403);
 if(!env.RESEND_API_KEY||!env.RESEND_FROM||!env.FIREBASE_WEB_API_KEY||!env.FIREBASE_PROJECT_ID)return reply({sent:false,notConfigured:true});
 let data;try{data=await request.json()}catch{return reply({sent:false,error:'Invalid JSON'},400)}
 const id=data?.id;
 if(typeof id!=='string'||!/^[A-Za-z0-9_-]{8,80}$/.test(id))return reply({sent:false,error:'Invalid ID'},400);
 try{
  const proposal=await load(env,'mealChangeRequests/'+encodeURIComponent(id));
  if(!proposal||str(proposal,'status')!=='pending')return reply({sent:false,error:'Not pending'},404);
  const created=Date.parse(timestamp(proposal,'submittedAt'));
  if(!Number.isFinite(created)||Math.abs(Date.now()-created)>20*60*1000)return reply({sent:false,error:'Request expired'},410);
  const slot=str(proposal,'slotId');if(!Object.hasOwn(titles,slot))return reply({sent:false,error:'Invalid slot'},400);
  // 避免短時間對同一份申請重複寄信。Cloudflare cache 為每 POP 最佳努力去重。
  const cache=globalThis.caches?.default;
  const cacheKey=new Request(origin+'/__mail-sent/'+encodeURIComponent(id));
  if(cache&&await cache.match(cacheKey))return reply({sent:true,duplicate:true});
  const old=await load(env,'mealSlots/'+encodeURIComponent(slot));
  const fields=[['餐點名稱','mealName'],['每套單價','unitPrice'],['總預算','totalBudget'],['備註','note']];
  const changes=fields.map(([title,key])=>{
   const before=old?String(str(old,key)):'（既有版本請至網站查看）';
   const after=String(str(proposal,key));
   return `${title}\n  原：${before}\n  新：${after}`;
  }).join('\n\n');
  const photos=`照片張數：${old?length(old):'請至網站查看'} → ${length(proposal)}`;
  const location=`${origin}/?review=${encodeURIComponent(id)}#meals-showcase`;
  const payload={
   from:env.RESEND_FROM,to:['darren.lin@twclc.org'],
   subject:`[CLC 聖誕季] 待審核｜${titles[slot]}餐點修改`,
   text:`2026 CLC 特別聖誕季 · 分堂餐點修改申請\n\n場次：${titles[slot]}\n填報人：${String(str(proposal,'reporter')||'未署名').slice(0,50)}\n\n${changes}\n\n${photos}\n\n點擊進入網站查看完整照片並核准／退回：\n${location}\n\n安全提醒：此連結不會直接核准，必須先以指定 Superuser 帳號登入。`
  };
  const sent=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(!sent.ok){console.error('Resend error',sent.status);return reply({sent:false,error:'Email provider error'},502)}
  if(cache)await cache.put(cacheKey,new Response('1',{headers:{'Cache-Control':'public, max-age=86400'}}));
  return reply({sent:true});
 }catch(e){console.error('Notify error',e);return reply({sent:false,error:'Notification service error'},502)}
}
export const onRequestGet=()=>reply({error:'Method not allowed'},405);
