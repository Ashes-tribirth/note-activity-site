import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const files = ["index.html", "app.js", "period-integrity.js", "health-integrity.js", "charts.js", "connection-insights.js"];
const source = Object.fromEntries(files.map(file => [file, readFileSync(new URL(`../${file}`, import.meta.url), "utf8")]));

for (const [file, text] of Object.entries(source)) {
  assert(!/\sstyle\s*=/.test(text), `${file}: CSPで無効になるインラインstyle属性があります`);
  assert(!/\.style\s*[.=]/.test(text), `${file}: CSPで無効になるelement.style操作があります`);
}

const ids = [...source["index.html"].matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(ids).size, ids.length, "index.html: idが重複しています");

const csp = source["index.html"].match(/Content-Security-Policy" content="([^"]+)"/)?.[1] || "";
assert(csp.includes("style-src 'self'"), "CSPのstyle-srcがself限定ではありません");
assert(!csp.includes("'unsafe-inline'"), "CSPでunsafe-inlineを許可しています");

assert(source["index.html"].includes('href="https://note.com/sitesettings/stats"'), "公式ダッシュボードへの導線がありません");
assert(source["index.html"].includes('id="benchmarkSummary"'), "記事実力の要約欄がありません");
assert(source["index.html"].includes('id="audienceSummary"'), "フォロワー増加の要約欄がありません");
assert(source["index.html"].includes('id="factorBreakdown"'), "要素別の比較欄がありません");
assert(source["index.html"].includes('id="decisionLoop"'), "次の試行を示す判断欄がありません");
assert(source["index.html"].includes("同じ分類・公開後日数帯の中央値"), "比較条件の説明がありません");
assert(source["app.js"].includes("function renderBenchmark"), "記事実力の要約を描画していません");
assert(source["app.js"].includes("function renderAudience"), "フォロワー増加を描画していません");
assert(source["app.js"].includes("function renderFactors"), "要素別比較を描画していません");
assert(source["app.js"].includes("function renderDecisionLoop"), "観測結果を次の試行へ変換していません");
assert(source["app.js"].includes("7日後の判定"), "試行の判定基準がありません");
assert(source["app.js"].includes("titleLengthBand"), "タイトル長を比較していません");
assert(source["app.js"].includes("hasReaderQuestion"), "読者への問いを比較していません");
assert(source["app.js"].includes("imageCount"), "本文画像数を比較していません");
assert(source["period-integrity.js"].includes("comparison?.compare(article, allItems, new Set(), observedDate)"), "記事ごとの同条件比較がありません");
assert(source["period-integrity.js"].includes("reactionDelta"), "反応率の平均との差がありません");
assert(source["index.html"].includes('id="openCampaignList"'), "募集中の公式企画一覧がありません");
assert(source["app.js"].includes('item.status === "open"'), "募集中の企画だけを抽出していません");
assert(!source["index.html"].includes('id="funnelPanel"'), "公式と重複する日次ファネルが残っています");
assert(!source["index.html"].includes('class="connection-insights"'), "優先度の低いフォロワー推移が残っています");
assert(!source["index.html"].includes('class="legacy-archive"'), "優先度の低い旧ビュー分析が残っています");
assert(!source["index.html"].includes('class="trending-panel"'), "接点のない急上昇表示が残っています");
assert(!source["index.html"].includes('class="alignment-panel"'), "根拠不足の外部テーマ比較が残っています");
const ownAnalysisPosition = source["index.html"].indexOf("benchmark-panel");
const externalPosition = source["index.html"].indexOf('class="external-observations"');
assert(ownAnalysisPosition >= 0 && externalPosition > ownAnalysisPosition, "外部動向が自記事分析より前に表示されています");
assert(csp.includes("frame-src 'none'"), "埋め込み不可の公式画面を読み込まないCSPになっていません");
assert(!source["index.html"].includes("公式マガジン掲載"), "価値検証で除外した公式マガジン欄が再追加されています");
assert(!source["index.html"].includes("複数作者の共通"), "採用しない共通タグ機能が画面に追加されています");

console.log(`dashboard audit passed: ${ids.length} unique ids, no CSP-inline conflicts`);
