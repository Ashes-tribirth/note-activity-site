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
assert(source["app.js"].includes("row.pageviews / row.impressions * 100"), "記事タイプ別の閲覧率が公式日次値から計算されていません");
assert(source["app.js"].includes("row.likes / row.pageviews * 100"), "記事タイプ別のスキ率が公式日次値から計算されていません");
assert(source["app.js"].includes('<svg class="mixbar"'), "記事年齢の構成比がSVG化されていません");
assert(source["charts.js"].includes("const factor = intervalHours && intervalHours > 0 ? 24 / intervalHours : 1"), "活動量が24時間換算されていません");
assert(!source["index.html"].includes("累計PV ÷ 公開日数"), "価値の低い平均PVペースが残っています");
assert(source["index.html"].includes('href="https://note.com/sitesettings/stats"'), "公式ダッシュボードへの正しい導線がありません");
assert(source["index.html"].includes('rel="noopener noreferrer"'), "公式ダッシュボード導線の安全属性がありません");
assert(source["index.html"].includes("従来ビュー"), "旧指標と新しいページビューを区別する説明がありません");
assert(source["index.html"].includes('class="legacy-archive"'), "従来ビューの分析が過去記録へ整理されていません");
assert(!source["index.html"].includes('id="changes"'), "重複した期間サマリーが残っています");
assert(!source["index.html"].includes('id="funnelBody"'), "記事別ファネルが分析表と重複しています");
assert(!source["index.html"].includes('id="followerDeltaChart"'), "判断価値の薄いフォロワー増減グラフが残っています");
assert(!source["index.html"].includes('id="followerTotalChart"'), "判断価値の薄いフォロワー累計グラフが残っています");
assert(source["period-integrity.js"].includes("impressions: Number(dailyRow.impressions || 0)"), "記事判断表へ日次インプレッションが統合されていません");
assert(source["period-integrity.js"].includes('article.impressions == null ? "—"'), "未取得と0を区別していません");
assert(source["period-integrity.js"].includes('timeZone: "Asia/Tokyo"'), "取得時刻が閲覧環境のタイムゾーンに依存しています");
assert(csp.includes("frame-src 'none'"), "埋め込み不可の公式画面を読み込まないCSPになっていません");
assert(!source["index.html"].includes('id="articleMap"'), "旧ビューをPVとみなす記事分布が残っています");
assert(!source["index.html"].includes('id="featureComparisons"'), "分析価値の低い特徴別比較が残っています");
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
assert(source["app.js"].includes('class="campaign-match-metrics"'), "参加記事の観測数値がありません");
assert(source["app.js"].includes('article.d7?.pv == null ? "記録中" : signed(article.d7.pv)'), "参加記事の直近7日PVが記録不足を区別していません");
assert(source["index.html"].includes("企画参加の効果を示すものではありません"), "参加と伸びを因果関係として誤読させる注意書きがありません");
assert(source["app.js"].includes('return { key: "new", label: "新出" }'), "急上昇語句の新出判定がありません");
assert(source["app.js"].includes('return { key: "continuing", label: `連続${fmt.format(consecutive)}日` }'), "急上昇語句の連続判定がありません");
assert(source["app.js"].includes('return { key: "returning", label: "再浮上" }'), "急上昇語句の再浮上判定がありません");
assert(source["app.js"].includes("item.rankChange"), "急上昇語句の順位差表示がありません");
assert(source["app.js"].includes("item.appearances14d"), "急上昇語句の14日観測回数がありません");
assert(source["index.html"].includes('id="alignmentContent"'), "外部テーマとの関係の表示領域がありません");
assert(source["app.js"].includes("externalMatchHistoryDays"), "外部テーマ照合の履歴日数が表示されません");
assert(source["app.js"].includes("matchedPvChange14d"), "外部テーマ一致記事の14日PV比較がありません");
assert(source["app.js"].includes("noMatchPvChange14d"), "外部テーマ非一致記事の14日PV比較がありません");
const ownAnalysisPosition = source["index.html"].indexOf('id="categories"');
const externalPosition = source["index.html"].indexOf('class="external-observations"');
assert(ownAnalysisPosition >= 0 && externalPosition > ownAnalysisPosition, "外部動向が自記事分析より前に表示されています");
assert(!source["index.html"].includes("公式マガジン掲載"), "価値検証で除外した公式マガジン欄が再追加されています");
assert(!source["index.html"].includes("複数作者の共通"), "採用しない共通タグ機能が画面に追加されています");

console.log(`dashboard audit passed: ${ids.length} unique ids, no CSP-inline conflicts`);
