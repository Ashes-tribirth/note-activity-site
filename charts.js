(()=>{
const fmt=new Intl.NumberFormat("ja-JP");
const $=s=>document.querySelector(s);
const state={data:null,activityRange:"30",followRange:"30"};

function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]))}
function finite(v){if(v===null||v===undefined||v==="")return null;const n=Number(v);return Number.isFinite(n)?n:null}
function asDate(row){const raw=row?.collectedAt||row?.date||row?.collectedDate;const d=new Date(raw);return Number.isNaN(d.getTime())?null:d}
function labelDate(v){const d=new Date(v);if(Number.isNaN(d.getTime()))return String(v||"");return `${d.getMonth()+1}/${d.getDate()}`}
function filterRange(rows,range){if(range==="all"||!rows.length)return rows.slice();const latest=asDate(rows.at(-1));if(!latest)return rows.slice();const start=new Date(latest);start.setDate(start.getDate()-(Number(range)-1));return rows.filter(r=>{const d=asDate(r);return d&&d>=start&&d<=latest})}
function filterCurrentArticles(d){
 const history=Array.isArray(d?.articleHistory)?d.articleHistory:[];
 const summaries=Array.isArray(d?.summaries)?d.summaries:[];
 const latestDate=summaries.at(-1)?.date||summaries.at(-1)?.collectedDate||history.at(-1)?.date||"";
 if(!latestDate||!Array.isArray(d?.articles)||!history.length)return d;
 const currentKeys=new Set(history.filter(row=>row?.date===latestDate).map(row=>row?.key).filter(Boolean));
 if(!currentKeys.size)return d;
 return {...d,articles:d.articles.filter(article=>currentKeys.has(article?.key||String(article?.url||"").split("/").pop()))};
}
function svgLineChart(target,rows,series,aria){
 if(!target)return;
 if(!rows.length){target.innerHTML='<div class="chart-empty">記録データがありません。</div>';return}
 const w=900,h=220,pad={l:48,r:18,t:16,b:32};
 const values=series.flatMap(s=>rows.map(r=>finite(r[s.key])).filter(v=>v!==null));
 if(!values.length){target.innerHTML='<div class="chart-empty">表示できる記録データがありません。</div>';return}
 const min=Math.min(...values),max=Math.max(...values),low=min===max?min-1:min,high=min===max?max+1:max;
 const usableW=w-pad.l-pad.r,usableH=h-pad.t-pad.b,xAt=i=>pad.l+(rows.length===1?usableW/2:i*usableW/(rows.length-1)),yAt=v=>pad.t+(high-v)/Math.max(high-low,1)*usableH;
 let out=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(aria)}">`;
 [0,.25,.5,.75,1].forEach(t=>{const y=pad.t+t*usableH,value=Math.round(high-t*(high-low));out+=`<line class="grid-line" x1="${pad.l}" y1="${y}" x2="${w-pad.r}" y2="${y}"></line><text class="axis-label" x="${pad.l-8}" y="${y+4}" text-anchor="end">${esc(fmt.format(value))}</text>`});
 const labelEvery=Math.max(1,Math.ceil(rows.length/8));
 rows.forEach((r,i)=>{if(i%labelEvery!==0&&i!==rows.length-1)return;out+=`<text class="axis-label" x="${xAt(i)}" y="${h-8}" text-anchor="middle">${esc(labelDate(r.collectedAt||r.date||r.collectedDate))}</text>`});
 series.forEach(s=>{const pts=rows.map((r,i)=>{const v=finite(r[s.key]);return v===null?null:{x:xAt(i),y:yAt(v),v,i}}).filter(Boolean);if(pts.length>1)out+=`<polyline class="line ${s.cls}-line" points="${pts.map(p=>`${p.x},${p.y}`).join(' ')}"></polyline>`;pts.forEach(p=>{out+=`<circle class="dot ${s.cls}-dot" cx="${p.x}" cy="${p.y}" r="4"><title>${esc(s.label)} ${esc(labelDate(rows[p.i].collectedAt||rows[p.i].date||rows[p.i].collectedDate))}: ${esc(fmt.format(p.v))}${rows[p.i].special?'（特例補完）':''}</title></circle>`})});
 out+='</svg><div class="chart-legend">'+series.map(s=>`<span><i class="${s.cls}"></i>${esc(s.label)}</span>`).join('')+'</div>';
 target.innerHTML=out;
}
function followerRows(d){let rows=(d.followers||[]).slice();const has813=rows.some(x=>String(x.date||x.collectedDate||x.collectedAt||"").startsWith("2026-08-13"));const has814=rows.some(x=>String(x.date||x.collectedDate||x.collectedAt||"").startsWith("2026-08-14"));if(!has813&&has814)rows=[{date:"2026-08-13",collectedAt:"2026-08-13T19:17:15+09:00",followingCount:null,followerCount:198,special:true},...rows];return rows}
function rangeLabel(range){return range==="all"?"全期間":`${range}日`}
function renderActivity(){if(!state.data)return;const rows=filterRange(state.data.summaries||[],state.activityRange);svgLineChart($("#trendBars"),rows,[{key:"totalPv",label:"累計PV",cls:"pv"},{key:"totalLikes",label:"累計スキ",cls:"likes"},{key:"totalComments",label:"累計コメント",cls:"comments"}],"累計PV・スキ・コメントの活動推移");const note=$("#trendNote");if(!note)return;const first=rows[0],last=rows.at(-1),span=first&&last&&asDate(first)&&asDate(last)?Math.floor((asDate(last)-asDate(first))/86400000)+1:rows.length;note.textContent=rows.length<2?`選択範囲：${rangeLabel(state.activityRange)}。現在は1回分の実数のみです。`:`選択範囲：${rangeLabel(state.activityRange)}／表示 ${rows.length}回・${span}日分の実測記録`}
function renderFollow(){if(!state.data)return;const rows=filterRange(followerRows(state.data),state.followRange);svgLineChart($("#followChart"),rows,[{key:"followingCount",label:"フォロー中",cls:"following"},{key:"followerCount",label:"フォロワー",cls:"followers"}],"フォロー数とフォロワー数の推移");const chart=$("#followChart");if(chart&&rows.some(x=>x.special))chart.insertAdjacentHTML("beforeend",'<p class="chart-exception">※ 8/13のフォロワー198のみ、今回限りの特例補完です。</p>')}
function syncButtons(kind,range){document.querySelectorAll(`.chart-toolbar[data-chart="${kind}"] [data-range]`).forEach(btn=>{const on=btn.dataset.range===range;btn.classList.toggle("active",on);btn.setAttribute("aria-pressed",String(on))})}
function bindRange(kind){document.querySelectorAll(`.chart-toolbar[data-chart="${kind}"] [data-range]`).forEach(btn=>btn.addEventListener("click",()=>{const range=btn.dataset.range;if(kind==="activity"){state.activityRange=range;syncButtons(kind,range);renderActivity()}else{state.followRange=range;syncButtons(kind,range);renderFollow()}}))}

const originalRender=window.render;
if(typeof originalRender==="function"){
 window.render=function(raw){
  const d=filterCurrentArticles(raw);
  const result=originalRender(d);
  state.data=d;
  renderActivity();
  renderFollow();
  return result;
 };
}
bindRange("activity");
bindRange("follow");
})();