// 餐點提案：無須登入即可新增；第一張為封面，其餘圖片放在各餐點的 photos 子集合。
// 既有只有 imageData 的餐點仍能正常顯示。
import {firebaseConfig,superusers} from './firebase-config.js';
import {getApps,initializeApp} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';
import {getFirestore,collection,doc,writeBatch,serverTimestamp,onSnapshot,getDocsFromServer} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const BRANCH_SERVICES={'江翠':['晚崇','青崇','主日'],'新莊':['青崇','主日'],'林口':['青崇','主日']};
const key='clc_christmas_public_meals_draft_v1';
const MAX_PHOTOS=20;
const form=$('publicMealForm'),rows=$('publicMealRows');
const photosForRow=new WeakMap();
const processingRows=new WeakSet();
let db=null,admin=false,meals=[],sending=false;
const money=v=>'NT$ '+Number(v).toLocaleString('zh-TW');
function message(s,error=false){const el=$('publicMealMessage');el.textContent=s;el.classList.toggle('error',error)}
function refreshService(){const branch=$('publicMealBranch').value,sel=$('publicMealService'),prior=sel.value;sel.innerHTML='<option value="">請選擇聚會類別</option>'+(BRANCH_SERVICES[branch]||[]).map(s=>`<option value="${s}">${s}</option>`).join('');sel.disabled=!branch;if((BRANCH_SERVICES[branch]||[]).includes(prior))sel.value=prior}
function showPreviews(row){
  const photos=photosForRow.get(row)||[],box=row.querySelector('.meal-photo-preview-grid');
  row.querySelector('.meal-picture-placeholder').textContent=photos.length?`已選 ${photos.length} 張照片 · 可繼續拖曳加入`:'＋ 選照片／拖曳放入';
  row.querySelector('.meal-photo-hint').textContent=`${photos.length} / ${MAX_PHOTOS} 張 · 可一次選擇多張`;
  box.innerHTML=photos.map((src,i)=>`<div class="meal-upload-thumb"><img src="${esc(src)}" alt="餐點照片 ${i+1}"><button type="button" class="meal-upload-remove" data-remove-photo="${i}" aria-label="移除第 ${i+1} 張照片">×</button>${i===0?'<span class="meal-cover-label">封面</span>':''}</div>`).join('');
  box.querySelectorAll('[data-remove-photo]').forEach(btn=>btn.addEventListener('click',()=>{
    photos.splice(Number(btn.dataset.removePhoto),1);showPreviews(row);saveLocal();
  }));
}
async function addFiles(row,files){
  if(processingRows.has(row))return;
  const photos=photosForRow.get(row)||[];
  const chosen=[...files].filter(f=>f && (f.type||'').startsWith('image/'));
  if(chosen.length===0){message('請選擇 JPG、PNG 或 WebP 照片。',true);return}
  if(chosen.length>MAX_PHOTOS-photos.length){message(`每筆餐點最多 ${MAX_PHOTOS} 張；目前已選 ${photos.length} 張，請減少選擇。`,true);return}
  processingRows.add(row);
  try{
    for(let i=0;i<chosen.length;i++){
      message(`正在壓縮並加入照片 ${i+1} / ${chosen.length} …`);
      const data=await makePhoto(chosen[i]);photos.push(data);
      showPreviews(row);
    }
    message(`已加入 ${chosen.length} 張照片，送出後會顯示疊放式相簿。`);saveLocal();
  }catch(e){message(`照片處理失敗：${e.message}`,true);saveLocal()}
  finally{processingRows.delete(row)}
}
function mealRow(preset={}){
  const row=document.createElement('fieldset');row.className='meal-entry';
  row.innerHTML=`<legend>餐點 <span class="meal-entry-number"></span></legend>
    <button class="meal-remove" type="button" aria-label="移除此筆餐點">移除 ×</button>
    <div class="meal-entry-fields">
      <div class="meal-picture">
        <div class="meal-upload-zone" role="button" tabindex="0" aria-label="點選或拖曳上傳多張餐點照片">
          <input type="file" accept="image/jpeg,image/png,image/webp" class="meal-photo-file" multiple hidden>
          <span class="meal-picture-placeholder">＋ 選照片／拖曳放入</span>
          <small class="meal-photo-hint">0 / ${MAX_PHOTOS} 張 · 可一次選擇多張</small>
        </div>
        <div class="meal-photo-preview-grid" aria-label="已選照片預覽"></div>
      </div>
      <div class="meal-entry-inputs"><label>餐點名稱<input class="meal-name" maxlength="80" required placeholder="例如：聖誕分享拼盤" value="${esc(preset.mealName||'')}"></label>
      <div class="meal-prices"><label>每套單價 NT$<input class="meal-unit" type="number" min="0" max="100000" step="1" inputmode="numeric" required placeholder="例如 120" value="${esc(preset.unitPrice??'')}"></label>
      <label>總預算 NT$<input class="meal-total" type="number" min="0" max="5000000" step="1" inputmode="numeric" required placeholder="例如 8000" value="${esc(preset.totalBudget??'')}"></label></div>
      <label>備註（選填）<textarea class="meal-note" rows="2" maxlength="500" placeholder="其他說明可留白">${esc(preset.note||'')}</textarea></label></div></div>`;
  rows.appendChild(row);
  const saved=Array.isArray(preset.images)?preset.images:(preset.imageData?[preset.imageData]:[]);
  photosForRow.set(row,saved.filter(v=>typeof v==='string'&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v)&&v.length<=135000).slice(0,MAX_PHOTOS));
  showPreviews(row);
  const zone=row.querySelector('.meal-upload-zone'),input=row.querySelector('.meal-photo-file');
  zone.addEventListener('click',()=>input.click());
  zone.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();input.click()}});
  input.addEventListener('change',async()=>{const chosen=[...input.files];input.value='';await addFiles(row,chosen)});
  ['dragenter','dragover'].forEach(name=>zone.addEventListener(name,e=>{e.preventDefault();e.stopPropagation();zone.classList.add('drag-over')}));
  ['dragleave','drop'].forEach(name=>zone.addEventListener(name,e=>{e.preventDefault();e.stopPropagation();zone.classList.remove('drag-over')}));
  zone.addEventListener('drop',e=>addFiles(row,e.dataTransfer?.files||[]));
  row.querySelector('.meal-remove').addEventListener('click',()=>{if(rows.children.length===1){message('至少需要一筆餐點。',true);return}row.remove();renumber();saveLocal()});
  row.addEventListener('input',saveLocal);
  renumber();return row;
}
function renumber(){[...rows.children].forEach((r,i)=>{r.querySelector('.meal-entry-number').textContent=`${i+1}`;r.querySelector('.meal-remove').hidden=rows.children.length===1})}
async function makePhoto(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('只支援 JPG、PNG 或 WebP');
  if(file.size>12*1024*1024)throw Error('單張原始照片最多 12 MB');
  const url=URL.createObjectURL(file);
  try{
    const im=await new Promise((ok,fail)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>fail(Error('無法讀取圖片'));i.src=url});
    let side=900,quality=.78;
    for(let n=0;n<12;n++){
      const scale=Math.min(1,side/Math.max(im.naturalWidth,im.naturalHeight));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(im.naturalWidth*scale));canvas.height=Math.max(1,Math.round(im.naturalHeight*scale));
      canvas.getContext('2d').drawImage(im,0,0,canvas.width,canvas.height);
      const data=canvas.toDataURL('image/jpeg',quality);
      if(data.length<=135000)return data;
      quality=Math.max(.36,quality-.06);side=Math.round(side*.82);
    }
    throw Error('照片壓縮失敗，請換較小圖片');
  }finally{URL.revokeObjectURL(url)}
}
function saveLocal(){
  const draft={branch:$('publicMealBranch').value,service:$('publicMealService').value,
    rows:[...rows.children].map(r=>({mealName:r.querySelector('.meal-name').value,unitPrice:r.querySelector('.meal-unit').value,totalBudget:r.querySelector('.meal-total').value,note:r.querySelector('.meal-note').value,images:photosForRow.get(r)||[]}))};
  try{localStorage.setItem(key,JSON.stringify(draft))}catch{
    // 瀏覽器 localStorage 容量有限；僅保留文字，照片仍保留在當前頁面直到送出。
    try{localStorage.setItem(key,JSON.stringify({...draft,rows:draft.rows.map(r=>({...r,images:[]}))}))}catch{}
  }
}
function loadLocal(){try{const raw=JSON.parse(localStorage.getItem(key)||'null');if(raw){$('publicMealBranch').value=raw.branch||'';refreshService();$('publicMealService').value=raw.service||'';if(Array.isArray(raw.rows)&&raw.rows.length){raw.rows.slice(0,10).forEach(r=>mealRow(r));return}}}catch{}mealRow()}
function getEntries(){
  const branch=$('publicMealBranch').value,service=$('publicMealService').value;
  if(!BRANCH_SERVICES[branch]?.includes(service))throw Error('請先選擇正確的分堂與聚會類別');
  return [...rows.children].map((row,i)=>{
    if(processingRows.has(row))throw Error(`餐點 ${i+1}：照片還在處理中`);
    const name=row.querySelector('.meal-name').value.trim(),unitText=row.querySelector('.meal-unit').value,budgetText=row.querySelector('.meal-total').value,note=row.querySelector('.meal-note').value.trim(),images=photosForRow.get(row)||[];
    if(images.length<1)throw Error(`餐點 ${i+1}：請至少上傳一張照片`);
    if(!name)throw Error(`餐點 ${i+1}：請填餐點名稱`);
    if(unitText===''||budgetText==='')throw Error(`餐點 ${i+1}：請填每套單價與總預算`);
    const unitPrice=Number(unitText),totalBudget=Number(budgetText);
    if(!Number.isInteger(unitPrice)||unitPrice<0||unitPrice>100000||!Number.isInteger(totalBudget)||totalBudget<0||totalBudget>5000000)throw Error(`餐點 ${i+1}：金額必須是有效整數`);
    return {row,images,record:{branch,service,mealName:name,unitPrice,totalBudget,note,imageData:images[0],photoCount:images.length,createdAt:serverTimestamp()}};
  });
}
function applyMealSnapshot(snapshot){meals=snapshot.docs.map(d=>({...d.data(),id:d.id}));render()}
async function send(e){
  e.preventDefault();if(sending)return;
  if(!db){message('尚未連接 Firebase。',true);return}
  let entries;try{entries=getEntries()}catch(err){message(err.message,true);return}
  const submit=$('submitPublicMeals');sending=true;submit.disabled=true;submit.textContent='正在送出…';
  const savedIds=[];
  try{
    const col=collection(db,'christmas2026','main','publicMeals');
    // 一筆餐點一個原子批次：與 Firestore Rules 的安全讀取上限相容。
    for(let i=0;i<entries.length;i++){
      const {row,images,record}=entries[i],ref=doc(col),batch=writeBatch(db);
      batch.set(ref,record);
      images.slice(1).forEach((imageData,index)=>batch.set(doc(collection(ref,'photos')),{imageData,position:index+1,createdAt:serverTimestamp()}));
      message(`正在儲存餐點 ${i+1}/${entries.length}（${images.length} 張照片）…`);
      await batch.commit();
      savedIds.push(ref.id);
      row.remove();
      if(rows.children.length===0)mealRow();else renumber();
      saveLocal();
    }
    try{
      const snapshot=await getDocsFromServer(col);applyMealSnapshot(snapshot);
      const visible=savedIds.every(id=>snapshot.docs.some(d=>d.id===id));
      message(visible?`已公開 ${savedIds.length} 筆餐點，首頁可點開多張照片。`:'資料已儲存，但首頁讀取尚未同步；請勿重複送出。',!visible);
    }catch(readError){console.warn('meal readback',readError);message('餐點已儲存，但重新讀取暫時失敗；請勿重複送出。',true)}
    document.getElementById('mealDialog')?.close();
    window.dispatchEvent(new CustomEvent('clc:meal-saved',{detail:{count:savedIds.length,verified:true}}));
    $('meals-showcase').scrollIntoView({behavior:'smooth',block:'start'});
  }catch(err){
    console.error('publicMeals write',err);
    message(`${savedIds.length?`已儲存 ${savedIds.length} 筆；剩餘餐點尚未送出。`:'送出失敗。'} ${err.code==='permission-denied'?'請確認 Firebase Firestore Database → Rules 已 Publish 最新規則。':err.message||'請稍後重試'}`,true);
  }finally{sending=false;submit.disabled=false;submit.textContent='送出餐點'}
}
const gallery={mealId:null,images:[],index:0};
const galleryDialog=$('mealGalleryDialog');
function galleryRender(){
  const item=gallery.images[gallery.index];if(!item)return;
  $('mealGalleryImage').src=item;
  $('mealGalleryImage').alt=`餐點照片第 ${gallery.index+1} 張`;
  $('mealGalleryPosition').textContent=`${gallery.index+1} / ${gallery.images.length}`;
  const many=gallery.images.length>1;
  $('mealGalleryPrev').hidden=!many;$('mealGalleryNext').hidden=!many;
  const box=$('mealGalleryThumbs');
  box.innerHTML=gallery.images.map((src,i)=>`<button type="button" class="gallery-thumb ${i===gallery.index?'active':''}" data-meal-gallery-index="${i}" aria-label="查看第 ${i+1} 張照片" aria-pressed="${i===gallery.index}"><img src="${esc(src)}" alt="第 ${i+1} 張縮圖"></button>`).join('');
  box.querySelectorAll('[data-meal-gallery-index]').forEach(btn=>btn.addEventListener('click',()=>{gallery.index=Number(btn.dataset.mealGalleryIndex);galleryRender()}));
  box.querySelector('.gallery-thumb.active')?.scrollIntoView({block:'nearest',inline:'nearest'});
}
function galleryMove(delta){const size=gallery.images.length;if(size<2)return;gallery.index=(gallery.index+delta+size)%size;galleryRender()}
async function galleryOpen(id){
  if(!db)return;
  const item=meals.find(m=>m.id===id);if(!item)return;
  gallery.mealId=id;gallery.images=[item.imageData];gallery.index=0;
  $('mealGalleryTitle').textContent=item.mealName;
  $('mealGalleryLoading').textContent=Number(item.photoCount||1)>1?'正在載入其他照片…':'';
  galleryRender();if(!galleryDialog.open)galleryDialog.showModal();
  if(Number(item.photoCount||1)<=1)return;
  try{
    const snapshot=await getDocsFromServer(collection(db,'christmas2026','main','publicMeals',id,'photos'));
    if(gallery.mealId!==id||!galleryDialog.open)return;
    const images=snapshot.docs.map(d=>d.data()).filter(x=>x.imageData&&Number.isInteger(x.position)).sort((a,b)=>a.position-b.position).map(x=>x.imageData);
    gallery.images=[item.imageData,...images];gallery.index=0;galleryRender();
    $('mealGalleryLoading').textContent=gallery.images.length<Number(item.photoCount||1)?'部分照片尚未載入，請稍後重新開啟。':'';
  }catch(e){console.error('meal gallery read',e);$('mealGalleryLoading').textContent='其他照片暫時無法讀取，請檢查 Firestore Rules。'}
}
$('mealGalleryPrev').addEventListener('click',()=>galleryMove(-1));
$('mealGalleryNext').addEventListener('click',()=>galleryMove(1));
$('mealGalleryClose').addEventListener('click',()=>galleryDialog.close());
galleryDialog.addEventListener('close',()=>{gallery.mealId=null});
galleryDialog.addEventListener('click',e=>{if(e.target===galleryDialog)galleryDialog.close()});
document.addEventListener('keydown',e=>{if(!galleryDialog.open)return;if(e.key==='ArrowLeft'){e.preventDefault();galleryMove(-1)}else if(e.key==='ArrowRight'){e.preventDefault();galleryMove(1)}});
let startX=null;
$('mealGalleryImage').addEventListener('touchstart',e=>{startX=e.changedTouches[0]?.screenX??null},{passive:true});
$('mealGalleryImage').addEventListener('touchend',e=>{if(startX===null)return;const dx=e.changedTouches[0].screenX-startX;if(Math.abs(dx)>45)galleryMove(dx<0?1:-1);startX=null},{passive:true});
function cardHTML(item,withAdmin){
  const count=Math.max(1,Number(item.photoCount)||1);
  return `<article class="public-meal-card">
    <button class="public-meal-image meal-photo-cover ${count>1?'meal-stack':''}" type="button" data-meal-gallery="${esc(item.id)}" aria-label="查看「${esc(item.mealName)}」的 ${count} 張餐點照片">
      <img src="${esc(item.imageData)}" alt="${esc(item.mealName)} 餐點照片" loading="lazy">
      ${count>1?`<span class="meal-photo-count">▣ ${count} 張照片</span>`:''}
      <span class="meal-cover-open">${count>1?'點擊看相簿 · 左右滑動':'點擊放大照片'}</span>
    </button>
    <div class="public-meal-content"><div class="public-meal-tags"><span>${esc(item.branch)}</span><span>${esc(item.service)}</span></div><h4>${esc(item.mealName)}</h4><div class="public-meal-price"><span>每套 ${money(item.unitPrice)}</span><b>總預算 ${money(item.totalBudget)}</b></div>${item.note?`<p>${esc(item.note)}</p>`:''}${withAdmin?`<button type="button" class="meal-admin-delete" data-meal-delete="${esc(item.id)}">刪除此筆</button>`:''}</div>
  </article>`;
}
function render(){
  const sorted=[...meals].sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
  const featured=$('featuredMeals');$('publicMealCount').textContent=sorted.length;
  if(!sorted.length){featured.innerHTML='<p class="meal-empty">目前尚無餐點提案。歡迎各分堂先上傳第一筆！</p>';return}
  featured.innerHTML=sorted.map(r=>cardHTML(r,admin)).join('');
  featured.querySelectorAll('[data-meal-delete]').forEach(b=>b.addEventListener('click',()=>removeMeal(b.dataset.mealDelete)));
  featured.querySelectorAll('[data-meal-gallery]').forEach(b=>b.addEventListener('click',()=>galleryOpen(b.dataset.mealGallery)));
}
async function removeMeal(id){
  if(!admin)return;const item=meals.find(m=>m.id===id);
  if(!item||!confirm(`管理者確定刪除「${item.mealName}」及其全部照片？刪除後無法復原。`))return;
  try{
    const ref=doc(db,'christmas2026','main','publicMeals',id);
    const snap=await getDocsFromServer(collection(ref,'photos'));
    const batch=writeBatch(db);
    snap.docs.forEach(d=>batch.delete(d.ref));batch.delete(ref);
    await batch.commit();message('已刪除餐點與所有附加照片。');
  }catch(e){console.error('meal delete',e);message('刪除失敗：'+(e.message||'請稍後再試'),true)}
}
$('publicMealBranch').addEventListener('change',()=>{refreshService();saveLocal()});
$('publicMealService').addEventListener('change',saveLocal);
$('addPublicMeal').addEventListener('click',()=>{if(rows.children.length>=10){message('每次最多新增 10 筆餐點。',true);return}mealRow();saveLocal()});
form.addEventListener('submit',send);
loadLocal();
const configured=!Object.values(firebaseConfig).some(v=>!v||String(v).includes('PASTE_'));
if(configured){
  const app=getApps()[0]||initializeApp(firebaseConfig);db=getFirestore(app);
  onSnapshot(collection(db,'christmas2026','main','publicMeals'),applyMealSnapshot,err=>{console.error('publicMeals listener',err);$('featuredMeals').innerHTML='<p class="meal-empty">餐點清單讀取失敗（'+esc(err.code||err.message||'未知錯誤')+'）。請檢查 Firestore Rules。</p>'});
  onAuthStateChanged(getAuth(app),user=>{admin=!!(user?.emailVerified&&superusers.includes((user.email||'').toLowerCase()));render()});
}else{$('featuredMeals').innerHTML='<p class="meal-empty">Firebase 尚未設定，完成後將顯示已提交餐點。</p>';message('請先完成 Firebase 設定才可送出餐點。',true)}
