const API = "https://sora-note-log.ashestribirth.chatgpt.site/api/data?v=20260817a";
const fmt = new Intl.NumberFormat("ja-JP");
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
})[char]);
const signed = value => `${value >= 0 ? "+" : ""}${fmt.format(value)}`;
const days = (from, to) => Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1);
let ledgerSort = { key: "pvDelta", dir: -1 };

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
  nc0ba447096ad: "孫子・思考",
  n715119ad26e9: "ゲーム・趣味",
  nd997cebc4486: "エッセイ・日常",
};

function categoryOf(article) {
  const key = article.key || String(article.url || "").split("/").pop();
  if (REVIEWED_CATEGORY_OVERRIDES[key]) return REVIEWED_CATEGORY_OVERRIDES[key];
  return article.category || "要確認";
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

function categoryShareBar(count, total, name) {
  const share = count / Math.max(total, 1) * 100;
  return `<svg class="category-share" viewBox="0 0 100 5" preserveAspectRatio="none" role="img" aria-label="${esc(name)}は全${total}記事中${count}記事、構成比${share.toFixed(1)}%"><rect class="category-track" x="0" y="0" width="100" height="5"></rect><rect class="category-fill" x="0" y="0" width="${share}" height="5"><title>${esc(name)} ${count}記事／全${total}記事（${share.toFixed(1)}%）</title></rect></svg>`;
}

function categoryMetrics(row, totalCount) {
  const count = Math.max(Number(row.count) || 0, 0);
  const share = count / Math.max(totalCount, 1) * 100;
  const viewRate = row.impressions > 0 ? row.pageviews / row.impressions * 100 : null;
  const likeRate = row.pageviews > 0 ? row.likes / row.pageviews * 100 : null;
  const rate = value => value == null ? "—" : `${value.toFixed(1)}%`;
  return `<dl class="category-metrics"><div><dt>構成比</dt><dd>${share.toFixed(1)}%</dd></div><div><dt>表示</dt><dd>${row.observed ? fmt.format(row.impressions) : "—"}</dd></div><div><dt>閲覧率</dt><dd>${rate(viewRate)}</dd></div><div><dt>スキ率</dt><dd>${rate(likeRate)}</dd></div></dl>`;
}

function median(values) {
  return window.NotePulseCampaignComparison?.median(values) ?? null;
}

function signedPoint(value) {
  return value == null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}pt`;
}

function followerChange(rows, endDate, daysBack) {
  const byDate = new Map((rows || []).map(row => [String(row.date || row.collectedDate || "").slice(0, 10), row]));
  const startDate = new Date(`${endDate}T00:00:00Z`);
  startDate.setUTCDate(startDate.getUTCDate() - daysBack);
  const start = byDate.get(startDate.toISOString().slice(0, 10));
  const end = byDate.get(endDate);
  if (!start || !end || start.followerCount == null || end.followerCount == null) return null;
  return Number(end.followerCount) - Number(start.followerCount);
}

function titleLengthBand(title) {
  const length = [...String(title || "")].length;
  if (length <= 24) return "24字以下";
  if (length <= 44) return "25〜44字";
  return "45字以上";
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
    const segment = `<rect class="mix-${index}" x="${cursor}" y="0" width="${width}" height="12"><title>${esc(group.name)} ${fmt.format(group.pv)}従来ビュー（${width.toFixed(1)}%）</title></rect>`;
    cursor += width;
    return segment;
  }).join("");
  $("#ageMix").innerHTML = total
    ? `<svg class="mixbar" viewBox="0 0 100 12" preserveAspectRatio="none" role="img" aria-label="前回取得からの従来ビュー増加を記事の公開後日数で分解">${segments}</svg>${groups.map((group, index) => `<p><i class="dot mix-${index}"></i><span>${group.name}</span><b>${fmt.format(group.pv)} 従来ビュー</b><small>${(group.pv / total * 100).toFixed(1)}%</small></p>`).join("")}`
    : empty("前回差を記録中", "2回分の記事履歴から内訳を表示します。");
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
    const width = 640;
    const height = 230;
    const pad = { left: 56, right: 18, top: 18, bottom: 36 };
    const plotWidth = width - pad.left - pad.right;
    const plotHeight = height - pad.top - pad.bottom;
    const xAt = index => pad.left + index / Math.max(1, rows.length - 1) * plotWidth;
    const yAt = pv => pad.top + (max - pv) / range * plotHeight;
    const points = rows.map((row, index) => `${xAt(index)},${yAt(row.pv)}`).join(" ");
    const yTicks = [max, Math.round((max + min) / 2), min];
    const yAxis = yTicks.map(value => {
      const y = yAt(value);
      return `<line class="curve-grid" x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}"></line><text class="curve-axis-label" x="${pad.left - 9}" y="${y + 4}" text-anchor="end">${fmt.format(value)}</text>`;
    }).join("");
    const dateStep = Math.max(1, Math.ceil(rows.length / 5));
    const dateIndexes = rows.map((_, index) => index).filter(index => index === 0 || index === rows.length - 1 || index % dateStep === 0);
    const xAxis = [...new Set(dateIndexes)].map(index => `<text class="curve-axis-label" x="${xAt(index)}" y="${height - 10}" text-anchor="middle">${esc(rows[index].date.slice(5).replace("-", "/"))}</text>`).join("");
    const dots = rows.map((row, index) => `<circle class="curve-dot" cx="${xAt(index)}" cy="${yAt(row.pv)}" r="3"><title>${esc(row.date)}: ${fmt.format(row.pv)} 従来ビュー</title></circle>`).join("");
    $("#curveChart").innerHTML = rows.length > 1
      ? `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="選択した記事の累計従来ビュー推移">${yAxis}<polyline points="${points}"/>${dots}${xAxis}</svg>`
      : empty("推移は記録中", "記事別履歴が2日分になると線で表示します。");
    $("#curveNote").textContent = rows.length
      ? `${rows[0].date} → ${rows.at(-1).date} ／ ${fmt.format(rows[0].pv)} → ${fmt.format(rows.at(-1).pv)} 従来ビュー`
      : "";
  };

  select.onchange = draw;
  draw();
}

function renderPhaseOne(data, activeItems, dormant, latest, historyDates, allItems) {
  renderHealth(data, latest);
  renderAudience(data, allItems, latest);
  renderReadingStages(data, allItems);
  renderBenchmark(allItems, latest);
  renderFactors(allItems, latest);
  renderDecisionLoop(allItems, latest);
  renderReadableLedger(allItems, latest.date);
}

function renderCampaigns(data, articleItems) {
  const campaignData = data.campaignData;
  if (!campaignData) {
    $("#openCampaignList").innerHTML = empty("企画データを準備中", "次回の自動更新後に表示します。");
    return;
  }
  const campaigns = campaignData.campaigns || [];
  const open = campaigns.filter(item => item.status === "open").sort((a, b) => String(a.endAt).localeCompare(String(b.endAt)));
  const dateLabel = value => value ? value.replaceAll("-", ".") : "期限未確認";
  const remaining = value => {
    if (!value) return "期限未確認";
    const count = Math.ceil((Date.parse(`${value}T23:59:59+09:00`) - Date.now()) / 86400000);
    return count >= 0 ? `あと${count}日` : "終了";
  };
  const campaignCard = item => `<a class="campaign-card" href="${esc(item.launchUrl)}" target="_blank" rel="noopener noreferrer"><span>${esc(item.type === "prompt" ? "お題" : "コンテスト")}</span><strong>${esc(item.hashtag || item.title)}</strong><small>${esc(item.title)}</small><b>${dateLabel(item.endAt)} <em>${remaining(item.endAt)}</em></b></a>`;
  $("#campaignCheckedAt").textContent = `最終照合 ${new Date(campaignData.checkedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
  $("#openCampaignList").innerHTML = open.length ? open.map(campaignCard).join("") : empty("募集中の企画はありません", "次回の自動更新で再確認します。");
  $("#campaignCoverage").textContent = "書きたい題材に合うものがあれば募集ページで条件を確認してください。参加によって閲覧やフォローが増えることを保証する一覧ではありません。";
}

function renderTrending(data) {
  const trending = data.campaignData?.trending;
  const status = data.campaignData?.trendingStatus;
  if (!trending) {
    const failed = status && !status.ok;
    $("#trendingTopicList").innerHTML = empty(failed ? "急上昇の更新に失敗" : "急上昇データを準備中", failed ? "前回の正常データがまだないため、次回の自動更新で再試行します。" : "次回の正常な観測後に表示します。");
    $("#trendingCoverage").textContent = failed ? "取得失敗を記録しました。企画・記事実績の更新には影響しません。" : "取得結果と照合結果の日付がそろった場合だけ表示します。";
    return;
  }
  const topics = trending.topics || [];
  const campaignMatches = topics.filter(item => Number(item.officialCampaignCount) > 0).length;
  const ownMatches = topics.filter(item => Number(item.ownArticleCount) > 0).length;
  const dateLabel = value => value ? value.slice(5).replace("-", "/") : "—";
  const observationState = item => {
    const consecutive = Number(item.consecutiveDays) || 0;
    const appearances = Number(item.appearances7d) || 0;
    if (String(item.firstSeenDate || "") === String(trending.observationDate || "")) {
      return { key: "new", label: "新出" };
    }
    if (consecutive >= 2) return { key: "continuing", label: `連続${fmt.format(consecutive)}日` };
    if (appearances >= 2) return { key: "returning", label: "再浮上" };
    return { key: "observed", label: "観測" };
  };
  const topicCard = item => {
    const state = observationState(item);
    const rankChange = Number.isFinite(Number(item.rankChange)) && item.rankChange !== null
      ? Number(item.rankChange)
      : null;
    const badges = [
      `<b class="topic-state ${state.key}">${state.label}</b>`,
      rankChange == null ? "" : `<b class="rank-change ${rankChange > 0 ? "up" : rankChange < 0 ? "down" : "flat"}">順位 ${rankChange > 0 ? "+" : ""}${fmt.format(rankChange)}</b>`,
      Number(item.officialCampaignCount) > 0 ? `<b class="official">公式企画 ${fmt.format(item.officialCampaignCount)}件</b>` : "",
      Number(item.ownArticleCount) > 0 ? `<b class="own">自記事 ${fmt.format(item.ownArticleCount)}件</b>` : "",
    ].filter(Boolean).join("");
    const articles = (item.ownArticles || []).map(article => `<a href="${esc(article.url)}" target="_blank" rel="noopener noreferrer">${esc(article.title)}</a>`).join("");
    return `<article class="trending-topic-card"><span>${String(item.rank).padStart(2, "0")}</span><div><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.topic)}</a><small>初回 ${dateLabel(item.firstSeenDate)} ／ 7日 ${fmt.format(item.appearances7d)}回 ／ 14日 ${fmt.format(item.appearances14d || item.appearances7d)}回${item.averageRank7d ? ` ／ 7日平均 ${Number(item.averageRank7d).toFixed(1)}位` : ""}</small><div class="trending-badges">${badges}</div>${articles ? `<div class="trending-own-articles">${articles}</div>` : ""}</div></article>`;
  };
  $("#trendingTopicCount").textContent = fmt.format(topics.length);
  $("#trendingCampaignMatchCount").textContent = fmt.format(campaignMatches);
  $("#trendingOwnMatchCount").textContent = fmt.format(ownMatches);
  const displayTime = value => new Date(value).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  $("#trendingCheckedAt").textContent = status && !status.ok ? `更新失敗 ${displayTime(status.checkedAt)}` : `最終観測 ${displayTime(trending.checkedAt)}`;
  $("#trendingTopicList").innerHTML = topics.length ? topics.map(topicCard).join("") : empty("観測語句はありません", "次回の自動更新で再確認します。");
  if (status && !status.ok) {
    $("#trendingCoverage").textContent = `今回の取得または照合に失敗したため、${displayTime(trending.checkedAt)}の正常データを保持しています。次回の自動更新で再試行します。`;
  } else {
    $("#trendingCoverage").textContent = trending.unavailableArticleCount
      ? `公開中の記事のうち${fmt.format(trending.unavailableArticleCount)}件はハッシュタグを確認できていません。`
      : `公開中の記事${fmt.format(trending.currentArticleCount || 0)}件を照合済みです。`;
  }
}

function renderTrendAlignment(data) {
  const alignment = data.campaignData?.trendAlignment;
  if (!alignment || !alignment.ready) {
    const articleDays = Number(alignment?.articleHistoryDays || 0);
    const matchDays = Number(alignment?.externalMatchHistoryDays || 0);
    const required = Number(alignment?.requiredDays || 15);
    $("#alignmentCheckedAt").textContent = "記録中";
    $("#alignmentContent").innerHTML = empty(
      "14日比較の履歴を記録中",
      `記事履歴 ${Math.min(articleDays, required)}/${required}日 ／ 外部テーマ照合 ${Math.min(matchDays, required)}/${required}日`
    );
    return;
  }
  $("#alignmentCheckedAt").textContent = `${alignment.periodStart.replaceAll("-", ".")} → ${alignment.periodEnd.replaceAll("-", ".")}`;
  const categories = alignment.categories || [];
  $("#alignmentContent").innerHTML = `<div class="alignment-summary"><div><span>比較対象</span><strong>${fmt.format(alignment.comparisonArticleCount || 0)}</strong><small>記事</small></div><div><span>期間中の新記事</span><strong>${fmt.format(alignment.excludedNewArticleCount || 0)}</strong><small>同条件比較から除外</small></div></div><div class="alignment-list">${categories.map(item => `<article><h3>${esc(item.category)}</h3><dl><div><dt>外部テーマ一致</dt><dd>${fmt.format(item.matchedArticleCount)}記事 ／ ${signed(item.matchedPvChange14d)} 従来ビュー</dd></div><div><dt>一致を観測せず</dt><dd>${fmt.format(item.noMatchArticleCount)}記事 ／ ${signed(item.noMatchPvChange14d)} 従来ビュー</dd></div></dl></article>`).join("")}</div><p class="campaign-observation-note">${esc(alignment.interpretation)}</p>`;
}


function renderFunnel(data) {
  const funnel = data.funnel;
  const panel = $("#funnelPanel");
  if (!panel || !funnel?.articles?.length) return;
  const rows = funnel.articles;
  const totals = rows.reduce((sum, item) => {
    sum.impressions += Number(item.impressions || 0);
    sum.pageviews += Number(item.pageviews || 0);
    sum.likes += Number(item.likes || 0);
    return sum;
  }, { impressions: 0, pageviews: 0, likes: 0 });
  const rate = (top, bottom) => bottom > 0 ? `${(top / bottom * 100).toFixed(1)}%` : "—";
  $("#funnelDate").textContent = `${String(funnel.date || "").replaceAll("-", ".")} の実績`;
  $("#funnelSummary").innerHTML = `
    <div><span>インプレッション</span><strong>${fmt.format(totals.impressions)}</strong><small>note上で表示された回数</small></div>
    <div><span>ページビュー</span><strong>${fmt.format(totals.pageviews)}</strong><small>記事を開いた回数</small></div>
    <div><span>閲覧率</span><strong>${rate(totals.pageviews, totals.impressions)}</strong><small>PV ÷ インプレッション</small></div>
    <div><span>スキ率</span><strong>${rate(totals.likes, totals.pageviews)}</strong><small>スキ ÷ PV</small></div>`;
  $("#funnelCoverage").textContent = `公式応答に含まれた${fmt.format(rows.length)}記事を集計。記事別の内訳は下の判断表へ統合しています。0と未取得は混同しません。`;
  const categoryPeriod = $("#categoryPeriod");
  if (categoryPeriod) categoryPeriod.textContent = `${String(funnel.date || "").replaceAll("-", ".")} の実績`;
  panel.hidden = false;
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

  renderCampaigns(data, items);
  renderPhaseOne(data, activeItems, dormant, latest, dates, items);

  window.notePulseData = data;
}

function showLoadError() {
  $("#status").textContent = "● データを取得できません";
  const trendNote = $("#trendNote");
  if (trendNote) trendNote.textContent = "しばらくしてから再読み込みしてください";
  $("#healthBadge").textContent = "取得エラー";
  $("#healthChecks").innerHTML = empty("データを表示できません", "通信または画面処理でエラーが発生しました。再読み込みしてください。");
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

// Reader-facing summaries use observed increments, not inferred causes.
function readableMedian(values) {
  const valid = values.filter(v => v != null && Number.isFinite(v));
  return valid.length ? median(valid) : null;
}
function countText(value, unit = "回") {
  return value == null ? "記録不足" : `${fmt.format(Math.round(value * 10) / 10)}${unit}`;
}
function periodText(date) { return `${shiftDate(date, -7)} → ${date}の取得時点`; }
function usableArticles(items) { return items.filter(x => x.d7?.pv != null && x.d7.pv >= 0 && x.d7.likes >= 0 && x.d7.comments >= 0); }
function articleLinks(items) {
  return items.slice(0, 3).map(x => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title)}</a>：ビュー ${countText(x.d7.pv)}増／スキ ${countText(x.d7.likes, "件")}増</li>`).join("");
}
function renderBenchmark(items, latest) {
  const rows = usableArticles(items), moving = rows.filter(x => x.d7.pv > 0 || x.d7.likes > 0 || x.d7.comments > 0);
  const top = [...rows].filter(x => x.d7.pv > 0).sort((a,b) => b.d7.pv-a.d7.pv).slice(0,3);
  $("#benchmarkPeriod").textContent = periodText(latest.date);
  $("#benchmarkSummary").innerHTML = `<p class="finding">${rows.length ? `${rows.length}記事のうち、${moving.length}記事でビュー・スキ・コメントのいずれかが増えています。` : "7日間を通した記録が足りないため、増え方はまだ比較できません。"}</p><p>まず、最近も動いている記事の題材と切り口を確認してください。以下は直近7日で従来ビューが増えた記事です。新作と過去記事が混ざるため、記事の優劣や次のヒットを示す順位ではありません。</p>${top.length ? `<ul class="evidence-list">${articleLinks(top)}</ul>` : '<p>この期間に従来ビューが増えた記事は確認できません。読者の需要がないとは判断できません。</p>'}<p class="method">従来ビューは新しい公式PVとは別の指標です。公開後7日間の成績ではなく、上記の取得時点間の増加です。</p>`;
}
function renderAudience(data, items, latest) {
  const rows = data.followers || [], now = rows.findLast(x => rowDate(x) === latest.date);
  const current = followerChange(rows, latest.date, 7), previous = followerChange(rows, shiftDate(latest.date,-7),7);
  const judgement = current == null ? "7日前の記録がないため、増えるペースはまだ判断できません。" : previous == null ? `直近7日でフォロワーは${signed(current)}人。前の7日との比較は記録不足です。` : `直近7日で${signed(current)}人、その前の7日で${signed(previous)}人。${current>previous ? "前の期間より純増が多くなっています。" : current<previous ? "前の期間より純増が少なくなっています。" : "純増は前の期間と同じです。"}`;
  $("#audienceSummary").innerHTML = `<p class="finding">${judgement}</p><p>${latest.date}時点のフォロワー：<strong>${now?.followerCount == null ? "未取得" : fmt.format(now.followerCount)+"人"}</strong>。純増は、増えた人数から減った人数を引いた値です。</p><p class="method">直近：${periodText(latest.date)}。前の期間：${periodText(shiftDate(latest.date,-7))}。どの記事からフォローされたか、再び読みに来たかは取得できていないため、ファン化や記事の貢献人数は判断できません。</p>${followerChart(rows)}`;
}
function followerChart(rows) {
 const values=rows.filter(r=>r.followerCount!=null && Number.isFinite(Number(r.followerCount))).slice(-30);
 if(values.length<2)return '<p>推移のグラフは2日分の記録から表示します。</p>';
 const first=Date.parse(rowDate(values[0])),last=Date.parse(rowDate(values.at(-1)));
 if(first===last)return '';
 const max=Math.max(1,...values.map(r=>Number(r.followerCount)));
 const x=r=>60+(Date.parse(rowDate(r))-first)/(last-first)*640,y=r=>210-Number(r.followerCount)/max*165;
 const segments=values.slice(1).map((r,i)=>rowDate(r)===shiftDate(rowDate(values[i]),1)?`<line x1="${x(values[i])}" y1="${y(values[i])}" x2="${x(r)}" y2="${y(r)}" stroke="#337bd2" stroke-width="3"/>`:'').join('');
 return `<figure class="data-chart"><figcaption>フォロワー数の推移（最大30日）</figcaption><svg viewBox="0 0 760 260" role="img" aria-label="${esc(rowDate(values[0]))}から${esc(rowDate(values.at(-1)))}のフォロワー数。${values[0].followerCount}人から${values.at(-1).followerCount}人。欠測日は線をつなぎません。">${[0,.5,1].map(t=>`<line x1="60" x2="700" y1="${210-t*165}" y2="${210-t*165}" stroke="#8996a644"/><text x="50" y="${215-t*165}" text-anchor="end">${Math.round(max*t)}人</text>`).join('')}${segments}${values.map(r=>`<circle cx="${x(r)}" cy="${y(r)}" r="4" fill="#337bd2"><title>${esc(rowDate(r))}：${r.followerCount}人</title></circle>`).join('')}<text x="60" y="244">${esc(rowDate(values[0]))}</text><text x="700" y="244" text-anchor="end">${esc(rowDate(values.at(-1)))}</text></svg><details><summary>日ごとの人数を見る</summary><ul>${values.map(r=>`<li>${esc(rowDate(r))}：${r.followerCount}人</li>`).join('')}</ul></details></figure>`;
}
function comparisonBars(groups, field, label, unit) {
 const valid=groups.filter(g=>g[field]!=null && Number.isFinite(g[field]));
 if(!valid.length)return '';
 const max=Math.max(1,...valid.map(g=>g[field]));
 return `<figure class="data-chart"><figcaption>${esc(label)}（1記事あたりの中央値）</figcaption><svg viewBox="0 0 760 ${valid.length*48+35}" role="img" aria-label="${esc(valid.map(g=>g.name+' '+countText(g[field],unit)).join('、'))}">${valid.map((g,i)=>`<text x="0" y="${i*48+25}">${esc(g.name)}</text><rect x="180" y="${i*48+8}" width="${g[field]/max*450}" height="24" rx="3" fill="#337bd2"/><text x="${190+g[field]/max*450}" y="${i*48+25}">${countText(g[field],unit)}</text>`).join('')}<text x="180" y="${valid.length*48+22}">0</text><text x="630" y="${valid.length*48+22}" text-anchor="end">${countText(max,unit)}</text></svg></figure>`;
}
function renderReadingStages(data, items) {
 const box=$('#readingStages'), funnel=data.funnel, rows=funnel?.articles||[];
 if(!rows.length){box.innerHTML=empty('新しい公式指標は未取得です','インプレッションとPVが取得できるまで、露出と閲覧は比較できません。');return;}
 const value=(r,k)=>r[k]!=null && Number.isFinite(Number(r[k])) && Number(r[k])>=0?Number(r[k]):null;
 const fields=[['impressions','表示された回数'],['pageviews','記事が開かれた回数（PV）'],['likes','スキの件数'],['comments','コメントの件数']];
 const totals=fields.map(([k,label])=>({name:label,pv:rows.every(r=>value(r,k)!=null)?rows.reduce((n,r)=>n+value(r,k),0):null}));
 const byKey=new Map(items.map(x=>[x.key,x]));
 const ratio=(r,a,b)=>value(r,a)!=null && value(r,b)>0?(value(r,a)/value(r,b)*100).toFixed(1)+'%':'算出不可';
 const sorted=[...rows].sort((a,b)=>(value(b,'pageviews')??-1)-(value(a,'pageviews')??-1));
 box.innerHTML=`<p class="finding">${esc(funnel.date)}の実績：表示 ${countText(totals[0].pv)}、PV ${countText(totals[1].pv)}、スキ ${countText(totals[2].pv,'件')}。</p><p>この日はどの記事に表示と閲覧が集まったかを確認できます。画面に届いている新指標はこの1日分です。先週との比較や、伸びない原因の判定はまだできません。</p><div class="stage-counts">${totals.map(g=>`<div><span>${esc(g.name)}</span><strong>${countText(g.pv,g.name.includes('件数')?'件':'回')}</strong></div>`).join('')}</div><p class="method">公式応答に含まれた${rows.length}記事が対象。返ってこなかった記事は0としません。表示・PV・スキは同じ人を追跡した数字ではありません。PV÷表示数は参考比率で、厳密なクリック率ではありません。</p><h3>PVが多かった記事は、どれくらい表示された？</h3>${comparisonBars(sorted.slice(0,5).map((r,i)=>({name:String(i+1)+'番の記事',pv:value(r,'pageviews')})),'pv','当日のPV','回')}<ol>${sorted.slice(0,5).map(r=>`<li><a href="${esc(byKey.get(r.key)?.url||'https://note.com')}" target="_blank" rel="noopener noreferrer">${esc(byKey.get(r.key)?.title||r.key)}</a>：表示 ${countText(value(r,'impressions'))}／PV ${countText(value(r,'pageviews'))}／スキ ${countText(value(r,'likes'),'件')}。PV÷表示数 ${ratio(r,'pageviews','impressions')}、スキ÷PV ${ratio(r,'likes','pageviews')}。</li>`).join('')}</ol><p><b>次に確認すること：</b>表示が少なければ流入元や告知状況、表示に対するPVが少なければ題材・タイトル・サムネ、閲覧に対する反応が少なければ本文や読者層を確認します。どれも原因の候補であり、この1日で結論を出しません。</p><details><summary>全${rows.length}記事の数値を見る</summary><div class="table-wrap"><table><thead><tr><th>記事</th><th>表示</th><th>PV</th><th>スキ</th><th>コメント</th></tr></thead><tbody>${sorted.map(r=>`<tr><td>${esc(byKey.get(r.key)?.title||r.key)}</td>${fields.map(([k])=>`<td>${countText(value(r,k),k==='likes'||k==='comments'?'件':'回')}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details><p class="method">記事別の流入元は現在このページのデータに含まれていません。検索・note内・外部SNSのどこが効いたかは未判定です。</p>`;
}
function factorGroups(items) {
  const rows=usableArticles(items);
  const specs=[
    ["どのジャンルの記事が最近も動いている？", x=>x.category || "要確認"],
    ["タイトルの長さで増え方は違う？",x=>titleLengthBand(x.title)],
    ["タイトルに【】を使った記事はどう？",x=>/【[^】]+】/.test(x.title)?"【】あり":"【】なし"],
    ["疑問符のあるタイトルはどう？",x=>/[？?]/.test(x.title)?"疑問符あり":"疑問符なし"],
    ["本文の画像の有無で違いはある？",x=>x.features?.imageCount==null?"未記録":Number(x.features.imageCount)>0?"画像あり":"画像なし"],
    ["読者への問いかけがある記事はどう？",x=>x.features?.hasReaderQuestion==null?"未記録":x.features.hasReaderQuestion?"問いかけあり":"問いかけなし"],
    ["本文の長さで増え方は違う？",x=>x.features?.bodyLength==null?"未記録":Number(x.features.bodyLength)<=1500?"1,500字以下":Number(x.features.bodyLength)<=5000?"1,501〜5,000字":"5,001字以上"]
  ];
  return specs.map(([question,key])=>{
    const map=new Map();for(const x of rows){const k=key(x);if(!map.has(k))map.set(k,[]);map.get(k).push(x);}
    return {question,groups:[...map].map(([name,members])=>({name,members,pv:readableMedian(members.map(x=>x.d7.pv)),likes:readableMedian(members.map(x=>x.d7.likes)),comments:readableMedian(members.map(x=>x.d7.comments))}))};
  });
}
function renderFactors(items, latest) {
  $("#factorBreakdown").innerHTML=factorGroups(items).map(({question,groups})=>{
    const known=groups.filter(x=>x.name!=="未記録"), enough=known.length>=2 && known.every(x=>x.members.length>=5);
    const same=enough && new Set(known.map(x=>x.pv)).size===1;
    const conclusion=!enough?"比較に使える記事が不足しています。" : same?"ビュー増加の中央値に差はありません。この項目では条件を選べません。":"集計値に違いがあります。ただし、この条件が増加の原因とは判断できません。";
    return `<details class="question-block"><summary>${esc(question)}<small>${conclusion}</small></summary><p>${periodText(latest.date)}。1記事あたりの増加の中央値（小さい順に並べた中央の値）です。題材・公開時期をそろえていない参考集計です。</p>${comparisonBars(groups,"pv","直近7日の従来ビュー増加","回")}${comparisonBars(groups,"likes","直近7日のスキ増加","件")}<div class="table-wrap"><table><thead><tr><th>条件</th><th>対象記事</th><th>ビュー増加</th><th>スキ増加</th><th>コメント増加</th></tr></thead><tbody>${groups.map(g=>`<tr><th>${esc(g.name)}</th><td>${g.members.length}本${g.members.length<5?"・少数":""}</td><td>${countText(g.pv)}</td><td>${countText(g.likes,"件")}</td><td>${countText(g.comments,"件")}</td></tr>`).join("")}</tbody></table></div><p>次の確認：各条件にどんな記事が含まれているかを見て、題材や公開時期の偏りを確認します。件数が多いことだけでは信頼できる傾向とは言えません。</p>${groups.map(g=>`<details><summary>${esc(g.name)}の対象記事（${g.members.length}本）</summary><ul>${g.members.map(x=>`<li><a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title)}</a>／公開 ${esc(String(x.publishedAt||"不明").slice(0,10))}</li>`).join("")}</ul></details>`).join("")}</details>`;
  }).join("") || empty("比較の記録が不足しています","7日間の記録がそろった記事から比較します。");
}
function renderDecisionLoop(items, latest) {
 const candidates=usableArticles(items).filter(x=>x.d7.pv>0 && x.d7.likes>0).sort((a,b)=>b.d7.likes-a.d7.likes).slice(0,3);
 $("#decisionLoop").innerHTML=`<p class="finding">${candidates.length?"まず、閲覧の指標とスキが両方増えた記事の続きを書けるか検討してください。":"現時点の記録から、優先して再現する記事は選べません。"}</p>${candidates.length?`<ul class="evidence-list">${articleLinks(candidates)}</ul><p>これは次の題材を考えるための候補です。記事を開き、続編で答えられる疑問や、追加できる自分の体験があるかを確認してください。タイトルやサムネが効いたと判断した候補ではありません。</p>`:""}<ol><li><b>書く前：</b>題材・読者に伝えること・今回試す変更を一つ決め、メモします。</li><li><b>公開後：</b>公式のPV、スキ、コメントを公開7日後に記録します。比べる記事も同じ公開後7日の数値が必要です。</li><li><b>次の判断：</b>閲覧と反応のどちらが増えたかを分けて確認し、一度の結果では成功パターンと決めず、別の記事でも試します。</li></ol><p class="method">このページには試行を保存して後日自動判定する機能はまだありません。サムネ属性・記事別フォロー数・再訪の記録もなく、タイトルやサムネの効果、ファン化は現時点では判定できません。</p>`;
}
function renderReadableLedger(items, date) {
 $("#categoryFilter").innerHTML='<option value="">すべての分類</option>'+[...new Set(items.map(x=>x.category))].filter(Boolean).sort().map(x=>`<option>${esc(x)}</option>`).join('');
 let key='pv',dir=-1;
 const draw=()=>{
 const q=$("#ledgerSearch").value.toLowerCase(),cat=$("#categoryFilter").value;
 const rows=items.filter(x=>(!q||x.title.toLowerCase().includes(q))&&(!cat||x.category===cat)).sort((a,b)=>key==='title'?a.title.localeCompare(b.title,'ja')*dir:((a.d7?.[key]??-Infinity)-(b.d7?.[key]??-Infinity))*dir);
 $("#ledgerBody").innerHTML=rows.map(x=>`<tr><td><a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title)}</a></td><td>${esc(x.category)}</td><td>${esc(String(x.publishedAt||'不明').slice(0,10))}</td><td>${countText(x.d7.pv)}</td><td>${countText(x.d7.likes,'件')}</td><td>${countText(x.d7.comments,'件')}</td></tr>`).join('') || '<tr><td colspan="6">一致する記事はありません</td></tr>';
 };
 $("#ledgerSearch").oninput=draw;$("#categoryFilter").onchange=draw;
 document.querySelectorAll('[data-sort]').forEach(el=>{el.onclick=()=>{if(key===el.dataset.sort)dir*=-1;else{key=el.dataset.sort;dir=-1;}draw();};});draw();
}
