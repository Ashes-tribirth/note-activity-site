(() => {
  const fmt = new Intl.NumberFormat("ja-JP");
  const $ = selector => document.querySelector(selector);
  const state = { data: null, activityRange: "30", followRange: "30" };

  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);

  function finite(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function asDate(row) {
    const raw = row?.collectedAt || row?.date || row?.collectedDate;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function labelDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value || "") : `${date.getMonth() + 1}/${date.getDate()}`;
  }

  function filterRange(rows, range) {
    if (range === "all" || !rows.length) return rows.slice();
    const latest = asDate(rows.at(-1));
    if (!latest) return rows.slice();
    const start = new Date(latest);
    start.setDate(start.getDate() - (Number(range) - 1));
    return rows.filter(row => {
      const date = asDate(row);
      return date && date >= start && date <= latest;
    });
  }

  function svgLineChart(target, rows, series, aria) {
    if (!target) return;
    if (!rows.length) {
      target.innerHTML = '<div class="chart-empty">記録データがありません。</div>';
      return;
    }

    const width = 900;
    const height = 220;
    const pad = { l: 48, r: 18, t: 16, b: 32 };
    const values = series.flatMap(item => rows.map(row => finite(row[item.key])).filter(value => value !== null));
    if (!values.length) {
      target.innerHTML = '<div class="chart-empty">表示できる記録データがありません。</div>';
      return;
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const low = min === max ? min - 1 : min;
    const high = min === max ? max + 1 : max;
    const usableWidth = width - pad.l - pad.r;
    const usableHeight = height - pad.t - pad.b;
    const xAt = index => pad.l + (rows.length === 1 ? usableWidth / 2 : index * usableWidth / (rows.length - 1));
    const yAt = value => pad.t + (high - value) / Math.max(high - low, 1) * usableHeight;

    let output = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(aria)}">`;

    [0, .25, .5, .75, 1].forEach(t => {
      const y = pad.t + t * usableHeight;
      const value = Math.round(high - t * (high - low));
      output += `<line class="grid-line" x1="${pad.l}" y1="${y}" x2="${width - pad.r}" y2="${y}"></line><text class="axis-label" x="${pad.l - 8}" y="${y + 4}" text-anchor="end">${esc(fmt.format(value))}</text>`;
    });

    const labelEvery = Math.max(1, Math.ceil(rows.length / 8));
    rows.forEach((row, index) => {
      if (index % labelEvery !== 0 && index !== rows.length - 1) return;
      output += `<text class="axis-label" x="${xAt(index)}" y="${height - 8}" text-anchor="middle">${esc(labelDate(row.collectedAt || row.date || row.collectedDate))}</text>`;
    });

    series.forEach(item => {
      const points = rows
        .map((row, index) => {
          const value = finite(row[item.key]);
          return value === null ? null : { x: xAt(index), y: yAt(value), value, index };
        })
        .filter(Boolean);

      if (points.length > 1) {
        output += `<polyline class="line ${item.cls}-line" points="${points.map(point => `${point.x},${point.y}`).join(" ")}"></polyline>`;
      }

      points.forEach(point => {
        const row = rows[point.index];
        output += `<circle class="dot ${item.cls}-dot" cx="${point.x}" cy="${point.y}" r="4"><title>${esc(item.label)} ${esc(labelDate(row.collectedAt || row.date || row.collectedDate))}: ${esc(fmt.format(point.value))}${row.special ? "（特例補完）" : ""}</title></circle>`;
      });
    });

    output += `</svg><div class="chart-legend">${series.map(item => `<span><i class="${item.cls}"></i>${esc(item.label)}</span>`).join("")}</div>`;
    target.innerHTML = output;
  }

  function rangeLabel(range) {
    return range === "all" ? "全期間" : `${range}日`;
  }

  function renderActivity() {
    if (!state.data) return;
    const rows = filterRange(state.data.summaries || [], state.activityRange);
    svgLineChart(
      $("#trendBars"),
      rows,
      [
        { key: "totalPv", label: "累計PV", cls: "pv" },
        { key: "totalLikes", label: "累計スキ", cls: "likes" },
        { key: "totalComments", label: "累計コメント", cls: "comments" },
      ],
      "累計PV・スキ・コメントの活動推移"
    );

    const note = $("#trendNote");
    if (!note) return;
    const first = rows[0];
    const last = rows.at(-1);
    const firstDate = first ? asDate(first) : null;
    const lastDate = last ? asDate(last) : null;
    const span = firstDate && lastDate ? Math.floor((lastDate - firstDate) / 86400000) + 1 : rows.length;
    note.textContent = rows.length < 2
      ? `選択範囲：${rangeLabel(state.activityRange)}。現在は1回分の実数のみです。`
      : `選択範囲：${rangeLabel(state.activityRange)}／表示 ${rows.length}回・${span}日分の実測記録`;
  }

  function renderFollow() {
    if (!state.data) return;
    const rows = filterRange(state.data.followers || [], state.followRange);
    svgLineChart(
      $("#followChart"),
      rows,
      [
        { key: "followingCount", label: "フォロー中", cls: "following" },
        { key: "followerCount", label: "フォロワー", cls: "followers" },
      ],
      "フォロー数とフォロワー数の推移"
    );

    const chart = $("#followChart");
    if (chart && rows.some(row => row.special)) {
      chart.insertAdjacentHTML("beforeend", '<p class="chart-exception">※ 8/13のフォロワー198のみ、今回限りの特例補完です。</p>');
    }
  }

  function syncButtons(kind, range) {
    document.querySelectorAll(`.chart-toolbar[data-chart="${kind}"] [data-range]`).forEach(button => {
      const active = button.dataset.range === range;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function bindRange(kind) {
    document.querySelectorAll(`.chart-toolbar[data-chart="${kind}"] [data-range]`).forEach(button => {
      button.addEventListener("click", () => {
        const range = button.dataset.range;
        if (kind === "activity") {
          state.activityRange = range;
          syncButtons(kind, range);
          renderActivity();
        } else {
          state.followRange = range;
          syncButtons(kind, range);
          renderFollow();
        }
      });
    });
  }

  function render(data) {
    state.data = data;
    renderActivity();
    renderFollow();
  }

  bindRange("activity");
  bindRange("follow");

  window.NotePulseCharts = { render };
  if (window.notePulseData) render(window.notePulseData);
})();