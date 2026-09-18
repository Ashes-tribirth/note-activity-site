import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const html=readFileSync(new URL('index.html',root),'utf8');
const fixture=process.env.PULSE_TEST_DATA ? JSON.parse(readFileSync(process.env.PULSE_TEST_DATA,'utf8')) : {ready:true,summaries:[{date:'2026-09-18',collectedAt:'2026-09-18T04:00:00+09:00',articleCount:1,totalPv:10,totalLikes:1,totalComments:0}],articles:[{key:'test',title:'Test',url:'https://note.com/example/n/test',publishedAt:'2026-09-17',pv:10,likes:1,comments:0,category:'その他'}],articleHistory:[{date:'2026-09-18',key:'test',pv:10,likes:1,comments:0}],followers:[]};
async function run(fail=false){
 const elements=new Map([...html.matchAll(/\sid="([^"]+)"/g)].map(m=>['#'+m[1],{textContent:'',innerHTML:'',value:'',classList:{toggle(){},contains(){return false}},setAttribute(){},addEventListener(){}}]));
 const context=vm.createContext({console,Intl,Date,Set,Map,URL,localStorage:{getItem(){return null}},document:{querySelector:s=>elements.get(s)||null,querySelectorAll:()=>[],body:{classList:{toggle(){},contains(){return false}}}},fetch:()=>fail?Promise.reject(new Error('offline')):Promise.resolve({ok:true,json:()=>Promise.resolve(structuredClone(fixture))})});
 context.window=context;
 for(const m of html.matchAll(/<script src="\.\/([^?]+)\?[^\"]+" defer>/g))vm.runInContext(readFileSync(new URL(m[1],root),'utf8'),context,{filename:m[1]});
 await new Promise(resolve=>setImmediate(resolve));
 if(fail){assert.match(elements.get('#status').textContent,/取得できません/);assert.match(elements.get('#healthChecks').innerHTML,/データを表示できません/);return;}
 assert(context.notePulseData,'render must finish');
 for(const id of ['audienceSummary','benchmarkSummary','factorBreakdown','decisionLoop','ledgerBody','openCampaignList'])assert(elements.get('#'+id).innerHTML.length>0,id+' must render');
 assert.equal(vm.runInContext('readableMedian([null, 0, 2])',context),1);
 assert.equal(vm.runInContext('readableMedian([null])',context),null);
 assert.equal(vm.runInContext('factorGroups([{title:"Test",d7:{pv:1,likes:0,comments:0}}])[4].groups[0].name',context),'未記録');
 assert(!elements.get('#decisionLoop').innerHTML.includes('入口の弱さ'));
 console.log('Rendered articles:' ,(elements.get('#ledgerBody').innerHTML.match(/<tr>/g)||[]).length);
}
await run();await run(true);
console.log('render and error-path smoke tests passed');
