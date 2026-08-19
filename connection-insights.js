(() => {
  const fmt = new Intl.NumberFormat("ja-JP");
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
  const finite = value => value === null || value === undefined || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
  const rawDate = row => String(row?.date || row?.collectedDate || row?.collectedAt || "").slice(0, 10);
  const labelDate = value => {
    const [y,m,d] = String(value).slice(0,10).split("-");
    return m && d ? `${Number(m)}/${Number(d)}` : String(value || "");
  };
  const signed = value => `${value >= 0 ? "+" : ""}${fmt.format(value)}`;

  function sortedRows(data) {
    return [...(data.followers || [])].filter(row => finite(row.followerCount) !== null).sort((a,b) => rawDate(a).localeCompare(rawDate(b)));
  }

  function shiftDate(date, delta) {
    const [y,m,d] = String(date).split("-").map(Number);
    if (!y || !m || !d) return "";
    return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0,10);
  }

  function continuousDelta(rows, daysBack) {
    if (!rows.length) return null;
    const byDate = new Map(rows.map(row => [rawDate(row), row]));
    const end = rawDate(rows.at(-1));
    for (let offset = 0; offset <= daysBack; offset += 1) {
      if (!byDate.has(shiftDate(end, -offset))) return null;
    }
    const start = byDate.get(shiftDate(end, -daysBack));
    const last = byDate.get(end);
    const a = finite(start?.followerCount), b = finite(last?.followerCount);
    return a === null || b === null ? null : b - a;
  }

  function deltaRows(rows) {
    return rows.slice(1).map((row,index) => {
      const previous = rows[index];
      const current = finite(row.followerCount);
      const before = finite(previous.followerCount);
      return { date: rawDate(row), value: current === null || before === null ? null : current - before };
    }).filter(row => row.value !== null);
  }

  function renderDeltaChart(rows) {
    const target = $("#followerDeltaChart");
    if (!target) return;
    const data = deltaRows(rows);
    if (!data.length) {
      target.innerHTML = '<div class="chart-empty">2回分の記録がそろうと増減を表示します。</div>';
      return;
    }
    const width = 900, height = 220, pad = {l:48,r:18,t:26,b:34};
    const maxAbs = Math.max(1, ...data.map(row => Math.abs(row.value)));
    const high = maxAbs, low = -maxAbs;
    const usableW = width - pad.l - pad.r, usableH = height - pad.t - pad.b;
    const zeroY = pad.t + high / (high - low) * usableH;
    const step = usableW / data.length;
    const barW = Math.min(56, step * .52);
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="前回取得からのフォロワー増減">`;
    [-1,-.5,0,.5,1].forEach(t => {
      const value = Math.round(maxAbs * t);
      const y = pad.t + (high - value) / (high - low) * usableH;
      svg += `<line class="grid-line" x1="${pad.l}" y1="${y}" x2="${width-pad.r}" y2="${y}"></line>`;
      svg += `<text class="axis-label" x="${pad.l-8}" y="${y+4}" text-anchor="end">${esc(signed(value))}</text>`;
    });
    data.forEach((row,index) => {
      const x = pad.l + step * index + (step - barW) / 2;
      const yValue = pad.t + (high - row.value) / (high - low) * usableH;
      const y = Math.min(zeroY, yValue);
      const h = row.value === 0 ? 3 : Math.max(3, Math.abs(zeroY - yValue));
      const cls = row.value < 0 ? "negative" : row.value === 0 ? "zero" : "positive";
      svg += `<rect class="follower-delta-bar ${cls}" x="${x}" y="${row.value === 0 ? zeroY - 1.5 : y}" width="${barW}" height="${h}"><title>${esc(labelDate(row.date))}: ${esc(signed(row.value))}人</title></rect>`;
      svg += `<text class="value-label" x="${x + barW/2}" y="${row.value >= 0 ? Math.max(14,y-7) : Math.min(height-18,y+h+15)}" text-anchor="middle">${esc(signed(row.value))}</text>`;
      svg += `<text class="axis-label" x="${x + barW/2}" y="${height-8}" text-anchor="middle">${esc(labelDate(row.date))}</text>`;
    });
    target.innerHTML = svg + "</svg>";
  }

  function renderTotalChart(rows) {
    const target = $("#followerTotalChart");
    if (!target) return;
    if (!rows.length) {
      target.innerHTML = '<div class="chart-empty">記録データがありません。</div>';
      return;
    }
    const width = 900, height = 210, pad = {l:48,r:18,t:20,b:32};
    const values = rows.map(row => finite(row.followerCount)).filter(v => v !== null);
    const minValue = Math.min(...values), maxValue = Math.max(...values);
    const padding = Math.max(1, Math.ceil((maxValue - minValue) * .25));
    const low = minValue - padding, high = maxValue + padding;
    const usableW = width-pad.l-pad.r, usableH = height-pad.t-pad.b;
    const xAt = index => pad.l + (rows.length === 1 ? usableW/2 : index * usableW/(rows.length-1));
    const yAt = value => pad.t + (high-value)/Math.max(1,high-low)*usableH;
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="フォロワー累計推移">`;
    [0,.5,1].forEach(t => {
      const value = Math.round(high - t*(high-low));
      const y = pad.t + t*usableH;
      svg += `<line class="grid-line" x1="${pad.l}" y1="${y}" x2="${width-pad.r}" y2="${y}"></line><text class="axis-label" x="${pad.l-8}" y="${y+4}" text-anchor="end">${esc(fmt.format(value))}</text>`;
    });
    const points = rows.map((row,index) => `${xAt(index)},${yAt(finite(row.followerCount))}`).join(" ");
    svg += `<polyline class="follower-total-line" points="${points}"></polyline>`;
    rows.forEach((row,index) => {
      const x = xAt(index), y = yAt(finite(row.followerCount));
      svg += `<circle class="follower-total-dot" cx="${x}" cy="${y}" r="4"><title>${esc(labelDate(rawDate(row)))}: ${esc(fmt.format(finite(row.followerCount)))}人</title></circle>`;
      svg += `<text class="axis-label" x="${x}" y="${height-7}" text-anchor="middle">${esc(labelDate(rawDate(row)))}</text>`;
    });
    target.innerHTML = svg + "</svg>";
  }

  function renderPeriods(rows) {
    const target = $("#followerPeriodCompare");
    if (!target) return;
    const previous = rows.length >= 2 ? finite(rows.at(-1).followerCount) - finite(rows.at(-2).followerCount) : null;
    const week = continuousDelta(rows, 7);
    const month = continuousDelta(rows, 30);
    const cell = (label, value, note) => `<div><span>${esc(label)}</span><strong class="${value === null ? "" : "ready"}">${value === null ? "記録中" : `${esc(signed(value))} 人`}</strong><small>${esc(note)}</small></div>`;
    target.innerHTML =
      cell("前回取得から", previous, previous === null ? "2回分の記録で表示" : `${labelDate(rawDate(rows.at(-2)))} → ${labelDate(rawDate(rows.at(-1)))}`) +
      cell("直近7日間", week, week === null ? "連続8回分の記録で表示" : "7日前の取得値との差") +
      cell("直近30日間", month, month === null ? "連続31回分の記録で表示" : "30日前の取得値との差");
  }

  function renderFollowingDiff(rows) {
    const target = $("#followingDiff");
    if (!target) return;
    const usable = rows.filter(row => finite(row.followingCount) !== null);
    if (usable.length < 2) {
      target.textContent = "記録中";
      return;
    }
    target.textContent = `${signed(finite(usable.at(-1).followingCount) - finite(usable.at(-2).followingCount))} 人`;
  }

  function renderConnection(data) {
    const rows = sortedRows(data);
    renderDeltaChart(rows);
    renderPeriods(rows);
    renderTotalChart(rows);
    renderFollowingDiff(rows);
  }

  const original = window.NotePulseCharts?.render;
  if (window.NotePulseCharts && typeof original === "function") {
    window.NotePulseCharts.render = data => {
      original(data);
      renderConnection(data);
    };
  }
  if (window.notePulseData) renderConnection(window.notePulseData);
})();
