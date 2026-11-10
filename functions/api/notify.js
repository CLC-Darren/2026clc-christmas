// Cloudflare Pages Function — 人工按下「送出確認」後寄送一封待審核 Email。
// 需要在 Cloudflare Pages Production 加入以下環境變數：
// RESEND_API_KEY（Secret）、RESEND_FROM（已驗證寄件網域的地址）、
// FIREBASE_WEB_API_KEY（Text）、FIREBASE_PROJECT_ID（Text）。
// 絕對不可把 RESEND_API_KEY 放入前端 firebase-config.js。
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const scalar=(obj,key)=>obj?.fields?.[key]?.stringValue ?? obj?.fields?.[key]?.integerValue ?? '';
export async function onRequestPost({request,env}) {
  const origin=request.headers.get('Origin');
  if(origin && origin!==new URL(request.url).origin)return json({error:'Origin denied'},403);
  if(!env.RESEND_API_KEY || !env.RESEND_FROM || !env.FIREBASE_WEB_API_KEY || !env.FIREBASE_PROJECT_ID){
    return json({sent:false,notConfigured:true});
  }
  const bearer=/^Bearer (\S+)$/.exec(request.headers.get('Authorization')||'');
  if(!bearer)return json({error:'Sign in required'},401);
  let data;try{data=await request.json()}catch{return json({error:'Invalid JSON'},400)}
  if(!['section','count'].includes(data.kind)||typeof data.id!=='string'||!(/^[a-zA-Z0-9_-]{1,90}$/.test(data.id))||!Number.isSafeInteger(data.version)||data.version<1)return json({error:'Invalid request'},400);
  // 透過 Google Identity Toolkit 驗證 Firebase ID token，不信任前端自行宣稱的 Email。
  const lookup=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+encodeURIComponent(env.FIREBASE_WEB_API_KEY),{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:bearer[1]})
  });
  if(!lookup.ok)return json({error:'Invalid Firebase session'},401);
  const identity=(await lookup.json()).users?.[0];
  const email=(identity?.email||'').toLowerCase();
  if(!identity?.emailVerified || !email.endsWith('@twclc.org'))return json({error:'Not authorized'},403);
  // 使用相同使用者的 Firebase ID token 讀取 Firestore；仍受到 Firestore Rules 限制。
  const folder=data.kind==='section'?'sections':'counts';
  const path=`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents/christmas2026/main/${folder}/${encodeURIComponent(data.id)}`;
  const recordResponse=await fetch(path,{headers:{Authorization:'Bearer '+bearer[1]}});
  if(!recordResponse.ok)return json({error:'Record not readable'},403);
  const record=await recordResponse.json();
  const status=scalar(record,'status'),by=String(scalar(record,'lastSubmittedBy')).toLowerCase(),version=Number(scalar(record,'submissionVersion'));
  if(status!=='submitted'||by!==email||version!==data.version)return json({error:'Submission mismatch'},403);
  const submittedAt=record.fields?.submittedAt?.timestampValue;
  if(!submittedAt||Math.abs(Date.now()-Date.parse(submittedAt))>20*60*1000)return json({error:'Submission expired'},403);
  const title=String(scalar(record,'title')||'新人人數回報').slice(0,120);
  const site=new URL(request.url).origin;
  const subject=`[2026 CLC 聖誕季] 待確認｜${title}`;
  const details=data.kind==='count'?`新人人數：${scalar(record,'count')} 人\n分堂：${scalar(record,'branch')}\n日期：${scalar(record,'date')}\n場次：${scalar(record,'service')}\n`:'';
  const payload={from:env.RESEND_FROM,to:['darren.lin@twclc.org'],subject,text:`2026 CLC 特別聖誕季：有人送出待確認項目。\n\n${title}\n送出者：${email}\n版本：${version}\n${details}\n請登入專案網站確認：${site}/#activity\n\n這封郵件只是通知；為安全起見，必須在網頁登入後確認。`};
  const sent=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(!sent.ok){console.error('Email send failed',sent.status);return json({sent:false,error:'Email provider rejected'},502)}
  return json({sent:true});
}
export function onRequestGet(){return json({error:'Method not allowed'},405)}
