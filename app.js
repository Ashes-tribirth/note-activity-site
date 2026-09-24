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
const labels = {pv:'従来ビュー',likes:'スキ',comments:'コメント',followers:'フォロワー',following:'フォロー'};
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
  $('#lifetime').innerHTML=`<div class="lifetime-values">${[['従来ビュー',model.latest.totalPv],['スキ',model.latest.totalLikes],['コメント',model.latest.totalComments],['公開記事',model.latest.articleCount],['フォロー',model.followers.get(model.end)?.followingCount],['フォロワー',model.followers.get(model.end)?.followerCount]].map(([l,v])=>`<span>${l} <b>${number(v)}</b></span>`).join('')}</div>`;
  drawTrend();
}
function drawTrend() {
  const metric=$('#metric').value||'pv', follow=metric==='following', field='followingCount';
  const points=M.range(model.end,period.n).map(date=>({date,value:follow?M.numeric(model.followers.get(date)?.[field]):period.eligible.length?period.eligible.reduce((s,a)=>s+M.numeric(model.history.get(a.key).get(date)[metric])-M.numeric(model.history.get(a.key).get(period.start)[metric]),0):null}));
  $('#trendTitle').textContent=follow?`${labels[metric]}数の推移`:`${labels[metric]}：期間開始からの増加`;
  $('#overviewChart').innerHTML=lineChart(points,units[metric],$('#trendTitle').textContent);
  $('#overviewValues').innerHTML=table(['取得日',follow?labels[metric]+'数':'期間開始からの増加'],points.map(p=>`<tr><td>${p.date}</td><td>${number(p.value)}${p.value===null?'':units[metric]}</td></tr>`));
}
function drawFollowerTrend() {
  const points=[...model.followers.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([date,row])=>({date,value:M.numeric(row.followerCount)}));
  const valid=points.filter(p=>p.value!==null);
  $('#followerChart').innerHTML=lineChart(points,'人','フォロワー数の推移');
  $('#followerValues').innerHTML=valid.length?table(['取得日','フォロワー数'],points.map(p=>`<tr><td>${p.date}</td><td>${number(p.value)}${p.value===null?'':'人'}</td></tr>`)):empty('フォロワー履歴を記録中です。');
  $('#followerTrendMeta').textContent=valid.length<2?'記録中':`${valid[0].date} → ${valid.at(-1).date} ／ ${signed(valid.at(-1).value-valid[0].value)}人`;
}
function median(values) {
  const sorted=[...values].sort((a,b)=>a-b),n=sorted.length;
  return n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2;
}
function drawArticlePosition() {
  const items=period.items.filter(a=>!a.dormant&&M.numeric(a.pv)!==null&&M.numeric(a.pv)>0&&M.numeric(a.likes)!==null&&M.numeric(a.comments)!==null).map(a=>({...a,rate:(Number(a.likes)+Number(a.comments))/Number(a.pv)*100}));
  if(items.length<2){$('#articlePosition').innerHTML=empty('四象限を描くための実測記事が不足しています。記録中です。');$('#positionNote').textContent='';return;}
  const midPv=median(items.map(a=>Number(a.pv))),midRate=median(items.map(a=>a.rate));
  const width=Math.max(320,Math.min(980,(Number(window.innerWidth)||1080)-100)),height=390,left=62,right=22,top=24,bottom=55;
  const maxPv=Math.max(1,...items.map(a=>Number(a.pv))),maxRate=Math.max(1,...items.map(a=>a.rate));
  const x=v=>left+v/maxPv*(width-left-right),y=v=>height-bottom-v/maxRate*(height-top-bottom);
  const xMid=x(midPv),yMid=y(midRate);
  const dots=items.map(a=>`<circle class="position-point" cx="${x(Number(a.pv))}" cy="${y(a.rate)}" r="4"><title>${esc(a.title)}｜PV ${number(a.pv)}｜反応率 ${a.rate.toFixed(1)}%</title></circle>`).join('');
  $('#articlePosition').innerHTML=`<div class="position-wrap"><svg class="position-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="記事ごとの累計PVと反応率の四象限"><line class="position-axis" x1="${left}" y1="${height-bottom}" x2="${width-right}" y2="${height-bottom}"/><line class="position-axis" x1="${left}" y1="${top}" x2="${left}" y2="${height-bottom}"/><line class="position-mid" x1="${xMid}" y1="${top}" x2="${xMid}" y2="${height-bottom}"/><line class="position-mid" x1="${left}" y1="${yMid}" x2="${width-right}" y2="${yMid}"/><text class="position-label" x="${left}" y="14">反応率（%）</text><text class="position-label" x="${width-right}" y="${height-16}" text-anchor="end">累計PV</text><text class="position-quadrant" x="${left+10}" y="${top+18}">高反応・低PV</text><text class="position-quadrant" x="${width-right-10}" y="${top+18}" text-anchor="end">高反応・高PV</text><text class="position-quadrant" x="${left+10}" y="${height-bottom-10}">低反応・低PV</text><text class="position-quadrant" x="${width-right-10}" y="${height-bottom-10}" text-anchor="end">低反応・高PV</text><text class="position-tick" x="${xMid}" y="${height-bottom+20}" text-anchor="middle">中央値 ${number(Math.round(midPv))}</text><text class="position-tick" x="${left-8}" y="${yMid+4}" text-anchor="end">${midRate.toFixed(1)}%</text>${dots}</svg></div>`;
  $('#positionNote').textContent=`表示${items.length}本。直近7日で動きのない記事は除外。四象限は記事の優劣ではなく、現在のPV規模と反応の位置関係を確認するためのものです。基準：PV中央値 ${number(Math.round(midPv))}、反応率中央値 ${midRate.toFixed(1)}%。`;
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
  $('#categoryMix').innerHTML=groupBars(groups('category').sort((a,b)=>(b.value??-Infinity)-(a.value??-Infinity)),'category');
  $('#contributionNote').textContent=`上の従来ビュー増加 ${signed(period.sum('pv'))}回と同じ対象の記事を分解しています。棒は合計への寄与を示し、1記事の強さを示すものではありません。新作も基準日の記録がなければ「記録不足」です。`;
}
function spark(article) {
  const dates=M.range(model.end,period.n),values=dates.map(date=>({date,value:M.numeric(model.history.get(article.key)?.get(date)?.pv)})),valid=values.filter(v=>v.value!==null);
  if(valid.length<2)return '—';
  const lo=Math.min(...valid.map(p=>p.value)),hi=Math.max(...valid.map(p=>p.value));
  const x=i=>3+i/period.n*84,y=v=>27-(v-lo)/Math.max(1,hi-lo)*24;
  return `<svg class="spark" viewBox="0 0 90 30" role="img" aria-label="従来ビューの推移。詳細で日付と数値を確認">${values.slice(1).map((p,i)=>p.value!==null&&values[i].value!==null?`<line x1="${x(i)}" y1="${y(values[i].value)}" x2="${x(i+1)}" y2="${y(p.value)}" stroke="#5790ae" stroke-width="2"/>`:'').join('')}</svg>`;
}
function ledgerRows(items) {
  const metric=['pv','likes','comments'].includes($('#sort').value)?$('#sort').value:'pv';
  const others=M.fields.filter(f=>f!==metric);
  return table(['比較','記事名','公開から',labels[metric]+' 増加',labels[others[0]]+' 増加',labels[others[1]]+' 増加','ビュー推移'],items.map(a=>`<tr><td><input class="compare-check" type="checkbox" data-compare="${esc(a.key)}" aria-label="${esc(a.title)}を比較" ${selected.has(a.key)?'checked':''}></td><td class="article-cell"><button class="article-title" type="button" data-detail="${esc(a.key)}">${esc(a.title)}</button><small>${esc(a.category)} · 公開 ${esc(String(a.publishedAt||'不明').slice(0,10))}${a.provisionalDormant?' · 動きなしは記録開始からの暫定判定':''}</small></td><td class="num">${a.age===null?'不明':a.age+'日'}</td><td class="num ${a.delta?.[metric]==null?'missing':''}">${signed(a.delta?.[metric])}</td>${others.map(f=>`<td class="num">${signed(a.delta?.[f])}</td>`).join('')}<td>${spark(a)}</td></tr>`),'ledger-table');
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
  $('#dormantSummary').textContent=`従来ビュー・スキ・コメントのすべてが不変。7日未満の記録は記録開始から暫定判定します。品質の低さを意味しません。対象の累計：従来ビュー ${number(dormant.reduce((s,a)=>s+Number(a.pv),0))} ／ スキ ${number(dormant.reduce((s,a)=>s+Number(a.likes),0))}。従来ビューを分母にした反応率は表示しません。`;
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
  if(!rows.length){$('#officialCards').innerHTML=empty('公式の単日指標は未取得です。');$('#officialTable').innerHTML='';return;}
  $('#officialCards').innerHTML=fields.map(([key,label,unit])=>{
    const total=rows.every(r=>M.numeric(r[key])!==null)?rows.reduce((s,r)=>s+Number(r[key]),0):null;
    return `<div class="summary-card"><span class="label">${label}</span><strong>${number(total)}</strong><small>${unit} ／ 応答の${rows.length}記事</small></div>`;
  }).join('');
  const byKey=new Map(model.articles.map(a=>[a.key,a]));
  $('#officialTable').innerHTML=table(['記事','インプレッション','PV','スキ','コメント'],[...rows].sort((a,b)=>(M.numeric(b.pageviews)??-Infinity)-(M.numeric(a.pageviews)??-Infinity)).map(r=>`<tr><td class="article-cell">${byKey.has(r.key)?`<button class="article-title" data-detail="${esc(r.key)}" type="button">${esc(byKey.get(r.key).title)}</button>`:esc(r.key)}</td>${fields.map(([key])=>`<td class="num">${number(M.numeric(r[key]))}</td>`).join('')}</tr>`));
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
  const points=history.length?M.range(model.end,M.age(start,model.end)).map(date=>({date,value:M.numeric(model.history.get(key)?.get(date)?.pv)})):[];
  $('#articleDetail').innerHTML=`<p class="basis">${esc(a.category)} ／ 公開 ${esc(dateTime(a.publishedAt))} JST ／ 記録 ${esc(start||'なし')}〜${model.end}</p><div class="detail-actions"><a href="${safeUrl(a.url)}" target="_blank" rel="noopener noreferrer">noteで記事を読む ↗</a><button type="button" data-toggle-compare="${esc(key)}">${selected.has(key)?'比較から外す':'比較に追加'}</button></div><h3>${period.start} → ${period.end} の増加</h3><div class="detail-values">${M.fields.map(f=>`<div><small>${labels[f]}</small><strong>${signed(a.delta?.[f])}</strong></div>`).join('')}</div>${!M.valid(a.delta)?'<p class="basis">基準日または途中の記録がありません。現在の累計を期間増加の代わりには使いません。</p>':''}<h3>従来ビューの成長曲線（累計）</h3>${lineChart(points,'回','この記事の従来ビュー累計')}<details class="data-details"><summary>日別の累計を見る</summary><div class="table-wrap">${table(['取得日','従来ビュー','スキ','コメント'],history.map(([date,r])=>`<tr><td>${date}</td>${M.fields.map(f=>`<td>${number(M.numeric(r[f]))}</td>`).join('')}</tr>`))}</div></details><h3>公式の単日指標：${esc(model.raw.funnel?.date||'未取得')} の単日データ</h3>${daily?table(['インプレッション','PV','スキ','コメント'],[`<tr>${['impressions','pageviews','likes','comments'].map(f=>`<td>${number(M.numeric(daily[f]))}</td>`).join('')}</tr>`]):empty('この日の公式応答にこの記事の記録はありません。')}<p class="basis">記事別の流入元・フォローへの貢献人数は未取得です。</p>`;
}
function toggleCompare(key) {
  if(selected.has(key))selected.delete(key);
  else if(selected.size<4)selected.add(key);
  else {$('#selectionLink').textContent='比較は最大4本です。選択を外して追加してください。';if(detailKey){const button=$('[data-toggle-compare]');if(button)button.textContent='比較は最大4本です';}return;}
  drawLedger();drawComparison();if(detailKey)drawDetail(detailKey);
}
function draw() {
  period=M.period(model,Number($('#period').value)||7);
  drawHealth();drawOverview();drawFollowerTrend();drawContributions();drawArticlePosition();drawLedger();drawComparison();drawOfficial();drawCampaigns();
  if(detailKey)drawDetail(detailKey);
}
function bind() {
  $('#period').addEventListener('change',draw);
  $('#metric').addEventListener('change',drawTrend);
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
    const target=event.target.closest('button');if(!target)return;
    if(target.dataset.detail){drawDetail(target.dataset.detail);$('#articleDialog').showModal();}
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
window.addEventListener?.('resize',()=>{if(model){drawTrend();drawFollowerTrend();drawArticlePosition();if(detailKey)drawDetail(detailKey);}});
bind();load();
