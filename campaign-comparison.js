(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.NotePulseCampaignComparison = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const MIN_PEERS = 3;

  function ageInDays(publishedAt, observedDate) {
    if (!publishedAt || !observedDate) return null;
    const published = Date.parse(publishedAt);
    const observed = Date.parse(`${String(observedDate).slice(0, 10)}T23:59:59+09:00`);
    if (!Number.isFinite(published) || !Number.isFinite(observed)) return null;
    return Math.max(1, Math.floor((observed - published) / 86400000) + 1);
  }

  function ageBand(publishedAt, observedDate) {
    const age = ageInDays(publishedAt, observedDate);
    if (age == null) return null;
    if (age <= 7) return { key: "0-7", label: "公開7日以内" };
    if (age <= 30) return { key: "8-30", label: "公開8〜30日" };
    if (age <= 90) return { key: "31-90", label: "公開31〜90日" };
    return { key: "91+", label: "公開91日以上" };
  }

  function median(values) {
    const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function reactionRate(article) {
    const pv = Number(article?.pv);
    if (!Number.isFinite(pv) || pv <= 0) return 0;
    return (Number(article.likes || 0) + Number(article.comments || 0)) / pv * 100;
  }

  function compare(article, articles, excludedKeys, observedDate) {
    const band = ageBand(article?.publishedAt, observedDate);
    if (!article || !band || !article.category || article.category === "要確認") {
      return { ready: false, reason: "条件を確認できません", peerCount: 0, band: band?.label || "公開日不明" };
    }
    if (article.d7?.pv == null) {
      return { ready: false, reason: "7日間の記録中", peerCount: 0, band: band.label };
    }

    const peers = (articles || []).filter(peer => {
      if (!peer || peer.key === article.key || excludedKeys.has(peer.key)) return false;
      if (peer.category !== article.category || peer.d7?.pv == null) return false;
      return ageBand(peer.publishedAt, observedDate)?.key === band.key;
    });
    if (peers.length < MIN_PEERS) {
      return { ready: false, reason: "比較対象不足", peerCount: peers.length, band: band.label };
    }

    return {
      ready: true,
      peerCount: peers.length,
      band: band.label,
      pvMedian: median(peers.map(peer => peer.d7.pv)),
      reactionMedian: median(peers.map(reactionRate)),
      articlePv: Number(article.d7.pv),
      articleReaction: reactionRate(article),
    };
  }

  return { MIN_PEERS, ageBand, median, reactionRate, compare };
});
