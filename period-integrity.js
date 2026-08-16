const DAY_MS = 86400000;
const periodState = { mode: "waiting", baselineDate: null, historyDates: [] };

function rowDate(row) {
  return String(row?.date || row?.collectedDate || row?.collectedAt || "").slice(0, 10);
}

function shiftDate(date, delta) {
  const [year, month, day] = String(date).split("-").map(Number);
  if (!year || !month || !day) return "";
  return new Date(Date.UTC(year, month - 1, day + delta)).toISOString().slice(0, 10);
}

function continuousWindow(rows, daysBack) {
  const byDate = new Map();
  (rows || []).forEach(row => {
    const date = rowDate(row);
    if (date) byDate.set(date, row);
  });
  const latestDate = [...byDate.keys()].sort().at(-1) || "";
  if (!latestDate) return null;
  for (let offset = daysBack; offset >= 0; offset -= 1) {
    if (!byDate.has(shiftDate(latestDate, -offset))) return null;
  }
  return {
    latest: byDate.get(latestDate),
    baseline: byDate.get(shiftDate(latestDate, -daysBack)),
  };
}

function articleHistoryByDate(data, date) {
  return (data.articleHistory || []).filter(row => rowDate(row) === date);
}

function deltaBetween(data, startDate, endDate, endRows = null) {
  const start = new Map(articleHistoryByDate(data, startDate).map(row => [row.key, row]));
  return (endRows || articleHistoryByDate(data, endDate)).reduce((sum, row) => {
    const before = start.get(row.key);
    sum.pv += Number(row.pv || 0) - Number(before?.pv || 0);
    sum.likes += Number(row.likes || 0) - Number(before?.likes || 0);
    sum.comments += Number(row.comments || 0) - Number(before?.comments || 0);
    return sum;
  }, { pv: 0, likes: 0, comments: 0 });
}

function articlePeriodContext(data) {
  const dates = [...new Set((data.articleHistory || []).map(rowDate).filter(Boolean))].sort();
  const latest = dates.at(-1) || "";
  if (continuousWindow(dates.map(date => ({ date })), 7)) {
    return { mode: "exact", baselineDate: shiftDate(latest, -7), dates };
  }
  if (!dates.length) return { mode: "waiting", baselineDate: null, dates };
  const span = Math.round((Date.parse(`${latest}T00:00:00Z`) - Date.parse(`${dates[0]}T00:00:00Z`)) / DAY_MS);
  if (span < 7) {
    return {
      mode: dates.length >= 2 ? "provisional" : "waiting",
      baselineDate: dates.length >= 2 ? dates[0] : null,
      dates,
    };
  }
  return { mode: "gap", baselineDate: null, dates };
}

function buildArticleItems(data) {
  const history = data.articleHistory || [];
  const context = articlePeriodContext(data);
  periodState.mode = context.mode;
  periodState.baselineDate = context.baselineDate;
  periodState.historyDates = context.dates;

  const previousDate = context.dates.at(-2);
  const byDate = new Map();
  history.forEach(row => {
    const date = rowDate(row);
    if (!date) return;
    if (!byDate.has(date)) byDate.set(date, new Map());
    byDate.get(date).set(row.key, row);
  });

  const items = (data.articles || []).map(article => {
    const key = article.key || String(article.url || "").split("/").pop();
    const previous = previousDate ? byDate.get(previousDate)?.get(key) : null;
    const baseline = context.baselineDate ? byDate.get(context.baselineDate)?.get(key) : null;
    const ready = ["exact", "provisional"].includes(context.mode);
    return {
      ...article,
      key,
      category: categoryOf(article),
      d1: {
        pv: article.pv - Number(previous?.pv || 0),
        likes: article.likes - Number(previous?.likes || 0),
        comments: article.comments - Number(previous?.comments || 0),
      },
      d7: ready ? {
        pv: article.pv - Number(baseline?.pv || 0),
        likes: article.likes - Number(baseline?.likes || 0),
        comments: article.comments - Number(baseline?.comments || 0),
      } : { pv: null, likes: null, comments: null },
    };
  });
  return { items, dates: context.dates };
}

function renderHeaderAndTotals(data, latest, previous, intervalLabel) {
  const date = new Date(latest.collectedAt);
  $("#recordDate").textContent = `${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
  $("#recordTime").textContent = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")} JST`;
  $("#recordCount").textContent = `対象 ${latest.articleCount}記事`;
  $("#status").textContent = "● 実データ連携中";
  $("#dataState").textContent = "最新データを表示中";
  $("#lastFetched").textContent = `${latest.collectedAt.replace("T", " ").slice(0, 16)} JST`;

  const summaries = data.summaries || [];
  const week = continuousWindow(summaries, 7);
  const month = continuousWindow(summaries, 30);
  const followers = data.followers || [];
  const follow = followers.at(-1) || {};
  const previousFollow = followers.at(-2) || follow;
  const followerReady = followers.length >= 2 && Number.isFinite(Number(follow.followerCount)) && Number.isFinite(Number(previousFollow.followerCount));
  const previousDelta = summaries.length >= 2 ? deltaBetween(data, rowDate(previous), rowDate(latest), data.articles || []) : null;
  const weekDelta = week ? deltaBetween(data, rowDate(week.baseline), rowDate(week.latest), data.articles || []) : null;
  const monthDelta = month ? deltaBetween(data, rowDate(month.baseline), rowDate(month.latest), data.articles || []) : null;

  $("#changes").innerHTML =
    change(intervalLabel, previousDelta?.pv || 0, previousDelta ? `スキ ${signed(previousDelta.likes)} ／ コメント ${signed(previousDelta.comments)}` : "", Boolean(previousDelta), "PV") +
    change("7日間", weekDelta?.pv || 0, weekDelta ? `スキ ${signed(weekDelta.likes)} ／ コメント ${signed(weekDelta.comments)}` : "", Boolean(weekDelta), "PV") +
    change("30日間", monthDelta?.pv || 0, monthDelta ? `スキ ${signed(monthDelta.likes)} ／ コメント ${signed(monthDelta.comments)}` : "", Boolean(monthDelta), "PV") +
    change("フォロワー前回比", followerReady ? Number(follow.followerCount) - Number(previousFollow.followerCount) : 0, `現在 ${fmt.format(Number(follow.followerCount) || 0)}人`, followerReady, "人");

  $("#stats").innerHTML =
    stat("TOTAL PV", latest.totalPv, "累計閲覧数", "pv") +
    stat("LIKES", latest.totalLikes, `平均 ${(latest.totalLikes / latest.articleCount).toFixed(1)} / 記事`, "likes") +
    stat("COMMENTS", latest.totalComments, `平均 ${(latest.totalComments / latest.articleCount).toFixed(1)} / 記事`, "comments") +
    stat("ARTICLES", latest.articleCount, "記録対象", "articles");

  $("#following").textContent = follow.followingCount == null ? "—" : fmt.format(follow.followingCount);
  $("#followers").textContent = follow.followerCount == null ? "—" : fmt.format(follow.followerCount);
  $("#followDiff").textContent = followerReady ? signed(Number(follow.followerCount) - Number(previousFollow.followerCount)) : "記録中";
  $("#days").textContent = `記録 ${summaries.length}日目`;
}

function renderPeriodComparison(data) {
  const summaries = data.summaries || [];
  $("#periodCompare").innerHTML = [7, 30].map(length => {
    const window = continuousWindow(summaries, 2 * length);
    if (!window) return empty(`${length}日比較は記録中`, `連続した${2 * length + 1}日分の実測記録が揃うと直前期間と比較できます。`);
    const end = rowDate(window.latest);
    const middle = shiftDate(end, -length);
    const current = deltaBetween(data, middle, end);
    const previous = deltaBetween(data, rowDate(window.baseline), middle);
    const difference = current.pv - previous.pv;
    const rate = previous.pv ? difference / previous.pv * 100 : null;
    return `<div class="period-row"><b>${length}日</b><span>直近 <strong>${signed(current.pv)}</strong> PV</span><span>前期間 ${signed(previous.pv)} PV</span><em class="${difference >= 0 ? "up" : "down"}">${signed(difference)} / ${rate == null ? "—" : `${signed(Math.round(rate))}%`}</em><small>スキ ${signed(current.likes)}（前期間 ${signed(previous.likes)}）</small></div>`;
  }).join("");
}

function renderDormant(dormant) {
  const mode = periodState.mode;
  if (mode === "waiting") {
    $("#dormantCount").textContent = "判定待ち";
    $("#dormantBasis").textContent = "2日分の記録から判定を開始します。";
  } else if (mode === "provisional") {
    const latest = periodState.historyDates.at(-1);
    const first = periodState.historyDates[0];
    const span = Math.max(1, Math.round((Date.parse(`${latest}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / DAY_MS));
    $("#dormantCount").textContent = `${dormant.length}記事`;
    $("#dormantBasis").textContent = `記録開始から${span}日間、PV・スキ・コメントがすべて変わっていない記事です。7日分が貯まるまでは暫定判定です。`;
  } else if (mode === "gap") {
    $("#dormantCount").textContent = "判定待ち";
    $("#dormantBasis").textContent = "直近7日間の記録に欠けがあるため、7日判定は記録中です。";
    dormant = [];
  } else {
    $("#dormantCount").textContent = `${dormant.length}記事`;
    $("#dormantBasis").textContent = "直近7日間、PV・スキ・コメントがすべて変わっていない記事です。";
  }
  const pv = dormant.reduce((sum, article) => sum + article.pv, 0);
  const likes = dormant.reduce((sum, article) => sum + article.likes, 0);
  const waiting = ["waiting", "gap"].includes(mode);
  $("#dormantSummary").innerHTML = dormant.length
    ? `<div><span>対象</span><b>${dormant.length}記事</b></div><div><span>累計PV</span><b>${fmt.format(pv)}</b></div><div><span>累計スキ</span><b>${fmt.format(likes)}</b></div>`
    : empty(waiting ? "判定待ち" : "該当なし", mode === "gap" ? "欠けた日付があるため推測せず判定を保留しています。" : mode === "waiting" ? "次回記録後から動きの有無を判定します。" : "動きのない記事はありません。");
}

function renderLedger(allItems, dormant) {
  const dormantKeys = new Set(dormant.map(article => article.key));
  const categories = [...new Set(allItems.map(article => article.category).filter(Boolean))].sort();
  const mode = periodState.mode;
  $("#categoryFilter").innerHTML = '<option value="">すべての分類</option>' + categories.map(category => `<option>${esc(category)}</option>`).join("");
  const draw = () => {
    const query = $("#ledgerSearch").value.toLowerCase();
    const category = $("#categoryFilter").value;
    const status = $("#statusFilter").value;
    const rows = allItems.map(article => {
      const isDormant = dormantKeys.has(article.key);
      const statusValue = ["gap", "waiting"].includes(mode) ? "pending" : isDormant ? "dormant" : "active";
      const statusLabel = mode === "exact" ? (isDormant ? "7日間動きなし" : "動きあり") : mode === "provisional" ? `暫定・${isDormant ? "動きなし" : "動きあり"}` : "記録中";
      return { ...article, d1pv: article.d1.pv, d7pv: article.d7.pv, rate: (article.likes + article.comments) / Math.max(1, article.pv), status: statusValue, statusLabel };
    }).filter(article =>
      (!query || article.title.toLowerCase().includes(query)) &&
      (!category || article.category === category) &&
      (!status || article.status === status)
    ).sort((a, b) => {
      const x = a[ledgerSort.key] ?? "";
      const y = b[ledgerSort.key] ?? "";
      const result = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "ja");
      return result * ledgerSort.dir;
    });
    $("#ledgerBody").innerHTML = rows.map(article =>
      `<tr><td><a href="${esc(article.url)}" target="_blank" rel="noopener noreferrer">${esc(article.title)}</a></td><td>${article.category ? esc(article.category) : "—"}</td><td>${article.publishedAt ? article.publishedAt.slice(0, 10) : "—"}</td><td>${fmt.format(article.pv)}</td><td>${fmt.format(article.likes)}</td><td>${fmt.format(article.comments)}</td><td>${signed(article.d1pv)}</td><td>${article.d7pv == null ? "記録中" : signed(article.d7pv)}</td><td>${(article.rate * 100).toFixed(1)}%</td><td><span class="state ${article.status}">${article.statusLabel}</span></td></tr>`
    ).join("");
  };
  $("#ledgerSearch").oninput = draw;
  $("#categoryFilter").onchange = draw;
  $("#statusFilter").onchange = draw;
  document.querySelectorAll("[data-sort]").forEach(header => {
    header.onclick = () => {
      const key = header.dataset.sort;
      if (ledgerSort.key === key) ledgerSort.dir *= -1;
      else ledgerSort = { key, dir: ["title", "category", "publishedAt"].includes(key) ? 1 : -1 };
      draw();
    };
  });
  draw();
}

function renderCategories(items, dormantKeys) {
  const canJudge = !["gap", "waiting"].includes(periodState.mode);
  const categories = new Map();
  items.filter(article => article.category).forEach(article => {
    const active = !dormantKeys.has(article.key);
    const entry = categories.get(article.category) || { name: article.category, count: 0, active: 0, pv: 0, likes: 0, comments: 0, d7: 0 };
    entry.count += 1;
    entry.pv += article.pv;
    entry.likes += article.likes;
    entry.comments += article.comments;
    if (canJudge && active) {
      entry.active += 1;
      entry.d7 += article.d7.pv;
    }
    categories.set(article.category, entry);
  });
  const order = ["音楽・曲", "エッセイ・日常", "note・ツール", "孫子・思考", "ゲーム・趣味", "その他"];
  const total = items.filter(article => article.category).length;
  const rows = order.map(name => categories.get(name) || { name, count: 0, active: 0, pv: 0, likes: 0, comments: 0, d7: 0 });
  $("#categories").innerHTML = rows.map(row =>
    `<div><p><b>${esc(row.name)}</b><span>全${row.count}記事／動きあり ${canJudge ? row.active : "判定中"}</span></p>${categoryShareBar(row.count, total, row.name)}${categoryMetrics(row, total, canJudge)}</div>`
  ).join("");
}
