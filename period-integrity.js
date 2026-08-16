(()=>{
  const DAY_MS=86400000;
  const state={mode:"waiting",baselineDate:null,historyDates:[]};

  function rowDate(row){return String(row?.date||row?.collectedDate||row?.collectedAt||"").slice(0,10)}
  function shiftDate(date,delta){const [y,m,d]=String(date).split("-").map(Number);if(!y||!m||!d)return "";return new Date(Date.UTC(y,m-1,d+delta)).toISOString().slice(0,10)}
  function distinctByDate(rows){const map=new Map();(rows||[]).forEach(row=>{const date=rowDate(row);if(date)map.set(date,row)});return map}
  function continuousWindow(rows,daysBack){
    const byDate=distinctByDate(rows),dates=[...byDate.keys()].sort(),latestDate=dates.at(-1)||"";
    if(!latestDate)return null;
    const required=[];for(let offset=daysBack;offset>=0;offset--)required.push(shiftDate(latestDate,-offset));
    if(required.some(date=>!byDate.has(date)))return null;
    return {latest:byDate.get(latestDate),baseline:byDate.get(shiftDate(latestDate,-daysBack)),dates:required,byDate};
  }
  function articleHistoryByDate(data,date){return (data.articleHistory||[]).filter(row=>rowDate(row)===date)}
  function deltaBetween(data,startDate,endDate,endRows=null){
    const start=new Map(articleHistoryByDate(data,startDate).map(row=>[row.key,row]));
    const rows=endRows||articleHistoryByDate(data,endDate);
    return rows.reduce((sum,row)=>{
      const before=start.get(row.key);
      sum.pv+=Number(row.pv||0)-Number(before?.pv||0);
      sum.likes+=Number(row.likes||0)-Number(before?.likes||0);
      sum.comments+=Number(row.comments||0)-Number(before?.comments||0);
      return sum;
    },{pv:0,likes:0,comments:0});
  }
  function articlePeriodContext(data){
    const allDates=[...new Set((data.articleHistory||[]).map(row=>rowDate(row)).filter(Boolean))].sort(),latestDate=allDates.at(-1)||"";
    const exact=continuousWindow(allDates.map(date=>({date})),7);
    if(exact)return {mode:"exact",baselineDate:shiftDate(latestDate,-7),dates:allDates};
    if(!allDates.length)return {mode:"waiting",baselineDate:null,dates:allDates};
    const firstDate=allDates[0],span=Math.round((Date.parse(`${latestDate}T00:00:00Z`)-Date.parse(`${firstDate}T00:00:00Z`))/DAY_MS);
    if(span<7)return {mode:allDates.length>=2?"provisional":"waiting",baselineDate:allDates.length>=2?firstDate:null,dates:allDates};
    return {mode:"gap",baselineDate:null,dates:allDates};
  }

  window.buildArticleItems=function(data){
    const history=data.articleHistory||[],context=articlePeriodContext(data);state.mode=context.mode;state.baselineDate=context.baselineDate;state.historyDates=context.dates;
    const dates=context.dates,previousDate=dates.at(-2),byDate=new Map();
    history.forEach(row=>{const date=rowDate(row);if(!date)return;if(!byDate.has(date))byDate.set(date,new Map());byDate.get(date).set(row.key,row)});
    const items=(data.articles||[]).map(article=>{
      const key=article.key||String(article.url||"").split("/").pop(),previous=previousDate?byDate.get(previousDate)?.get(key):null,baseline=context.baselineDate?byDate.get(context.baselineDate)?.get(key):null;
      const d7=context.mode==="exact"||context.mode==="provisional"?{pv:article.pv-Number(baseline?.pv||0),likes:article.likes-Number(baseline?.likes||0),comments:article.comments-Number(baseline?.comments||0)}:{pv:null,likes:null,comments:null};
      return {...article,key,category:categoryOf(article),d1:{pv:article.pv-Number(previous?.pv||0),likes:article.likes-Number(previous?.likes||0),comments:article.comments-Number(previous?.comments||0)},d7};
    });
    return {items,dates};
  };

  const originalHeader=window.renderHeaderAndTotals;
  window.renderHeaderAndTotals=function(data,latest,previous,intervalLabel){
    originalHeader(data,latest,previous,intervalLabel);
    const summaries=data.summaries||[],latestDate=rowDate(latest),previousDate=rowDate(previous),week=continuousWindow(summaries,7),month=continuousWindow(summaries,30),followers=data.followers||[],follow=followers.at(-1)||{},previousFollow=followers.at(-2)||follow;
    const followerReady=followers.length>=2&&Number.isFinite(Number(follow.followerCount))&&Number.isFinite(Number(previousFollow.followerCount));
    const previousDelta=summaries.length>=2?deltaBetween(data,previousDate,latestDate,data.articles||[]):null;
    const weekDelta=week?deltaBetween(data,rowDate(week.baseline),rowDate(week.latest),data.articles||[]):null;
    const monthDelta=month?deltaBetween(data,rowDate(month.baseline),rowDate(month.latest),data.articles||[]):null;
    $("#changes").innerHTML=
      change(intervalLabel,previousDelta?.pv||0,previousDelta?`スキ ${signed(previousDelta.likes)} ／ コメント ${signed(previousDelta.comments)}`:"",!!previousDelta,"PV")+
      change("7日間",weekDelta?.pv||0,weekDelta?`スキ ${signed(weekDelta.likes)} ／ コメント ${signed(weekDelta.comments)}`:"",!!weekDelta,"PV")+
      change("30日間",monthDelta?.pv||0,monthDelta?`スキ ${signed(monthDelta.likes)} ／ コメント ${signed(monthDelta.comments)}`:"",!!monthDelta,"PV")+
      change("フォロワー前回比",followerReady?Number(follow.followerCount)-Number(previousFollow.followerCount):0,`現在 ${fmt.format(Number(follow.followerCount)||0)}人`,followerReady,"人");
  };

  window.renderPeriodComparison=function(data){
    const summaries=data.summaries||[];
    const period=n=>{
      const full=continuousWindow(summaries,2*n);if(!full)return null;
      const end=rowDate(full.latest),middle=shiftDate(end,-n),start=rowDate(full.baseline);
      return {current:deltaBetween(data,middle,end),previous:deltaBetween(data,start,middle)};
    };
    $("#periodCompare").innerHTML=[7,30].map(n=>{
      const result=period(n);if(!result)return empty(`${n}日比較は記録中`,`連続した${2*n+1}日分の実測記録が揃うと直前期間と比較できます。`);
      const diff=result.current.pv-result.previous.pv,rate=result.previous.pv?diff/result.previous.pv*100:null;
      return `<div class="period-row"><b>${n}日</b><span>直近 <strong>${signed(result.current.pv)}</strong> PV</span><span>前期間 ${signed(result.previous.pv)} PV</span><em class="${diff>=0?"up":"down"}">${signed(diff)} / ${rate==null?"—":`${signed(Math.round(rate))}%`}</em><small>スキ ${signed(result.current.likes)}（前期間 ${signed(result.previous.likes)}）</small></div>`;
    }).join("");
  };

  window.renderDormant=function(dormant,historyDates){
    const mode=state.mode;
    if(mode==="waiting"){$("#dormantCount").textContent="判定待ち";$("#dormantBasis").textContent="2日分の記録から判定を開始します。"}
    else if(mode==="provisional"){const latest=state.historyDates.at(-1),first=state.historyDates[0],span=Math.max(1,Math.round((Date.parse(`${latest}T00:00:00Z`)-Date.parse(`${first}T00:00:00Z`))/DAY_MS));$("#dormantCount").textContent=`${dormant.length}記事`;$("#dormantBasis").textContent=`記録開始から${span}日間、PV・スキ・コメントがすべて変わっていない記事です。7日分が貯まるまでは暫定判定です。`}
    else if(mode==="gap"){$("#dormantCount").textContent="判定待ち";$("#dormantBasis").textContent="直近7日間の記録に欠けがあるため、7日判定は記録中です。";dormant=[]}
    else{$("#dormantCount").textContent=`${dormant.length}記事`;$("#dormantBasis").textContent="直近7日間、PV・スキ・コメントがすべて変わっていない記事です。"}
    const pv=dormant.reduce((sum,a)=>sum+a.pv,0),likes=dormant.reduce((sum,a)=>sum+a.likes,0);
    $("#dormantSummary").innerHTML=dormant.length?`<div><span>対象</span><b>${dormant.length}記事</b></div><div><span>累計PV</span><b>${fmt.format(pv)}</b></div><div><span>累計スキ</span><b>${fmt.format(likes)}</b></div>`:empty(mode==="waiting"||mode==="gap"?"判定待ち":"該当なし",mode==="gap"?"欠けた日付があるため推測せず判定を保留しています。":mode==="waiting"?"次回記録後から動きの有無を判定します。":"動きのない記事はありません。");
  };

  window.renderLedger=function(allItems,dormant,historyDates){
    const dormantKeys=new Set(dormant.map(article=>article.key)),categories=[...new Set(allItems.map(article=>article.category).filter(Boolean))].sort(),mode=state.mode;
    $("#categoryFilter").innerHTML='<option value="">すべての分類</option>'+categories.map(category=>`<option>${esc(category)}</option>`).join("");
    const draw=()=>{
      const query=$("#ledgerSearch").value.toLowerCase(),category=$("#categoryFilter").value,status=$("#statusFilter").value;
      const rows=allItems.map(article=>{const dormantState=dormantKeys.has(article.key),statusValue=mode==="gap"||mode==="waiting"?"pending":dormantState?"dormant":"active",statusLabel=mode==="exact"?(dormantState?"7日間動きなし":"動きあり"):mode==="provisional"?`暫定・${dormantState?"動きなし":"動きあり"}`:"記録中";return {...article,d1pv:article.d1.pv,d7pv:article.d7.pv,rate:(article.likes+article.comments)/Math.max(1,article.pv),status:statusValue,statusLabel}})
        .filter(article=>(!query||article.title.toLowerCase().includes(query))&&(!category||article.category===category)&&(!status||(status==="active"?article.status==="active":status==="dormant"?article.status==="dormant":true)))
        .sort((a,b)=>{const x=a[ledgerSort.key]??"",y=b[ledgerSort.key]??"";return (typeof x==="number"&&typeof y==="number"?x-y:String(x).localeCompare(String(y),"ja"))*ledgerSort.dir});
      $("#ledgerBody").innerHTML=rows.map(article=>`<tr><td><a href="${esc(article.url)}" target="_blank" rel="noopener noreferrer">${esc(article.title)}</a></td><td>${article.category?esc(article.category):"—"}</td><td>${article.publishedAt?article.publishedAt.slice(0,10):"—"}</td><td>${fmt.format(article.pv)}</td><td>${fmt.format(article.likes)}</td><td>${fmt.format(article.comments)}</td><td>${signed(article.d1pv)}</td><td>${article.d7pv==null?"記録中":signed(article.d7pv)}</td><td>${(article.rate*100).toFixed(1)}%</td><td><span class="state ${article.status}">${article.statusLabel}</span></td></tr>`).join("");
    };
    $("#ledgerSearch").oninput=draw;$("#categoryFilter").onchange=draw;$("#statusFilter").onchange=draw;document.querySelectorAll("[data-sort]").forEach(header=>{header.onclick=()=>{const key=header.dataset.sort;if(ledgerSort.key===key)ledgerSort.dir*=-1;else ledgerSort={key,dir:["title","category","publishedAt"].includes(key)?1:-1};draw()}});draw();
  };

  const originalCategories=window.renderCategories;
  window.renderCategories=function(items,dormantKeys){
    if(state.mode!=="gap"&&state.mode!=="waiting")return originalCategories(items,dormantKeys);
    const categories=new Map();items.filter(article=>article.category).forEach(article=>{const entry=categories.get(article.category)||{name:article.category,count:0,pv:0,likes:0};entry.count++;entry.pv+=article.pv;entry.likes+=article.likes;categories.set(article.category,entry)});
    const order=["音楽・曲","エッセイ・日常","note・ツール","孫子・思考","ゲーム・趣味","その他"],rows=order.map(name=>categories.get(name)||{name,count:0,pv:0,likes:0});
    $("#categories").innerHTML=rows.map(row=>`<div><p><b>${esc(row.name)}</b><span>全${row.count}記事／動きあり 判定中</span></p><small>${fmt.format(row.pv)} PV ・ スキ率 ${(row.likes/Math.max(row.pv,1)*100).toFixed(1)}% ・ 直近7日PV 記録中</small></div>`).join("");
  };
})();
