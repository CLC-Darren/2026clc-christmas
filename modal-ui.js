// Minimal popup wiring. Forms remain owned by meal-public.js and app.js; no Firebase logic duplicated.
(()=>{
  const byId=id=>document.getElementById(id);
  const setup=(dialogId,closeId,openIds)=>{
    const dlg=byId(dialogId);
    if(!dlg)return;
    for(const id of openIds){
      byId(id)?.addEventListener('click',()=>{
        if(!dlg.open)dlg.showModal();
      });
    }
    byId(closeId)?.addEventListener('click',()=>dlg.close());
    // Click backdrop outside dialog rectangle to dismiss; clicking content won't close it.
    dlg.addEventListener('click',e=>{
      if(e.target!==dlg)return;
      const r=dlg.getBoundingClientRect();
      if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dlg.close();
    });
  };
  setup('mealDialog','mealDialogClose',['openMealFromHero','openMealFromShowcase','openMealFromWorkstreams']);
  setup('countDialog','countDialogClose',['openCountFromHero','openCountFromSection']);
  let toastTimeout;
  window.addEventListener('clc:meal-saved',e=>{
    const el=byId('toast');
    if(!el)return;
    el.textContent=e.detail.verified
      ? `成功送出 ${e.detail.count} 筆餐點，已同步顯示於首頁。`
      : `已儲存 ${e.detail.count} 筆餐點，但公開畫面尚未確認同步。請先重新整理，不要重複送出。`;
    el.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout=setTimeout(()=>el.classList.remove('show'),5600);
  });
})();
