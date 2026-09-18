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

function renderBenchmark(items, latest) {
  const comparison = window.NotePulseCampaignComparison;
  const comparable = items.filter(item => item.d7?.pv != null);
  const med = values => comparison?.median(values) ?? null;
  const reaction = item => comparison?.reactionRate(item) ?? null;
  const fmtMetric = value => value == null ? "—" : fmt.format(Math.round(value));
  const fmtRate = value => value == null ? "—" : `${value.toFixed(1)}%`;
  const observedDate = latest.date;
  const ready = comparable.filter(item => comparison?.compare(item, items, new Set(), observedDate).ready);
  $("#benchmarkPeriod").textContent = `基準日 ${observedDate.replaceAll("-", ".")} ／ 直近7日`;
  $("#benchmarkSummary").innerHTML = `
    <div><span>比較できる記事</span><strong>${fmt.format(ready.length)}</strong><small>${fmt.format(comparable.length)}記事中。分類・公開後日数が同じ3記事以上</small></div>
    <div><span>7日伸びの中央値</span><strong>${fmtMetric(med(comparable.map(item => item.d7.pv)))}</strong><small>保存ビューの増加</small></div>
    <div><span>反応率の中央値</span><strong>${fmtRate(med(comparable.map(reaction)))}</strong><small>（スキ＋コメント）÷ 保存ビュー</small></div>
    <div><span>記事総数</span><strong>${fmt.format(items.length)}</strong><small>公開後日数をそろえず順位づけしません</small></div>`;
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
  renderBenchmark(allItems, latest);
  renderLedger(allItems, latest.date);
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
  $("#campaignCoverage").textContent = "締切が近い順に表示しています。参加した過去記事の照合と急上昇語句は、次の記事の判断を直接変えないため画面から外しました。";
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
