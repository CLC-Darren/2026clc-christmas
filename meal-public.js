// 餐點提案獨立模組：不更動原本內部工作、登入及審核流程。
import {firebaseConfig,superusers} from './firebase-config.js';
import {getApps,initializeApp} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';
import {getFirestore,collection,doc,writeBatch,serverTimestamp,onSnapshot,getDocsFromServer,deleteDoc} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const BRANCH_SERVICES={'江翠':['晚崇','青崇','主日'],'新莊':['青崇','主日'],'林口':['青崇','主日']};
const key='clc_christmas_public_meals_draft_v1';
const form=$('publicMealForm'),rows=$('publicMealRows');
const imageForRow=new WeakMap();
let db=null,admin=false,meals=[],sending=false;
const money=v=>'NT$ '+Number(v).toLocaleString('zh-TW');
function message(s,error=false){const el=$('publicMealMessage');el.textContent=s;el.classList.toggle('error',error)}
function refreshService(){const branch=$('publicMealBranch').value,sel=$('publicMealService'),prior=sel.value;sel.innerHTML='<option value="">請選擇聚會類別</option>'+(BRANCH_SERVICES[branch]||[]).map(s=>`<option value="${s}">${s}</option>`).join('');sel.disabled=!branch;if((BRANCH_SERVICES[branch]||[]).includes(prior))sel.value=prior}
function mealRow(preset={}){
  const row=document.createElement('fieldset');row.className='meal-entry';
  row.innerHTML=`<legend>餐點 <span class="meal-entry-number"></span></legend>
    <button class="meal-remove" type="button" aria-label="移除此筆餐點">移除 ×</button>
    <div class="meal-entry-fields">
      <label class="meal-picture">餐點照片（每筆一張）<input type="file" accept="image/jpeg,image/png,image/webp" class="meal-photo-file"><span class="meal-picture-placeholder">＋ 選擇照片</span><img alt="餐點照片預覽" hidden></label>
      <div class="meal-entry-inputs"><label>餐點名稱<input class="meal-name" maxlength="80" required placeholder="例如：聖誕分享拼盤" value="${esc(preset.mealName||'')}"></label>
      <div class="meal-prices"><label>每套單價 NT$<input class="meal-unit" type="number" min="0" max="100000" step="1" inputmode="numeric" required placeholder="例如 120" value="${esc(preset.unitPrice??'')}"></label>
      <label>總預算 NT$<input class="meal-total" type="number" min="0" max="5000000" step="1" inputmode="numeric" required placeholder="例如 8000" value="${esc(preset.totalBudget??'')}"></label></div>
      <label>備註（選填）<textarea class="meal-note" rows="2" maxlength="500" placeholder="其他說明可留白">${esc(preset.note||'')}</textarea></label></div></div>`;
  rows.appendChild(row);
  if(typeof preset.imageData==='string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(preset.imageData) && preset.imageData.length<=135000){imageForRow.set(row,preset.imageData);showPicture(row,preset.imageData)}
  row.querySelector('.meal-photo-file').addEventListener('change',async e=>{
    const input=e.currentTarget,file=input.files[0];if(!file)return;
    message('正在處理照片…');input.disabled=true;
    try{const data=await makePhoto(file);imageForRow.set(row,data);showPicture(row,data);message('照片已加入，送出後會立即公布。');saveLocal()}
    catch(err){input.value='';message(err.message||'照片處理失敗',true)}
    finally{input.disabled=false}
  });
  row.querySelector('.meal-remove').addEventListener('click',()=>{if(rows.children.length===1){message('至少需要一筆餐點。',true);return}row.remove();renumber();saveLocal()});
  row.addEventListener('input',saveLocal);
  renumber();return row;
}
function showPicture(row,data){const img=row.querySelector('.meal-picture img');img.src=data;img.hidden=false;row.querySelector('.meal-picture-placeholder').hidden=true}
function renumber(){[...rows.children].forEach((r,i)=>{r.querySelector('.meal-entry-number').textContent=`${i+1}`;r.querySelector('.meal-remove').hidden=rows.children.length===1})}
async function makePhoto(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('請選擇 JPG、PNG 或 WebP 圖片');
  if(file.size>12*1024*1024)throw Error('照片太大（最多 12 MB）');
  const url=URL.createObjectURL(file);
  try{
    const im=await new Promise((ok,fail)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>fail(Error('無法讀取圖片'));i.src=url});
    let side=800,quality=.75;
    for(let n=0;n<9;n++){
      const scale=Math.min(1,side/Math.max(im.naturalWidth,im.naturalHeight));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(im.naturalWidth*scale));canvas.height=Math.max(1,Math.round(im.naturalHeight*scale));
      canvas.getContext('2d').drawImage(im,0,0,canvas.width,canvas.height);
      const data=canvas.toDataURL('image/jpeg',quality);
      if(data.length<=135000)return data;
      quality=Math.max(.38,quality-.07);side=Math.round(side*.84);
    }
    throw Error('照片壓縮失敗，請改用較小圖片');
  }finally{URL.revokeObjectURL(url)}
}
function saveLocal(){try{localStorage.setItem(key,JSON.stringify({branch:$('publicMealBranch').value,service:$('publicMealService').value,rows:[...rows.children].map(r=>({mealName:r.querySelector('.meal-name').value,unitPrice:r.querySelector('.meal-unit').value,totalBudget:r.querySelector('.meal-total').value,note:r.querySelector('.meal-note').value,imageData:imageForRow.get(r)||''}))}))}catch{}}
function loadLocal(){try{const raw=JSON.parse(localStorage.getItem(key)||'null');if(raw){$('publicMealBranch').value=raw.branch||'';refreshService();$('publicMealService').value=raw.service||'';if(Array.isArray(raw.rows)&&raw.rows.length){raw.rows.slice(0,10).forEach(r=>mealRow(r));return}}}catch{}mealRow()}
function getEntries(){const branch=$('publicMealBranch').value,service=$('publicMealService').value;if(!BRANCH_SERVICES[branch]?.includes(service))throw Error('請先選擇正確的分堂與聚會類別');
  const entries=[...rows.children].map((row,i)=>{const name=row.querySelector('.meal-name').value.trim(),unitText=row.querySelector('.meal-unit').value,budgetText=row.querySelector('.meal-total').value,note=row.querySelector('.meal-note').value.trim(),imageData=imageForRow.get(row)||'';
    if(!imageData)throw Error(`餐點 ${i+1}：請上傳一張照片`);
    if(!name)throw Error(`餐點 ${i+1}：請填餐點名稱`);
    if(unitText===''||budgetText==='')throw Error(`餐點 ${i+1}：請填每套單價與總預算`);
    const unitPrice=Number(unitText),totalBudget=Number(budgetText);
    if(!Number.isInteger(unitPrice)||unitPrice<0||unitPrice>100000||!Number.isInteger(totalBudget)||totalBudget<0||totalBudget>5000000)throw Error(`餐點 ${i+1}：金額必須是有效整數`);
    return {branch,service,mealName:name,unitPrice,totalBudget,note,imageData,createdAt:serverTimestamp()};
  });return entries;
}
// 只在 Firebase 實際完成寫入後宣告成功，並立即從伺服器重新讀取公開清單。
function applyMealSnapshot(snapshot){
  meals=snapshot.docs.map(d=>({...d.data(),id:d.id}));
  render();
}
async function send(e){
  e.preventDefault();
  if(sending)return;
  if(!db){message('尚未連接 Firebase，請先完成 Firebase 設定。',true);return}
  let entries;
  try{entries=getEntries()}catch(err){message(err.message,true);return}
  const submit=$('submitPublicMeals');
  sending=true;submit.disabled=true;submit.textContent='正在送出…';
  let savedIds=[];
  try{
    const batch=writeBatch(db),col=collection(db,'christmas2026','main','publicMeals');
    for(const entry of entries){const newDoc=doc(col);batch.set(newDoc,entry);savedIds.push(newDoc.id)}
    await batch.commit(); // 確認伺服器已接收，不只是本機草稿。
    localStorage.removeItem(key);rows.innerHTML='';mealRow();

    // 主動重新取得 server 資料，避免只等即時監聽器更新而讓使用者看不到新卡片。
    try{
      const snapshot=await getDocsFromServer(col);
      applyMealSnapshot(snapshot);
      const visible=savedIds.every(id=>snapshot.docs.some(d=>d.id===id));
      if(visible){
        message(`已送出 ${entries.length} 筆餐點，並確認顯示於首頁（目前共 ${meals.length} 筆）。`);
      }else{
        message('資料已儲存至 Firebase，但公開清單尚未找到本次餐點。請不要重複送出；請至 Firebase → Firestore Database → Data 檢查 publicMeals。',true);
      }
    }catch(readError){
      console.error('publicMeals readback error',readError);
      message('餐點已儲存，但無法重新讀取公開清單（'+(readError.code||readError.message||'未知錯誤')+'）。請不要重複送出；請檢查 Firestore Rules 的 publicMeals 讀取權限。',true);
    }
    $('meals-showcase').scrollIntoView({behavior:'smooth',block:'start'});
  }catch(err){
    console.error('publicMeals write error',err);
    message(err.code==='permission-denied'?'送出被 Firestore Rules 拒絕。請確認已發布本次更新的 firestore.rules。':'送出失敗：'+(err.message||'請稍後重試'),true);
  }finally{
    sending=false;submit.disabled=false;submit.textContent='送出餐點';
  }
}
function cardHTML(item,withAdmin){return `<article class="public-meal-card"><div class="public-meal-image"><img src="${esc(item.imageData)}" alt="${esc(item.mealName)}" loading="lazy"></div>
  <div class="public-meal-content"><div class="public-meal-tags"><span>${esc(item.branch)}</span><span>${esc(item.service)}</span></div><h4>${esc(item.mealName)}</h4><div class="public-meal-price"><span>每套 ${money(item.unitPrice)}</span><b>總預算 ${money(item.totalBudget)}</b></div>${item.note?`<p>${esc(item.note)}</p>`:''}${withAdmin?`<button type="button" class="meal-admin-delete" data-meal-delete="${esc(item.id)}">刪除此筆</button>`:''}</div></article>`}
function render(){const sorted=[...meals].sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));const all=$('allPublicMeals'),featured=$('featuredMeals');
  $('publicMealCount').textContent=sorted.length;
  if(!sorted.length){all.innerHTML=featured.innerHTML='<p class="meal-empty">目前尚無餐點提案。歡迎各分堂先上傳第一筆！</p>';$('allMealsLink').hidden=true;return}
  featured.innerHTML=sorted.slice(0,6).map(r=>cardHTML(r,false)).join('');
  all.innerHTML=sorted.map(r=>cardHTML(r,admin)).join('');
  $('allMealsLink').hidden=sorted.length<=6;
  all.querySelectorAll('[data-meal-delete]').forEach(b=>b.addEventListener('click',()=>removeMeal(b.dataset.mealDelete)));
}
async function removeMeal(id){if(!admin)return;const item=meals.find(m=>m.id===id);if(!item||!confirm(`Superuser 確定刪除「${item.mealName}」？刪除後無法復原。`))return;
  try{await deleteDoc(doc(db,'christmas2026','main','publicMeals',id));message('管理員已刪除這筆餐點。')}
  catch(e){message('刪除失敗：'+(e.message||'請稍後再試'),true)}
}
$('publicMealBranch').addEventListener('change',()=>{refreshService();saveLocal()});
$('publicMealService').addEventListener('change',saveLocal);
$('addPublicMeal').addEventListener('click',()=>{if(rows.children.length>=10){message('每次最多新增 10 筆餐點。',true);return}mealRow();saveLocal()});
form.addEventListener('submit',send);
loadLocal();
const configured=!Object.values(firebaseConfig).some(v=>!v||String(v).includes('PASTE_'));
if(configured){
  const app=getApps()[0]||initializeApp(firebaseConfig);db=getFirestore(app);
  onSnapshot(collection(db,'christmas2026','main','publicMeals'),applyMealSnapshot,err=>{console.error('publicMeals listener error',err);$('featuredMeals').innerHTML=$('allPublicMeals').innerHTML='<p class="meal-empty">餐點清單讀取失敗（'+esc(err.code||err.message||'未知錯誤')+'）。請檢查 Firestore Rules 的 publicMeals allow list 權限，然後重新整理。</p>';});
  onAuthStateChanged(getAuth(app),user=>{admin=!!(user?.emailVerified&&superusers.includes((user.email||'').toLowerCase()));render()});
}else{$('featuredMeals').innerHTML=$('allPublicMeals').innerHTML='<p class="meal-empty">Firebase 尚未設定，完成後將自動顯示已提交餐點。</p>';message('請先完成 Firebase 設定才可送出餐點。',true)}
