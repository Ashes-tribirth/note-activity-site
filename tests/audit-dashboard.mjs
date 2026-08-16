import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const files = ["index.html", "app.js", "period-integrity.js", "health-integrity.js", "charts.js"];
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
assert(source["app.js"].includes('<svg class="mixbar"'), "記事年齢の構成比がSVG化されていません");
assert(source["charts.js"].includes("const factor = intervalHours && intervalHours > 0 ? 24 / intervalHours : 1"), "活動量が24時間換算されていません");
assert(source["index.html"].includes("累計PV ÷ 公開日数"), "平均PVペースの計算根拠が画面にありません");

console.log(`dashboard audit passed: ${ids.length} unique ids, no CSP-inline conflicts`);
