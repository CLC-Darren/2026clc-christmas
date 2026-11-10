/* Add to home screen / Install PWA without altering Firebase application code. */
(()=>{
  'use strict';
  const btn=document.getElementById('installAppButton');
  const dlg=document.getElementById('installHelpDialog');
  let deferred=null;
  const installed=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
  const refresh=()=>{btn.hidden=installed()};
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferred=event;refresh()});
  window.addEventListener('appinstalled',()=>{deferred=null;refresh()});
  btn.addEventListener('click',async()=>{
    if(installed()){refresh();return}
    if(deferred){
      const prompt=deferred;deferred=null;
      try{await prompt.prompt();await prompt.userChoice}catch(e){console.warn('PWA install prompt',e)}
      return;
    }
    const ua=navigator.userAgent||'';
    const ios=/iPhone|iPad|iPod/.test(ua);
    const android=/Android/.test(ua);
    document.getElementById('installHelpText').textContent=ios
      ? '使用 Safari 開啟此網站，點選「分享」圖示，再選「加入主畫面」。若使用其他瀏覽器，請先改用 Safari。'
      :android
        ? '請開啟瀏覽器右上角選單，選擇「安裝應用程式」或「新增至主畫面」。若未看到選項，請使用 Chrome 或 Edge 開啟網站。'
        : '請從 Chrome／Edge 的網址列安裝圖示，或右上角瀏覽器選單選擇「安裝此網站／應用程式」。如果沒有安裝選項，請先使用 HTTPS 網址開啟網站。';
    dlg.showModal();
  });
  document.getElementById('installHelpClose').addEventListener('click',()=>dlg.close());
  document.getElementById('installHelpDone').addEventListener('click',()=>dlg.close());
  dlg.addEventListener('click',e=>{if(e.target===dlg)dlg.close()});
  if('serviceWorker' in navigator&&location.protocol==='https:')window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(e=>console.warn('PWA Service Worker',e)));
  refresh();
})();
