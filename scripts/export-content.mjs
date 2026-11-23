import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// One-time importer for a trusted legacy checkout. The generated bank is the maintained source thereafter.
const source = path.resolve(process.argv[2] || '.');
const target = path.resolve('src/data/bank.json');
const ctx = vm.createContext({});
vm.runInContext('const TOPIC_LEVELS = [];', ctx);
const files = [...fs.readFileSync(path.join(source, 'index.html'), 'utf8').matchAll(/<script src="([^"?]+)(?:\?[^" ]*)?"><\/script>/g)].map(m=>m[1]);
for (const file of files) {
  if (['question-bank.js','practice-data.js','project-levels.js','resume-coverage.js'].includes(file) || file.startsWith('topic-')) {
    vm.runInContext(fs.readFileSync(path.join(source,file),'utf8'),ctx,{filename:file});
  }
}
const legacy=vm.runInContext('({levels:LEVELS,topics:TOPIC_LEVELS,practice:PRACTICE_BANK,coverage:RESUME_COVERAGE})',ctx);
const levels=[...legacy.levels]; levels.splice(levels.findIndex(l=>l.id===9),0,...legacy.topics);
const plain=s=>String(s??'').replace(/<br\s*\/?>/gi,'\n').replace(/<\/?(?:strong|code|b|em)>/gi,'').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');
const titles=['JavaScript 核心','CSS 与布局','计算机网络','Vue 生态','React 生态','Node.js 服务端','接口迁移','文件上传','权限与 BFF','面试表达','设计模式','手写代码','ES6 与 TypeScript','浏览器与安全','Redis 与缓存','数据结构与算法','分账与资金管控','视频与性能','AI 应用工程','网络场景','安全场景','JS 与 TS 深入','框架进阶','浏览器与工程化','系统设计','Node 运行机制','视频与移动端','质量与国际化','数据与部署','前端与跨端','AI 与业务集成'];
const category=id=>[0,1,10,11,12,15,21].includes(id)?'语言与基础':[3,4,22,29].includes(id)?'框架与界面':[2,13,19,20,23].includes(id)?'浏览器与网络':[5,14,24,25,27,28].includes(id)?'服务端与工程':[18,30].includes(id)?'AI 应用':'项目与表达';
const colors={'语言与基础':'#c7d4ee','框架与界面':'#c4dfd4','浏览器与网络':'#e4cde4','服务端与工程':'#e8d8ba','AI 应用':'#d5cce8','项目与表达':'#e8ccc2'};
const symbols=['code','layout','global','code','code','database','swap','cloud','lock','message','branches','code','code','safety','database','cluster','account','play','robot','global','safety','code','code','appstore','cluster','database','play','check','cloud','layout','robot'];
const refs={
  vue:['Vue · 响应式基础','https://vuejs.org/guide/essentials/reactivity-fundamentals.html'],
  react:['React · 渲染状态快照','https://react.dev/learn/state-as-a-snapshot'],
  ts:['TypeScript · 类型收窄','https://www.typescriptlang.org/docs/handbook/2/narrowing.html'],
  network:['MDN · HTTP 缓存','https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching'],
  merge:['Redis · 分布式锁','https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/'],
  split:['微信支付 · 服务商查询分账结果','https://pay.wechatpay.cn/doc/v3/partner/4012466850'],
  node:['Node.js · 事件循环与工作线程池','https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop'],
  tools:['MCP · 架构','https://modelcontextprotocol.io/docs/learn/architecture'],
  stream:['MDN · 读取流','https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Using_readable_streams'],
  measure:['web.dev · Web Vitals','https://web.dev/articles/vitals'],
  play:['MDN · Intersection Observer','https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API'],
  range:['MDN · HTTP 范围请求','https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Range_requests'],
  hydrate:['React · hydrateRoot','https://react.dev/reference/react-dom/client/hydrateRoot'],
  incident:['Google SRE · Monitoring Distributed Systems','https://sre.google/sre-book/monitoring-distributed-systems/'],
};
const questions=[];
const topics=levels.map(l=>{
  const questionIds=l.questions.map((q,i)=>{
    const id=`quiz:${l.id}:${i}`;
    const detail=q.detail?structuredClone(q.detail):undefined;
    if(detail)for(const key of ['principle','example','pitfalls'])if(detail[key])detail[key]=plain(detail[key]);
    if(detail?.pitfalls?.includes('用 get(k) 是否为 undefined 判断未命中'))detail.pitfalls=detail.pitfalls.replace('用 get(k) 是否为 undefined 判断未命中，会把合法的 0、false、空字符串误判成没有。','用真假值判断（例如 !cache.get(k)）会把合法的 0、false、空字符串误判为未命中。严格比较 === undefined 不会误判这些值，但无法区分未命中与已存储的 undefined；需要 Map.has 或明确的 {hit,value} 契约。');
    if(detail?.example)detail.example=detail.example.replace('相接的区间（比如 [1,3] 和 [4,6]）','共享端点的区间（比如 [1,3] 和 [3,6]）');
    questions.push({id,kind:q.type==='truefalse'?'boolean':q.type==='text'?'oral':'choice',prompt:plain(q.q),...(q.options?{choices:q.options.map(o=>plain(o).replace(/^[A-D]\)\s*/,''))}:{}),...(q.type!=='text'?{correctAnswer:q.answer}:{}),explanation:plain(q.explain),...(detail?{detail}:{}),topicId:String(l.id),...(q.chain?{chainId:q.chain}:{}),...(q.answer&&q.type==='text'?{label:plain(q.answer)}:{})});
    return id;
  });
  return {id:String(l.id),title:titles[l.id]||plain(l.name),description:plain(l.desc),difficulty:l.difficulty,questionIds,category:category(l.id),color:colors[category(l.id)],symbol:symbols[l.id]||'book'};
});
const chains=Object.values(legacy.practice.cards).map(c=>{
  const source=c.source||refs[c.id];
  const questionIds=c.steps.map(([prompt,answer],i)=>{
    const id=`oral:${c.id}:${i}`, [explanation,...code]=plain(answer).split('↵');
    questions.push({id,kind:'oral',prompt:plain(prompt),explanation,...(code.length?{detail:{code:code.join('\n')}}:{}),chainId:c.id,stepIndex:i,...(source?{source}:{})});return id;
  });
  return {id:c.id,title:c.title,groupId:c.group,questionIds,check:c.check,...(source?{source}:{})};
});
const bank={schemaVersion:1,version:'2026.11.23',topics,groups:legacy.practice.groups.map(g=>({id:g.id,title:g.name,chainIds:g.cards})),chains,questions,coverage:legacy.coverage};
fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(bank,null,2)+'\n');
console.log({topics:topics.length,quiz:topics.reduce((n,t)=>n+t.questionIds.length,0),groups:bank.groups.length,chains:chains.length,oral:chains.reduce((n,c)=>n+c.questionIds.length,0)});
