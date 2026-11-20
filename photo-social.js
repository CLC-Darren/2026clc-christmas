import {firebaseConfig} from './firebase-config.js';
import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
import {getAuth,signInAnonymously} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';
import {getFirestore,collection,doc,onSnapshot,setDoc,deleteDoc} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';

const reactions=[
  ['like','👍','讚'],['love','❤️','好愛'],['care','🥰','抱抱'],
  ['laugh','😆','哈'],['wow','😮','哇'],['sad','😢','難過'],['angry','😡','生氣']
];
const labels=new Map(reactions.map(([id,icon,label])=>[id,{icon,label}]));
const thumbOutline='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M8 20H4V10h4m0 10h9.2a2 2 0 0 0 1.97-1.66l1.18-6.5A1.6 1.6 0 0 0 18.77 10H15l.55-3.55A2.28 2.28 0 0 0 13.3 4L8 10m0 10V10"/></svg>';
const storageKey='clc-photo-reactions-v1';
let local={};
try{local=JSON.parse(localStorage.getItem(storageKey))||{}}catch{}
const channels=new Map();
let services;
let guestSignIn;
let guestUnavailable=false;

function firebase(){
  if(!services){
    const app=initializeApp(firebaseConfig,'photo-reactions');
    services={db:getFirestore(app),auth:getAuth(app)};
    services.auth.onAuthStateChanged(()=>channels.forEach(refresh));
  }
  return services;
}

async function guest(){
  const {auth}=firebase();
  await auth.authStateReady();
  if(auth.currentUser)return auth.currentUser;
  guestSignIn??=signInAnonymously(auth).then(result=>result.user).finally(()=>{guestSignIn=null});
  return guestSignIn;
}

function photoKey(album,src){
  let hash=2166136261;
  for(let i=0;i<src.length;i++)hash=Math.imul(hash^src.charCodeAt(i),16777619);
  return album+':'+src.length+':'+(hash>>>0).toString(36);
}

function refresh(channel){
  const uid=services?.auth.currentUser?.uid;
  const shared=channel.mode==='shared';
  const localOnly=!shared||guestUnavailable||(!uid&&!!local[channel.key]);
  const reaction=localOnly?local[channel.key]:channel.votes.get(uid);
  const {icon,label}=labels.get(reaction)||labels.get('like');
  const countValue=(shared?channel.votes.size:0)+(localOnly&&reaction?1:0);
  for(const root of channel.roots){
    const button=root.querySelector('.photo-like');
    button.setAttribute('aria-pressed',String(!!reaction));
    button.disabled=channel.busy||channel.mode==='loading';
    button.setAttribute('aria-label',reaction?`收回表情：${label}`:'按讚');
    button.title=button.getAttribute('aria-label');
    const iconSlot=button.querySelector('.photo-like-icon');
    if(reaction)iconSlot.textContent=icon;
    else if(!iconSlot.querySelector('svg'))iconSlot.innerHTML=thumbOutline;
    const count=root.querySelector('.photo-reaction-count');
    count.textContent=channel.mode==='loading'?'…':countValue.toLocaleString('zh-TW');
    count.title=localOnly?(shared?'共用總數及此瀏覽器的表情':'此瀏覽器的表情數'):'所有訪客的表情數';
    const localLabel=root.querySelector('.photo-local-label');
    localLabel.textContent=shared?'含本機':'本機';
    localLabel.hidden=channel.mode==='loading'||!localOnly;
    root.querySelectorAll('[data-reaction]').forEach(option=>{
      option.disabled=channel.busy||channel.mode==='loading';
      option.setAttribute('aria-pressed',String(option.dataset.reaction===reaction));
    });
  }
}

function subscribe(key,root){
  let channel=channels.get(key);
  if(!channel){
    channel={key,roots:new Set(),votes:new Map(),mode:'loading',busy:false,stop:null};
    channels.set(key,channel);
    const {db}=firebase();
    const ref=collection(db,'christmas2026','main','photoReactions',key,'votes');
    channel.ref=ref;
    channel.stop=onSnapshot(ref,snapshot=>{
      channel.mode='shared';
      channel.votes=new Map(snapshot.docs.map(record=>[record.id,record.data().kind]).filter(([,kind])=>labels.has(kind)));
      refresh(channel);
    },()=>{
      channel.mode='local';
      refresh(channel);
    });
  }
  channel.roots.add(root);
  refresh(channel);
  return channel;
}

function unsubscribe(channel,root){
  if(!channel)return;
  channel.roots.delete(root);
  queueMicrotask(()=>{
    if(channel.roots.size||channels.get(channel.key)!==channel)return;
    channel.stop?.();
    channels.delete(channel.key);
  });
}

function saveLocal(){
  try{localStorage.setItem(storageKey,JSON.stringify(local))}catch{}
}

function changeLocal(channel,kind,toggle){
  if(toggle&&local[channel.key])delete local[channel.key];
  else if(local[channel.key]===kind)delete local[channel.key];
  else local[channel.key]=kind;
  saveLocal();
}

async function react(channel,kind,toggle=false){
  if(!channel||channel.busy||channel.mode==='loading')return;
  const localReaction=local[channel.key];
  const removingLocal=localReaction&&!services?.auth.currentUser&&(toggle||localReaction===kind);
  if(channel.mode==='local'||guestUnavailable||removingLocal){
    changeLocal(channel,kind,toggle);
    refresh(channel);
    return;
  }
  channel.busy=true;
  refresh(channel);
  try{
    const user=await guest();
    const previous=channel.votes.get(user.uid);
    const vote=doc(channel.ref,user.uid);
    if(previous&&(toggle||previous===kind))await deleteDoc(vote);
    else await setDoc(vote,{kind});
    if(localReaction){
      delete local[channel.key];
      saveLocal();
    }
  }catch(error){
    if(['auth/admin-restricted-operation','auth/operation-not-allowed'].includes(error.code)){
      guestUnavailable=true;
      changeLocal(channel,kind,toggle);
      channels.forEach(refresh);
    }else{
      channel.roots.forEach(root=>{root.querySelector('[role="status"]').textContent='表情未更新，請再試一次。'});
    }
  }finally{
    channel.busy=false;
    refresh(channel);
  }
}

class PhotoReactionsBar extends HTMLElement{
  connectedCallback(){
    if(this.key&&!this.channel)this.channel=subscribe(this.key,this);
  }
  disconnectedCallback(){
    unsubscribe(this.channel,this);
    this.channel=null;
  }
  setPhoto(key){
    if(this.key===key)return;
    this.disconnectedCallback();
    this.key=key;
    this.hidden=!key;
    this.replaceChildren();
    if(!key)return;
    this.innerHTML=`<div class="photo-reaction-controls">
      <button type="button" class="photo-like" aria-pressed="false" aria-expanded="false" aria-keyshortcuts="ArrowUp">
        <span class="photo-like-icon" aria-hidden="true">${thumbOutline}</span>
      </button>
      <span class="photo-reaction-count" aria-label="表情數">…</span>
      <div class="photo-emoji-options" role="group" aria-label="照片表情" hidden>
        ${reactions.map(([id,icon,label])=>`<button type="button" data-reaction="${id}" aria-label="${label}" title="${label}" aria-pressed="false">${icon}</button>`).join('')}
      </div>
      <span class="photo-local-label" hidden>本機</span>
    </div><p class="photo-social-status" role="status"></p>`;
    const palette=this.querySelector('.photo-emoji-options');
    const controls=this.querySelector('.photo-reaction-controls');
    const likeButton=this.querySelector('.photo-like');
    let dismissTimer;
    let holdTimer;
    let holdStart;
    let longPress=false;
    const showPalette=show=>{
      palette.hidden=!show;
      likeButton.setAttribute('aria-expanded',String(show));
    };
    const cancelHold=()=>{
      clearTimeout(holdTimer);
      holdStart=null;
    };
    likeButton.addEventListener('pointerenter',event=>{
      if(event.pointerType==='mouse')showPalette(true);
    });
    controls.addEventListener('pointerenter',()=>clearTimeout(dismissTimer));
    controls.addEventListener('pointerleave',event=>{
      if(event.pointerType==='mouse'){
        dismissTimer=setTimeout(()=>{
          if(!palette.contains(document.activeElement))showPalette(false);
        },180);
      }
    });
    controls.addEventListener('focusout',event=>{
      if(!controls.contains(event.relatedTarget))showPalette(false);
    });
    likeButton.addEventListener('pointerdown',event=>{
      longPress=false;
      if(event.pointerType!=='touch'&&event.pointerType!=='pen')return;
      likeButton.focus({preventScroll:true});
      holdStart=event;
      holdTimer=setTimeout(()=>{
        longPress=true;
        showPalette(true);
      },450);
    });
    likeButton.addEventListener('pointermove',event=>{
      if(holdStart&&Math.hypot(event.clientX-holdStart.clientX,event.clientY-holdStart.clientY)>10)cancelHold();
    });
    likeButton.addEventListener('pointerup',cancelHold);
    likeButton.addEventListener('pointercancel',cancelHold);
    likeButton.addEventListener('contextmenu',event=>event.preventDefault());
    likeButton.onclick=event=>{
      if(event.detail&&longPress){
        longPress=false;
        return;
      }
      showPalette(false);
      react(this.channel,'like',true);
    };
    palette.onclick=event=>{
      const button=event.target.closest('[data-reaction]');
      if(!button)return;
      showPalette(false);
      likeButton.focus({preventScroll:true});
      react(this.channel,button.dataset.reaction);
    };
    controls.addEventListener('keydown',event=>{
      if(event.key==='ArrowUp'&&event.target===likeButton){
        event.preventDefault();
        event.stopPropagation();
        showPalette(true);
        palette.querySelector('button').focus();
      }else if(event.key==='Escape'&&!palette.hidden){
        event.preventDefault();
        event.stopPropagation();
        showPalette(false);
        likeButton.focus();
      }
    });
    if(this.isConnected)this.connectedCallback();
  }
}
customElements.define('photo-reactions-bar',PhotoReactionsBar);

export function sharedPhoto(kind){
  const [type,album,photo]=new URLSearchParams(location.search).get('photo')?.split(':')||[];
  return type===kind&&album&&photo?{album,photo}:null;
}

export function renderPhotoSocial(root,photo){
  root.setPhoto(photo?photoKey(photo.kind+':'+photo.album,photo.src):null);
}

window.addEventListener('storage',event=>{
  if(event.key!==storageKey)return;
  try{local=JSON.parse(event.newValue)||{}}catch{local={}}
  channels.forEach(refresh);
});
