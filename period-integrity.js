(()=>{
  const DAY_MS=86400000;
  const state={mode:"waiting",baselineDate:null,consecutiveDates:[],historyDates:[]};

  function rowDate(row){
    return String(row?.date||row?.collectedDate||row?.collectedAt||"").slice(0,10);
  }

  function shiftDate(date,delta){
    const [y,m,d]=String(date).split("-").map(Number);
    if(!y||!m||!d)return "";
    return new Date(Date.UTC(y,m-1,d+delta)).toISOString().slice(0,10);
  }

  function distinctByDate(rows){
    const map=new Map();
    (rows||[]).forEach(row=>{const date=rowDate(row);if(date)map.set(date,row)});
    return map;
  }

  function continuousWindow(rows,daysBack){
    const byDate=distinctByDate(rows);
    const dates=[...byDate.keys()].sort();
    const latestDate=dates.at(-1)||"";
    if(!latestDate)return null;
    const required=[];
    for(let offset=daysBack;offset>=0;offset--)required.push(shiftDate(latestDate,-offset));
    if(required.some(date=>!byDate.has(date)))return null;
    return {latest:byDate.get(latestDate),baseline:byDate.get(shiftDate(latestDate,-daysBack)),dates:required,byDate};
  }

  function articlePeriodContext(data){
    const history=data.articleHistory||[];
    const allDates=[...new Set(history.map(row=>rowDate(row)).filter(Boolean))].sort();
    const latestDate=allDates.at(-1)||"";
    const exact=continuousWindow(allDates.map(date=>({date})),7);
    if(exact)return {mode:"exact",baselineDate:shiftDate(latestDate,-7),dates:allDates};
    if(!allDates.length)return {mode:"waiting",baselineDate:null,dates:allDates};
    const firstDate=allDates[0];
    const span=Math.round((Date.parse(`${latestDate}T00:00:00Z`)-Date.parse(`${firstDate}T00:00:00Z`))/DAY_MS);
    if(span<7)return {mode:allDates.length>=2?"provisional":"waiting",baselineDate:allDates.length>=2?firstDate:null,dates:allDates};
    return {mode:"gap",baselineDate:null,dates:allDates};
  }

  const originalBuildArticleItems=window.buildArticleItems;
  window.buildArticleItems=function(data){
    const history=data.articleHistory||[];
    const context=articlePeriodContext(data);
    state.mode=context.mode;
    state.baselineDate=context.baselineDate;
    state.historyDates=context.dates;
    const dates=context.dates;
    const previousDate=dates.at(-2);
    const byDate=new Map();
    history.forEach(row=>{
      const date=rowDate(row);
      if(!date)return;
      if(!byDate.has(date))byDate.set(date,new Map());
      byDate.get(date).set(row.key,row);
    });
    const items=(data.articles||[]).map(article=>{
      const key=article.key||String(article.url||"").split("/").pop();
      const previous=previousDate?byDate.get(previousDate)?.get(key):null;
      const baseline=context.baselineDate?byDate.get(context.baselineDate)?.get(key):null;
      const d7=context.mode==="exact"||context.mode==="provisional"?{
        pv:article.pv-(baseline?.pv??article.pv),
        likes:article.likes-(baseline?.likes??article.likes),
        comments:article.comments-(baseline?.comments??article.comments),
      }:{pv:null,likes:null,comments:null};
      return {...article,key,category:categoryOf(article),d1:{
        pv:article.pv-(previous?.pv??article.pv),
        likes:article.likes-(previous?.likes??article.likes),
        comments:article.comments-(previous?.comments??article.comments),
      },d7};
    });
    return {items,dates};
  };

  const originalHeader=window.renderHeaderAndTotals;
  window.renderHeaderAndTotals=function(data,latest,previous,intervalLabel){
    originalHeader(data,latest,previous,intervalLabel);
    const summaries=data.summaries||[];
    const week=continuousWindow(summaries,7);
    const month=continuousWindow(summaries,30);
    const followers=data.followers||[];
    const follow=followers.at(-1)||{};
    const previousFollow=followers.at(-2)||follow;
    const followerReady=followers.length>=2&&Number.isFinite(Number(follow.followerCount))&&Number.isFinite(Number(previousFollow.followerCount));
    $("#changes").innerHTML=
      change(intervalLabel,latest.totalPv-previous.totalPv,`スキ ${signed(latest.totalLikes-previous.totalLikes)} ／ コメント ${signed(latest.totalComments-previous.totalComments)}`,summaries.length>=2,"PV")+
      change("7日間",week?week.latest.totalPv-week.baseline.totalPv:0,week?`スキ ${signed(week.latest.totalLikes-week.baseline.totalLikes)} ／ コメント ${signed(week.latest.totalComments-week.baseline.totalComments)}`:"",!!week,"PV")+
      change("30日間",month?month.latest.totalPv-month.baseline.totalPv:0,month?`スキ ${signed(month.latest.totalLikes-month.baseline.totalLikes)} ／ コメント ${signed(month.latest.totalComments-month.baseline.totalComments)}`:"",!!month,"PV")+
      change("フォロワー前回比",followerReady?Number(follow.followerCount)-Number(previousFollow.followerCount):0,`現在 ${fmt.format(Number(follow.followerCount)||0)}人`,followerReady,"人");
  };

  window.renderPeriodComparison=function(data){
    const summaries=data.summaries||[];
    const period=n=>{
      const full=continuousWindow(summaries,2*n);
      if(!full)return null;
      const a=full.latest;
      const b=full.byDate.get(shiftDate(rowDate(a),-n));
      const c=full.baseline;
      return {current:a.totalPv-b.totalPv,previous:b.totalPv-c.totalPv,likes:a.totalLikes-b.totalLikes,prevLikes:b.totalLikes-c.totalLikes};
    };
    $("#periodCompare").innerHTML=[7,30].map(n=>{
      const result=period(n);
      if(!result)return empty(`${n}日比較は記録中`,`連続した${2*n+1}日分の実測記録が揃うと直前期間と比較できます。`);
      const diff=result.current-result.previous;
      const rate=result.previous?diff/result.previous*100:null;
      return `<div class="period-row"><b>${n}日</b><span>直近 <strong>${signed(result.current)}</strong> PV</span><span>前期間 ${signed(result.previous)} PV</span><em class="${diff>=0?"up":"down"}">${signed(diff)} / ${rate==null?"—":`${signed(Math.round(rate))}%`}</em><small>スキ ${signed(result.likes)}（前期間 ${signed(result.prevLikes)}）</small></div>`;
    }).join("");
  };

  window.renderDormant=function(dormant,historyDates){
    const mode=state.mode;
    if(mode==="waiting"){
      $("#dormantCount").textContent="判定待ち";
      $("#dormantBasis").textContent="2日分の記録から判定を開始します。";
    }else if(mode==="provisional"){
      const latest=state.historyDates.at(-1),first=state.historyDates[0];
      const span=Math.max(1,Math.round((Date.parse(`${latest}T00:00:00Z`)-Date.parse(`${first}T00:00:00Z`))/DAY_MS));
      $("#dormantCount").textContent=`${dormant.length}記事`;
      $("#dormantBasis").textContent=`記録開始から${span}日間、PV・スキ・コメントがすべて変わっていない記事です。7日分が貯まるまでは暫定判定です。`;
    }else if(mode==="gap"){
      $("#dormantCount").textContent="判定待ち";
      $("#dormantBasis").textContent="直近7日間の記録に欠けがあるため、7日判定は記録中です。";
      dormant=[];
    }else{
      $("#dormantCount").textContent=`${dormant.length}記事`;
      $("#dormantBasis").textContent="直近7日間、PV・スキ・コメントがすべて変わっていない記事です。";
    }
    const pv=dormant.reduce((sum,a)=>sum+a.pv,0),likes=dormant.reduce((sum,a)=>sum+a.likes,0);
    $("#dormantSummary").innerHTML=dormant.length
      ? `<div><span>対象</span><b>${dormant.length}記事</b></div><div><span>累計PV</span><b>${fmt.format(pv)}</b></div><div><span>累計スキ</span><b>${fmt.format(likes)}</b></div>`
      : empty(mode==="waiting"||mode==="gap"?"判定待ち":"該当なし",mode==="gap"?"欠けた日付があるため推測せず判定を保留しています。":mode==="waiting"?"次回記録後から動きの有無を判定します。":"動きのない記事はありません。");
  };

  window.renderLedger=function(allItems,dormant,historyDates){
    const dormantKeys=new Set(dormant.map(article=>article.key));
    const categories=[...new Set(allItems.map(article=>article.category))].sort();
    const mode=state.mode;
    $("#categoryFilter").innerHTML='<option value="">すべての分類</option>'+categories.map(category=>`<option>${esc(category)}</option>`).join("");
    const draw=()=>{
      const query=$("#ledgerSearch").value.toLowerCase(),category=$("#categoryFilter").value,status=$("#statusFilter").value;
      const rows=allItems.map(article=>{
        const dormantState=dormantKeys.has(article.key);
        const statusValue=mode==="gap"||mode==="waiting"?"pending":dormantState?"dormant":"active";
        const statusLabel=mode==="exact"?(dormantState?"7日間動きなし":"動きあり"):mode==="provisional"?`暫定・${dormantState?"動きなし":"動きあり"}`:"記録中";
        return {...article,d1pv:article.d1.pv,d7pv:article.d7.pv,rate:(article.likes+article.comments)/Math.max(1,article.pv),status:statusValue,statusLabel};
      }).filter(article=>(!query||article.title.toLowerCase().includes(query))&&(!category||article.category===category)&&(!status||(status==="active"?article.status==="active":status==="dormant"?article.status==="dormant":true))).sort((a,b)=>{
        const x=a[ledgerSort.key]??"",y=b[ledgerSort.key]??"";
        return (typeof x==="number"&&typeof y==="number"?x-y:String(x).localeCompare(String(y),"ja"))*ledgerSort.dir;
      });
      $("#ledgerBody").innerHTML=rows.map(article=>`<tr><td><a href="${esc(article.url)}" target="_blank" rel="noopener noreferrer">${esc(article.title)}</a></td><td>${esc(article.category)}</td><td>${article.publishedAt?article.publishedAt.slice(0,10):"—"}</td><td>${fmt.format(article.pv)}</td><td>${fmt.format(article.likes)}</td><td>${fmt.format(article.comments)}</td><td>${signed(article.d1pv)}</td><td>${article.d7pv==null?"記録中":signed(article.d7pv)}</td><td>${(article.rate*100).toFixed(1)}%</td><td><span class="state ${article.status}">${article.statusLabel}</span></td></tr>`).join("");
    };
    $("#ledgerSearch").oninput=draw;$("#categoryFilter").onchange=draw;$("#statusFilter").onchange=draw;
    document.querySelectorAll("[data-sort]").forEach(header=>{header.onclick=()=>{const key=header.dataset.sort;if(ledgerSort.key===key)ledgerSort.dir*=-1;else ledgerSort={key,dir:["title","category","publishedAt"].includes(key)?1:-1};draw();}});
    draw();
  };

  const originalCategories=window.renderCategories;
  window.renderCategories=function(items,dormantKeys){
    if(state.mode!=="gap"&&state.mode!=="waiting")return originalCategories(items,dormantKeys);
    const categories=new Map();
    items.forEach(article=>{
      const entry=categories.get(article.category)||{name:article.category,count:0,pv:0,likes:0};
      entry.count++;entry.pv+=article.pv;entry.likes+=article.likes;categories.set(article.category,entry);
    });
    const order=["音楽・曲","エッセイ・日常","note・ツール","孫子・思考","ゲーム・趣味","その他","要確認"];
    const rows=order.filter(name=>name!=="要確認"||categories.has(name)).map(name=>categories.get(name)||{name,count:0,pv:0,likes:0});
    const top=Math.max(...rows.map(row=>row.count),1);
    $("#categories").innerHTML=rows.map(row=>`<div><p><b>${esc(row.name)}</b><span>全${row.count}記事／動きあり 判定中</span></p><i><b style="width:${row.count/top*100}%"></b></i><small>${fmt.format(row.pv)} PV ・ スキ率 ${(row.likes/Math.max(row.pv,1)*100).toFixed(1)}% ・ 直近7日PV 記録中</small></div>`).join("");
  };
})();
