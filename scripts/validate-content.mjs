import fs from 'node:fs';
import assert from 'node:assert/strict';
const bank=JSON.parse(fs.readFileSync(new URL('../src/data/bank.json',import.meta.url),'utf8'));
const questions=new Map(bank.questions.map(q=>[q.id,q]));
assert.equal(questions.size,946);assert.equal(bank.questions.length,946);
assert.equal(bank.topics.length,31);assert.equal(bank.chains.length,163);assert.equal(bank.groups.length,30);
assert.equal(bank.topics.reduce((n,t)=>n+t.questionIds.length,0),278);
assert.equal(bank.chains.reduce((n,c)=>n+c.questionIds.length,0),668);
const chains=new Set(bank.chains.map(c=>c.id)),groups=new Set(bank.groups.map(g=>g.id));
for(const q of questions.values()) {
  assert.ok(q.prompt.trim()&&q.explanation.trim(),q.id);
  if(q.kind==='choice'){assert.ok(Number.isInteger(q.correctAnswer)&&q.choices[q.correctAnswer]!==undefined,q.id);assert.equal(new Set(q.choices).size,q.choices.length,q.id);}
  if(q.kind==='boolean')assert.equal(typeof q.correctAnswer,'boolean',q.id);
  if(q.chainId)assert.ok(chains.has(q.chainId),q.id);
  for(const source of [...(q.source?[q.source]:[]),...(q.detail?.sources||[])])assert.ok(source[1].startsWith('https://'),q.id);
}
for(const t of bank.topics)for(const id of t.questionIds)assert.ok(questions.has(id),id);
for(const c of bank.chains){assert.ok(groups.has(c.groupId),c.id);for(const id of c.questionIds)assert.ok(questions.has(id),id);}
for(const g of bank.groups)for(const id of g.chainIds)assert.ok(chains.has(id),id);
for(const item of bank.coverage)for(const id of [...item.existing,...item.added])assert.ok(chains.has(id),id);
assert.ok(!questions.get('quiz:11:10').detail.pitfalls.includes('用 get(k) 是否为 undefined 判断未命中，会把'));
console.log('Content validated: 278 quiz questions, 668 oral questions, 31 topics, 163 chains, 30 groups; stable references and corrected examples.');
