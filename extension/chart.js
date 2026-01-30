// Simple Canvas chart for usage history

const COLORS = [
  '#c96442', // primary
  '#4a90d9', // blue
  '#50b83c', // green
  '#9c6ade', // purple
  '#f5a623', // orange
];

function drawUsageChart(canvas, history, days) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const padding = { top: 20, right: 12, bottom: 40, left: 36 };
  const chartW = W - padding.left - padding.right;
  const chartH = H - padding.top - padding.bottom;

  ctx.clearRect(0, 0, W, H);

  if (!history || history.length === 0) return null;

  // Filter by date range
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const filtered = history.filter(h => new Date(h.timestamp).getTime() > cutoff);

  if (filtered.length === 0) return null;

  // Collect all series (model names)
  const seriesMap = {};
  for (const entry of filtered) {
    if (entry.models) {
      for (const name of Object.keys(entry.models)) {
        if (!seriesMap[name]) seriesMap[name] = [];
      }
    }
  }
  const seriesNames = Object.keys(seriesMap);

  // Build time series for each model
  for (const entry of filtered) {
    const t = new Date(entry.timestamp).getTime();
    for (const name of seriesNames) {
      const val = entry.models?.[name]?.usage;
      const num = val ? parseFloat(val) : null;
      seriesMap[name].push({ t, v: num });
    }
  }

  // If no model data, try overallUsage
  if (seriesNames.length === 0) {
    seriesMap['전체'] = filtered.map(e => ({
      t: new Date(e.timestamp).getTime(),
      v: e.overallUsage ? parseFloat(e.overallUsage) : null,
    }));
    seriesNames.push('전체');
  }

  // Find ranges
  const allTimes = filtered.map(e => new Date(e.timestamp).getTime());
  const tMin = Math.min(...allTimes);
  const tMax = Math.max(...allTimes);
  const tRange = tMax - tMin || 1;

  let vMax = 0;
  for (const pts of Object.values(seriesMap)) {
    for (const p of pts) {
      if (p.v != null && p.v > vMax) vMax = p.v;
    }
  }
  vMax = Math.max(vMax, 5); // Minimum 5%
  vMax = Math.ceil(vMax / 5) * 5; // Round up to 5

  // ─── Draw grid ────────────────────────────────────────
  ctx.strokeStyle = '#e8e8e8';
  ctx.lineWidth = 1;
  ctx.font = '10px -apple-system, sans-serif';
  ctx.fillStyle = '#999';
  ctx.textAlign = 'right';

  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const y = padding.top + chartH - (i / gridLines) * chartH;
    const val = Math.round((i / gridLines) * vMax);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(W - padding.right, y);
    ctx.stroke();
    ctx.fillText(`${val}%`, padding.left - 4, y + 3);
  }

  // ─── Draw time labels ────────────────────────────────
  ctx.textAlign = 'center';
  ctx.fillStyle = '#999';
  const labelCount = Math.min(days <= 1 ? 6 : days <= 3 ? 6 : 7, filtered.length);
  for (let i = 0; i < labelCount; i++) {
    const t = tMin + (i / (labelCount - 1)) * tRange;
    const x = padding.left + (i / (labelCount - 1)) * chartW;
    const d = new Date(t);
    let label;
    if (days <= 1) {
      label = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    } else {
      label = `${d.getMonth() + 1}/${d.getDate()}`;
    }
    ctx.fillText(label, x, H - padding.bottom + 16);
  }

  // ─── Draw lines ──────────────────────────────────────
  const legends = [];
  seriesNames.forEach((name, si) => {
    const pts = seriesMap[name].filter(p => p.v != null);
    if (pts.length === 0) return;

    const color = COLORS[si % COLORS.length];
    legends.push({ name, color });

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();

    pts.forEach((p, i) => {
      const x = padding.left + ((p.t - tMin) / tRange) * chartW;
      const y = padding.top + chartH - (p.v / vMax) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw dots
    ctx.fillStyle = color;
    for (const p of pts) {
      const x = padding.left + ((p.t - tMin) / tRange) * chartW;
      const y = padding.top + chartH - (p.v / vMax) * chartH;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  return legends;
}
