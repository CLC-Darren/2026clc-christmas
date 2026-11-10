// Tiny service worker: cache ONLY install icons, not Firestore data or HTML/JS.
const CACHE='clc-christmas-icons-20261111';
const ASSETS=['/assets/icon-192.png','/assets/icon-512.png','/assets/icon-maskable-512.png','/assets/favicon-32.png','/assets/favicon.svg','/manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('clc-christmas-icons-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin||!ASSETS.includes(url.pathname))return;
  event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request)));
});
