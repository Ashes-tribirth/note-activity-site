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

assert(!source["app.js"].includes("<i><b style="), "記事タイプ別に無効な棒グラフが残っています");
assert(source["app.js"].includes('<svg class="category-share"'), "記事タイプ別の構成比がSVG化されていません");
assert(source["app.js"].includes("count / Math.max(total, 1) * 100"), "記事タイプ別の棒が全記事数を分母にしていません");
assert(source["app.js"].includes("commentRate = Number(row.comments || 0) / Math.max(pv, 1) * 100"), "記事タイプ別のコメント率がPV基準ではありません");
assert(source["app.js"].includes("pvPerArticle = Number(row.d7 || 0) / Math.max(count, 1)"), "記事タイプ別の記録PVが記事数で正規化されていません");
assert(source["app.js"].includes('<svg class="mixbar"'), "記事年齢の構成比がSVG化されていません");
assert(source["charts.js"].includes("const factor = intervalHours && intervalHours > 0 ? 24 / intervalHours : 1"), "活動量が24時間換算されていません");
assert(source["index.html"].includes("累計PV ÷ 公開日数"), "平均PVペースの計算根拠が画面にありません");
assert(!source["index.html"].includes("charts.css"), "空のcharts.css参照が残っています");
assert(!source["period-integrity.js"].includes("window.render"), "描画関数の後付け上書きが残っています");
assert(!source["health-integrity.js"].includes("window.render"), "健全性描画の後付け上書きが残っています");
assert.equal((source["app.js"].match(/function renderHealth/g) || []).length, 0, "app.jsに旧健全性実装が残っています");
assert(source["connection-insights.js"].includes("continuousDelta(rows, 7)"), "フォロワーの7日差がありません");
assert(source["connection-insights.js"].includes("continuousDelta(rows, 30)"), "フォロワーの30日差がありません");
assert(!source["index.html"].includes("分析の見方"), "数値でない説明カードがつながりの概要に混在しています");
assert(source["app.js"].includes('nc0ba447096ad: "孫子・思考"'), "『将来は、何になりたい？』の確認済み分類がありません");
assert(source["app.js"].includes('n715119ad26e9: "ゲーム・趣味"'), "スローライフ記事の確認済み分類がありません");
assert(source["app.js"].includes('nd997cebc4486: "エッセイ・日常"'), "『note書いてるの私じゃん』の確認済み分類がありません");
assert(source["app.js"].includes('return article.category || "要確認"'), "未確認分類が分析表から隠れます");
assert(source["period-integrity.js"].includes("order.includes(article.category)"), "要確認記事が正式分類の集計へ混入します");
assert(source["health-integrity.js"].includes("pendingCategories"), "分類確認待ちが健全性チェックにありません");
assert(source["app.js"].includes('class="curve-axis-label"'), "記事推移グラフに軸ラベルがありません");
assert(source["app.js"].includes('rows[index].date.slice(5).replace("-", "/")'), "記事推移グラフに日付目盛りがありません");
assert(source["index.html"].includes('id="openCampaignList"'), "募集中の公式企画一覧がありません");
assert(source["index.html"].includes('id="confirmedCampaignMatches"'), "確定した参加記事欄がありません");
assert(source["index.html"].includes('id="candidateCampaignMatches"'), "要確認候補欄がありません");
assert(source["app.js"].includes('item.status === "open"'), "募集中の企画だけを抽出していません");
assert(source["app.js"].includes('candidate ? "要確認" : "確認済み"'), "確定と候補の表示が区別されていません");
assert(source["app.js"].includes("unavailableArticleCount"), "未取得記事の件数が表示されません");

console.log(`dashboard audit passed: ${ids.length} unique ids, no CSP-inline conflicts`);
