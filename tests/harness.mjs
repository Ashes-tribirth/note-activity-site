import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
export const html=readFileSync(new URL('index.html',root),'utf8');
export const fixture={ready:true,summaries:[{date:'2026-09-24',collectedAt:'2026-09-24T04:00:00+09:00',articleCount:1,totalPv:10,totalLikes:1,totalComments:0}],articles:[{key:'test',title:'Test',url:'https://note.com/example/n/test',publishedAt:'2026-09-17',pv:10,likes:1,comments:0,category:'その他'}],articleHistory:[{date:'2026-09-24',key:'test',pv:10,likes:1,comments:0}],followers:[]};
export async function run(data=fixture,fail=false){
 const elements=new Map([...html.matchAll(/\sid="([^"]+)"/g)].map(m=>['#'+m[1],{textContent:'',innerHTML:'',value:'',hidden:false,open:false,listeners:{},classList:{toggle(){},add(){}},addEventListener(type,fn){this.listeners[type]=fn;},showModal(){this.open=true;},close(){this.open=false;},scrollIntoView(){}}]));
 const context=vm.createContext({console,Intl,Date,Set,Map,URL,document:{querySelector:s=>elements.get(s)||null,addEventListener(){}},fetch:()=>fail?Promise.reject(new Error('offline')):Promise.resolve({ok:true,json:()=>Promise.resolve(structuredClone(data))})});
 context.window=context;
 for(const m of html.matchAll(/<script src="\.\/([^?]+)\?[^\"]+" defer>/g))vm.runInContext(readFileSync(new URL(m[1],root),'utf8'),context,{filename:m[1]});
 await new Promise(resolve=>setImmediate(resolve));
 return {context,elements,eval:code=>vm.runInContext(code,context)};
}
