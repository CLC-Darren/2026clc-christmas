// 2026 CLC Christmas — 分堂餐點：六張分類卡片／七個場次；首次公開，後續修改先審核。
import {firebaseConfig,superusers} from './firebase-config.js';
import {getApps,initializeApp} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';
import {getFirestore,collection,doc,onSnapshot,getDocs,getDocsFromServer,setDoc,addDoc,writeBatch,serverTimestamp,deleteDoc} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
const $=id=>document.getElementById(id);
const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slotMeta={
 'jiangcui-sunday':['江翠','主日'],'jiangcui-youth':['江翠','青崇'],'jiangcui-evening':['江翠','晚崇'],
 'xinzhuang-sunday':['新莊','主日'],'xinzhuang-youth':['新莊','青崇'],
 'linkou-sunday':['林口','主日'],'linkou-youth':['林口','青崇']
};
const groups=[
 {id:'jc-sun',name:'江翠主日',slots:['jiangcui-sunday']},
 {id:'jc-youth',name:'江翠青、晚崇',slots:['jiangcui-youth','jiangcui-evening']},
 {id:'xz-sun',name:'新莊主日',slots:['xinzhuang-sunday']},
 {id:'xz-youth',name:'新莊青崇',slots:['xinzhuang-youth']},
 {id:'lk-sun',name:'林口主日',slots:['linkou-sunday']},
 {id:'lk-youth',name:'林口青崇',slots:['linkou-youth']}
];
const MAX_PHOTOS=20, MAX_TOTAL_CHARS=760000;
const isPhoto=x=>typeof x==='string'&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(x)&&x.length<=140000;
const money=n=>'NT$ '+Number(n||0).toLocaleString('zh-TW');
const state={db:null,admin:false,user:null,slots:new Map(),legacy:new Map(),legacyAll:new Map(),legacyImages:new Map(),requests:new Map(),activeTabs:new Map(),positions:new Map(),pendingUnsub:null,currentSlot:null,editing:false,images:[],processing:false,selectedGallery:[],galleryIndex:0,gallerySlot:null,busy:false,reviewSlot:null};
const form=$('publicMealForm'),dialog=$('mealDialog'),gallery=$('mealGalleryDialog'),reviewDialog=$('mealReviewDialog');
const imgCol=id=>collection(state.db,'christmas2026','main','publicMeals',id,'photos');
const slotRef=id=>doc(state.db,'christmas2026','main','mealSlots',id);
const requestRef=id=>doc(state.db,'christmas2026','main','mealChangeRequests',id);
function shortStatus(s,error=false){const el=$('publicMealMessage');el.textContent=s;el.classList.toggle('error',error)}
function getSlotId(branch,service){return Object.keys(slotMeta).find(id=>slotMeta[id][0]===branch&&slotMeta[id][1]===service)||null}
function groupSlot(group){return state.activeTabs.get(group.id)||group.slots[0]}
function newest(items){return items.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))[0]||null}
function effective(slot){return state.slots.get(slot)||state.legacy.get(slot)||null}
function imagesFor(item){if(!item)return [];if(Array.isArray(item.images)&&item.images.length)return item.images.filter(isPhoto).slice(0,MAX_PHOTOS);
 const imgs=[item.imageData,...(state.legacyImages.get(item.id)||[])];return imgs.filter(isPhoto).slice(0,MAX_PHOTOS)}
function pendingFor(slot){return [...state.requests.values()].filter(r=>r.status==='pending'&&r.slotId===slot).sort((a,b)=>(a.submittedAt?.seconds||0)-(b.submittedAt?.seconds||0))}
function maybeLoadLegacy(item){if(!state.db||!item?.legacy||state.legacyImages.has(item.id))return;
 state.legacyImages.set(item.id,[]);
 getDocs(imgCol(item.id)).then(snap=>{state.legacyImages.set(item.id,snap.docs.map(x=>x.data()).filter(d=>isPhoto(d.imageData)).sort((a,b)=>a.position-b.position).map(d=>d.imageData));renderCards()}).catch(e=>console.warn('legacy meal photos',e));
}
function coverView(group,slot,item){const images=imagesFor(item),pos=state.positions.get(slot)||0,idx=pos%Math.max(images.length,1);
 if(!images.length)return `<button type="button" class="meal-card-empty" data-edit-slot="${slot}"><span>＋</span><strong>尚未填寫餐點</strong><small>點擊開始填寫</small></button>`;
 return `<div class="meal-card-photo-wrap ${images.length>1?'meal-photo-stack':''}">
 <button class="meal-card-cover" type="button" data-open-gallery="${slot}" aria-label="打開${escapeHTML(group.name)}餐點相簿"><img src="${escapeHTML(images[idx])}" alt="${escapeHTML(item.mealName)} 第 ${idx+1} 張照片"><span class="meal-card-photo-counter">${idx+1} / ${images.length}</span><span class="meal-card-photo-open">點開查看全部照片 ↗</span></button>
 ${images.length>1?`<button class="meal-card-arrow meal-card-arrow-prev" type="button" data-slide="${slot}" data-step="-1" aria-label="上一張">‹</button><button class="meal-card-arrow meal-card-arrow-next" type="button" data-slide="${slot}" data-step="1" aria-label="下一張">›</button>`:''}
 </div>`;
}
function groupHTML(g){const slot=groupSlot(g),item=effective(slot),tabs=g.slots.length>1?`<div class="meal-card-tabs">${g.slots.map(s=>`<button type="button" data-select-slot="${s}" data-group="${g.id}" class="${s===slot?'active':''}">${escapeHTML(slotMeta[s][1])}${state.admin&&pendingFor(s).length?'<i class="meal-tab-dot" aria-label="待審核"></i>':''}</button>`).join('')}</div>`:'';
 const pend=pendingFor(slot),total=[...g.slots].reduce((n,k)=>n+pendingFor(k).length,0),reviewTarget=pend.length?slot:(g.slots.find(k=>pendingFor(k).length)||slot);
 return `<article class="public-meal-card meal-category-card" data-category="${g.id}">
 <div class="meal-card-head"><div><small>BRANCH HOSPITALITY</small><h3>${escapeHTML(g.name)}</h3></div><span class="meal-card-badge ${item?'ready':'empty'}">${item?'已填寫':'待填寫'}</span></div>
 ${tabs}${coverView(g,slot,item)}
 <div class="meal-card-details">${item?`<h4>${escapeHTML(item.mealName)}</h4><div class="meal-card-prices"><span>每套 ${money(item.unitPrice)}</span><strong>總預算 ${money(item.totalBudget)}</strong></div>${item.note?`<p>${escapeHTML(item.note)}</p>`:''}`:'<p class="meal-card-placeholder">請點擊「填寫餐點」上傳圖片與預算。</p>'}</div>
 <div class="meal-card-footer"><button class="meal-card-edit" type="button" data-edit-slot="${slot}">${item?'編輯餐點':'＋ 填寫餐點'}</button>${state.admin&&total?`<button type="button" class="meal-card-review" data-review-slot="${reviewTarget}" aria-label="有 ${total} 筆待審核，點擊審核"><span class="meal-review-dot"></span> 待審核 ${total}</button>`:''}${state.admin&&item?`<button class="meal-card-delete" type="button" data-delete-slot="${slot}">刪除</button>`:''}${!state.admin&&item?'<span class="meal-card-note">後續修改需審核</span>':''}</div>
 </article>`;
}
let suppressGalleryClickUntil=0;
function slide(slot,step){const images=imagesFor(effective(slot));if(images.length<2)return;state.positions.set(slot,((state.positions.get(slot)||0)+step+images.length)%images.length);renderCards()}
function renderCards(){const root=$('featuredMeals');if(!root)return;root.innerHTML=groups.map(groupHTML).join('');
 $('publicMealCount').textContent=Object.keys(slotMeta).filter(s=>!!effective(s)).length;
 root.querySelectorAll('[data-select-slot]').forEach(b=>b.addEventListener('click',()=>{state.activeTabs.set(b.dataset.group,b.dataset.selectSlot);renderCards()}));
 root.querySelectorAll('[data-edit-slot]').forEach(b=>b.addEventListener('click',()=>openEditor(b.dataset.editSlot)));
 root.querySelectorAll('[data-slide]').forEach(b=>b.addEventListener('click',()=>slide(b.dataset.slide,Number(b.dataset.step))));
 root.querySelectorAll('[data-open-gallery]').forEach(b=>{
  let start=null;
  b.addEventListener('touchstart',e=>{start=e.changedTouches[0]?.clientX??null},{passive:true});
  b.addEventListener('touchend',e=>{if(start==null)return;const dx=e.changedTouches[0].clientX-start;start=null;if(Math.abs(dx)>45){suppressGalleryClickUntil=Date.now()+350;slide(b.dataset.openGallery,dx<0?1:-1)}},{passive:true});
  b.addEventListener('click',()=>{if(Date.now()<suppressGalleryClickUntil)return;openGallery(b.dataset.openGallery)});
 });
 root.querySelectorAll('[data-review-slot]').forEach(b=>b.addEventListener('click',()=>openReview(b.dataset.reviewSlot)));
 root.querySelectorAll('[data-delete-slot]').forEach(b=>b.addEventListener('click',()=>deleteEntry(b.dataset.deleteSlot)));
}
async function resizeImage(source,maxChars){let image;
 if(source instanceof File){if(!['image/jpeg','image/png','image/webp'].includes(source.type))throw Error('請選 JPG、PNG 或 WebP 圖片');if(source.size>12*1024*1024)throw Error('單張原始照片不可超過 12 MB')}
 const url=source instanceof File?URL.createObjectURL(source):source;
 try{image=await new Promise((ok,bad)=>{const img=new Image();img.onload=()=>ok(img);img.onerror=()=>bad(Error('照片讀取失敗'));img.src=url});
 let side=920,quality=.78;
 for(let i=0;i<20;i++){
  const scale=Math.min(1,side/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
  const result=canvas.toDataURL('image/jpeg',quality);if(result.length<=maxChars)return result;quality=Math.max(.23,quality-.055);side=Math.max(240,Math.round(side*.86));
 }
 throw Error('照片太複雜，壓縮失敗');
 }finally{if(source instanceof File)URL.revokeObjectURL(url)}
}
async function prepareImageList(){const target=Math.min(95000,Math.floor(MAX_TOTAL_CHARS/Math.max(1,state.images.length)));
 let result=[];for(let i=0;i<state.images.length;i++){const photo=state.images[i];result.push(photo.length<=target?photo:await resizeImage(photo,target))}
 if(result.reduce((n,x)=>n+x.length,0)>MAX_TOTAL_CHARS)throw Error('照片總量過大，請減少張數');return result;
}
function renderPreviews(){const box=$('mealPhotoPreviews');box.innerHTML=state.images.map((src,i)=>`<div class="meal-upload-thumb"><img src="${escapeHTML(src)}" alt="餐點照片第 ${i+1} 張"><button type="button" class="meal-upload-remove" data-remove-photo="${i}" aria-label="移除第 ${i+1} 張">×</button>${i===0?'<span class="meal-cover-label">封面</span>':''}</div>`).join('');
 $('mealPhotoHint').textContent=`已選 ${state.images.length} / ${MAX_PHOTOS} 張 · 支援多選與拖曳`;
 box.querySelectorAll('[data-remove-photo]').forEach(b=>b.addEventListener('click',()=>{state.images.splice(Number(b.dataset.removePhoto),1);renderPreviews();saveDraft()}));
}
async function addFiles(files){if(state.processing)return;const chosen=[...files].filter(f=>f instanceof File);
 if(!chosen.length)return;if(state.images.length+chosen.length>MAX_PHOTOS){shortStatus(`最多 ${MAX_PHOTOS} 張照片，目前已選 ${state.images.length} 張。`,true);return}
 state.processing=true;$('submitPublicMeals').disabled=true;
 try{for(let i=0;i<chosen.length;i++){shortStatus(`正在加入照片 ${i+1} / ${chosen.length} …`);state.images.push(await resizeImage(chosen[i],95000));renderPreviews()}
 shortStatus(`已加入 ${chosen.length} 張照片。`);saveDraft()}catch(e){shortStatus(e.message,true)}finally{state.processing=false;$('submitPublicMeals').disabled=false}
}
const draftKey=id=>'clc_meal_slot_draft_v1_'+id;
function saveDraft(){if(!state.currentSlot||!dialog.open)return;const obj={mealName:$('mealName').value,unitPrice:$('mealUnit').value,totalBudget:$('mealBudget').value,note:$('mealNote').value,reporter:$('mealReporter').value};
 try{localStorage.setItem(draftKey(state.currentSlot),JSON.stringify(obj))}catch{}}
function readDraft(id){try{return JSON.parse(localStorage.getItem(draftKey(id))||'null')}catch{return null}}
function clearDraft(id){try{localStorage.removeItem(draftKey(id))}catch{}}
async function openEditor(slot){if(!slotMeta[slot])return;state.currentSlot=slot;const existing=effective(slot);state.editing=!!existing;
 $('mealDialogTitle').textContent=`${slotMeta[slot].join('／')}｜${existing?'修改餐點':'首次填寫'}`;
 $('mealSelectedService').textContent=slotMeta[slot].join('／');$('mealSubmissionMode').textContent=existing?'修改須審核':'首次填寫 · 立即公開';
 $('mealDialogSubtitle').textContent=existing?'送出後不會直接覆蓋，需管理者確認才會更新首頁。':'第一次提交不需登入，送出後會直接公開。';
 $('mealReporterWrap').hidden=!existing;$('submitPublicMeals').textContent=existing?'送出修改申請':'送出並公開';
 form.reset();const d=readDraft(slot)||{};
 $('mealName').value=d.mealName??existing?.mealName??'';$('mealUnit').value=d.unitPrice??existing?.unitPrice??'';
 $('mealBudget').value=d.totalBudget??existing?.totalBudget??'';$('mealNote').value=d.note??existing?.note??'';$('mealReporter').value=d.reporter||'';
 state.images=imagesFor(existing);if(existing?.legacy){maybeLoadLegacy(existing)}renderPreviews();shortStatus(existing?'請確認內容，送出後將進入待審核，不會立即更改公開資料。':'首次填寫送出後會直接公開。');
 if(!dialog.open)dialog.showModal();
 if(existing?.legacy&&Number(existing.photoCount||1)>1){try{const snap=await getDocs(imgCol(existing.id));if(state.currentSlot!==slot||!dialog.open)return;state.legacyImages.set(existing.id,snap.docs.map(d=>d.data()).filter(d=>isPhoto(d.imageData)).sort((a,b)=>a.position-b.position).map(d=>d.imageData));state.images=imagesFor(existing);renderPreviews()}catch(e){console.warn('existing meal images',e)}}
}
const dropZone=$('mealUploadZone'),photoInput=$('mealPhotoInput');
dropZone.addEventListener('click',()=>photoInput.click());dropZone.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();photoInput.click()}});
photoInput.addEventListener('change',async()=>{const files=[...photoInput.files];photoInput.value='';await addFiles(files)});
['dragenter','dragover'].forEach(type=>dropZone.addEventListener(type,e=>{e.preventDefault();dropZone.classList.add('drag-over')}));
['dragleave','drop'].forEach(type=>dropZone.addEventListener(type,e=>{e.preventDefault();dropZone.classList.remove('drag-over')}));
dropZone.addEventListener('drop',e=>addFiles(e.dataTransfer?.files||[]));
form.addEventListener('input',saveDraft);
function readForm(){if(!state.currentSlot)throw Error('請先選擇分堂場次');const mealName=$('mealName').value.trim(),unitPrice=Number($('mealUnit').value),totalBudget=Number($('mealBudget').value),note=$('mealNote').value.trim();
 if(!mealName)throw Error('請填寫餐點名稱');if($('mealUnit').value===''||$('mealBudget').value==='')throw Error('請填寫每套單價與總預算');
 if(!Number.isInteger(unitPrice)||unitPrice<0||unitPrice>100000||!Number.isInteger(totalBudget)||totalBudget<0||totalBudget>5000000)throw Error('金額格式不正確');
 if(!state.images.length)throw Error('請至少上傳一張餐點照片');return {mealName,unitPrice,totalBudget,note};
}
async function notifyRevision(id){try{const response=await fetch('/api/meal-review-notify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});if(!response.ok)return false;return !!(await response.json()).sent}catch(e){console.warn('mail notification not delivered',e);return false}}
form.addEventListener('submit',async e=>{e.preventDefault();if(state.busy||state.processing||!state.db)return;let record;try{record=readForm()}catch(err){shortStatus(err.message,true);return}
 const slot=state.currentSlot,existing=effective(slot);state.busy=true;$('submitPublicMeals').disabled=true;
 try{shortStatus('正在壓縮照片並送出…');const images=await prepareImageList();const data={...record,imageData:images[0],images};
 if(!existing){try{await setDoc(slotRef(slot),{...data,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});shortStatus('首次餐點已直接公開！');clearDraft(slot);dialog.close();renderCards()}
  catch(e){if(e.code==='permission-denied'){shortStatus('這個場次剛剛已有其他人完成首次填寫，請關閉後重新開啟修改；資料未被覆蓋。',true)}else throw e} }
 else{const proposal=await addDoc(collection(state.db,'christmas2026','main','mealChangeRequests'),{...data,slotId:slot,reporter:$('mealReporter').value.trim(),status:'pending',submittedAt:serverTimestamp()});clearDraft(slot);dialog.close();const sent=await notifyRevision(proposal.id);shortStatus(sent?'修改已提交待管理者審核，通知郵件已寄出。':'修改已提交待管理者審核；通知郵件尚未成功寄送，請告知管理者登入網站查看。',!sent);showToast(sent?'修改申請已提交，已通知管理者。':'修改申請已保存，請提醒管理者查看紅點。')}
 }catch(err){console.error('meal save error',err);shortStatus('送出失敗：'+(err.code||err.message||'請稍後再試'),true)}finally{state.busy=false;$('submitPublicMeals').disabled=false}
});
$('mealDialogClose').addEventListener('click',()=>dialog.close());
function showToast(msg){const t=$('toast');if(!t)return;t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),5200)}
async function openGallery(slot){const item=effective(slot);if(!item)return;state.gallerySlot=slot;state.selectedGallery=imagesFor(item);state.galleryIndex=state.positions.get(slot)||0;
 $('mealGalleryTitle').textContent=slotMeta[slot].join('／')+' · '+item.mealName;
 drawGallery();if(!gallery.open)gallery.showModal();
 if(item.legacy&&Number(item.photoCount||1)>1&&state.selectedGallery.length<Number(item.photoCount||1)){
  try{const snap=await getDocs(imgCol(item.id));if(state.gallerySlot!==slot||!gallery.open)return;
   state.legacyImages.set(item.id,snap.docs.map(d=>d.data()).filter(d=>isPhoto(d.imageData)).sort((a,b)=>a.position-b.position).map(d=>d.imageData));
   state.selectedGallery=imagesFor(item);drawGallery();renderCards();
  }catch(e){console.warn('legacy photos not loaded',e)}
 }
}
function drawGallery(){const imgs=state.selectedGallery;if(!imgs.length)return;state.galleryIndex=state.galleryIndex%imgs.length;
 $('mealGalleryImage').src=imgs[state.galleryIndex];$('mealGalleryPosition').textContent=`${state.galleryIndex+1} / ${imgs.length}`;
 $('mealGalleryLoading').textContent=imgs.length>1?'可左右滑動，或點選下方縮圖':'';
 $('mealGalleryPrev').hidden=imgs.length<=1;$('mealGalleryNext').hidden=imgs.length<=1;
 $('mealGalleryThumbs').innerHTML=imgs.map((src,i)=>`<button class="gallery-thumb ${state.galleryIndex===i?'active':''}" type="button" data-gallery-index="${i}" aria-label="第 ${i+1} 張"><img src="${escapeHTML(src)}" alt="第 ${i+1} 張"></button>`).join('');
 $('mealGalleryThumbs').querySelectorAll('[data-gallery-index]').forEach(b=>b.addEventListener('click',()=>{state.galleryIndex=Number(b.dataset.galleryIndex);drawGallery()}));
}
function moveGallery(n){if(state.selectedGallery.length<2)return;state.galleryIndex=(state.galleryIndex+n+state.selectedGallery.length)%state.selectedGallery.length;drawGallery()}
$('mealGalleryPrev').addEventListener('click',()=>moveGallery(-1));$('mealGalleryNext').addEventListener('click',()=>moveGallery(1));$('mealGalleryClose').addEventListener('click',()=>gallery.close());
document.addEventListener('keydown',e=>{if(!gallery.open)return;if(e.key==='ArrowLeft')moveGallery(-1);if(e.key==='ArrowRight')moveGallery(1)});
let touchX=null;$('mealGalleryImage').addEventListener('touchstart',e=>{touchX=e.changedTouches[0]?.clientX??null},{passive:true});$('mealGalleryImage').addEventListener('touchend',e=>{if(touchX==null)return;const d=e.changedTouches[0].clientX-touchX;touchX=null;if(Math.abs(d)>45)moveGallery(d<0?1:-1)},{passive:true});
async function deleteEntry(slot){
 if(!state.admin||!state.db||state.busy)return;
 if(!confirm(`確定刪除「${slotMeta[slot].join('／')}」的正式餐點與舊版紀錄？此動作無法復原。`))return;
 state.busy=true;
 try{
  const batch=writeBatch(state.db);if(state.slots.has(slot))batch.delete(slotRef(slot));
  // 清除相同場次的舊版資料，避免刪掉新版後又顯示歷史重複餐點。
  for(const item of (state.legacyAll.get(slot)||[])){
   const ref=doc(state.db,'christmas2026','main','publicMeals',item.id);
   const photos=await getDocs(imgCol(item.id));photos.docs.forEach(d=>batch.delete(d.ref));batch.delete(ref);
  }
  await batch.commit();showToast('管理者已刪除這個場次的正式資料。');
 }catch(e){console.error('delete meal',e);showToast('刪除失敗：'+(e.message||e.code||'未知錯誤'))}
 finally{state.busy=false}
}
// 原卡片右下角紅點審核；只在 Superuser 登入時顯示。
function reviewItemsFor(slot){return state.reviewSlot==='ALL'?[...state.requests.values()].filter(r=>r.status==='pending'):[...state.requests.values()].filter(r=>r.slotId===slot&&r.status==='pending')}
function openReview(slot){if(!state.admin)return;state.reviewSlot=slot;
 $('mealReviewTitle').textContent=slot==='ALL'?'待審核的餐點修改':slotMeta[slot].join('／')+'｜待審核';drawReview();if(!reviewDialog.open)reviewDialog.showModal();}
function drawReview(){const list=reviewItemsFor(state.reviewSlot).sort((a,b)=>(a.submittedAt?.seconds||0)-(b.submittedAt?.seconds||0));
 const root=$('mealReviewList');if(!list.length){root.innerHTML='<p class="meal-review-empty">目前沒有待審核的修改。</p>';return}
 root.innerHTML=list.map(p=>{const old=effective(p.slotId);const changed=[['餐點名稱',old?.mealName,p.mealName],['每套單價',old?.unitPrice,p.unitPrice],['總預算',old?.totalBudget,p.totalBudget],['備註',old?.note,p.note],['照片張數',imagesFor(old).length,p.images?.length||0]];
 const diff=changed.filter(([k,a,b])=>String(a??'')!==String(b??'')).map(([k,a,b])=>`<div class="meal-review-diff"><b>${k}</b><span>${escapeHTML(a??'未填')}</span><strong>→ ${escapeHTML(b??'無')}</strong></div>`).join('')||'<p>資料內容未改動，請確認照片是否有變更。</p>';
 return `<article class="meal-review-record" data-review-id="${escapeHTML(p.id)}"><header><strong>${escapeHTML(slotMeta[p.slotId]?.join('／')||p.slotId)}</strong><small>填報人：${escapeHTML(p.reporter||'未署名')}</small></header>${p.images?.length?`<img class="meal-review-cover" src="${escapeHTML(p.images[0])}" alt="修改提案的餐點照片">`:''}<div>${diff}</div><div class="meal-review-actions"><button type="button" class="primary-btn" data-approve="${escapeHTML(p.id)}">核准並公開</button><button type="button" class="secondary-btn" data-reject="${escapeHTML(p.id)}">退回</button></div></article>`}).join('');
 root.querySelectorAll('[data-approve]').forEach(b=>b.addEventListener('click',()=>decide(b.dataset.approve,true)));
 root.querySelectorAll('[data-reject]').forEach(b=>b.addEventListener('click',()=>decide(b.dataset.reject,false)));
}
async function decide(id,approve){if(!state.admin||!state.db||state.busy)return;const p=state.requests.get(id);if(!p||p.status!=='pending')return;
 if(!confirm(approve?'確定核准這份修改，直接更新首頁？':'確定退回這份修改？'))return;
 state.busy=true;
 try{const batch=writeBatch(state.db);if(approve){const existing=state.slots.get(p.slotId);const docData={mealName:p.mealName,unitPrice:p.unitPrice,totalBudget:p.totalBudget,note:p.note,imageData:p.imageData,images:p.images,createdAt:existing?.createdAt||serverTimestamp(),updatedAt:serverTimestamp(),lastApprovedBy:state.user.email};batch.set(slotRef(p.slotId),docData)}
 batch.update(requestRef(id),{status:approve?'approved':'rejected',reviewedAt:serverTimestamp(),reviewedBy:state.user.email});await batch.commit();showToast(approve?'已核准，首頁資料正在更新。':'已退回修改申請。')}
 catch(e){console.error('meal review',e);showToast('操作失敗：'+(e.message||e.code||'未知錯誤'))}
 finally{state.busy=false}
}
$('mealReviewClose').addEventListener('click',()=>reviewDialog.close());
function autoOpenMailReview(){const id=new URLSearchParams(location.search).get('review');if(!id||!state.admin)return;const p=state.requests.get(id);if(!p)return;openReview(p.slotId);history.replaceState(null,'',location.pathname+location.hash)}
const configured=!Object.values(firebaseConfig).some(x=>!x||String(x).includes('PASTE_'));
if(configured){const app=getApps()[0]||initializeApp(firebaseConfig);state.db=getFirestore(app);
 onSnapshot(collection(state.db,'christmas2026','main','mealSlots'),snap=>{state.slots=new Map(snap.docs.map(d=>[d.id,{...d.data(),id:d.id}]));renderCards()},e=>console.error('mealSlots',e));
 onSnapshot(collection(state.db,'christmas2026','main','publicMeals'),snap=>{const fresh=new Map();
  const all=new Map();
  for(const d of snap.docs){const data=d.data(),slot=getSlotId(data.branch,data.service);if(!slot)continue;const next={...data,id:d.id,legacy:true};
   if(!all.has(slot))all.set(slot,[]);all.get(slot).push(next);
   if(!fresh.has(slot)||((next.createdAt?.seconds||0)>(fresh.get(slot).createdAt?.seconds||0)))fresh.set(slot,next)}
  state.legacy=fresh;state.legacyAll=all;for(const item of fresh.values())maybeLoadLegacy(item);renderCards()
 },e=>console.error('legacy publicMeals',e));
 onAuthStateChanged(getAuth(app),user=>{state.user=user;state.admin=!!(user?.emailVerified&&superusers.some(s=>s===user.email?.toLowerCase()));
  state.pendingUnsub?.();state.pendingUnsub=null;state.requests.clear();renderCards();
  if(state.admin){state.pendingUnsub=onSnapshot(collection(state.db,'christmas2026','main','mealChangeRequests'),snap=>{
   state.requests=new Map(snap.docs.map(d=>[d.id,{...d.data(),id:d.id}]));renderCards();if(reviewDialog.open)drawReview();autoOpenMailReview()
  },e=>console.error('mealChangeRequests read',e))}
  else if(new URLSearchParams(location.search).has('review')){showToast('請先按右上角「管理者登入」，登入後即可審核此修改申請。')}
 });
}else{$('featuredMeals').innerHTML='<p class="meal-empty">Firebase 尚未設定，請確認 firebase-config.js。</p>'}
renderCards();
