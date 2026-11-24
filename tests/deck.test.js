import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const data=JSON.parse(readFileSync(new URL('../deck.json',import.meta.url)));
const raw=JSON.parse(readFileSync(new URL('../data/source-metadata.json',import.meta.url)));
test('all 600 source questions survive exactly once through deduplication',()=>{
 assert.equal(raw.length,600);assert.equal(data.cards.reduce((n,c)=>n+c.sources.length,0),600);
 const sources=data.cards.flatMap(c=>c.sources.map(s=>`${s.page}-${s.number}`));assert.equal(new Set(sources).size,600);
 assert.equal(data.summary.original-data.summary.removed,data.cards.length);
});
test('unique cards keep kind, full word and tested positions; all assets exist',()=>{
 const ids=new Set(),keys=new Set();for(const c of data.cards){
  assert.ok(!ids.has(c.id));ids.add(c.id);const key=JSON.stringify([c.kind,c.word,c.target,c.targetIndices]);assert.ok(!keys.has(key));keys.add(key);
  c.targetIndices.forEach(i=>assert.equal(c.word[i],c.target));
  assert.match(c.bopomofo,/^˙?[ㄅ-ㄩ]+[ˊˇˋ]?$/u);
  for(const asset of [c.prompt,c.answerImage,c.sourceImage])assert.ok(existsSync(new URL(`../${asset}`,import.meta.url)),asset);
 }
});
test('same character in different words and multi-target questions are retained',()=>{
 assert.ok(data.cards.find(c=>c.word==='銀行'&&c.target==='行'&&c.kind==='sound'));
 assert.ok(data.cards.find(c=>c.word==='旅行'&&c.target==='旅'&&c.kind==='sound'));
 assert.ok(data.cards.find(c=>c.word==='信誓旦旦'&&c.targetIndices.length===2));
 assert.ok(data.cards.find(c=>c.word==='一望無際'&&c.kind==='shape').sources.length>=3);
});
