const reactions=[
  ['like','👍','讚'],['love','❤️','好愛'],['care','🥰','抱抱'],
  ['laugh','😆','哈'],['wow','😮','哇'],['sad','😢','難過'],['angry','😡','生氣']
];
const storageKey='clc-photo-reactions-v1';
let choices={};
try{choices=JSON.parse(localStorage.getItem(storageKey))||{}}catch{}
const mounted=new WeakMap();

function photoKey(album,src){
  // Scope the reaction to the image content, even when its position in the album changes.
  let hash=2166136261;
  for(let i=0;i<src.length;i++)hash=Math.imul(hash^src.charCodeAt(i),16777619);
  return album+':'+src.length+':'+(hash>>>0).toString(36);
}

function refresh(root){
  const current=choices[root.dataset.photoKey];
  const alternate=reactions.find(([id])=>id===current&&id!=='like');
  const trigger=root.querySelector('.photo-emoji summary');
  trigger.querySelector('span').textContent=alternate?.[1]||'☺';
  trigger.dataset.selected=String(!!alternate);
  root.querySelectorAll('[data-reaction]').forEach(button=>{
    button.setAttribute('aria-pressed',String(button.dataset.reaction===current));
  });
}

export function sharedPhoto(kind){
  const [type,album,photo]=new URLSearchParams(location.search).get('photo')?.split(':')||[];
  return type===kind&&album&&photo?{album,photo}:null;
}

function reactionButton([id,emoji,label]){
  return `<button type="button" data-reaction="${id}" aria-label="${label}" title="${label}" aria-pressed="false"><span aria-hidden="true">${emoji}</span></button>`;
}

export function renderPhotoSocial(root,photo){
  root.hidden=!photo;
  if(!photo){
    root.replaceChildren();
    delete root.dataset.photoKey;
    mounted.delete(root);
    return;
  }
  const {kind,album,position,src,title}=photo;
  const key=photoKey(kind+':'+album,src);
  const url=new URL(location.pathname,location.origin);
  url.searchParams.set('photo',[kind,album,position].join(':'));
  const shareUrl=url.href;
  if(mounted.get(root)===shareUrl+'|'+key+'|'+title)return;
  mounted.set(root,shareUrl+'|'+key+'|'+title);
  root.dataset.photoKey=key;
  root.innerHTML=`<div class="photo-social-row">
    <div class="photo-reactions">
      ${reactionButton(reactions[0])}
      <details class="photo-emoji">
        <summary aria-label="選擇表情"><span aria-hidden="true">☺</span></summary>
        <div class="photo-emoji-options" role="group" aria-label="照片表情">
          ${reactions.slice(1).map(reactionButton).join('')}
        </div>
      </details>
    </div>
    <details class="photo-share">
      <summary><span aria-hidden="true">↗</span> 分享</summary>
      <div class="photo-share-options">
        <a data-facebook target="_blank" rel="noopener noreferrer">Facebook</a>
        <a data-line target="_blank" rel="noopener noreferrer">LINE</a>
        <button type="button" data-native-share hidden>更多</button>
        <button type="button" data-copy-link>複製連結</button>
      </div>
    </details>
  </div>
  <p class="photo-social-status" role="status"></p>`;
  const status=root.querySelector('.photo-social-status');
  root.querySelector('[data-facebook]').href='https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(shareUrl);
  root.querySelector('[data-line]').href='https://social-plugins.line.me/lineit/share?url='+encodeURIComponent(shareUrl);
  const nativeShare=root.querySelector('[data-native-share]');
  if(navigator.share){
    nativeShare.hidden=false;
    nativeShare.onclick=async()=>{
      try{await navigator.share({title,url:shareUrl})}
      catch(error){if(error.name!=='AbortError')status.textContent='分享未完成，可以複製連結。'}
    };
  }
  root.querySelector('[data-copy-link]').onclick=async()=>{
    try{
      await navigator.clipboard.writeText(shareUrl);
      status.textContent='已複製照片連結';
    }catch{
      status.replaceChildren();
      const link=document.createElement('input');
      link.type='url';
      link.value=shareUrl;
      link.readOnly=true;
      link.setAttribute('aria-label','照片分享連結');
      status.append(link);
      link.select();
    }
  };
  root.querySelector('.photo-reactions').onclick=event=>{
    const button=event.target.closest('[data-reaction]');
    if(!button)return;
    const reaction=button.dataset.reaction;
    const emojiMenu=root.querySelector('.photo-emoji');
    if(emojiMenu.open){
      emojiMenu.open=false;
      emojiMenu.querySelector('summary').focus();
    }
    if(choices[key]===reaction)delete choices[key];
    else choices[key]=reaction;
    let saved=true;
    try{localStorage.setItem(storageKey,JSON.stringify(choices))}catch{saved=false}
    document.querySelectorAll('[data-photo-key]').forEach(element=>{
      if(element.dataset.photoKey===key)refresh(element);
    });
    status.textContent=saved?(choices[key]?'已在此瀏覽器儲存表情':'已移除表情'):'表情已在此頁更新。';
  };
  refresh(root);
}

window.addEventListener('storage',event=>{
  if(event.key!==storageKey)return;
  try{choices=JSON.parse(event.newValue)||{}}catch{choices={}}
  document.querySelectorAll('[data-photo-key]').forEach(refresh);
});
