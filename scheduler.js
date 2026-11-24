export const DAY = 86400000;
export function dayKey(time = Date.now()) {
  const p = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(time);
  const get = k => p.find(x => x.type === k).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function dayStart(date) { return Date.parse(`${date}T00:00:00+08:00`); }
export function mastered(record) { return (record?.correctDays?.length || 0) >= 2; }
export function applyReview(previous, grade, now = Date.now()) {
  if (![0,1,2].includes(grade)) throw new Error('Invalid grade');
  const r = {attempts:0,lapses:0,correctDays:[],...previous};
  const today = dayKey(now);
  const correctDays = grade === 0 ? [] : grade === 2 ? [...new Set([...r.correctDays,today])].slice(-6) : [...r.correctDays];
  const delay = grade === 0 ? 5*60000 : grade === 1 ? 12*3600000 : (correctDays.length >= 3 ? 5 : correctDays.length >= 2 ? 3 : 1)*DAY;
  return {...r,attempts:r.attempts+1,lapses:r.lapses+(grade===0?1:0),correctDays,lastGrade:grade,lastReviewed:now,dueAt:now+delay,firstReviewed:r.firstReviewed || now};
}
export function plan(deck, records, examDate, now = Date.now(), kind='all') {
  const cards = deck.filter(c => kind==='all' || c.kind===kind);
  const today = dayKey(now);
  const exam = dayStart(examDate);
  // Finish first exposure three full days before the exam. Recalculate after a missed day.
  const daysForNew = Math.max(1, Math.floor((exam-4*DAY-dayStart(today))/DAY)+1);
  const unseen = cards.filter(c => !records[c.id]).length;
  const todayNew = cards.filter(c => records[c.id] && dayKey(records[c.id].firstReviewed)===today).length;
  const due = cards.filter(c => records[c.id]?.dueAt<=now).length;
  const recommendedNew = Math.max(0,Math.ceil((unseen+todayNew)/daysForNew)-todayNew);
  return {total:cards.length,unseen,due,recommendedNew,todayNew,daysForNew,mastered:cards.filter(c=>mastered(records[c.id])).length,daysLeft:Math.max(0,Math.ceil((exam-dayStart(today))/DAY))};
}
function shuffle(items, random) {
  const result = [...items];
  for(let i=result.length-1;i>0;i--) {const j=Math.floor(random()*(i+1)); [result[i],result[j]]=[result[j],result[i]];}
  return result;
}
export function makeQueue(deck, records, {size=10,kind='all',mode='smart',now=Date.now(),random=Math.random}={}) {
  const eligible=deck.filter(c=>kind==='all'||c.kind===kind);
  const weakSort=(a,b)=>(records[b.id]?.lapses||0)-(records[a.id]?.lapses||0)||(records[a.id]?.dueAt||0)-(records[b.id]?.dueAt||0);
  const due=eligible.filter(c=>records[c.id]?.dueAt<=now).sort(weakSort);
  const unseen=shuffle(eligible.filter(c=>!records[c.id]),random);
  const future=shuffle(eligible.filter(c=>records[c.id]?.dueAt>now),random).sort((a,b)=>records[a.id].lastReviewed-records[b.id].lastReviewed);
  if(mode==='wrong') return eligible.filter(c=>(records[c.id]?.lapses||0)>0&&!mastered(records[c.id])).sort(weakSort).slice(0,size).map(c=>c.id);
  if(mode==='mock') {
    const sound=shuffle(eligible.filter(c=>c.kind==='sound'),random);
    const shape=shuffle(eligible.filter(c=>c.kind==='shape'),random);
    const result=[];
    while(result.length<size&&(sound.length||shape.length)) {
      if(shape.length)result.push(shape.pop());
      if(sound.length&&result.length<size)result.push(sound.pop());
    }
    return shuffle(result,random).map(c=>c.id);
  }
  const result=[];
  // Keep covering new material even when overdue reviews accumulate.
  while(result.length<size&&(due.length||unseen.length)) {
    const chooseNew = unseen.length && (!due.length || result.length%3===2);
    result.push((chooseNew?unseen:due).shift());
  }
  if(result.length<size)result.push(...future.slice(0,size-result.length));
  return result.map(c=>c.id);
}
