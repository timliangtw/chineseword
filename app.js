import {DAY,dayKey,dayStart,applyReview,mastered,plan,makeQueue} from './scheduler.js';
const $=s=>document.querySelector(s);
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STATE_KEY='chineseword.progress.v1', SESSION_KEY='chineseword.session.v1';
const defaults={examDate:'2026-12-03',kind:'all',size:10,font:'normal',pad:false};
let deckData,deck=[],cardMap=new Map(),state={version:1,settings:{...defaults},records:{},history:[]},session=null,screen='home',toastTimer,swRegistration;
let storageAvailable=true,processing=false;
function storageWarning(){const e=$('#storage-warning');e.hidden=false;e.textContent='這個瀏覽器暫時無法保存進度。請在離開前，到家長設定匯出備份。';}
function save(){try{localStorage.setItem(STATE_KEY,JSON.stringify(state));if(session)localStorage.setItem(SESSION_KEY,JSON.stringify(session));else localStorage.removeItem(SESSION_KEY);}catch{storageAvailable=false;storageWarning();}}
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3800);}
function isDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(dayStart(value))&&dayKey(dayStart(value))===value;}
function validSettings(value={}){return {examDate:isDate(value.examDate)?value.examDate:defaults.examDate,kind:['all','shape','sound'].includes(value.kind)?value.kind:'all',size:[10,20].includes(value.size)?value.size:10,font:value.font==='large'?'large':'normal',pad:value.pad===true};}
function validateState(value){
 if(!value||value.version!==1||!value.records||typeof value.records!=='object'||Array.isArray(value.records))throw new Error('這份檔案不是可使用的複習進度備份。');
 const records={};
 for(const [id,r] of Object.entries(value.records)){
  if(!cardMap.has(id))continue;
  if(!r||![r.attempts,r.lapses,r.lastReviewed,r.firstReviewed,r.dueAt].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0)||!Array.isArray(r.correctDays)||!r.correctDays.every(isDate)||![0,1,2].includes(r.lastGrade)||r.attempts<1)throw new Error('備份中的題目紀錄不完整，尚未匯入。');
  records[id]={attempts:Math.floor(r.attempts),lapses:Math.floor(r.lapses),lastReviewed:r.lastReviewed,firstReviewed:r.firstReviewed,dueAt:r.dueAt,correctDays:[...new Set(r.correctDays)].slice(-6),lastGrade:r.lastGrade};
 }
 const history=Array.isArray(value.history)?value.history.filter(x=>x&&typeof x.id==='string'&&Number.isFinite(x.time)&&[0,1,2].includes(x.grade)&&cardMap.has(x.id)).slice(-10000).map(x=>({id:x.id,time:x.time,grade:x.grade})):[];
 return {version:1,settings:validSettings(value.settings),records,history};
}
function load(){
 try{const raw=localStorage.getItem(STATE_KEY);if(raw)state=validateState(JSON.parse(raw));}catch{storageWarning();}
 try{const s=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');if(s&&['smart','wrong','mock'].includes(s.mode)&&['writing','review','done'].includes(s.phase)&&Array.isArray(s.queue)&&s.queue.every(id=>cardMap.has(id))&&Number.isInteger(s.index)&&s.index>=0&&s.index<=s.queue.length&&Array.isArray(s.results)){session=s;session.revealed=false;session.drawings=session.drawings||{};}}catch{/* A damaged round cannot invalidate the saved learning record. */}
 document.body.classList.toggle('large-type',state.settings.font==='large');
}
function wordHTML(c,answer=false){const indices=c.targetIndices||[c.targetIndex];return [...c.word].map((char,i)=>`<span${indices.includes(i)?' class="target"':''}>${escapeHTML(char)}</span>`).join('');}
function sourceLabel(c){return c.sources.map(s=>`${s.year} 年第 ${s.number} 題`).join('、');}
function todayAttempts(){const today=dayKey();return state.history.filter(h=>dayKey(h.time)===today);}
function renderHome(){
 screen='home';const p=plan(deck,state.records,state.settings.examDate,Date.now(),state.settings.kind);const viewed=p.total-p.unseen;const progress=p.total?Math.round(viewed/p.total*100):0;
 const today=todayAttempts();const wrong=deck.filter(c=>(state.settings.kind==='all'||c.kind===state.settings.kind)&&(state.records[c.id]?.lapses||0)>0&&!mastered(state.records[c.id])).length;
 const examLabel=p.daysLeft>0?`距離 ${+state.settings.examDate.slice(5,7)}/${+state.settings.examDate.slice(8)} 還有 ${p.daysLeft} 天`:dayKey()===state.settings.examDate?'今天考試，輕鬆暖身就好':'繼續累積你的實力';
 const active=session&&session.phase!=='done';
 $('#app').innerHTML=`<section class="hero"><div><div class="exam-chip">✦ ${examLabel}</div><p class="eyebrow">一小回合，一點進步</p><h1>把字記牢，<br>照自己的步調。</h1><p>先自己寫，再看看答案。<br>不熟的字，我們會陪你再練一次。</p></div><div class="orbit" style="--progress:${progress}%"><div class="orbit-text"><strong>${progress}<span>%</span></strong><span>全範圍已練過</span></div></div></section>
 ${active?`<section class="resume-banner"><p><strong>上次的${session.mode==='mock'?'模擬考':'練習'}還在這裡</strong><br>已完成 ${session.index}／${session.queue.length} 題，隨時可以接著做。</p><button class="button primary" id="resume">接著上次練習</button></section>`:''}
 <div class="dashboard-grid"><section class="panel"><h2>今天，先來一小回合</h2><p class="subtle">${state.settings.kind==='all'?'字形與字音混合練習':state.settings.kind==='shape'?'今天練字形':'今天練字音'} · 每回合 ${state.settings.size} 題</p><div class="count-row"><div><strong>${p.due}</strong><span>現在該複習</span></div><div><strong>${p.recommendedNew}</strong><span>建議再練的新題</span></div></div><button class="button primary full" id="start">${active?'接著上次練習':p.due||p.unseen?`開始 ${state.settings.size} 題`:'再練一小回合'}</button><p class="today-summary">${today.length?`今天已完成 ${today.length} 次作答，練過 ${new Set(today.map(h=>h.id)).size} 題。`:'今天做多少都可以，隨時停、隨時接著練。'}</p></section><section class="panel"><h2>換個方式練習</h2><div class="practice-options"><button class="option" id="wrong"><span><strong>錯題再挑戰</strong><small>${wrong?`${wrong} 題，慢慢變熟就好`:'做過的錯題會收在這裡'}</small></span><span class="badge-count">${wrong}</span></button><button class="option" id="mock"><span><strong>考前小測驗</strong><small>20 題，全部寫完再對答案</small></span><span class="symbol" aria-hidden="true">✎</span></button></div></section></div>
 <section class="progress-strip"><div class="progress-top"><strong>每一題，都有照顧到</strong><span>已練 ${viewed}／${p.total} 題 · 跨天確認記牢 ${p.mastered} 題</span></div><div class="progress-track" role="progressbar" aria-label="全範圍練習進度" aria-valuemin="0" aria-valuemax="${p.total}" aria-valuenow="${viewed}"><div style="width:${progress}%"></div></div></section>
 <p class="notice">${p.recommendedNew>state.settings.size*3?'題目比較多，可以分成早、晚幾個小回合。':'少做一點，下次接續；想多做，也隨時歡迎。'} 排程會依實際進度調整，${p.unseen?`還有 ${p.unseen} 題等待第一次練習。`:'全部題目都已練過，接下來把不熟的字練穩。'}</p>`;
 $('#start').onclick=()=>active?resume():startSession('smart');if($('#resume'))$('#resume').onclick=resume;
 $('#wrong').onclick=()=>requestNewSession('wrong');$('#mock').onclick=()=>requestNewSession('mock');
}
function requestNewSession(mode){
 if(session&&session.phase!=='done'){
  const message='目前有一回合尚未完成。要結束這一回合，開始新的練習嗎？已評分的題目進度會保留。';
  if(!confirm(message))return;
 }
 startSession(mode);
}
function startSession(mode){
 const queue=makeQueue(deck,state.records,{mode,size:mode==='mock'?20:state.settings.size,kind:state.settings.kind});
 if(!queue.length){$('#app').innerHTML=`<section class="panel empty"><div class="done-symbol">✓</div><h1>目前沒有待加強的錯題</h1><p>可以開始一般練習，或來一回合小測驗。</p><button class="button primary" id="back-home">回到首頁</button></section>`;$('#back-home').onclick=renderHome;screen='empty';return;}
 session={mode,queue,index:0,phase:'writing',revealed:false,results:[],drawings:{},retries:{},started:Date.now(),id:`round-${Date.now()}`,initialSize:queue.length};save();renderSession();window.scrollTo({top:0,behavior:'instant'});
}
function resume(){renderSession();window.scrollTo({top:0,behavior:'instant'});}
function currentCard(){return cardMap.get(session.queue[session.index]);}
function questionHTML(c){
 if(c.kind==='sound')return `<div class="word" aria-label="${escapeHTML(c.word)}，請寫出${escapeHTML(c.target)}的注音">${wordHTML(c)}</div>`;
 if(c.bopomofo)return `<div class="word shape-word" aria-label="依注音寫國字">${[...c.word].map((char,i)=>c.targetIndices.includes(i)?`<span class="phonetic-hint">${escapeHTML(c.bopomofo)}</span>`:`<span>${escapeHTML(char)}</span>`).join('')}</div>`;
 return `<img class="question-image" src="${c.prompt}" alt="依圖片中的注音寫出國字，答案尚未顯示" draggable="false">`;
}
function answerHTML(c){return `<section class="answer-box"><p class="answer-label">正確答案</p>${c.kind==='shape'?`<div class="answer-glyph">${escapeHTML(c.target)}</div>`:c.bopomofo?`<div class="answer-glyph zhuyin">${escapeHTML(c.bopomofo)}</div>`:`<img class="answer-image" src="${c.answerImage}" alt="原教材的正確注音，請核對聲母、韻母與聲調" draggable="false">`}<div class="answer-word">${wordHTML(c,true)}</div><p class="answer-note">${c.kind==='sound'?'聲母、韻母、聲調都寫對，才算答對。':'注意部件與筆畫，整個字寫對才算答對。'}</p>${c.note?`<p class="answer-note">教材提醒：${escapeHTML(c.note)}</p>`:''}<details class="source-details"><summary>看看教材原題</summary><img src="${c.sourceImage}" alt="教材原題與紅色答案"></details></section>`;}
function renderSession(){
 screen='study';processing=false;
 if(!session)return renderHome();if(session.phase==='done')return renderDone();
 if(session.index>=session.queue.length){if(session.mode==='mock'&&session.phase==='writing'){session.phase='review';session.index=0;session.revealed=true;save();}else {session.phase='done';save();return renderDone();}}
 const c=currentCard(),mock=session.mode==='mock',review=mock&&session.phase==='review',revealed=session.revealed||review;
 const label=mock?(review?'核對小測驗':'考前小測驗'):session.mode==='wrong'?'錯題再挑戰':'今天的小回合';
 $('#app').innerHTML=`<nav class="session-nav"><button class="icon-button" id="pause">休息一下</button><p><strong>${label}</strong> · ${session.index+1}／${session.queue.length} 題</p></nav><div class="session-meter"><div style="width:${session.index/session.queue.length*100}%"></div></div>
 <article class="study-card"><div class="card-meta"><span class="tag ${c.kind}">${c.kind==='shape'?'字形練習':'字音練習'}</span><span class="source-label">${escapeHTML(sourceLabel(c))}</span></div><div class="question-area"><p class="instruction">${c.kind==='shape'?'把注音換成國字，先自己寫寫看。':'寫出標示國字的完整注音，別忘了聲調。'}</p>${questionHTML(c)}</div>
 ${review&&session.drawings[c.id]?`<div class="pad-wrap"><p class="subtle">你剛才寫的答案</p><img id="pad-drawing" src="${session.drawings[c.id]}" alt="你在平板上寫的答案"></div>`:''}
 ${!review?`<div class="pad-wrap" ${state.settings.pad?'':'hidden'} id="pad-wrap"><div class="pad-head"><span>這裡可以手寫，也可以寫在紙上。</span><button class="text-button" id="clear-pad">清除</button></div><canvas id="pad" aria-label="手寫練習區；也可以在紙上作答"></canvas></div>`:''}
 ${revealed?answerHTML(c):''}</article>
 <div class="study-controls">${revealed?`<p class="subtle" style="text-align:center;margin:0 0 14px">依照剛才自己寫的答案來選：</p><div class="grading"><button class="button grade no" data-grade="0">不會／寫錯<small>再練一次</small></button><button class="button grade unsure" data-grade="1">答對但猶豫<small>早一點複習</small></button><button class="button grade yes" data-grade="2">自己答對<small>隔天再確認</small></button></div>`:`<button class="button primary full" id="reveal">${mock?'我寫好了，下一題':'我寫好了，看答案'}</button>`}
 ${!review?`<div class="write-toggle"><button class="text-button" id="toggle-pad">${state.settings.pad?'收起手寫板':'在平板上手寫'}</button><span class="small" style="color:var(--muted)">紙筆作答也可以</span></div>`:''}</div>`;
 $('#pause').onclick=()=>{saveDrawing();save();renderHome();};
 if($('#reveal'))$('#reveal').onclick=()=>{
  if(processing)return;processing=true;saveDrawing();
  if(mock){session.index++;session.revealed=false;save();renderSession();window.scrollTo({top:0,behavior:'instant'});}else{session.revealed=true;save();renderSession();}
 };
 document.querySelectorAll('[data-grade]').forEach(b=>b.onclick=()=>gradeCard(Number(b.dataset.grade)));
 if($('#toggle-pad'))$('#toggle-pad').onclick=()=>{saveDrawing();state.settings.pad=!state.settings.pad;save();renderSession();};
 if($('#pad')&&state.settings.pad)initPad();
}
function gradeCard(grade){
 if(processing)return;processing=true;const c=currentCard();const now=Date.now();
 state.records[c.id]=applyReview(state.records[c.id],grade,now);state.history.push({id:c.id,time:now,grade});if(state.history.length>10000)state.history=state.history.slice(-10000);
 session.results.push({id:c.id,grade});
 // Revisit after at least three other cards. A short round never loops on the same mistake.
 if(grade===0&&session.mode!=='mock'&&session.queue.length-session.index-1>=3&&(session.retries[c.id]||0)<1){session.queue.splice(session.index+4,0,c.id);session.retries[c.id]=(session.retries[c.id]||0)+1;}
 delete session.drawings[c.id];session.index++;session.revealed=false;save();renderSession();window.scrollTo({top:0,behavior:'instant'});
}
function renderDone(){
 screen='done';const results=session.results;const correct=results.filter(r=>r.grade===2).length,unsure=results.filter(r=>r.grade===1).length,wrong=results.filter(r=>r.grade===0).length;
 const unique=new Set(results.map(r=>r.id)).size;const p=plan(deck,state.records,state.settings.examDate,Date.now(),state.settings.kind);
 $('#app').innerHTML=`<section class="panel done"><div class="done-symbol" aria-hidden="true">✦</div><p class="eyebrow">你又往前走了一小步</p><h1>${session.mode==='mock'?'小測驗完成！':'這一回合完成了！'}</h1><p>你認真練了 ${unique} 題${results.length>unique?`，共完成 ${results.length} 次作答`:''}。${wrong?'不熟的字已經記下來，下次會陪你再練。':'給自己一個小小的鼓勵。'}</p><div class="score-grid"><div><strong>${correct}</strong><span>自己答對</span></div><div><strong>${unsure}</strong><span>有點猶豫</span></div><div><strong>${wrong}</strong><span>再練一次</span></div></div><p>${p.unseen?`全範圍還有 ${p.unseen} 題沒練過，下一回合會繼續安排。`:'全範圍都練過了！接下來，讓記憶更穩。'}</p><div class="button-row"><button class="button primary" id="another">還想再做 ${state.settings.size} 題</button><button class="button secondary" id="done-home">今天先到這裡</button></div><p class="small">休息沒有關係，回來會依照你的進度接續。</p></section>`;
 $('#another').onclick=()=>startSession('smart');$('#done-home').onclick=()=>{session=null;save();renderHome();};
}
function initPad(){
 const canvas=$('#pad'),rect=canvas.getBoundingClientRect(),scale=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(rect.width*scale);canvas.height=Math.round(rect.height*scale);
 const ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.lineWidth=3.3;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#24445b';let drawing=false,dirty=false,last;
 const existing=session.drawings[currentCard().id];if(existing){const image=new Image();image.onload=()=>ctx.drawImage(image,0,0,rect.width,rect.height);image.src=existing;}
 const point=e=>{const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
 canvas.onpointerdown=e=>{if(e.button!==0&&e.pointerType==='mouse')return;e.preventDefault();drawing=true;dirty=true;canvas.setPointerCapture(e.pointerId);last=point(e);ctx.beginPath();ctx.arc(last.x,last.y,1.6,0,Math.PI*2);ctx.fillStyle=ctx.strokeStyle;ctx.fill();};
 canvas.onpointermove=e=>{if(!drawing)return;e.preventDefault();const p=point(e);ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();last=p;};
 const finish=()=>{if(!drawing)return;drawing=false;saveDrawing();save();};canvas.onpointerup=finish;canvas.onpointercancel=finish;
 canvas.dataset.ready='true';canvas.hasInk=()=>dirty||!!session.drawings[currentCard().id];
 $('#clear-pad').onclick=()=>{ctx.clearRect(0,0,rect.width,rect.height);dirty=false;delete session.drawings[currentCard().id];save();};
}
function saveDrawing(){const canvas=$('#pad');if(canvas&&canvas.dataset.ready&&canvas.hasInk?.()&&session&&session.phase!=='done')session.drawings[currentCard().id]=canvas.toDataURL('image/png');}
function openSettings(){
 saveDrawing();save();$('#exam-date').value=state.settings.examDate;$('#kind').value=state.settings.kind;$('#round-size').value=state.settings.size;$('#font-size').value=state.settings.font;
 const p=plan(deck,state.records,state.settings.examDate);const recent=state.history.filter(h=>h.time>Date.now()-7*DAY);const weak=deck.filter(c=>(state.records[c.id]?.lapses||0)>0&&!mastered(state.records[c.id])).sort((a,b)=>state.records[b.id].lapses-state.records[a.id].lapses).slice(0,5);
 $('#parent-stats').innerHTML=`<div class="stat-list"><div><span>全題庫</span><strong>${deck.length} 題</strong></div><div><span>尚未練過</span><strong>${p.unseen} 題</strong></div><div><span>不同日期答對兩次</span><strong>${p.mastered} 題</strong></div><div><span>最近 7 天作答</span><strong>${recent.length} 次</strong></div></div><p>${weak.length?`最近需要加強：${weak.map(c=>escapeHTML(c.word)).join('、')}`:'完成練習後，這裡會顯示需要加強的詞語。'}</p>`;
 $('#deck-info').textContent=`原教材 600 題，移除 ${deckData.summary.removed} 題完全重複題，保留 ${deck.length} 題（字形 ${deckData.summary.shape}、字音 ${deckData.summary.sound}）。同字不同詞、不同目標位置分開保留。`;
 $('#settings-status').textContent='';$('#search').value='';renderSearch('');$('#settings').showModal();
}
function renderSearch(term){
 const q=term.trim();if(!q){$('#search-results').innerHTML='<p class="small">可搜尋詞語，查看考的國字、答案與來源。</p>';return;}
 const found=deck.filter(c=>c.word.includes(q)).slice(0,50);
 $('#search-results').innerHTML=found.length?found.map(c=>`<div class="search-item"><div><div class="word-small">${[...c.word].map((x,i)=>`<span class="${c.targetIndices.includes(i)?'search-target':''}">${escapeHTML(x)}</span>`).join('')}</div><small>${c.kind==='shape'?'字形':'字音'} · ${escapeHTML(sourceLabel(c))}</small></div><span class="search-answer">${escapeHTML(c.kind==='shape'?c.target:c.bopomofo||'看原題')}</span></div>`).join(''):'<p>找不到這個詞語。</p>';
}
function bindSettings(){
 $('#brand').onclick=e=>{e.preventDefault();saveDrawing();save();renderHome();};$('#settings-open').onclick=openSettings;$('#settings-close').onclick=()=>$('#settings').close();
 $('#settings-form').onsubmit=e=>{e.preventDefault();const date=$('#exam-date').value;if(!isDate(date))return toast('請選擇有效的考試日期。');state.settings={...state.settings,examDate:date,kind:$('#kind').value,size:Number($('#round-size').value),font:$('#font-size').value};save();document.body.classList.toggle('large-type',state.settings.font==='large');$('#settings').close();if(screen==='study')renderSession();else if(screen==='done')renderDone();else renderHome();toast('設定已儲存，排程會跟著調整。');};
 $('#search').oninput=e=>renderSearch(e.target.value);
 $('#export').onclick=()=>{saveDrawing();save();const blob=new Blob([JSON.stringify({...state,exportedAt:new Date().toISOString(),deckVersion:deckData.version},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`字字小宇宙-進度-${dayKey()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);$('#settings-status').textContent='已匯出進度，請將檔案存到安全的位置。';};
 $('#import').onclick=()=>$('#import-file').click();
 $('#import-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>3*1024*1024)throw new Error('檔案太大，請選擇此網站匯出的進度 JSON。');const imported=validateState(JSON.parse(await file.text()));if(!confirm(`要匯入 ${Object.keys(imported.records).length} 題的學習進度嗎？這會取代目前進度，未完成的回合也會結束。`))return;state=imported;session=null;save();document.body.classList.toggle('large-type',state.settings.font==='large');$('#settings').close();renderHome();toast('進度已匯入，可以接著練習了。');}catch(err){$('#settings-status').textContent=err instanceof SyntaxError?'無法讀取這份檔案，請選擇匯出的進度 JSON。':err.message;}finally{e.target.value='';}};
 $('#offline').onclick=async()=>{
  const button=$('#offline');if(!('serviceWorker' in navigator)){$('#settings-status').textContent='這個瀏覽器不支援離線題庫，連線時仍可正常練習。';return;}
  button.disabled=true;try{const registration=await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('timeout')),10000))]);const worker=registration.active;if(!worker)throw new Error();const channel=new MessageChannel();channel.port1.onmessage=e=>{if(e.data.error){button.disabled=false;$('#settings-status').textContent='下載中斷，請確認網路後再試一次。';}else if(e.data.done){button.disabled=false;$('#settings-status').textContent=`離線題庫已備妥，共 ${deck.length} 題。沒有網路時也能開啟這個網址。`;}else $('#settings-status').textContent=`正在下載離線題庫… ${e.data.current}／${e.data.total}`;};worker.postMessage({type:'CACHE_DECK',urls:[...new Set(deck.flatMap(c=>[c.prompt,c.answerImage,c.sourceImage]))]},[channel.port2]);}catch{button.disabled=false;$('#settings-status').textContent='離線功能尚未準備好，請重新整理後再試一次。';}
 };
}
window.addEventListener('pagehide',()=>{saveDrawing();save();});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){saveDrawing();save();}});
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(screen==='study'&&state.settings.pad&&session?.phase==='writing'){saveDrawing();renderSession();}},180);});
async function init(){
 try{const response=await fetch('./deck.json');if(!response.ok)throw new Error('題庫載入失敗');deckData=await response.json();deck=deckData.cards;cardMap=new Map(deck.map(c=>[c.id,c]));load();bindSettings();renderHome();if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').then(r=>swRegistration=r).catch(()=>{});}catch(err){$('#app').innerHTML='<section class="panel empty"><h1>題庫還沒載入成功</h1><p>請確認網路連線，再按一次重新載入。</p><button class="button primary" id="reload">重新載入</button></section>';$('#reload').onclick=()=>location.reload();console.error(err);}
}
init();
