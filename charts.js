(()=>{
const API="https://sora-note-log.ashestribirth.chatgpt.site/api/data";
const NS="http://www.w3.org/2000/svg";
const fmt=new Intl.NumberFormat("ja-JP");
const $=s=>document.querySelector(s);
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]))}
function num(v){const n=Number(v);return Number.isFinite(n)?n:0}
function labelDate(v){const d=new Date(v);if(Number.isNaN(d.getTime()))return String(v||"");return `${d.getMonth()+1}/${d.getDate()}`}
function points(values,w,h,pad,min,max){const span=Math.max(max-min,1);const usableW=w-pad.l-pad.r,usableH=h-pad.t-pad.b;return values.map((v,i)=>({x:pad.l+(values.length===1?usableW/2:i*usableW/(values.length-1)),y:pad.t+(max-v)/span*usableH,v}))}
function svgLineChart(target,rows,series,options={}){
 if(!target)return;
 if(!rows.length){target.innerHTML='<div class="chart-empty">記録データがありません。</div>';return}
 const w=900,h=220,pad={l:48,r:18,t:16,b:32};
 const all=series.flatMap(s=>rows.map(r=>num(r[s.key])));
 const min=options.zeroBase?0:Math.min(...all),max=Math.max(...all);
 const low=min===max?min-1:min,high=min===max?max+1:max;
 const grid=[0,.25,.5,.75,1];
 let out=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(options.aria||'推移グラフ')}">`;
 grid.forEach(t=>{const y=pad.t+t*(h-pad.t-pad.b);const value=Math.round(high-t*(high-low));out+=`<line class="grid-line" x1="${pad.l}" y1="${y}" x2="${w-pad.r}" y2="${y}"></line><text class="axis-label" x="${pad.l-8}" y="${y+4}" text-anchor="end">${esc(fmt.format(value))}</text>`});
 rows.forEach((r,i)=>{const x=pad.l+(rows.length===1?(w-pad.l-pad.r)/2:i*(w-pad.l-pad.r)/(rows.length-1));out+=`<text class="axis-label" x="${x}" y="${h-8}" text-anchor="middle">${esc(labelDate(r.collectedAt||r.date))}</text>`});
 series.forEach(s=>{const vals=rows.map(r=>num(r[s.key]));const pts=points(vals,w,h,pad,low,high);if(pts.length>1)out+=`<polyline class="line ${s.cls}-line" points="${pts.map(p=>`${p.x},${p.y}`).join(' ')}"></polyline>`;pts.forEach((p,i)=>{out+=`<circle class="dot ${s.cls}-dot" cx="${p.x}" cy="${p.y}" r="4"><title>${esc(s.label)} ${esc(labelDate(rows[i].collectedAt||rows[i].date))}: ${esc(fmt.format(p.v))}</title></circle>`})});
 out+='</svg><div class="chart-legend">'+series.map(s=>`<span><i class="${s.cls}"></i>${esc(s.label)}</span>`).join('')+'</div>';
 target.innerHTML=out;
}
function render(d){
 const sums=(d.summaries||[]).slice(-30);
 svgLineChart($("#trendBars"),sums,[
  {key:"totalPv",label:"累計PV",cls:"pv"},
  {key:"totalLikes",label:"累計スキ",cls:"likes"},
  {key:"totalComments",label:"累計コメント",cls:"comments"}
 ],{aria:"累計PV・スキ・コメントの活動推移"});
 const note=$("#trendNote");
 if(note)note.textContent=sums.length<2?"現在は1回分の実数のみ。記録が増えると線として推移を確認できます。":`直近${sums.length}回の取得実績を表示`;
 const followers=(d.followers||[]).slice(-30);
 svgLineChart($("#followChart"),followers,[
  {key:"followingCount",label:"フォロー中",cls:"following"},
  {key:"followerCount",label:"フォロワー",cls:"followers"}
 ],{aria:"フォロー数とフォロワー数の推移"});
}
fetch(API,{credentials:"omit"}).then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json()}).then(render).catch(()=>{
 const a=$("#trendBars"),f=$("#followChart");if(a&&!a.children.length)a.innerHTML='<div class="chart-empty">活動推移を取得できませんでした。</div>';if(f)f.innerHTML='<div class="chart-empty">つながりの推移を取得できませんでした。</div>';
});
})();