import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const root=new URL('../',import.meta.url),html=readFileSync(new URL('index.html',root),'utf8');
const assets=[...html.matchAll(/(?:src|href)="\.\/([^"?]+)(?:\?[^" ]+)?"/g)].map(m=>m[1]);
for(const file of assets){assert(existsSync(new URL(file,root)),file+' is missing');const text=readFileSync(new URL(file,root),'utf8');if(file.endsWith('.js')){assert(!/\sstyle\s*=/.test(text));assert(!/\.style\s*[.=]/.test(text));}}
const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
const csp=html.match(/Content-Security-Policy" content="([^"]+)"/)[1];assert(csp.includes("style-src 'self'"));assert(!csp.includes('unsafe-inline'));assert(csp.includes("frame-src 'none'"));
assert(html.includes('https://note.com/sitesettings/stats'));
const sections=['overview','contribution','articles','compare','official','external'].map(id=>html.indexOf(`id="${id}"`));assert(sections.every((x,i)=>x>=0&&(i===0||x>sections[i-1])));
assert(!html.includes('id="decisionLoop"'),'unfounded advice must not return');
const js=readFileSync(new URL('app.js',root),'utf8');
for(const m of js.matchAll(/\$\('#([\w-]+)'\)/g))assert(ids.includes(m[1]),'missing static DOM target: '+m[1]);
console.log('Assets, DOM targets, CSP and analysis order verified.');
