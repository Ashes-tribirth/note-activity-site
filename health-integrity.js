function missingDates(rows) {
  const dates = [...new Set((rows || []).map(rowDate).filter(Boolean))].sort();
  if (dates.length < 2) return [];
  const present = new Set(dates);
  const missing = [];
  let cursor = dates[0];
  while (cursor < dates.at(-1)) {
    cursor = shiftDate(cursor, 1);
    if (cursor <= dates.at(-1) && !present.has(cursor)) missing.push(cursor);
  }
  return missing;
}

function collectionTimeStatus(collectedAt) {
  const date = new Date(collectedAt);
  if (Number.isNaN(date.getTime())) return { ok: false, text: "取得時刻を確認できません" };
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find(part => part.type === "hour")?.value);
  const minute = Number(parts.find(part => part.type === "minute")?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return { ok: false, text: "取得時刻を確認できません" };
  }
  const minutes = hour * 60 + minute;
  const withinRange = minutes >= 5 * 60 + 30 && minutes <= 9 * 60;
  const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return {
    ok: withinRange,
    text: withinRange
      ? `${time} JST（通常範囲 05:30〜09:00）`
      : `${time} JST（通常範囲 05:30〜09:00 から外れています）`,
  };
}

function articleValueReversals(data) {
  const byDate = new Map();
  (data.articleHistory || []).forEach(row => {
    const date = rowDate(row);
    if (!date) return;
    if (!byDate.has(date)) byDate.set(date, new Map());
    byDate.get(date).set(row.key, row);
  });
  const dates = [...byDate.keys()].sort();
  let count = 0;
  for (let index = 1; index < dates.length; index += 1) {
    const before = byDate.get(dates[index - 1]);
    byDate.get(dates[index]).forEach((row, key) => {
      const previous = before.get(key);
      if (previous && ["pv", "likes", "comments"].some(field => Number(row[field] || 0) < Number(previous[field] || 0))) {
        count += 1;
      }
    });
  }
  return count;
}

function renderHealth(data, latest) {
  const summaries = data.summaries || [];
  const latestMs = Date.parse(latest.collectedAt);
  const stale = !Number.isFinite(latestMs) || Date.now() - latestMs > 36 * 3600000;
  const duplicateDates = new Set(summaries.map(rowDate)).size !== summaries.length;
  const missing = missingDates(summaries);
  const timeStatus = collectionTimeStatus(latest.collectedAt);
  const reversals = articleValueReversals(data);
  const latestDate = rowDate(latest);
  const historyCount = (data.articleHistory || []).filter(row => rowDate(row) === latestDate).length;
  const articles = data.articles || [];
  const pendingCategories = articles.filter(article => categoryOf(article) === "要確認");
  const countMismatch = historyCount !== articles.length || Number(latest.articleCount) !== articles.length;
  const totalMismatch = [["pv", "totalPv"], ["likes", "totalLikes"], ["comments", "totalComments"]]
    .some(([field, total]) => articles.reduce((sum, row) => sum + Number(row[field] || 0), 0) !== Number(latest[total]));
  const missingText = missing.length
    ? `欠測: ${missing.slice(0, 3).join("、")}${missing.length > 3 ? ` ほか${missing.length - 3}日` : ""}`
    : "記録開始後の日付欠けなし";
  const checks = [
    ["最新性", stale ? "注意" : "正常", stale ? "最終取得から36時間以上経過" : "最終取得は36時間以内"],
    ["取得時刻", timeStatus.ok ? "正常" : "注意", timeStatus.text],
    ["記事別累計", reversals ? "注意" : "正常", reversals ? `${reversals}記事で前回値から逆行しています` : "同じ記事のPV・スキ・コメントに逆行なし"],
    ["記事件数", countMismatch ? "注意" : "正常", countMismatch ? "最新の一覧・履歴・集計で件数が一致しません" : `${articles.length}記事で一覧・履歴・集計が一致`],
    ["集計値", totalMismatch ? "注意" : "正常", totalMismatch ? "記事合計と最新集計が一致しません" : "記事合計と最新集計が一致"],
    ["日付重複", duplicateDates ? "注意" : "正常", duplicateDates ? "同じ日付の記録が重複" : "日付の重複なし"],
    ["日付欠測", missing.length ? "注意" : "正常", missingText],
    ["記事分類", pendingCategories.length ? "注意" : "正常", pendingCategories.length ? `確認待ち ${pendingCategories.length}記事：${pendingCategories.slice(0, 2).map(article => article.title).join("、")}${pendingCategories.length > 2 ? " ほか" : ""}` : "公開中の記事はすべて分類済み"],
  ];
  const warnings = checks.filter(row => row[1] === "注意").length;
  $("#healthBadge").textContent = warnings ? `${warnings}件 注意` : "異常なし";
  $("#healthBadge").classList.toggle("warn", Boolean(warnings));
  $("#healthChecks").innerHTML = checks.map(row =>
    `<div class="${row[1] === "正常" ? "ok" : "warn"}"><b>${esc(row[0])}</b><strong>${row[1]}</strong><small>${esc(row[2])}</small></div>`
  ).join("");
}
