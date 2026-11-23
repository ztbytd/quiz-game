import {provider} from '../server/provider.ts';
process.loadEnvFile('server/.env.local');
const complete=provider({baseUrl:process.env.AI_BASE_URL!,model:process.env.AI_MODEL!,apiKey:process.env.AI_API_KEY!});
const result=await complete([{role:'user',content:'请只用一句中文解释什么是幂等。'}],{maxTokens:180,signal:AbortSignal.timeout(60000)});
console.log(JSON.stringify({model:process.env.AI_MODEL,ok:result.text.length>0,tokens:result.tokens,characters:result.text.length}));
