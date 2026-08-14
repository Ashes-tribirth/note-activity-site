(()=>{
  const DAY_MS=86400000;
  function rowDate(row){return String(row?.date||row?.collectedDate||row?.collectedAt||"").slice(0,10)}
  function shiftDate(date,delta){const [y,m,d]=String(date).split("-").map(Number);if(!y||!m||!d)return "";return new Date(Date.UTC(y,m-1,d+delta)).toISOString().slice(0,10)}
  function missingDates(rows){
    const dates=[...new Set((rows||[]).map(rowDate).filter(Boolean))].sort();
    if(dates.length<2)return [];
    const present=new Set(dates),missing=[];
    let cursor=dates[0];
    while(cursor<dates.at(-1)){
      cursor=shiftDate(cursor,1);
      if(cursor<=dates.at(-1)&&!present.has(cursor))missing.push(cursor);
    }
    return missing;
  }
  function collectionTimeStatus(collectedAt){
    const dt=new Date(collectedAt);
    if(Number.isNaN(dt.getTime()))return {ok:false,text:"取得時刻を確認できません"};
    const parts=new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(dt);
    const hour=Number(parts.find(part=>part.type==="hour")?.value);
    const minute=Number(parts.find(part=>part.type==="minute")?.value);
    if(!Number.isFinite(hour)||!Number.isFinite(minute))return {ok:false,text:"取得時刻を確認できません"};
    const value=hour*60+minute;
    const start=5*60+30;
    const end=9*60;
    const hhmm=`${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`;
    return value>=start&&value<=end
      ? {ok:true,text:`${hhmm} JST（通常範囲 05:30〜09:00）`}
      : {ok:false,text:`${hhmm} JST（通常範囲 05:30〜09:00 から外れています）`};
  }

  window.renderHealth=function(data,latest){
    const summaries=data.summaries||[];
    const latestMs=Date.parse(latest.collectedAt);
    const stale=!Number.isFinite(latestMs)||Date.now()-latestMs>36*3600000;
    const duplicateDates=new Set(summaries.map(rowDate)).size!==summaries.length;
    const missing=missingDates(summaries);
    const timeStatus=collectionTimeStatus(latest.collectedAt);
    const decreasing=summaries.some((row,index)=>index&&(
      row.totalPv<summaries[index-1].totalPv||
      row.totalLikes<summaries[index-1].totalLikes||
      row.totalComments<summaries[index-1].totalComments
    ));
    const countDrop=summaries.some((row,index)=>index&&row.articleCount<summaries[index-1].articleCount);
    const missingText=missing.length?`欠測: ${missing.slice(0,3).join("、")}${missing.length>3?` ほか${missing.length-3}日`:""}`:"記録開始後の日付欠けなし";
    const checks=[
      ["最新性",stale?"注意":"正常",stale?"最終取得から36時間以上経過":"最終取得は36時間以内"],
      ["取得時刻",timeStatus.ok?"正常":"注意",timeStatus.text],
      ["累計値",decreasing?"注意":"正常",decreasing?"前回より小さい累計値があります":"PV・スキ・コメントに逆行なし"],
      ["記事数",countDrop?"注意":"正常",countDrop?"記録記事数が減った日があります":"記事数の減少なし"],
      ["日付重複",duplicateDates?"注意":"正常",duplicateDates?"同じ日付の記録が重複":"日付の重複なし"],
      ["日付欠測",missing.length?"注意":"正常",missingText],
    ];
    const warnings=checks.filter(row=>row[1]==="注意").length;
    $("#healthBadge").textContent=warnings?`${warnings}件 要確認`:"異常なし";
    $("#healthBadge").classList.toggle("warn",!!warnings);
    $("#healthChecks").innerHTML=checks.map(row=>`<div class="${row[1]==="正常"?"ok":"warn"}"><b>${esc(row[0])}</b><strong>${row[1]}</strong><small>${esc(row[2])}</small></div>`).join("");
  };
})();
