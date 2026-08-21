const assert = require("node:assert/strict");
const comparison = require("../campaign-comparison.js");

const article = (key, category, publishedAt, pv7, pv = 100, likes = 10, comments = 0) => ({
  key, category, publishedAt, pv, likes, comments, d7: { pv: pv7 },
});
const observed = "2026-08-21";

assert.equal(comparison.ageBand("2026-08-17T07:00:00+09:00", observed).key, "0-7");
assert.equal(comparison.ageBand("2026-07-30T07:00:00+09:00", observed).key, "8-30");
assert.equal(comparison.ageBand("2026-06-20T07:00:00+09:00", observed).key, "31-90");
assert.equal(comparison.ageBand("2026-02-26T07:00:00+09:00", observed).key, "91+");
assert.equal(comparison.median([1, 100, 3]), 3);

const target = article("target", "その他", "2026-02-26T07:00:00+09:00", 9, 200, 20, 0);
const peers = [
  article("p1", "その他", "2026-03-01T07:00:00+09:00", 2, 100, 5, 0),
  article("p2", "その他", "2026-03-02T07:00:00+09:00", 5, 100, 10, 0),
  article("p3", "その他", "2026-03-03T07:00:00+09:00", 20, 100, 15, 0),
  article("different-category", "音楽・曲", "2026-03-03T07:00:00+09:00", 999),
  article("candidate", "その他", "2026-03-03T07:00:00+09:00", 999),
];
const result = comparison.compare(target, [target, ...peers], new Set(["candidate"]), observed);
assert.equal(result.ready, true);
assert.equal(result.peerCount, 3);
assert.equal(result.pvMedian, 5);
assert.equal(result.reactionMedian, 10);

const insufficient = comparison.compare(target, [target, peers[0], peers[1]], new Set(), observed);
assert.equal(insufficient.ready, false);
assert.equal(insufficient.reason, "比較対象不足");
assert.equal(insufficient.peerCount, 2);

const waiting = comparison.compare({ ...target, d7: { pv: null } }, [target, ...peers], new Set(), observed);
assert.equal(waiting.ready, false);
assert.equal(waiting.reason, "7日間の記録中");

console.log("campaign comparison tests: ok");
