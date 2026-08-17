const API = "https://sora-note-log.ashestribirth.chatgpt.site/api/data?v=20260817a";
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

function renderFairComparison(activeItems, latest) {
  const fair = activeItems
    .filter(article => article.publishedAt)
    .sort((a, b) => b.pv / days(b.publishedAt, latest.date) - a.pv / days(a.publishedAt, latest.date))
    .slice(0, 6);

  $("#fairList").innerHTML = fair.length
    ? fair.map((article, index) => linkRow(article, index, (article.pv / days(article.publishedAt, latest.date)).toFixed(1), "PV/日", "fair-row")).join("")
    : empty("公開日の取得準備中", "次回の自動取得から、1日当たりPVと公開後7日間を比較します。");
}

function categoryShareBar(count, total, name) {
  const share = count / Math.max(total, 1) * 100;
  return `<svg class="category-share" viewBox="0 0 100 5" preserveAspectRatio="none" role="img" aria-label="${esc(name)}は全${total}記事中${count}記事、構成比${share.toFixed(1)}%"><rect class="category-track" x="0" y="0" width="100" height="5"></rect><rect class="category-fill" x="0" y="0" width="${share}" height="5"><title>${esc(name)} ${count}記事／全${total}記事（${share.toFixed(1)}%）</title></rect></svg>`;
}

function categoryMetrics(row, totalCount, activityReady = true) {
  const pv = Math.max(Number(row.pv) || 0, 0);
  const count = Math.max(Number(row.count) || 0, 0);
  const share = count / Math.max(totalCount, 1) * 100;
  const likeRate = Number(row.likes || 0) / Math.max(pv, 1) * 100;
  const commentRate = Number(row.comments || 0) / Math.max(pv, 1) * 100;
  const pvPerArticle = Number(row.d7 || 0) / Math.max(count, 1);
  const activity = activityReady ? pvPerArticle.toFixed(1) : "記録中";
  return `<dl class="category-metrics"><div><dt>構成比</dt><dd>${share.toFixed(1)}%</dd></div><div><dt>スキ率</dt><dd>${likeRate.toFixed(1)}%</dd></div><div><dt>総コメント率</dt><dd>${commentRate.toFixed(1)}%</dd></div><div><dt>記録PV／記事</dt><dd>${activity}</dd></div></dl>`;
}

function featureAggregate(items) {
  return items.reduce((sum, article) => {
    sum.count += 1;
    sum.pv += Number(article.pv || 0);
    sum.likes += Number(article.likes || 0);
    sum.comments += Number(article.comments || 0);
    if (article.d7?.pv != null) sum.periodPv += Number(article.d7.pv || 0);
    return sum;
  }, { count: 0, pv: 0, likes: 0, comments: 0, periodPv: 0 });
}

function featureMetricCard(label, items, periodReady) {
  const row = featureAggregate(items);
  const likeRate = row.likes / Math.max(row.pv, 1) * 100;
  const commentRate = row.comments / Math.max(row.pv, 1) * 100;
  const periodPv = periodReady ? (row.periodPv / Math.max(row.count, 1)).toFixed(1) : "記録中";
  return `<article><h4>${esc(label)}</h4><b>${row.count}記事</b><dl><div><dt>スキ率</dt><dd>${likeRate.toFixed(1)}%</dd></div><div><dt>総コメント率</dt><dd>${commentRate.toFixed(1)}%</dd></div><div><dt>記録PV／記事</dt><dd>${periodPv}</dd></div></dl></article>`;
}

function renderFeatureComparisons(items) {
  const measured = items.filter(article => article.features && Number.isFinite(Number(article.features.bodyLength)));
  if (!measured.length) {
    $("#featureComparisons").innerHTML = empty("記事特徴を準備中", "次回のデータ連携後に表示します。");
    return;
  }
  const lengths = measured.map(article => Number(article.features.bodyLength)).sort((a, b) => a - b);
  const median = lengths[Math.floor(lengths.length / 2)];
  const periodReady = !["gap", "waiting"].includes(periodState.mode);
  const groups = [
    { name: "動画", yes: "動画あり", no: "動画なし", test: article => article.features.hasVideo === true },
    { name: "問いかけ", yes: "問いかけあり", no: "問いかけなし", test: article => article.features.hasReaderQuestion === true },
    { name: "本文量", yes: `本文 ${fmt.format(median)}字以上`, no: `本文 ${fmt.format(median)}字未満`, test: article => Number(article.features.bodyLength) >= median },
  ];
  $("#featureComparisons").innerHTML = groups.map(group => {
    const yes = measured.filter(group.test);
    const no = measured.filter(article => !group.test(article));
    return `<section class="feature-pair"><h3>${esc(group.name)}</h3><div>${featureMetricCard(group.yes, yes, periodReady)}${featureMetricCard(group.no, no, periodReady)}</div></section>`;
  }).join("");
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
  renderFeatureComparisons(items);
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
