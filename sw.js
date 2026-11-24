const CACHE='chineseword-v1';
const SHELL=['./','./index.html','./style.css','./app.js','./scheduler.js','./deck.json','./icon.svg','./manifest.webmanifest','./assets/icon-192.png','./assets/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('chineseword-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==location.origin)return;
 const isCard=new URL(event.request.url).pathname.includes('/assets/cards/');
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  if(isCard){const saved=await cache.match(event.request);if(saved)return saved;}
  try{const response=await fetch(event.request);if(response.ok)await cache.put(event.request,response.clone());return response;}
  catch(error){const saved=await cache.match(event.request);if(saved)return saved;if(event.request.mode==='navigate'){const home=await cache.match(new URL('./',self.location).href);if(home)return home;}throw error;}
 })());
});
self.addEventListener('message',event=>{
 if(event.data?.type!=='CACHE_DECK')return;
 const port=event.ports[0];
 event.waitUntil((async()=>{
  try{const cache=await caches.open(CACHE),urls=event.data.urls.filter(x=>typeof x==='string'&&x.startsWith('assets/cards/'));let current=0,next=0;
   async function worker(){while(next<urls.length){const url=new URL(urls[next++],self.location).href;if(!await cache.match(url))await cache.add(url);current++;if(current%15===0)port.postMessage({current,total:urls.length});}}
   await Promise.all(Array.from({length:6},worker));port.postMessage({done:true});
  }catch{port.postMessage({error:true});}
 })());
});
