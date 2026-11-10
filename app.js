// 2026 CLC Christmas：所有表單免登入，新增即公開；只有兩位 Superuser 可刪除。
import {firebaseConfig,superusers} from './firebase-config.js';
const configured=!Object.values(firebaseConfig).some(v=>!v||String(v).includes('PASTE_'));
const [appSDK,authSDK,dbSDK]=configured?await Promise.all([
  import('https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js'),
  import('https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js'),
  import('https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js')
]):[{},{},{}];
const {initializeApp,getApps}=appSDK;
const {getAuth,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged}=authSDK;
const {getFirestore,collection,doc,addDoc,setDoc,deleteDoc,onSnapshot,getDocFromServer,serverTimestamp}=dbSDK;
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const localPrefix='clc_christmas_2026_public_';
const schedule=[['2026-12-05','12/05（六）'],['2026-12-06','12/06（日）'],['2026-12-12','12/12（六）'],['2026-12-13','12/13（日）'],['2026-12-19','12/19（六）宏匯'],['2026-12-20','12/20（日）宏匯'],['2026-12-26','12/26（六）'],['2026-12-27','12/27（日）']];
const seed=[
  {id:'central',type:'central',title:'中央統一提供',owner:'中央統籌',description:'餐點兌換券原則兌換至 12 月底；各分堂可彈性評估延長。',couponStatus:'待確認',stickerStatus:'待確認',notes:''},
  {id:'honghui-kit',type:'supplies',title:'宏匯｜禮物與茶點',owner:'中央統籌',description:'預估 600 位新朋友；接待桌提供小點心、飲料。',giftCount:'600',giftStatus:'待確認',refreshmentStatus:'待確認',notes:''},
  {id:'honghui-sa1',type:'session',title:'12/19（六）下午｜學青',owner:'立元牧師',description:'第一場；學青窗口尚待確認。',leader:'待確認',team:'學青',people:'',notes:''},
  {id:'honghui-sa2',type:'session',title:'12/19（六）晚上｜社青',owner:'立元牧師',description:'第二場；社青欣芳配搭。',leader:'欣芳',team:'社青',people:'',notes:''},
  {id:'honghui-su1',type:'session',title:'12/20（日）早上',owner:'惠卿姊妹',description:'第三場；江翠 4 位＋新莊 4 位。江翠坤岳協調，新莊窗口待確認。',leader:'江翠坤岳／新莊待確認',team:'江翠4＋新莊4',people:'8',notes:''},
  {id:'honghui-su2',type:'session',title:'12/20（日）下午',owner:'惠卿姊妹',description:'第四場；江翠 4 位＋林口 4 位。江翠坤岳協調，林口窗口待確認。',leader:'江翠坤岳／林口待確認',team:'江翠4＋林口4',people:'8',notes:''}
];
const fields={
  central:[['couponStatus','餐點兌換券狀態','select',['待確認','準備中','已完成']],['stickerStatus','聖誕季貼紙狀態','select',['待確認','準備中','已完成']],['notes','補充說明','textarea']],
  supplies:[['giftCount','預估禮物份數','number'],['giftStatus','小禮物準備狀態','select',['待確認','準備中','已完成']],['refreshmentStatus','點心／飲料狀態','select',['待確認','準備中','已完成']],['notes','補充說明','textarea']],
  session:[['leader','現場 Leader／配搭窗口','text'],['team','接待人力分配','text'],['people','預計同工人數','number'],['notes','待確認事項／備註','textarea']]
};
const state={db:null,auth:null,user:null,sections:new Map(),updates:new Map(),counts:new Map(),centralAssets:new Map(),current:null,sending:false};
const admin=()=>!!state.user?.emailVerified&&superusers.includes((state.user.email||'').toLowerCase());
const collectionRef=name=>collection(state.db,'christmas2026','main',name);
const docRef=(name,id)=>doc(state.db,'christmas2026','main',name,id);
const sortTime=r=>r?.submittedAt?.seconds??r?.createdAt?.seconds??0;
const sortedUpdates=()=>[...state.updates.entries()].map(([id,v])=>({...v,id})).sort((a,b)=>sortTime(b)-sortTime(a));
const latestFor=id=>sortedUpdates().find(r=>r.sectionId===id);
const baseFor=id=>seed.find(s=>s.id===id);
function getSection(id){const s=baseFor(id);if(!s)return null;const old=state.sections.get(id)||{},latest=latestFor(id);return {...s,...old,...(latest?.fields||{}),lastUpdateId:latest?.id,hasContent:!!latest||!!state.sections.has(id),reporter:latest?.reporter||''}}
const prettyTime=t=>{try{const d=t?.toDate?t.toDate():t?new Date(t):null;return d&&!Number.isNaN(d.getTime())?new Intl.DateTimeFormat('zh-TW',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Taipei'}).format(d):''}catch{return ''}};
let timer;
function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');clearTimeout(timer);timer=setTimeout(()=>el.classList.remove('show'),5500)}
function notice(msg,warning=false){const el=$('connectionNotice');el.textContent=msg;el.classList.toggle('warn',warning)}
const safeMsg=e=>String(e?.code||e?.message||'未知錯誤').slice(0,180);
function card(item){let content='';if(item.type==='session')content=`<p>主責：${esc(item.owner)}　|　現場：${esc(item.leader||'待確認')}</p><p class="smallmeta">${esc(item.team||item.description)}${item.people?' · 同工 '+esc(item.people)+' 人':''}</p>`;
  else if(item.type==='central')content=`<p>餐點券：${esc(item.couponStatus||'待確認')} · 貼紙：${esc(item.stickerStatus||'待確認')}</p><p class="smallmeta">${esc(item.description)}</p>`;
  else content=`<p>禮物：${esc(item.giftStatus||'待確認')} · 點心／飲料：${esc(item.refreshmentStatus||'待確認')}</p><p class="smallmeta">${esc(item.description)}</p>`;
  if(item.notes)content+=`<p class="smallmeta">備註：${esc(item.notes)}</p>`;
  const when=item.lastUpdateId?prettyTime(state.updates.get(item.lastUpdateId)?.submittedAt):'';
  const centralLocked=item.type==='central'&&!admin();
  return `<article class="item-card"><div class="item-top"><span class="kicker">${item.type==='session'?'SESSION':'SUPPORT'}</span><span class="status ${item.hasContent?'confirmed':'draft'}">${item.hasContent?'已公開':'待補資料'}</span></div><h4>${esc(item.title)}</h4>${content}<div class="item-bottom"><small class="smallmeta">${centralLocked?'僅管理者可更新':when?'最近更新 '+esc(when):'開放免登入填寫'}</small>${centralLocked?'':`<button class="card-button" type="button" data-edit="${esc(item.id)}">填寫／更新</button>`}</div>${admin()&&(item.lastUpdateId||state.sections.has(item.id))?`<div class="admin-actions"><button type="button" class="admin-remove" data-remove-section="${esc(item.id)}">管理者刪除${item.lastUpdateId?'最新填報':'舊資料'}</button></div>`:''}</article>`;
}
function renderSections(){for(const id of ['centralCards','honghuiCards'])$(id).innerHTML='';for(const s of seed){const item=getSection(s.id);$(s.type==='central'?'centralCards':'honghuiCards').insertAdjacentHTML('beforeend',card(item))}document.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>openEditor(b.dataset.edit)));document.querySelectorAll('[data-remove-section]').forEach(b=>b.addEventListener('click',()=>removeSection(b.dataset.removeSection)));renderRecent()}
function renderCounts(){const reports=[...state.counts.entries()].map(([id,v])=>({...v,id})).sort((a,b)=>sortTime(b)-sortTime(a));const total=reports.reduce((n,r)=>n+Math.max(0,Number(r.count)||0),0);
  $('totalPeople').textContent=total.toLocaleString('zh-TW');$('countReportTotal').textContent=`${total.toLocaleString('zh-TW')} 人`;
  $('countRows').innerHTML=reports.length?reports.slice(0,30).map(r=>`<div class="count-row"><div>${esc(r.branch)} · ${esc(r.date)}<small>${esc(r['service'])} · ${esc(r.reporter||'未署名')} · 已公開</small></div><strong>${Math.max(0,Number(r.count)||0)} 人${admin()?` <button type="button" class="count-delete" data-delete-count="${esc(r.id)}" title="管理者刪除此筆">×</button>`:''}</strong></div>`).join(''):'<p class="muted">尚無回報資料。</p>';
  document.querySelectorAll('[data-delete-count]').forEach(b=>b.addEventListener('click',()=>removeCount(b.dataset.deleteCount)));renderRecent()}
function renderRecent(){const latest=seed.map(s=>latestFor(s.id)).filter(Boolean).sort((a,b)=>sortTime(b)-sortTime(a));$('pendingList').innerHTML=latest.length?latest.map(r=>`<div class="activity-item"><div><b>${esc(baseFor(r.sectionId)?.title||r.sectionId)}</b><small>${esc(r.reporter||'未署名')} · ${esc(prettyTime(r.submittedAt))} · 已公開</small></div></div>`).join(''):'<p class="empty">目前尚無工作項目更新。</p>';
  const history=[...sortedUpdates().map(r=>({...r,kind:'update',label:baseFor(r.sectionId)?.title||r.sectionId})),...[...state.counts.entries()].map(([id,r])=>({...r,id,kind:'count',label:`${r.branch||''} · ${r.date||''} · ${r.count||0} 人`}))].sort((a,b)=>sortTime(b)-sortTime(a)).slice(0,30);
  $('logList').innerHTML=history.length?history.map(r=>`<div class="activity-item"><div><b>${esc(r.label)}</b><small>${esc(r.reporter||'未署名')} · ${esc(prettyTime(r.submittedAt||r.createdAt))}</small></div>${admin()?`<button type="button" class="admin-remove" data-delete-record="${esc(r.kind+'|'+r.id)}">刪除</button>`:''}</div>`).join(''):'<p class="empty">目前尚無提交紀錄。</p>';
  document.querySelectorAll('[data-delete-record]').forEach(b=>b.addEventListener('click',()=>{const [kind,id]=b.dataset.deleteRecord.split('|');kind==='count'?removeCount(id):removeUpdate(id)}));
}
function renderLogin(){const button=$('authButton');button.disabled=!configured;button.textContent=!configured?'待設定 Firebase':admin()?'管理者｜登出':'管理者登入';$('countSubmit').disabled=!configured;$('formRole').textContent='免登入 · 直接公開';$('originalFormLink').hidden=!admin();if(!configured)notice('目前尚未設定 Firebase，請先完成 firebase-config.js 與 Firestore Rules。',true);else notice('所有填報免登入，送出後立即公開；只有兩位管理者可修改中央提供或刪除資料。');renderSections();renderCounts();renderCentralAssets()}
function formField([name,label,type,options],value){const v=esc(value??'');if(type==='select')return `<label>${esc(label)}<select name="${name}">${options.map(s=>`<option ${s===String(value)?'selected':''}>${esc(s)}</option>`).join('')}</select></label>`;if(type==='textarea')return `<label class="full">${esc(label)}<textarea name="${name}" maxlength="1200">${v}</textarea></label>`;return `<label>${esc(label)}<input name="${name}" type="${type}" ${type==='number'?'min="0" max="5000" step="1"':'maxlength="250"'} value="${v}"></label>`}
function readEditor(){const s=baseFor(state.current);if(!s)return null;const form=new FormData($('editForm'));const obj={};for(const [name] of fields[s.type])obj[name]=String(form.get(name)||'').trim();return obj}
function saveLocal(){if(!state.current)return;try{localStorage.setItem(localPrefix+state.current,JSON.stringify({fields:readEditor(),reporter:$('editReporter').value.trim()}))}catch{}}
function openEditor(id){if(id==='central'&&!admin())return toast('中央提供只允許管理者登入後更新。');const item=getSection(id);if(!item)return;state.current=id;$('editTitle').textContent=item.title;$('editKicker').textContent=item.type==='session'?'HONGHUI SESSION':'PROJECT UPDATE';let cached=null;try{cached=JSON.parse(localStorage.getItem(localPrefix+id)||'null')}catch{}
  const actual={...item,...(cached?.fields||{})};$('editFields').innerHTML=`<div class="read-only" style="grid-column:1/-1">${esc(item.description)}<br>負責／窗口：${esc(item.owner)}</div>`+fields[item.type].map(f=>formField(f,actual[f[0]])).join('');$('editReporter').value=cached?.reporter||'';
  $('editFields').querySelectorAll('input,textarea,select').forEach(el=>{el.disabled=false;el.addEventListener('input',saveLocal);el.addEventListener('change',saveLocal)});$('editReporter').oninput=saveLocal;$('submitReview').disabled=!configured;$('saveInfo').textContent='免登入填寫。尚未送出的內容會保存在此瀏覽器；按「送出並公開」後立即顯示。';$('editDialog').showModal()}
async function submitSection(){if(!state.db||!state.current||state.sending)return;if(state.current==='central'&&!admin())return toast('中央提供必須由管理者登入後提交。');const id=state.current,entry=readEditor(),reporter=$('editReporter').value.trim();if(reporter.length>50){toast('填報人最多 50 字');return}state.sending=true;$('submitReview').disabled=true;
  try{const ref=await addDoc(collectionRef('publicUpdates'),{sectionId:id,fields:entry,reporter,submittedAt:serverTimestamp()});localStorage.removeItem(localPrefix+id);$('editDialog').close();toast('已送出！資訊已公開。');try{const result=await getDocFromServer(ref);if(result.exists()){state.updates.set(ref.id,result.data());renderSections()}}catch(e){console.warn('published but readback failed',e);toast('已儲存 Firebase，但讀取同步稍慢，請稍後重新整理；不要重複送出。')}}catch(e){toast('送出失敗：'+safeMsg(e))}finally{state.sending=false;$('submitReview').disabled=false}}
async function submitCount(e){e.preventDefault();if(!state.db)return toast('Firebase 尚未設定');const f=new FormData(e.currentTarget),date=String(f.get('date')||''),branch=String(f.get('branch')||''),service=String(f.get('service')||''),reporter=String(f.get('reporter')||'').trim(),note=String(f.get('note')||'').trim(),count=Number(f.get('count'));
  if(!schedule.some(d=>d[0]===date)||!branch||!service||!reporter||reporter.length>50||!Number.isInteger(count)||count<0||count>5000)return toast('請填寫完整且有效的人數資料');
  if(['2026-12-19','2026-12-20'].includes(date)!==(branch==='宏匯聖誕'))return toast('宏匯聖誕僅適用 12/19–12/20，其他日期請選分堂');
  const allowedServices=branch==='宏匯聖誕'?(countHonghuiServices[date]||[]):(countServicesByBranch[branch]||[]);
  if(!allowedServices.includes(service))return toast('所選場次與分堂不符，請重新選擇');
  const button=$('countSubmit');button.disabled=true;try{const ref=await addDoc(collectionRef('counts'),{date,branch,service,reporter,note,count,createdAt:serverTimestamp()});$('countForm').reset();refreshCountBranch();toast('人數回報已送出並直接公開。');try{const result=await getDocFromServer(ref);if(result.exists()){state.counts.set(ref.id,result.data());renderCounts()}}catch(err){console.warn('count readback',err);toast('已儲存 Firebase，但讀取同步稍慢；請勿重複送出。')}}catch(err){toast('回報失敗：'+safeMsg(err))}finally{button.disabled=false}}
async function removeUpdate(id){if(!admin()||!state.updates.has(id)||!confirm('管理者確定刪除此筆工作填報？刪除後無法復原。'))return;try{await deleteDoc(docRef('publicUpdates',id));toast('已刪除這筆填報')}catch(e){toast('刪除失敗：'+safeMsg(e))}}
async function removeSection(sectionId){const latest=latestFor(sectionId);if(latest)return removeUpdate(latest.id);if(!admin()||!state.sections.has(sectionId)||!confirm('確定刪除此項原有資料？'))return;try{await deleteDoc(docRef('sections',sectionId));toast('已刪除原有資料')}catch(e){toast('刪除失敗：'+safeMsg(e))}}
async function removeCount(id){if(!admin()||!state.counts.has(id)||!confirm('管理者確定刪除此筆人數回報？刪除後總數會同步更新。'))return;try{await deleteDoc(docRef('counts',id));toast('已刪除這筆人數回報')}catch(e){toast('刪除失敗：'+safeMsg(e))}}
// 新人人數回報：場次依分堂切換；宏匯聖誕保留原本的四場安排。
const countServicesByBranch={
  '江翠':['青崇','晚崇','主日第一堂','主日第二堂','主日第三堂'],
  '新莊':['青崇','主日第一堂','主日第二堂'],
  '林口':['青崇','主日第一堂','主日第二堂']
};
const countHonghuiServices={
  '2026-12-19':['週六下午（學青）','週六晚上（社青）'],
  '2026-12-20':['週日早上','週日下午']
};
function refreshCountService(){
  const branch=$('countBranch').value,date=$('countDate').value,sel=$('countService'),previous=sel.value;
  const options=branch==='宏匯聖誕'?(countHonghuiServices[date]||[]):(countServicesByBranch[branch]||[]);
  sel.innerHTML='<option value="">選擇場次</option>'+options.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');
  if(options.includes(previous))sel.value=previous;
  sel.disabled=!options.length;
}
function refreshCountBranch(){
  const date=$('countDate').value,sel=$('countBranch'),previous=sel.value;
  const options=!date?[]:countHonghuiServices[date]?['宏匯聖誕']:['江翠','新莊','林口'];
  sel.innerHTML='<option value="">選擇分堂</option>'+options.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');
  if(options.length===1)sel.value=options[0];
  else if(options.includes(previous))sel.value=previous;
  sel.disabled=!options.length;
  refreshCountService();
}
function setupForm(){
  const sel=$('countDate');
  for(const [id,label] of schedule){const opt=document.createElement('option');opt.value=id;opt.textContent=label;sel.appendChild(opt)}
  sel.addEventListener('change',refreshCountBranch);
  $('countBranch').addEventListener('change',refreshCountService);
  refreshCountBranch();
  $('countForm').addEventListener('submit',submitCount);
  $('closeDialog').addEventListener('click',()=>$('editDialog').close());
  $('editDialog').addEventListener('close',()=>{state.current=null});
  $('editForm').addEventListener('submit',e=>e.preventDefault());
  $('submitReview').addEventListener('click',submitSection)
}

// Central supplies photos: two fixed Firestore documents, public read and administrator-only write.
const centralAssetIds=['sticker','voucher'];
const MAX_CENTRAL_IMAGE_LENGTH=220000;
function renderCentralAssets(){
  for(const id of centralAssetIds){
    const item=state.centralAssets.get(id),data=item?.imageData||'';
    const valid=typeof data==='string'&&data.length<=MAX_CENTRAL_IMAGE_LENGTH&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(data);
    const image=$('centralAssetImg-'+id),empty=$('centralAssetEmpty-'+id);
    if(valid)image.src=data;else image.removeAttribute('src');
    image.hidden=!valid;empty.hidden=valid;
    $('centralAssetMeta-'+id).textContent=valid?('最近更新 '+(prettyTime(item.updatedAt)||'剛剛')):'尚未提供';
    $('centralAssetControls-'+id).hidden=!admin();
    $('centralAssetRemove-'+id).hidden=!admin()||!valid;
  }
}
async function compressCentralAsset(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('請使用 JPG、PNG 或 WebP 照片');
  if(file.size>12*1024*1024)throw Error('圖片超過 12 MB，請先縮小');
  const blob=URL.createObjectURL(file);
  try{
    const image=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('無法讀取圖片'));im.src=blob});
    let side=1000,quality=.82;
    for(let attempt=0;attempt<10;attempt++){
      const ratio=Math.min(1,side/Math.max(image.naturalWidth,image.naturalHeight));
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));
      canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
      const ctx=canvas.getContext('2d');
      if(!ctx)throw Error('瀏覽器無法壓縮照片');
      ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(image,0,0,canvas.width,canvas.height);
      const result=canvas.toDataURL('image/jpeg',quality);
      if(result.length<=MAX_CENTRAL_IMAGE_LENGTH)return result;
      quality=Math.max(.4,quality-.08);side=Math.round(side*.85);
    }
    throw Error('圖片壓縮後仍過大，請改用更小的照片');
  }finally{URL.revokeObjectURL(blob)}
}
async function uploadCentralAsset(id,input){
  const file=input.files?.[0];if(!file)return;
  if(!admin()||!state.db){toast('請先使用 Superuser 帳號登入。');input.value='';return}
  input.disabled=true;
  try{
    toast('正在處理並上傳圖片…');
    const imageData=await compressCentralAsset(file);
    const ref=docRef('centralAssets',id);
    await setDoc(ref,{imageData,updatedAt:serverTimestamp(),updatedBy:state.user.email});
    const fresh=await getDocFromServer(ref);
    if(!fresh.exists())throw Error('伺服器尚未回傳照片，請重新整理確認');
    state.centralAssets.set(id,fresh.data());renderCentralAssets();
    toast((id==='sticker'?'聖誕季貼紙':'餐點兌換券')+'照片已更新，所有人都能看到。');
  }catch(e){toast('照片上傳失敗：'+safeMsg(e))}
  finally{input.disabled=false;input.value=''}
}
async function removeCentralAsset(id){
  if(!admin()||!state.db||!confirm('確定移除這張物資照片？'))return;
  try{await deleteDoc(docRef('centralAssets',id));state.centralAssets.delete(id);renderCentralAssets();toast('照片已移除。')}
  catch(e){toast('移除失敗：'+safeMsg(e))}
}
for(const id of centralAssetIds){
  $('centralAssetInput-'+id).addEventListener('change',e=>uploadCentralAsset(id,e.currentTarget));
  $('centralAssetRemove-'+id).addEventListener('click',()=>removeCentralAsset(id));
}

setupForm();renderLogin();
if(configured){const app=getApps()[0]||initializeApp(firebaseConfig);state.db=getFirestore(app);state.auth=getAuth(app);renderLogin();
  $('authButton').addEventListener('click',async()=>{if(admin()){try{await signOut(state.auth)}catch(e){toast(safeMsg(e))}return}try{const credential=await signInWithPopup(state.auth,new GoogleAuthProvider());if(!superusers.includes((credential.user.email||'').toLowerCase())){toast('只有指定管理者可以登入管理功能；一般填報不需要登入。');await signOut(state.auth)}}catch(e){toast('管理者登入失敗：'+safeMsg(e))}});
  onAuthStateChanged(state.auth,user=>{state.user=user;renderLogin()});
  const sub=(name,handler)=>onSnapshot(collectionRef(name),snap=>handler(snap),error=>{console.error('Firestore listener',name,error);notice(`讀取 ${name} 失敗：${safeMsg(error)}。請核對 Firestore Database → Rules 已 Publish。`,true)});
  sub('sections',snap=>{state.sections=new Map(snap.docs.map(d=>[d.id,d.data()]));renderSections()});
  sub('publicUpdates',snap=>{state.updates=new Map(snap.docs.map(d=>[d.id,d.data()]));renderSections()});
  sub('counts',snap=>{state.counts=new Map(snap.docs.map(d=>[d.id,d.data()]));renderCounts()});
  sub('centralAssets',snap=>{state.centralAssets=new Map(snap.docs.map(d=>[d.id,d.data()]));renderCentralAssets()});
}
