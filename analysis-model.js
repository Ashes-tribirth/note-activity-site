/* All values come from observed records. Missing dates never become zero. */
(function (root) {
  const DAY = 86400000;
  const numeric = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
  const dateOf = row => String(row?.date || row?.collectedDate || row?.collectedAt || '').slice(0, 10);
  const shift = (date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
  const age = (published, date) => published && Number.isFinite(Date.parse(published)) ? Math.floor((Date.parse(date + 'T00:00:00Z') - Date.parse(String(published).slice(0, 10) + 'T00:00:00Z')) / DAY) : null;
  const range = (end, n) => Array.from({length:n+1}, (_,i)=>shift(end,i-n));
  const fields = ['pv','likes','comments'];
  const reviewed = {n3445e9974c2c:'エッセイ・日常',nc0ba447096ad:'孫子・思考',n715119ad26e9:'ゲーム・趣味',nd997cebc4486:'エッセイ・日常'};
  function create(raw) {
    const summaries = [...(raw.summaries || [])].sort((a,b)=>dateOf(a).localeCompare(dateOf(b)));
    const latest = summaries.at(-1);
    if (!latest || !dateOf(latest)) throw new Error('No dated summary');
    const end = dateOf(latest), history = new Map();
    for (const row of raw.articleHistory || []) {
      if (!history.has(row.key)) history.set(row.key,new Map());
      history.get(row.key).set(dateOf(row),row);
    }
    const current = new Set((raw.articleHistory || []).filter(r=>dateOf(r)===end).map(r=>r.key));
    const articles = (raw.articles || []).map(a=>({...a,key:a.key||String(a.url).split('/').pop()})).filter(a=>current.has(a.key)).map(a=>({...a,category:reviewed[a.key]||a.category||'要確認'}));
    return {raw,summaries,latest,end,history,articles,followers:new Map((raw.followers||[]).map(r=>[dateOf(r),r]))};
  }
  function delta(model,key,end,n) {
    const map=model.history.get(key), dates=range(end,n);
    if (!map || dates.some(d=>!map.has(d))) return null;
    const result={};
    for(const field of fields){
      const values=dates.map(d=>numeric(map.get(d)[field]));
      result[field]=values.some(v=>v===null)?null:values.at(-1)-values[0];
    }
    return result;
  }
  const valid = d => d && fields.every(f=>d[f]!==null);
  function period(model,n) {
    const items=model.articles.map(a=>{
      const d=delta(model,a.key,model.end,n), d7=delta(model,a.key,model.end,7), aDays=age(a.publishedAt,model.end);
      const map=model.history.get(a.key); const dates=[...map.keys()].sort();
      const shortSpan=age(dates[0],model.end);
      const provisional=shortSpan>0&&shortSpan<7?delta(model,a.key,model.end,shortSpan):null;
      const dormantBasis=valid(d7)?d7:provisional;
      return {...a,delta:d,age:aDays,band:aDays===null?'公開日不明':aDays<=7?'新作（0〜7日）':aDays<=30?'中期（8〜30日）':'過去記事（31日〜）',dormant:valid(dormantBasis)&&fields.every(f=>dormantBasis[f]===0),provisionalDormant:!valid(d7)&&valid(provisional)};
    });
    const eligible=items.filter(a=>valid(a.delta));
    const comparable=eligible.filter(a=>valid(delta(model,a.key,shift(model.end,-n),n)));
    const previous=comparable.map(a=>delta(model,a.key,shift(model.end,-n),n));
    const sum=field=>eligible.length?eligible.reduce((s,a)=>s+a.delta[field],0):null;
    const prev=field=>comparable.length?previous.reduce((s,d)=>s+d[field],0):null;
    const compared=field=>comparable.length?comparable.reduce((s,a)=>s+a.delta[field],0):null;
    return {n,start:shift(model.end,-n),end:model.end,items,eligible,comparable,sum,prev,compared};
  }
  function followerDelta(model,end,n,field='followerCount') {
    const values=range(end,n).map(d=>numeric(model.followers.get(d)?.[field]));
    return values.some(v=>v===null)?null:values.at(-1)-values[0];
  }
  function aligned(model,article,n) {
    if(!article.publishedAt || !Number.isFinite(Date.parse(article.publishedAt))) return {reason:'公開日不明'};
    const target=shift(String(article.publishedAt).slice(0,10),n),row=model.history.get(article.key)?.get(target);
    if(target>model.end) return {reason:target+'の取得待ち',target};
    if(!row) return {reason:target+'の記録なし',target};
    const collectedAt=model.summaries.find(s=>dateOf(s)===target)?.collectedAt;
    return {target,row,hours:collectedAt?(Date.parse(collectedAt)-Date.parse(article.publishedAt))/3600000:null};
  }
  root.PulseModel={numeric,dateOf,shift,age,range,fields,create,delta,valid,period,followerDelta,aligned};
})(typeof window==='undefined'?globalThis:window);
