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

  function activityDeltas(data) {
    const summaries = [...(data.summaries || [])].sort((a, b) => asDate(a) - asDate(b));
    const historyByDate = new Map();
    (data.articleHistory || []).forEach(row => {
      const date = String(row.date || row.collectedDate || row.collectedAt || "").slice(0, 10);
      if (!historyByDate.has(date)) historyByDate.set(date, new Map());
      historyByDate.get(date).set(row.key, row);
    });
    return summaries.slice(1).map((current, index) => {
      const previous = summaries[index];
      const currentDate = String(current.date || current.collectedDate || current.collectedAt || "").slice(0, 10);
      const previousDate = String(previous.date || previous.collectedDate || previous.collectedAt || "").slice(0, 10);
      const before = historyByDate.get(previousDate) || new Map();
      const now = historyByDate.get(currentDate) || new Map();
      const delta = [...now.values()].reduce((sum, row) => {
        const old = before.get(row.key);
        sum.pv += Number(row.pv || 0) - Number(old?.pv || 0);
        sum.likes += Number(row.likes || 0) - Number(old?.likes || 0);
        sum.comments += Number(row.comments || 0) - Number(old?.comments || 0);
        return sum;
      }, { pv: 0, likes: 0, comments: 0 });
      const start = asDate(previous);
      const end = asDate(current);
      return { ...delta, date: currentDate, collectedAt: current.collectedAt, intervalHours: start && end ? (end - start) / 3600000 : null };
    });
  }

  function activityBarChart(rows, key, label, cls) {
    const width = 900, height = 128;
    const pad = { l: 48, r: 18, t: 13, b: 29 };
    const values = rows.map(row => Number(row[key] || 0));
    const high = Math.max(1, ...values, 0), low = Math.min(0, ...values), span = Math.max(1, high - low);
    const usableWidth = width - pad.l - pad.r, usableHeight = height - pad.t - pad.b;
    const zeroY = pad.t + high / span * usableHeight;
    const step = usableWidth / Math.max(rows.length, 1), barWidth = Math.min(44, step * .58);
    let svg = `<section class="activity-metric"><h3>${esc(label)}</h3><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="前回取得からの${esc(label)}">`;
    svg += `<line class="grid-line" x1="${pad.l}" y1="${zeroY}" x2="${width - pad.r}" y2="${zeroY}"></line>`;
    rows.forEach((row, index) => {
      const value = values[index], x = pad.l + step * index + (step - barWidth) / 2;
      const valueY = pad.t + (high - value) / span * usableHeight, y = Math.min(zeroY, valueY);
      const barHeight = Math.max(1, Math.abs(zeroY - valueY));
      const interval = row.intervalHours == null ? "取得間隔不明" : `前回から${row.intervalHours.toFixed(1)}時間`;
      svg += `<rect class="activity-bar ${cls}" x="${x}" y="${y}" width="${barWidth}" height="${barHeight}"><title>${esc(label)} ${esc(labelDate(row.date))}: ${value >= 0 ? "+" : ""}${esc(fmt.format(value))}（${esc(interval)}）</title></rect>`;
      svg += `<text class="point-label" x="${x + barWidth / 2}" y="${Math.max(11, y - 4)}" text-anchor="middle">${value >= 0 ? "+" : ""}${esc(fmt.format(value))}</text>`;
      svg += `<text class="axis-label" x="${x + barWidth / 2}" y="${height - 7}" text-anchor="middle">${esc(labelDate(row.date))}</text>`;
    });
    return `${svg}</svg></section>`;
  }

  function renderActivity() {
    if (!state.data) return;
    const rows = filterRange(activityDeltas(state.data), state.activityRange);
    const target = $("#trendBars");
    target.innerHTML = rows.length
      ? activityBarChart(rows, "pv", "PV増加", "pv") +
        activityBarChart(rows, "likes", "スキ増加", "likes") +
        activityBarChart(rows, "comments", "コメント増加", "comments")
      : '<div class="chart-empty">2回分の記録がそろうと増加量を表示します。</div>';

    const note = $("#trendNote");
    if (!note) return;
    note.textContent = rows.length
      ? `選択範囲：${rangeLabel(state.activityRange)}／表示 ${rows.length}区間。棒は前回取得からの実測増加量です。取得間隔は各棒に触れると確認できます。`
      : `選択範囲：${rangeLabel(state.activityRange)}。増加量は記録中です。`;
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
