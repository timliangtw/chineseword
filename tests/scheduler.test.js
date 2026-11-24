import test from 'node:test';
import assert from 'node:assert/strict';
import {DAY,dayKey,dayStart,applyReview,mastered,plan,makeQueue} from '../scheduler.js';
const now=Date.parse('2026-11-25T10:00:00+08:00');
const deck=Array.from({length:60},(_,i)=>({id:`c${i}`,kind:i%2?'shape':'sound'}));
test('Taipei day boundary and independent-day mastery',()=>{
  assert.equal(dayKey(Date.parse('2026-11-25T16:01:00Z')),'2026-11-26');
  let r=applyReview(null,2,now);r=applyReview(r,2,now+10000);
  assert.equal(mastered(r),false);
  r=applyReview(r,2,now+DAY);assert.equal(mastered(r),true);
  r=applyReview(r,0,now+DAY+1000);assert.equal(mastered(r),false);
  assert.equal(r.dueAt,now+DAY+1000+300000);
});
test('less work carries forward and a missed day recalculates remaining work',()=>{
  const initial=plan(deck,{},'2026-12-03',now);assert.equal(initial.recommendedNew,12);
  const records={};deck.slice(0,5).forEach(c=>records[c.id]=applyReview(null,2,now));
  assert.equal(plan(deck,records,'2026-12-03',now).recommendedNew,7);
  assert.equal(plan(deck,records,'2026-12-03',now+DAY).recommendedNew,14);
});
test('doing extra reduces future load without a daily cap',()=>{
  const records={};deck.slice(0,20).forEach(c=>records[c.id]=applyReview(null,2,now));
  assert.equal(plan(deck,records,'2026-12-03',now).recommendedNew,0);
  assert.equal(plan(deck,records,'2026-12-03',now+DAY).recommendedNew,10);
  assert.equal(makeQueue(deck,records,{now}).length,10);
});
test('overdue reviews do not starve new cards, queue is unique and supports early extra study',()=>{
  const records={};deck.slice(0,30).forEach(c=>records[c.id]=applyReview(null,0,now-DAY));
  const q=makeQueue(deck,records,{now,size:10});
  assert.ok(q.filter(id=>!records[id]).length>=3);assert.equal(new Set(q).size,10);
  const all={};deck.forEach(c=>all[c.id]=applyReview(null,2,now));
  assert.equal(makeQueue(deck,all,{now}).length,10);
});
test('word/sound filtering and mock sampling keep their scope',()=>{
  assert.ok(makeQueue(deck,{}, {mode:'mock',kind:'shape',size:20}).every(id=>deck.find(c=>c.id===id).kind==='shape'));
  const mixed=makeQueue(deck,{}, {mode:'mock',size:20});
  assert.equal(mixed.filter(id=>deck.find(c=>c.id===id).kind==='sound').length,10);
  assert.deepEqual(makeQueue(deck,{}, {mode:'wrong'}),[]);
  assert.equal(plan(deck,{},'2026-12-03',dayStart('2026-12-05')).daysLeft,0);
});
