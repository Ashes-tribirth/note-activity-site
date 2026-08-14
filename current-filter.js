(()=>{
  const originalRender=window.render;
  if(typeof originalRender!=="function")return;

  window.render=function(d){
    const history=Array.isArray(d?.articleHistory)?d.articleHistory:[];
    const summaries=Array.isArray(d?.summaries)?d.summaries:[];
    const latestDate=summaries.at(-1)?.date||summaries.at(-1)?.collectedDate||history.at(-1)?.date||"";

    if(latestDate&&Array.isArray(d?.articles)&&history.length){
      const currentKeys=new Set(
        history
          .filter(row=>row?.date===latestDate)
          .map(row=>row?.key)
          .filter(Boolean)
      );
      if(currentKeys.size){
        d={...d,articles:d.articles.filter(article=>{
          const key=article?.key||String(article?.url||"").split("/").pop();
          return currentKeys.has(key);
        })};
      }
    }

    return originalRender(d);
  };
})();
