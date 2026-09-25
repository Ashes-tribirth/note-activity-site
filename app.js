'use strict';
const API = 'https://sora-note-log.ashestribirth.chatgpt.site/api/data?v=20260817a';
const M = window.PulseModel;
const $ = selector => document.querySelector(selector);
const fmt = new Intl.NumberFormat('ja-JP');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const safeUrl = value => { try { const url = new URL(value); return url.protocol === 'https:' ? esc(url.href) : '#'; } catch { return '#'; } };
const number = value => value === null || value === undefined ? '記録不足' : fmt.format(value);
const signed = value => value === null || value === undefined ? '記録不足' : (value > 0 ? '+' : '') + fmt.format(value);
const ratio = (numerator,denominator) => M.numeric(numerator)===null||M.numeric(denominator)===null||Number(denominator)===0?null:Number(numerator)/Number(denominator)*100;
const percent = value => value===null?'—':`${value.toFixed(1)}%`;
const labels = {pv:'PV',likes:'スキ',comments:'コメント',followers:'フォロワー',following:'フォロー'};
const units = {pv:'回',likes:'件',comments:'件',followers:'人',following:'人'};
const selected = new Set();
let model, period, detailKey = null;
const empty = text => `<p class="empty">${esc(text)}</p>`;
function dateTime(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return '時刻不明';
  return new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value));
}
function metricCard(label,current,previous,unit,compared=current,cohort=null) {
  const diff=compared!==null&&previous!==null?compared-previous:null;
  return `<div class="summary-card"><span class="label">${esc(label)}</span><strong class="${current===null?'pending':''}">${signed(current)}${current===null?'':`<small class="unit">${unit}</small>`}</strong><small>${cohort===null?'フォロワー数で比較':`同じ${cohort}記事で比較`}</small><small>今回 ${signed(compared)} ／ 前 ${signed(previous)}</small><small class="difference">${diff===null?'同じ対象での比較は記録不足':`前の期間との差 ${signed(diff)}${unit}`}</small></div>`;
}
function table(headers,rows,className='') {
  return `<table class="${className}"><thead><tr>${headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
}
function lineChart(points,unit,description) {
  const valid=points.filter(p=>M.numeric(p.value)!==null);
  if(valid.length<2) return empty('推移を描くための実測記録が不足しています。日付と数値の一覧で取得状況を確認できます。');
  const width=Math.max(300,Math.min(900,(Number(window.innerWidth)||980)-80)),height=235,left=55,right=18,top=20,bottom=45;
  const first=Date.parse(points[0].date),last=Date.parse(points.at(-1).date);
  const min=Math.min(0,...valid.map(p=>p.value)),max=Math.max(1,...valid.map(p=>p.value));
  const x=p=>left+(Date.parse(p.date)-first)/Math.max(86400000,last-first)*(width-left-right);
  const y=p=>height-bottom-(p.value-min)/(max-min)*(height-top-bottom);
  const ticks=[min,(min+max)/2,max];
  const grid=ticks.map(t=>`<line class="grid" x1="${left}" y1="${y({value:t})}" x2="${width-right}" y2="${y({value:t})}"/><text x="${left-9}" y="${y({value:t})+4}" text-anchor="end">${number(Math.round(t*10)/10)}</text>`).join('');
  const segments=points.slice(1).map((p,i)=>M.numeric(p.value)!==null&&M.numeric(points[i].value)!==null&&M.shift(points[i].date,1)===p.date?`<line class="series" x1="${x(points[i])}" y1="${y(points[i])}" x2="${x(p)}" y2="${y(p)}"/>`:'').join('');
  const indices=[...new Set([0,Math.floor((points.length-1)/2),points.length-1])];
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(description)}。${esc(valid[0].date)} ${number(valid[0].value)}${unit}から${esc(valid.at(-1).date)} ${number(valid.at(-1).value)}${unit}。欠測日は線をつなぎません。"><text x="${left}" y="12">${esc(unit)}</text>${grid}${segments}${valid.map(p=>`<circle cx="${x(p)}" cy="${y(p)}" r="3"><title>${esc(p.date)}：${number(p.value)}${unit}</title></circle>`).join('')}${indices.map(i=>`<text x="${x(points[i])}" y="${height-12}" text-anchor="${i===0?'start':i===points.length-1?'end':'middle'}">${esc(points[i].date.slice(5).replace('-','/'))}</text>`).join('')}</svg>`;
}
function drawHealth() {
  const warnings=[];
  const at=Date.parse(model.latest.collectedAt);
  if(!Number.isFinite(at)||Date.now()-at>36*3600000)warnings.push('最終取得から36時間以上経過しています。');
  const unique=new Set(model.summaries.map(M.dateOf));
  if(unique.size!==model.summaries.length)warnings.push('全体集計に同日の重複記録があります。');
  const dates=[...unique].sort(),missing=dates.length?M.range(model.end,M.age(dates[0],model.end)).filter(d=>!unique.has(d)):[];
  if(missing.length)warnings.push('全体集計の欠測：'+missing.join('、'));
  const count=model.articles.length;
  if(count!==Number(model.latest.articleCount)||count!==(model.raw.articles||[]).length)warnings.push('最新の記事一覧・記事履歴・全体集計の件数が一致しません。最新履歴にある記事だけ表示します。');
  const previous=model.summaries.at(-2);
  if(previous&&Number(previous.articleCount)>Number(model.latest.articleCount))warnings.push(`前回より記事数が${Number(previous.articleCount)-Number(model.latest.articleCount)}本減っています。削除・非公開・取得失敗の区別は未確認です。`);
  for(const [field,total] of [['pv','totalPv'],['likes','totalLikes'],['comments','totalComments']]){
    if(model.articles.some(a=>M.numeric(a[field])===null)||model.articles.reduce((s,a)=>s+Number(a[field]),0)!==Number(model.latest[total]))warnings.push(labels[field]+'の記事合計と全体集計が一致しません。');
  }
  const pending=model.articles.filter(a=>a.category==='要確認').length;
  if(pending)warnings.push(`分類は${pending}記事が要確認です。タイトルだけで分類を確定していません。`);
  const reverse=period.items.filter(a=>a.delta&&M.fields.some(f=>a.delta[f]!==null&&a.delta[f]<0)).length;
  if(reverse)warnings.push(`選択期間で累計が減少した記事が${reverse}本あります。減少も実測の差として表示しています。`);
  const currentDates=new Set((model.raw.articleHistory||[]).map(M.dateOf));
  const gaps=M.range(model.end,period.n).filter(d=>!currentDates.has(d));
  if(gaps.length)warnings.push(`選択期間の記事履歴なし：${gaps.join('、')}。期間差分は計算しません。`);
  $('#health').classList.toggle('warning',warnings.length>0);
  $('#status').textContent=warnings.length?`記録の注意 ${warnings.length}件 · ${count}記事`:`取得・集計を確認 · ${count}記事`;
  $('#healthChecks').innerHTML=`<p class="basis">最終取得 ${esc(dateTime(model.latest.collectedAt))} JST。欠測と0件は分けて扱います。</p>${warnings.length?`<ul>${warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>`:'<p class="basis">最新の記事件数と集計値が一致しています。</p>'}`;
}
function drawOverview() {
  const n=period.n;
  $('#updated').textContent='最終取得 '+dateTime(model.latest.collectedAt)+' JST';
  $('#periodLabel').textContent=`${period.start} → ${period.end} の取得時点間 ／ 前期間 ${M.shift(period.start,-n)} → ${period.start}`;
  const summaryDates=new Map(model.summaries.map(r=>[M.dateOf(r),r]));
  const startAt=summaryDates.get(period.start)?.collectedAt,endAt=model.latest.collectedAt;
  const published=model.articles.filter(a=>startAt&&Number.isFinite(Date.parse(a.publishedAt))&&Date.parse(a.publishedAt)>Date.parse(startAt)&&Date.parse(a.publishedAt)<=Date.parse(endAt)).length;
  $('#publicationCount').textContent=startAt?`現在公開中の記事のうち 期間内公開 ${published}本`:'期間内公開数：基準時刻なし';
  $('#summaryCards').innerHTML=M.fields.map(f=>metricCard(labels[f]+'の増加',period.sum(f),period.prev(f),units[f],period.compared(f),period.comparable.length)).join('')+metricCard('フォロワーの純増',M.followerDelta(model,model.end,n),M.followerDelta(model,period.start,n),'人');
  const hours=startAt?(Date.parse(endAt)-Date.parse(startAt))/3600000:null;
  $('#coverage').textContent=`記事指標は${model.articles.length}本中、${n+1}日分の記録がそろう${period.eligible.length}本の合計。新作・欠測など${model.articles.length-period.eligible.length}本は合計に含めません。前期間比較は両期間の記録がそろう${period.comparable.length}本に対象をそろえます。${hours===null?'':`取得時点間は${hours.toFixed(1)}時間です。`}`;
  $('#lifetime').innerHTML=`<div class="lifetime-values">${[['PV',model.latest.totalPv],['スキ',model.latest.totalLikes],['コメント',model.latest.totalComments],['公開記事',model.latest.articleCount],['フォロー',model.followers.get(model.end)?.followingCount],['フォロワー',model.followers.get(model.end)?.followerCount]].map(([l,v])=>`<span>${l} <b>${number(v)}</b></span>`).join('')}</div>`;
  drawTrend();
}
function drawTrend() {
  const dates=M.range(model.end,period.n);
  const series=['pv','likes','comments'].map(metric=>({metric,label:`${labels[metric]}増加`,unit:units[metric],points:dates.map(date=>({date,value:period.eligible.length?period.eligible.reduce((sum,article)=>sum+M.numeric(model.history.get(article.key).get(date)[metric])-M.numeric(model.history.get(article.key).get(period.start)[metric]),0):null}))}));
  series.push({metric:'followers',label:'フォロワー数',unit:'人',points:dates.map(date=>({date,value:M.numeric(model.followers.get(date)?.followerCount)}))});
  $('#overviewCharts').innerHTML=series.map(item=>`<section class="trend-card"><h4>${esc(item.label)}</h4>${lineChart(item.points,item.unit,item.label)}</section>`).join('');
  $('#overviewValues').innerHTML=table(['取得日',...series.map(item=>item.label)],dates.map((date,index)=>`<tr><td>${date}</td>${series.map(item=>`<td class="num">${number(item.points[index].value)}${item.points[index].value===null?'':item.unit}</td>`).join('')}</tr>`));
}
function median(values) {
  const sorted=[...values].sort((a,b)=>a-b),n=sorted.length;
  return n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2;
}
function latestFunnelRows() { return model.raw.funnel?.articles||[]; }
function funnelHistory() { return model.raw.funnelHistory||model.raw.funnel?.history||[]; }
function categoryEvidence() {
  const funnelByKey=new Map(latestFunnelRows().map(row=>[row.key,row]));
  const categoryByKey=new Map(period.items.map(article=>[article.key,article.category]));
  const officialWindow=funnelHistory().slice(-7);
  return [...new Set(period.items.map(a=>a.category))].map(category=>{
    const items=period.items.filter(a=>a.category===category),official=items.map(a=>({article:a,row:funnelByKey.get(a.key)})).filter(x=>x.row);
    const d7=items.map(a=>({article:a,delta:M.delta(model,a.key,model.end,7)})).filter(x=>M.valid(x.delta));
    const active=d7.filter(x=>M.fields.some(field=>x.delta[field]!==0)),contributors=active.filter(x=>x.delta.pv>0).sort((a,b)=>b.delta.pv-a.delta.pv);
    const pv7=d7.length?d7.reduce((sum,x)=>sum+x.delta.pv,0):null,topShare=pv7>0&&contributors.length?contributors[0].delta.pv/pv7:null;
    const officialDaily=officialWindow.flatMap(day=>(day.articles||[]).filter(row=>categoryByKey.get(row.key)===category));
    const totals=officialDaily.reduce((sum,row)=>({imp:sum.imp+(M.numeric(row.impressions)||0),pv:sum.pv+(M.numeric(row.pageviews)||0),likes:sum.likes+(M.numeric(row.likes)||0),comments:sum.comments+(M.numeric(row.comments)||0)}),{imp:0,pv:0,likes:0,comments:0});
    const published=items.map(a=>String(a.publishedAt||'').slice(0,10)).filter(Boolean).sort().at(-1)||null;
    const complete=official.filter(x=>['impressions','pageviews','likes','comments'].every(f=>M.numeric(x.row[f])!==null)).length;
    let confidence=!latestFunnelRows().length?'記録中':items.length>=3&&d7.length>=3&&complete>=3?'限定的':'不足';
    if(officialWindow.length<7&&confidence!=='不足')confidence='限定的';
    if(confidence==='限定的'&&(topShare===null||topShare<=0.7))confidence='十分';
    if(category==='要確認')confidence='不足';
    const recurrence=contributors.length>=2&&topShare!==null&&topShare<=0.7?'複数記事で確認':contributors.length===1||topShare>0.7?'単一記事の影響が大きい':'確認できず';
    return {category,items,official,d7,active,pv7,topShare,totals,published,confidence,recurrence,impPv:ratio(totals.pv,totals.imp),pvLike:ratio(totals.likes,totals.pv)};
  }).sort((a,b)=>(b.pv7??-Infinity)-(a.pv7??-Infinity));
}
function drawDecisions() {
  const evidence=categoryEvidence(),funnel=model.raw.funnel,historyDays=new Set((model.raw.articleHistory||[]).map(M.dateOf)).size;
  const officialHistory=funnelHistory();
  const upward=evidence.filter(item=>item.pv7>0).length,repeated=evidence.filter(item=>item.recurrence==='複数記事で確認').length,funnelDays=officialHistory.length||1;
  $('#decisionCoverage').textContent=latestFunnelRows().length?`公式指標 ${funnel.date}・履歴 ${historyDays}日`:'公式指標を記録中';
  $('#decisionSummary').innerHTML=`<div><span>PVが上向きの分類</span><strong>${number(upward)}<small> / ${evidence.length}</small></strong><small>直近7日の実測差分</small></div><div><span>複数記事で再現</span><strong>${number(repeated)}<small> 分類</small></strong><small>単発の影響を分離</small></div><div><span>公式指標の履歴</span><strong>${funnelDays}<small> 日</small></strong><small>${officialHistory.length?'履歴を蓄積中':'現在は単日のみ・記録中'}</small></div>`;
  $('#categoryDecisions').innerHTML=evidence.map(item=>{const stale=item.published?M.age(item.published,model.end):null;const movement=item.pv7===null?'7日比較は記録不足':item.pv7>0?`直近7日で ${signed(item.pv7)} PV`:item.pv7<0?`直近7日で ${signed(item.pv7)} PV`:'直近7日のPV増加なし';return `<article class="decision-card"><header><div><h3>${esc(item.category)}</h3><small>${item.items.length}記事</small></div><span class="confidence ${item.confidence==='十分'?'good':item.confidence==='不足'?'low':''}">判断材料：${item.confidence}</span></header><p class="decision-finding"><strong>${esc(movement)}</strong><span>${esc(item.recurrence)}</span></p><div class="decision-key"><span>閲覧効率 <b>${percent(item.impPv)}</b></span><span>読後反応 <b>${percent(item.pvLike)}</b></span></div><details class="decision-evidence"><summary>根拠を確認</summary><dl><div><dt>公式指標のある記事</dt><dd>${item.official.length}/${item.items.length}本</dd></div><div><dt>動きのある記事</dt><dd>${item.active.length}/${item.d7.length}本</dd></div><div><dt>最終投稿日</dt><dd>${item.published?`${esc(item.published)}${stale!==null?`（${stale}日前）`:''}`:'不明'}</dd></div><div><dt>PV増加の偏り</dt><dd>${item.topShare===null?'—':`${(item.topShare*100).toFixed(0)}%が最多記事`}</dd></div></dl></details></article>`}).join('');
  $('#decisionNote').textContent='「十分」は3記事以上に7日履歴と公式4指標があり、PV増加の70%超を1記事だけが占めない場合。「限定的」は最低条件を満たすものの履歴や対象数に制約がある場合です。率は直近最大7日分の実数合計から計算しています。流入元は取得開始まで判断しません。';
}
function scatterPanel(title,items,xLabel,yLabel,quadrants) {
  if(items.length<2)return `<section class="scatter-block"><h3>${esc(title)}</h3>${empty('同じ条件で比較できる記事が不足しています。')}</section>`;
  const midX=median(items.map(a=>a.x)),midY=median(items.map(a=>a.y)),width=760,height=340,left=68,right=24,top=28,bottom=58,maxX=Math.max(1,...items.map(a=>a.x)),maxY=Math.max(1,...items.map(a=>a.y));
  const x=v=>left+v/maxX*(width-left-right),y=v=>height-bottom-v/maxY*(height-top-bottom);
  const dots=items.map(a=>`<a href="#" data-detail="${esc(a.key)}" aria-label="${esc(a.title)}の詳細"><circle class="position-point" cx="${x(a.x)}" cy="${y(a.y)}" r="6"><title>${esc(a.title)}｜${esc(xLabel)} ${number(a.x)}｜${esc(yLabel)} ${percent(a.y)}</title></circle></a>`).join('');
  const chart=`<div class="position-wrap"><svg class="position-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}"><line class="position-axis" x1="${left}" y1="${height-bottom}" x2="${width-right}" y2="${height-bottom}"/><line class="position-axis" x1="${left}" y1="${top}" x2="${left}" y2="${height-bottom}"/><line class="position-mid" x1="${x(midX)}" y1="${top}" x2="${x(midX)}" y2="${height-bottom}"/><line class="position-mid" x1="${left}" y1="${y(midY)}" x2="${width-right}" y2="${y(midY)}"/><text class="position-label" x="${left}" y="17">${esc(yLabel)}</text><text class="position-label" x="${width-right}" y="${height-15}" text-anchor="end">${esc(xLabel)}</text><text class="position-quadrant" x="${left+8}" y="${top+18}">${esc(quadrants[0])}</text><text class="position-quadrant" x="${width-right-8}" y="${top+18}" text-anchor="end">${esc(quadrants[1])}</text><text class="position-quadrant" x="${left+8}" y="${height-bottom-10}">${esc(quadrants[2])}</text><text class="position-quadrant" x="${width-right-8}" y="${height-bottom-10}" text-anchor="end">${esc(quadrants[3])}</text><text class="position-tick" x="${x(midX)}" y="${height-bottom+20}" text-anchor="middle">中央値 ${number(Math.round(midX*10)/10)}</text><text class="position-tick" x="${left-8}" y="${y(midY)+4}" text-anchor="end">${percent(midY)}</text>${dots}</svg></div>`;
  const grouped=quadrants.map(()=>[]);
  const rows=[...items].sort((a,b)=>b.x-a.x).map(a=>{const index=a.x>=midX?(a.y>=midY?1:3):(a.y>=midY?0:2);grouped[index].push(a);return `<tr><td class="article-cell"><button class="article-title" data-detail="${esc(a.key)}" type="button">${esc(a.title)}</button><small>${esc(a.category)}</small></td><td class="num">${number(a.x)}</td><td class="num">${percent(a.y)}</td><td>${esc(quadrants[index])}</td><td>${esc(String(a.publishedAt||'不明').slice(0,10))}</td></tr>`});
  const summary=grouped.map((group,index)=>`<article class="quadrant-card"><span>${esc(quadrants[index])}</span><strong>${group.length}本</strong>${group.length?`<button type="button" data-detail="${esc(group[0].key)}">${esc(group[0].title)}</button>${group.length>1?`<small>ほか${group.length-1}本</small>`:''}`:'<small>該当なし</small>'}</article>`).join('');
  return `<section class="scatter-block"><h3>${esc(title)}</h3><div class="quadrant-grid">${summary}</div><details class="scatter-details"><summary>点の分布と全記事を確認（${items.length}本）</summary>${chart}<div class="table-wrap">${table(['記事',xLabel,yLabel,'象限','公開日'],rows)}</div></details><p class="basis">基準：表示対象の${esc(xLabel)}中央値 ${number(Math.round(midX*10)/10)}、${esc(yLabel)}中央値 ${percent(midY)}。点の分布は補助表示です。率の分母が0の記事は除外します。</p></section>`;
}
function drawArticlePosition() {
  const byKey=new Map(model.articles.map(a=>[a.key,a]));
  const items=latestFunnelRows().map(row=>({...byKey.get(row.key),...row,key:row.key,impPv:ratio(row.pageviews,row.impressions),pvLike:ratio(row.likes,row.pageviews)}));
  const exposure=items.filter(a=>a.title&&M.numeric(a.impressions)!==null&&a.impPv!==null).map(a=>({...a,x:Number(a.impressions),y:a.impPv}));
  const reaction=items.filter(a=>a.title&&M.numeric(a.pageviews)!==null&&a.pvLike!==null).map(a=>({...a,x:Number(a.pageviews),y:a.pvLike}));
  $('#positionPeriod').textContent=model.raw.funnel?.date?`${model.raw.funnel.date} 単日`:'記録中';
  $('#articlePosition').innerHTML=scatterPanel('露出 → 閲覧',exposure,'IMP','IMP→PV率',['閲覧効率高・露出少','露出も閲覧効率も高い','露出不足','露出あり・閲覧効率低'])+scatterPanel('閲覧 → 反応',reaction,'PV','PV→スキ率',['反応率高・閲覧少','閲覧も反応率も高い','閲覧不足','閲覧あり・反応率低']);
  $('#positionNote').textContent='対象は公式ダッシュボードから取得できた同一日の記事です。単日の位置関係であり、長期傾向や記事の優劣を示しません。点と一覧から記事詳細を開けます。';
}
function groupBars(groups,filter) {
  const max=Math.max(1,...groups.map(g=>Math.abs(g.value??0)));
  return groups.map(g=>`<button type="button" class="bar-row" data-filter="${filter}" data-value="${esc(g.name)}"><span class="bar-top"><span>${esc(g.name)}</span><strong>${signed(g.value)}${g.value===null?'':'<small> 回</small>'}</strong></span><svg viewBox="0 0 400 7" preserveAspectRatio="none" aria-hidden="true"><rect width="400" height="7" fill="#e4ebf0"/><rect width="${Math.abs(g.value??0)/max*400}" height="7" fill="${g.value<0?'#8f7457':'#4e8fab'}"/></svg><small>全${g.all}本 ／ 集計${g.count}本 ／ 直近7日の活動${g.active}本${g.unknown?`・判定待ち${g.unknown}本`:''}</small></button>`).join('');
}
function drawContributions() {
  const groups=key=>[...new Set(period.items.map(a=>a[key]))].map(name=>{
    const all=period.items.filter(a=>a[key]===name),ready=all.filter(a=>M.valid(a.delta));
    const d7=all.map(a=>M.delta(model,a.key,model.end,7));
    return {name,all:all.length,count:ready.length,value:ready.length?ready.reduce((s,a)=>s+a.delta.pv,0):null,active:d7.filter(d=>M.valid(d)&&M.fields.some(f=>d[f]!==0)).length,unknown:d7.filter(d=>!M.valid(d)).length};
  });
  const order=['新作（0〜7日）','中期（8〜30日）','過去記事（31日〜）','公開日不明'];
  $('#ageMix').innerHTML=groupBars(groups('band').sort((a,b)=>order.indexOf(a.name)-order.indexOf(b.name)),'ageFilter');
  $('#contributionNote').textContent=`上のPV増加 ${signed(period.sum('pv'))}回と同じ対象の記事を分解しています。棒は合計への寄与を示し、1記事の強さを示すものではありません。新作も基準日の記録がなければ「記録不足」です。`;
}
function ledgerRows(items) {
  const metric=['pv','likes','comments'].includes($('#sort').value)?$('#sort').value:'pv';
  const others=M.fields.filter(f=>f!==metric);
  return table(['比較','記事名','公開から',labels[metric]+' 増加',labels[others[0]]+' 増加',labels[others[1]]+' 増加'],items.map(a=>`<tr><td><input class="compare-check" type="checkbox" data-compare="${esc(a.key)}" aria-label="${esc(a.title)}を比較" ${selected.has(a.key)?'checked':''}></td><td class="article-cell"><button class="article-title" type="button" data-detail="${esc(a.key)}">${esc(a.title)}</button><small>${esc(a.category)} · 公開 ${esc(String(a.publishedAt||'不明').slice(0,10))}${a.provisionalDormant?' · 動きなしは記録開始からの暫定判定':''}</small></td><td class="num">${a.age===null?'不明':a.age+'日'}</td><td class="num ${a.delta?.[metric]==null?'missing':''}">${signed(a.delta?.[metric])}</td>${others.map(f=>`<td class="num">${signed(a.delta?.[f])}</td>`).join('')}</tr>`),'ledger-table');
}
function drawLedger() {
  const query=$('#search').value.trim().toLowerCase(),category=$('#category').value,band=$('#ageFilter').value,sort=$('#sort').value||'pv';
  const filtered=period.items.filter(a=>(!query||a.title.toLowerCase().includes(query))&&(!category||a.category===category)&&(!band||a.band===band)).sort((a,b)=>{
    if(sort==='new')return String(b.publishedAt||'').localeCompare(String(a.publishedAt||''));
    const av=a.delta?.[sort],bv=b.delta?.[sort];return av==null?bv==null?0:1:bv==null?-1:bv-av;
  });
  const active=filtered.filter(a=>!a.dormant),dormant=filtered.filter(a=>a.dormant);
  $('#articleCount').textContent=`${period.start} → ${period.end} の増加 ／ 表示${active.length}本（記録不足を含む）。記事名を押すと詳細。スマホの数値は並び順で切り替えられます。`;
  $('#ledger').innerHTML=active.length?ledgerRows(active):empty('この条件に合う通常記事はありません。動きのない記事、または絞り込み条件を確認してください。');
  $('#dormantLabel').textContent=`直近7日で動きのない記事（暫定判定を含む） · ${dormant.length}本`;
  $('#dormantSummary').textContent=`PV・スキ・コメントのすべてが不変。7日未満の記録は記録開始から暫定判定します。品質の低さを意味しません。対象の累計：PV ${number(dormant.reduce((s,a)=>s+Number(a.pv),0))} ／ スキ ${number(dormant.reduce((s,a)=>s+Number(a.likes),0))}。PVを分母にした反応率は表示しません。`;
  $('#dormantLedger').innerHTML=dormant.length?ledgerRows(dormant):empty('該当なし');
  $('#selectionLink').textContent=`比較する記事：${selected.size}本`;
}
function drawComparison() {
  const items=period.items.filter(a=>selected.has(a.key)),n=Number($('#compareAge').value)||7;
  if(!items.length){$('#comparison').innerHTML=empty('比較したい記事を、上の記事一覧から選んでください。ここに公開後の同じ時点の実績を並べます。');return;}
  const aligned=items.map(a=>M.aligned(model,a,n));
  const row=(name,values)=>`<tr><th scope="row">${name}</th>${values.map(v=>`<td>${v}</td>`).join('')}</tr>`;
  $('#comparison').innerHTML=`<div class="selection-tags">${items.map(a=>`<button type="button" data-remove="${esc(a.key)}">${esc(a.title)} ×</button>`).join('')}</div><div class="table-wrap"><table class="comparison-table"><thead><tr><th>比較項目</th>${items.map(a=>`<th scope="col">${esc(a.title)}</th>`).join('')}</tr></thead><tbody>${row('分類',items.map(a=>esc(a.category)))}${row('公開日',items.map(a=>esc(String(a.publishedAt||'不明').slice(0,10))))}${row('取得状況',aligned.map(a=>a.row?`${a.target}<br>${a.hours===null?'時刻不明':`公開から${a.hours.toFixed(1)}時間`}`:esc(a.reason)))}${M.fields.map(f=>row(labels[f]+' 累計',aligned.map(a=>number(M.numeric(a.row?.[f]))))).join('')}${row('タイトル文字数',items.map(a=>String([...a.title].length)))}${row('本文文字数',items.map(a=>number(M.numeric(a.features?.bodyLength))))}${row('本文の画像数',items.map(a=>number(M.numeric(a.features?.imageCount))))}</tbody></table></div><p class="basis">記事の特徴は現在の記録です。公開後に編集された内容の履歴はありません。題材・告知・公開時期の差もあるため、特徴の効果を断定しません。</p>`;
}
function drawOfficial() {
  const funnel=model.raw.funnel,rows=funnel?.articles||[],fields=[['impressions','インプレッション','回'],['pageviews','PV','回'],['likes','スキ','件'],['comments','コメント','件']];
  const dailyLabel=funnel?.date?funnel.date.replaceAll('-','/')+' の単日データ':'公式の単日データ';
  $('#officialHeading').textContent=dailyLabel;
  $('#officialDate').textContent='公式ダッシュボード';
  if(!rows.length){$('#officialCards').innerHTML=empty('公式の単日指標は未取得です。');$('#officialTable').innerHTML='';$('#officialBasis').textContent='日次履歴を記録中です。';return;}
  $('#officialCards').innerHTML=fields.map(([key,label,unit])=>{
    const total=rows.every(r=>M.numeric(r[key])!==null)?rows.reduce((s,r)=>s+Number(r[key]),0):null;
    return `<div class="summary-card"><span class="label">${label}</span><strong>${number(total)}</strong><small>${unit} ／ 応答の${rows.length}記事</small></div>`;
  }).join('');
  const byKey=new Map(model.articles.map(a=>[a.key,a]));
  $('#officialTable').innerHTML=table(['記事','IMP','PV','スキ','コメント','IMP→PV','PV→スキ','PV→コメント'],[...rows].sort((a,b)=>(M.numeric(b.pageviews)??-Infinity)-(M.numeric(a.pageviews)??-Infinity)).map(r=>`<tr><td class="article-cell">${byKey.has(r.key)?`<button class="article-title" data-detail="${esc(r.key)}" type="button">${esc(byKey.get(r.key).title)}</button><small>${esc(byKey.get(r.key).category)}</small>`:esc(r.key)}</td>${fields.map(([key])=>`<td class="num">${number(M.numeric(r[key]))}</td>`).join('')}<td class="num">${percent(ratio(r.pageviews,r.impressions))}</td><td class="num">${percent(ratio(r.likes,r.pageviews))}</td><td class="num">${percent(ratio(r.comments,r.pageviews))}</td></tr>`));
  $('#officialBasis').textContent=`対象 ${funnel.date}、取得 ${dateTime(funnel.collectedAt)} JST、応答 ${rows.length}記事。率は保存せず表示時に実数から計算しています。流入元は現在APIに届いていません。公式指標の期間比較は日次履歴の公開後まで記録中です。`;
}
function drawCampaigns() {
  const data=model.raw.campaignData;
  $('#campaignCheckedAt').textContent=data?.checkedAt?'最終照合 '+dateTime(data.checkedAt)+' JST':'照合日時未取得';
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const items=(data?.campaigns||[]).filter(item=>item.status==='open'&&(!item.endAt||item.endAt>=today)).sort((a,b)=>String(a.endAt||'9999').localeCompare(String(b.endAt||'9999')));
  $('#openCampaignList').innerHTML=items.length?items.map(item=>`<a class="campaign-card" href="${safeUrl(item.launchUrl)}" target="_blank" rel="noopener noreferrer"><span>${item.type==='prompt'?'お題':'コンテスト'}</span><b>${esc(item.hashtag||item.title)}</b><small>${esc(item.title)}</small><small>締切 ${esc(item.endAt||'未確認')} · 募集元で確認 ↗</small></a>`).join(''):empty('取得した情報に募集中の企画はありません。');
}
function drawDetail(key) {
  const a=period.items.find(a=>a.key===key);if(!a)return;
  detailKey=key;$('#detailTitle').textContent=a.title;
  const history=[...(model.history.get(key)||new Map()).entries()].sort(([a],[b])=>a.localeCompare(b));
  const daily=model.raw.funnel?.articles?.find(r=>r.key===key),start=history[0]?.[0];
  const officialSeries=funnelHistory().map(day=>({date:day.date,row:(day.articles||[]).find(r=>r.key===key)}));
  const points=history.length?M.range(model.end,M.age(start,model.end)).map(date=>({date,value:M.numeric(model.history.get(key)?.get(date)?.pv)})):[];
  $('#articleDetail').innerHTML=`<p class="basis">${esc(a.category)} ／ 公開 ${esc(dateTime(a.publishedAt))} JST ／ 記録 ${esc(start||'なし')}〜${model.end}</p><div class="detail-actions"><a href="${safeUrl(a.url)}" target="_blank" rel="noopener noreferrer">noteで記事を読む ↗</a><button type="button" data-toggle-compare="${esc(key)}">${selected.has(key)?'比較から外す':'比較に追加'}</button></div><h3>${period.start} → ${period.end} の増加</h3><div class="detail-values">${M.fields.map(f=>`<div><small>${labels[f]}</small><strong>${signed(a.delta?.[f])}</strong></div>`).join('')}</div>${!M.valid(a.delta)?'<p class="basis">基準日または途中の記録がありません。現在の累計を期間増加の代わりには使いません。</p>':''}<h3>PVの成長曲線（累計）</h3>${lineChart(points,'回','この記事のPV累計')}<details class="data-details"><summary>日別の累計を見る</summary><div class="table-wrap">${table(['取得日','PV','スキ','コメント'],history.map(([date,r])=>`<tr><td>${date}</td>${M.fields.map(f=>`<td>${number(M.numeric(r[f]))}</td>`).join('')}</tr>`))}</div></details><h3>公式指標の日次推移</h3><div class="official-curves">${[['impressions','IMP','回'],['pageviews','PV','回'],['likes','スキ','件'],['comments','コメント','件']].map(([field,label,unit])=>`<section><h4>${label}</h4>${lineChart(officialSeries.map(item=>({date:item.date,value:M.numeric(item.row?.[field])})),unit,`${a.title}の${label}日次推移`)}</section>`).join('')}</div><h3>公式の単日指標：${esc(model.raw.funnel?.date||'未取得')} の単日データ</h3>${daily?table(['インプレッション','PV','スキ','コメント'],[`<tr>${['impressions','pageviews','likes','comments'].map(f=>`<td>${number(M.numeric(daily[f]))}</td>`).join('')}</tr>`]):empty('この日の公式応答にこの記事の記録はありません。')}<p class="basis">日次指標は各日の実数です。記事別の流入元・フォローへの貢献人数は未取得です。</p>`;
}
function toggleCompare(key) {
  if(selected.has(key))selected.delete(key);
  else if(selected.size<4)selected.add(key);
  else {$('#selectionLink').textContent='比較は最大4本です。選択を外して追加してください。';if(detailKey){const button=$('[data-toggle-compare]');if(button)button.textContent='比較は最大4本です';}return;}
  drawLedger();drawComparison();if(detailKey)drawDetail(detailKey);
}
function draw() {
  period=M.period(model,Number($('#period').value)||7);
  drawHealth();drawDecisions();drawOverview();drawContributions();drawArticlePosition();drawLedger();drawComparison();drawOfficial();drawCampaigns();
  if(detailKey)drawDetail(detailKey);
}
function bind() {
  $('#period').addEventListener('change',draw);
  for(const id of ['search','category','ageFilter','sort'])$('#'+id).addEventListener(id==='search'?'input':'change',drawLedger);
  $('#compareAge').addEventListener('change',drawComparison);
  $('#clearFilters').addEventListener('click',()=>{for(const id of ['search','category','ageFilter'])$('#'+id).value='';drawLedger();});
  $('#closeDetail').addEventListener('click',()=>{$('#articleDialog').close();detailKey=null;});
  $('#articleDialog').addEventListener('close',()=>{detailKey=null;});
  document.addEventListener('change',event=>{
    const key=event.target.dataset.compare;if(!key)return;
    if(!selected.has(key)&&selected.size>=4)event.target.checked=false;
    toggleCompare(key);
  });
  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-detail],button');if(!target)return;
    if(target.dataset.detail){event.preventDefault();drawDetail(target.dataset.detail);$('#articleDialog').showModal();}
    if(target.dataset.remove)toggleCompare(target.dataset.remove);
    if(target.dataset.toggleCompare)toggleCompare(target.dataset.toggleCompare);
    if(target.dataset.filter){for(const id of ['search','category','ageFilter'])$('#'+id).value='';$('#'+target.dataset.filter).value=target.dataset.value;drawLedger();$('#articles').scrollIntoView({behavior:'smooth',block:'start'});}
  });
  $('#retry').addEventListener('click',load);
}
async function load() {
  $('#retry').hidden=true;$('#status').textContent='データを読み込んでいます';
  try {
    const response=await fetch(API);if(!response.ok)throw new Error('HTTP '+response.status);
    const raw=await response.json();if(!raw.ready)throw new Error('Data not ready');
    model=M.create(raw);
    $('#category').innerHTML='<option value="">すべての分類</option>'+[...new Set(model.articles.map(a=>a.category))].sort().map(c=>`<option>${esc(c)}</option>`).join('');
    draw();window.notePulseData=raw;
  }catch(error){
    $('#status').textContent='データを取得できません';$('#health').classList.add('warning');$('#health').open=true;
    $('#healthChecks').innerHTML=empty('データを表示できません。時間をおいて再読み込みしてください。数値を0として扱ったり、古いデータを最新として表示したりはしません。');
    $('#retry').hidden=false;
  }
}
window.addEventListener?.('resize',()=>{if(model){drawTrend();drawArticlePosition();if(detailKey)drawDetail(detailKey);}});
bind();load();
