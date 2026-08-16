const API = "https://sora-note-log.ashestribirth.chatgpt.site/api/data";
const fmt = new Intl.NumberFormat("ja-JP");
const $ = selector => document.querySelector(selector);
const esc = value => {
  const node = document.createElement("div");
  node.textContent = value ?? "";
  return node.innerHTML;
};
const signed = value => `${value >= 0 ? "+" : ""}${fmt.format(value)}`;
const days = (from, to) => Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1);
let ledgerSort = { key: "d1pv", dir: -1 };

function setTheme(dark, save = false) {
  document.body.classList.toggle("dark", dark);
  const button = $("#theme");
  if (!button) return;
  button.textContent = dark ? "☀" : "☾";
  button.setAttribute("aria-pressed", String(dark));
  button.setAttribute("aria-label", dark ? "ライトモードに切り替える" : "ダークモードに切り替える");
  if (save) {
    try { localStorage.setItem("note-pulse-theme", dark ? "dark" : "light"); } catch {}
  }
}

function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem("note-pulse-theme"); } catch {}
  setTheme(saved ? saved === "dark" : !!window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  $("#theme")?.addEventListener("click", () => setTheme(!document.body.classList.contains("dark"), true));
}

const REVIEWED_CATEGORY_OVERRIDES = {
  n3445e9974c2c: "エッセイ・日常",
};

function categoryOf(article) {
  const key = article.key || String(article.url || "").split("/").pop();
  if (REVIEWED_CATEGORY_OVERRIDES[key]) return REVIEWED_CATEGORY_OVERRIDES[key];
  return article.category && article.category !== "要確認" ? article.category : "";
}

function empty(title, text) {
  return `<div class="empty"><i>◌</i><div><b>${esc(title)}</b><p>${esc(text)}</p></div></div>`;
}

function stat(label, value, note, colorClass) {
  return `<article class="stat stat-${colorClass}"><span>${label}</span><strong>${fmt.format(value)}</strong><small>${note}</small><i></i></article>`;
}

function change(label, value, sub, ready, unit) {
  return `<article><span>${label}</span>${
    ready
      ? `<strong>${signed(value)} <small>${unit}</small></strong><p>${sub}</p>`
      : '<strong class="pending">記録中</strong><p>比較に必要な日数を蓄積中</p>'
  }</article>`;
}

function linkRow(article, index, value, label, cls = "row") {
  return `<a class="${cls}" href="${esc(article.url)}" target="_blank" rel="noopener noreferrer"><span class="rank">${String(index + 1).padStart(2, "0")}</span><span>${esc(article.title)}</span><span><b>${value}</b><small>${label}</small></span></a>`;
}

function latestDateOf(data) {
  const summaries = data.summaries || [];
  const history = data.articleHistory || [];
  return summaries.at(-1)?.date || summaries.at(-1)?.collectedDate || history.at(-1)?.date || "";
}

function filterCurrentArticles(data) {
  const history = data.articleHistory || [];
  const latestDate = latestDateOf(data);
  if (!latestDate || !Array.isArray(data.articles) || !history.length) return data;

  const currentKeys = new Set(
    history.filter(row => row.date === latestDate).map(row => row.key).filter(Boolean)
  );
  if (!currentKeys.size) return data;

  return {
    ...data,
    articles: data.articles.filter(article => {
      const key = article.key || String(article.url || "").split("/").pop();
      return currentKeys.has(key);
    }),
  };
}

function addApprovedFollowerBackfill(data) {
  const followers = [...(data.followers || [])];
  const has813 = followers.some(row => String(row.date || row.collectedDate || row.collectedAt || "").startsWith("2026-08-13"));
  const has814 = followers.some(row => String(row.date || row.collectedDate || row.collectedAt || "").startsWith("2026-08-14"));
  if (!has813 && has814) {
    followers.unshift({
      date: "2026-08-13",
      collectedAt: "2026-08-13T19:17:15+09:00",
      followingCount: null,
      followerCount: 198,
      special: true,
    });
  }
  return { ...data, followers };
}

function prepareData(raw) {
  return addApprovedFollowerBackfill(filterCurrentArticles(raw));
}

function buildArticleItems(data) {
  const history = data.articleHistory || [];
  const dates = [...new Set(history.map(row => row.date))].sort();
  const previousDate = dates.at(-2);
  const comparisonDate = dates[Math.max(0, dates.length - 8)];
  const byDate = new Map();

  history.forEach(row => {
    if (!byDate.has(row.date)) byDate.set(row.date, new Map());
    byDate.get(row.date).set(row.key, row);
  });

  const items = (data.articles || []).map(article => {
    const key = article.key || String(article.url || "").split("/").pop();
    const previous = previousDate ? byDate.get(previousDate)?.get(key) : null;
    const comparison = comparisonDate ? byDate.get(comparisonDate)?.get(key) : null;
    return {
      ...article,
      key,
      category: categoryOf(article),
      d1: {
        pv: article.pv - (previous?.pv ?? article.pv),
        likes: article.likes - (previous?.likes ?? article.likes),
        comments: article.comments - (previous?.comments ?? article.comments),
      },
      d7: {
        pv: article.pv - (comparison?.pv ?? article.pv),
        likes: article.likes - (comparison?.likes ?? article.likes),
        comments: article.comments - (comparison?.comments ?? article.comments),
      },
    };
  });

  return { items, dates };
}

function renderHeaderAndTotals(data, latest, previous, intervalLabel) {
  const dt = new Date(latest.collectedAt);
  $("#recordDate").textContent = `${String(dt.getMonth() + 1).padStart(2, "0")}.${String(dt.getDate()).padStart(2, "0")}`;
  $("#recordTime").textContent = `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")} JST`;
  $("#recordCount").textContent = `対象 ${latest.articleCount}記事`;
  $("#status").textContent = "● 実データ連携中";
  $("#dataState").textContent = "最新データを表示中";
  $("#lastFetched").textContent = `${latest.collectedAt.replace("T", " ").slice(0, 16)} JST`;

  const summaries = data.summaries || [];
  const week = summaries[Math.max(0, summaries.length - 8)] || latest;
  const month = summaries[Math.max(0, summaries.length - 31)] || latest;
  const followers = data.followers || [];
  const follow = followers.at(-1) || {};
  const previousFollow = followers.at(-2) || follow;
  const followerReady = followers.length >= 2 && Number.isFinite(Number(follow.followerCount)) && Number.isFinite(Number(previousFollow.followerCount));

  $("#changes").innerHTML =
    change(intervalLabel, latest.totalPv - previous.totalPv, `スキ ${signed(latest.totalLikes - previous.totalLikes)} ／ コメント ${signed(latest.totalComments - previous.totalComments)}`, summaries.length >= 2, "PV") +
    change("7日間", latest.totalPv - week.totalPv, `スキ ${signed(latest.totalLikes - week.totalLikes)} ／ コメント ${signed(latest.totalComments - week.totalComments)}`, summaries.length >= 8, "PV") +
    change("30日間", latest.totalPv - month.totalPv, `スキ ${signed(latest.totalLikes - month.totalLikes)} ／ コメント ${signed(latest.totalComments - month.totalComments)}`, summaries.length >= 31, "PV") +
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

function renderFairComparison(activeItems, latest) {
  const fair = activeItems
    .filter(article => article.publishedAt)
    .sort((a, b) => b.pv / days(b.publishedAt, latest.date) - a.pv / days(a.publishedAt, latest.date))
    .slice(0, 6);

  $("#fairList").innerHTML = fair.length
    ? fair.map((article, index) => linkRow(article, index, (article.pv / days(article.publishedAt, latest.date)).toFixed(1), "PV/日", "fair-row")).join("")
    : empty("公開日の取得準備中", "次回の自動取得から、1日当たりPVと公開後7日間を比較します。");
}

function renderCategories(items, dormantKeys) {
  const categories = new Map();
  items.filter(article => article.category).forEach(article => {
    const active = !dormantKeys.has(article.key);
    const entry = categories.get(article.category) || { name: article.category, count: 0, active: 0, pv: 0, likes: 0, d7: 0 };
    entry.count += 1;
    entry.pv += article.pv;
    entry.likes += article.likes;
    if (active) {
      entry.active += 1;
      entry.d7 += article.d7.pv;
    }
    categories.set(article.category, entry);
  });

  const order = ["音楽・曲", "エッセイ・日常", "note・ツール", "孫子・思考", "ゲーム・趣味", "その他"];
  const totalCount = items.filter(article => article.category).length;
  const rows = order
    .map(name => categories.get(name) || { name, count: 0, active: 0, pv: 0, likes: 0, d7: 0 });
  $("#categories").innerHTML = rows.map(row =>
    `<div><p><b>${esc(row.name)}</b><span>全${row.count}記事／動きあり ${row.active}</span></p>${categoryShareBar(row.count, totalCount, row.name)}<small>構成比 ${(row.count / Math.max(totalCount, 1) * 100).toFixed(1)}% ・ ${fmt.format(row.pv)} PV ・ スキ率 ${(row.likes / Math.max(row.pv, 1) * 100).toFixed(1)}% ・ 直近 ${signed(row.d7)} PV</small></div>`
  ).join("");
}

function categoryShareBar(count, total, name) {
  const share = count / Math.max(total, 1) * 100;
  return `<svg class="category-share" viewBox="0 0 100 5" preserveAspectRatio="none" role="img" aria-label="${esc(name)}は全${total}記事中${count}記事、構成比${share.toFixed(1)}%"><rect class="category-track" x="0" y="0" width="100" height="5"></rect><rect class="category-fill" x="0" y="0" width="${share}" height="5"><title>${esc(name)} ${count}記事／全${total}記事（${share.toFixed(1)}%）</title></rect></svg>`;
}

function renderHealth(data, latest) {
  const summaries = data.summaries || [];
  const latestMs = Date.parse(latest.collectedAt);
  const stale = !Number.isFinite(latestMs) || Date.now() - latestMs > 36 * 3600000;
  const duplicateDates = new Set(summaries.map(row => row.date)).size !== summaries.length;
  const decreasing = summaries.some((row, index) => index && (
    row.totalPv < summaries[index - 1].totalPv ||
    row.totalLikes < summaries[index - 1].totalLikes ||
    row.totalComments < summaries[index - 1].totalComments
  ));
  const countDrop = summaries.some((row, index) => index && row.articleCount < summaries[index - 1].articleCount);

  const checks = [
    ["最新性", stale ? "注意" : "正常", stale ? "最終取得から36時間以上経過" : "最終取得は36時間以内"],
    ["累計値", decreasing ? "注意" : "正常", decreasing ? "前回より小さい累計値があります" : "PV・スキ・コメントに逆行なし"],
    ["記事数", countDrop ? "注意" : "正常", countDrop ? "記録記事数が減った日があります" : "記事数の減少なし"],
    ["日付", duplicateDates ? "注意" : "正常", duplicateDates ? "同じ日付の記録が重複" : "日付の重複なし"],
  ];
  const warnings = checks.filter(row => row[1] === "注意").length;
  $("#healthBadge").textContent = warnings ? `${warnings}件 注意` : "異常なし";
  $("#healthBadge").classList.toggle("warn", !!warnings);
  $("#healthChecks").innerHTML = checks.map(row =>
    `<div class="${row[1] === "正常" ? "ok" : "warn"}"><b>${esc(row[0])}</b><strong>${row[1]}</strong><small>${esc(row[2])}</small></div>`
  ).join("");
}

function renderPeriodComparison(data) {
  const summaries = data.summaries || [];
  const period = n => {
    if (summaries.length < 2 * n + 1) return null;
    const a = summaries.at(-1);
    const b = summaries.at(-1 - n);
    const c = summaries.at(-1 - 2 * n);
    return {
      current: a.totalPv - b.totalPv,
      previous: b.totalPv - c.totalPv,
      likes: a.totalLikes - b.totalLikes,
      prevLikes: b.totalLikes - c.totalLikes,
    };
  };

  $("#periodCompare").innerHTML = [7, 30].map(n => {
    const result = period(n);
    if (!result) return empty(`${n}日比較は記録中`, `あと ${Math.max(0, 2 * n + 1 - summaries.length)} 日分で直前期間と比較できます。`);
    const diff = result.current - result.previous;
    const rate = result.previous ? diff / result.previous * 100 : null;
    return `<div class="period-row"><b>${n}日</b><span>直近 <strong>${signed(result.current)}</strong> PV</span><span>前期間 ${signed(result.previous)} PV</span><em class="${diff >= 0 ? "up" : "down"}">${signed(diff)} / ${rate == null ? "—" : `${signed(Math.round(rate))}%`}</em><small>スキ ${signed(result.likes)}（前期間 ${signed(result.prevLikes)}）</small></div>`;
  }).join("");
}

function renderDormant(dormant, historyDates) {
  const basisDays = Math.min(7, Math.max(1, historyDates.length - 1));
  $("#dormantCount").textContent = historyDates.length < 2 ? "判定待ち" : `${dormant.length}記事`;
  $("#dormantBasis").textContent = historyDates.length < 2
    ? "2日分の記録から判定を開始します。"
    : basisDays < 7
      ? `記録開始から${basisDays}日間、PV・スキ・コメントがすべて変わっていない記事です。7日分が貯まるまでは暫定判定です。`
      : "直近7日間、PV・スキ・コメントがすべて変わっていない記事です。";

  const pv = dormant.reduce((sum, article) => sum + article.pv, 0);
  const likes = dormant.reduce((sum, article) => sum + article.likes, 0);
  $("#dormantSummary").innerHTML = dormant.length
    ? `<div><span>対象</span><b>${dormant.length}記事</b></div><div><span>累計PV</span><b>${fmt.format(pv)}</b></div><div><span>累計スキ</span><b>${fmt.format(likes)}</b></div>`
    : empty(
        historyDates.length < 2 ? "判定待ち" : "該当なし",
        historyDates.length < 2 ? "次回記録後から動きの有無を判定します。" : "動きのない記事はありません。"
      );
}

function renderAgeMix(items, latest) {
  const groups = [
    { name: "公開7日以内", pv: 0 },
    { name: "公開8〜30日", pv: 0 },
    { name: "公開31日以上", pv: 0 },
    { name: "公開日不明", pv: 0 },
  ];
  items.forEach(article => {
    const age = article.publishedAt ? days(article.publishedAt, latest.date) : null;
    const index = age == null ? 3 : age <= 7 ? 0 : age <= 30 ? 1 : 2;
    groups[index].pv += Math.max(0, article.d1.pv);
  });
  const total = groups.reduce((sum, group) => sum + group.pv, 0);
  let cursor = 0;
  const segments = groups.map((group, index) => {
    const width = group.pv / Math.max(total, 1) * 100;
    const segment = `<rect class="mix-${index}" x="${cursor}" y="0" width="${width}" height="12"><title>${esc(group.name)} ${fmt.format(group.pv)}PV（${width.toFixed(1)}%）</title></rect>`;
    cursor += width;
    return segment;
  }).join("");
  $("#ageMix").innerHTML = total
    ? `<svg class="mixbar" viewBox="0 0 100 12" preserveAspectRatio="none" role="img" aria-label="前回取得からの増加PVを記事の公開後日数で分解">${segments}</svg>${groups.map((group, index) => `<p><i class="dot mix-${index}"></i><span>${group.name}</span><b>${fmt.format(group.pv)} PV</b><small>${(group.pv / total * 100).toFixed(1)}%</small></p>`).join("")}`
    : empty("前回差を記録中", "2回分の記事履歴から内訳を表示します。");
}

function renderArticleMap(items) {
  const mapItems = items.filter(article => article.pv > 0);
  const maxPv = Math.max(...mapItems.map(article => article.pv), 1);
  const maxRate = Math.max(...mapItems.map(article => (article.likes + article.comments) / article.pv), 0.01);
  const points = mapItems.map(article => {
    const rate = (article.likes + article.comments) / article.pv;
    const x = Math.sqrt(article.pv / maxPv) * 92 + 3;
    const y = 94 - rate / maxRate * 88;
    const label = `${article.title}｜${article.pv} PV｜反応率 ${(rate * 100).toFixed(1)}%`;
    return `<a href="${esc(article.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(label)}"><title>${esc(label)}</title><circle class="point" cx="${x}" cy="${y}" r="1.1"></circle></a>`;
  }).join("");
  $("#articleMap").innerHTML =
    '<div class="axis-y">反応率 高</div><div class="axis-x">PV 高 →</div>' +
    `<svg class="article-map-svg" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="記事ごとのPVと反応率の分布">${points}</svg>`;
}

function renderGrowthCurve(data, items, latest) {
  const history = data.articleHistory || [];
  const select = $("#curveSelect");
  select.innerHTML = [...items]
    .sort((a, b) => b.d1.pv - a.d1.pv)
    .map(article => `<option value="${esc(article.key)}">${esc(article.title)}</option>`)
    .join("");

  const draw = () => {
    const key = select.value;
    const rows = history.filter(row => row.key === key).sort((a, b) => a.date.localeCompare(b.date));
    const article = items.find(item => item.key === key);
    if (!rows.length && article) rows.push({ date: latest.date, pv: article.pv });
    const min = Math.min(...rows.map(row => row.pv));
    const max = Math.max(...rows.map(row => row.pv));
    const range = Math.max(1, max - min);
    const points = rows.map((row, index) => `${index / Math.max(1, rows.length - 1) * 100},${92 - (row.pv - min) / range * 80}`).join(" ");
    $("#curveChart").innerHTML = rows.length > 1
      ? `<svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${points}"/></svg>`
      : empty("推移は記録中", "記事別履歴が2日分になると線で表示します。");
    $("#curveNote").textContent = rows.length
      ? `${rows[0].date} → ${rows.at(-1).date} ／ ${fmt.format(rows[0].pv)} → ${fmt.format(rows.at(-1).pv)} PV`
      : "";
  };

  select.onchange = draw;
  draw();
}

function renderLedger(allItems, dormant, historyDates) {
  const dormantKeys = new Set(dormant.map(article => article.key));
  const categories = [...new Set(allItems.map(article => article.category).filter(Boolean))].sort();
  const finalStatus = historyDates.length >= 8;
  $("#categoryFilter").innerHTML = '<option value="">すべての分類</option>' + categories.map(category => `<option>${esc(category)}</option>`).join("");

  const draw = () => {
    const query = $("#ledgerSearch").value.toLowerCase();
    const category = $("#categoryFilter").value;
    const status = $("#statusFilter").value;
    const rows = allItems
      .map(article => {
        const dormantState = dormantKeys.has(article.key);
        return {
          ...article,
          d1pv: article.d1.pv,
          d7pv: article.d7.pv,
          rate: (article.likes + article.comments) / Math.max(1, article.pv),
          status: dormantState ? "dormant" : "active",
          statusLabel: `${finalStatus ? "" : "暫定・"}${dormantState ? "7日間動きなし" : "動きあり"}`,
        };
      })
      .filter(article => (!query || article.title.toLowerCase().includes(query)) && (!category || article.category === category) && (!status || article.status === status))
      .sort((a, b) => {
        const x = a[ledgerSort.key] ?? "";
        const y = b[ledgerSort.key] ?? "";
        return (typeof x === "number" ? x - y : String(x).localeCompare(String(y), "ja")) * ledgerSort.dir;
      });

    $("#ledgerBody").innerHTML = rows.map(article =>
      `<tr><td><a href="${esc(article.url)}" target="_blank" rel="noopener noreferrer">${esc(article.title)}</a></td><td>${article.category ? esc(article.category) : "—"}</td><td>${article.publishedAt ? article.publishedAt.slice(0, 10) : "—"}</td><td>${fmt.format(article.pv)}</td><td>${fmt.format(article.likes)}</td><td>${fmt.format(article.comments)}</td><td>${signed(article.d1pv)}</td><td>${signed(article.d7pv)}</td><td>${(article.rate * 100).toFixed(1)}%</td><td><span class="state ${article.status}">${article.statusLabel}</span></td></tr>`
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

function renderPhaseOne(data, activeItems, dormant, latest, historyDates, allItems) {
  renderHealth(data, latest);
  renderPeriodComparison(data);
  renderDormant(dormant, historyDates);
  renderAgeMix(activeItems, latest);
  renderArticleMap(activeItems);
  renderGrowthCurve(data, allItems, latest);
  renderLedger(allItems, dormant, historyDates);
}

function render(data) {
  const summaries = data.summaries || [];
  const latest = summaries.at(-1);
  if (!latest) throw new Error("No summary data");

  const previous = summaries.at(-2) || latest;
  const intervalHours = summaries.length >= 2
    ? (Date.parse(latest.collectedAt) - Date.parse(previous.collectedAt)) / 3600000
    : null;
  const intervalLabel = intervalHours == null ? "前回取得から" : `前回取得から（${intervalHours.toFixed(1)}時間）`;

  renderHeaderAndTotals(data, latest, previous, intervalLabel);

  const { items, dates } = buildArticleItems(data);
  const canJudgeDormant = dates.length >= 2;
  const dormant = canJudgeDormant
    ? items.filter(article => article.d7.pv === 0 && article.d7.likes === 0 && article.d7.comments === 0)
    : [];
  const dormantKeys = new Set(dormant.map(article => article.key));
  const activeItems = items.filter(article => !dormantKeys.has(article.key));

  renderFairComparison(items, latest);
  renderCategories(items, dormantKeys);
  renderPhaseOne(data, activeItems, dormant, latest, dates, items);

  window.notePulseData = data;
  window.NotePulseCharts?.render(data);
}

function showLoadError() {
  $("#status").textContent = "● データを取得できません";
  $("#trendNote").textContent = "しばらくしてから再読み込みしてください";
  $("#dataState").textContent = "取得エラー";
}

initTheme();

fetch(API, { credentials: "omit" })
  .then(response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then(raw => {
    if (!raw.ready) throw new Error("API not ready");
    render(prepareData(raw));
  })
  .catch(showLoadError);
