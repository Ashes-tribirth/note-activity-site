import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const escSource = source.match(/const esc = value =>[\s\S]*?\n\};/)?.[0];

assert.ok(escSource, "app.js の共通エスケープ処理を取得できること");

const context = {};
vm.runInNewContext(`${escSource}; globalThis.result = esc('&<>"\\'');`, context);
assert.equal(context.result, "&amp;&lt;&gt;&quot;&#39;");

console.log("output escaping tests: ok");
