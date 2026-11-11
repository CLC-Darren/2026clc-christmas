/* CLC Christmas - PWA desktop shortcut entry: native prompt first, browser steps if unavailable. */
(()=>{
  'use strict';
  const btn=document.getElementById('installAppButton');
  const dlg=document.getElementById('installHelpDialog');
  const help=document.getElementById('installHelpText');
  if(!btn||!dlg||!help)return;
  let deferredPrompt=null;
  let installedThisSession=false;
  let prompting=false;
  const displayMode=window.matchMedia('(display-mode: standalone)');
  const isStandalone=()=>displayMode.matches||window.navigator.standalone===true;
  const updateButton=()=>{
    btn.hidden=isStandalone()||installedThisSession;
    btn.disabled=prompting;
    if(prompting)btn.setAttribute('aria-busy','true');
    else btn.removeAttribute('aria-busy');
    btn.classList.toggle('install-ready',!!deferredPrompt);
  };
  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();
    deferredPrompt=event;
    installedThisSession=false;
    updateButton();
  });
  window.addEventListener('appinstalled',()=>{
    deferredPrompt=null;
    installedThisSession=true;
    if(dlg.open)dlg.close();
    updateButton();
  });
  const showHelp=(reason='')=>{
    const ua=navigator.userAgent||'';
    const ios=/iPhone|iPad|iPod/.test(ua)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1;
    const android=/Android/i.test(ua);
    let instructions;
    if(ios){
      instructions='請使用 Safari 開啟這個網站，再按「分享」→「加入主畫面」→「新增」，即可在桌面建立捷徑。';
    }else if(android){
      instructions='請使用 Chrome 開啟網站，點選右上角「⋮」→「安裝應用程式」或「加入主畫面」，依畫面提示確認。';
    }else if(/Edg\//.test(ua)){
      instructions='請按 Edge 網址列右側的安裝圖示；或右上角「…」→「應用程式」→「將此網站安裝為應用程式」。';
    }else if(/Chrome\//.test(ua)||/Brave/i.test(ua)){
      instructions='請點選瀏覽器網址列右側的安裝圖示，或右上角選單裡的「安裝應用程式／安裝此網站」。Brave 如未提供此選項，可以 Chrome 或 Edge 開啟網站。';
    }else{
      instructions='此瀏覽器暫未提供一鍵安裝提示。請從瀏覽器選單選擇「加入主畫面」或「安裝應用程式」，或改用 Chrome／Edge。';
    }
    help.textContent=(reason?reason+' ':'')+instructions;
    if(!dlg.open)dlg.showModal();
  };
  btn.addEventListener('click',async()=>{
    if(isStandalone()||installedThisSession){updateButton();return}
    if(prompting)return;
    if(deferredPrompt){
      const event=deferredPrompt;
      deferredPrompt=null;
      prompting=true;
      updateButton();
      try{
        // Must be invoked synchronously from the user's click. The browser owns the confirmation.
        await event.prompt();
        const choice=await event.userChoice;
        if(choice&&choice.outcome==='dismissed')return;
      }catch(err){
        console.warn('PWA native prompt unavailable:',err);
        showHelp('瀏覽器未能開啟建立桌面捷徑提示。');
      }finally{
        prompting=false;
        updateButton();
      }
      return;
    }
    showHelp();
  });
  document.getElementById('installHelpClose').addEventListener('click',()=>dlg.close());
  document.getElementById('installHelpDone').addEventListener('click',()=>dlg.close());
  dlg.addEventListener('click',e=>{if(e.target===dlg)dlg.close()});
  window.addEventListener('pageshow',updateButton);
  if(typeof displayMode.addEventListener==='function')displayMode.addEventListener('change',updateButton);
  if('serviceWorker' in navigator&&location.protocol==='https:'){
    window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(e=>console.warn('PWA Service Worker:',e)));
  }
  updateButton();
})();
