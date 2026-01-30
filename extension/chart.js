// Simple Canvas chart for usage history

const SERIES_CONFIG = [
  { key: 'session',       label: 'session',       color: '#c96442' },
  { key: 'weeklyAll',     label: 'weekly-all',     color: '#4a90d9' },
  { key: 'weeklySonnet',  label: 'weekly-sonnet',  color: '#50b83c' },
];

function drawUsageChart(canvas, history, days) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const pad = { top: 20, right: 12, bottom: 40, left: 36 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;

  ctx.clearRect(0, 0, W, H);

  if (!history || history.length === 0) return null;

  // Filter by date range
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const filtered = history.filter(h => new Date(h.timestamp).getTime() > cutoff);
  if (filtered.length === 0) return null;

  // Build series
  const series = {};
  for (const cfg of SERIES_CONFIG) {
    const pts = [];
    for (const entry of filtered) {
      const val = entry[cfg.key];
      const num = val ? parseFloat(val) : null;
      if (num != null) {
        pts.push({ t: new Date(entry.timestamp).getTime(), v: num });
      }
    }
    if (pts.length > 0) series[cfg.key] = pts;
  }

  if (Object.keys(series).length === 0) return null;

  // Ranges
  const allTimes = filtered.map(e => new Date(e.timestamp).getTime());
  const tMin = Math.min(...allTimes);
  const tMax = Math.max(...allTimes);
  const tRange = tMax - tMin || 1;

  let vMax = 0;
  for (const pts of Object.values(series)) {
    for (const p of pts) {
      if (p.v > vMax) vMax = p.v;
    }
  }
  vMax = Math.max(vMax, 5);
  vMax = Math.ceil(vMax / 5) * 5;

  // Grid
  ctx.strokeStyle = '#e8e8e8';
  ctx.lineWidth = 1;
  ctx.font = '10px -apple-system, sans-serif';
  ctx.fillStyle = '#999';
  ctx.textAlign = 'right';

  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const y = pad.top + chartH - (i / gridLines) * chartH;
    const val = Math.round((i / gridLines) * vMax);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(W - pad.right, y);
    ctx.stroke();
    ctx.fillText(`${val}%`, pad.left - 4, y + 3);
  }

  // Time labels
  ctx.textAlign = 'center';
  ctx.fillStyle = '#999';
  const labelCount = Math.min(days <= 1 ? 6 : days <= 3 ? 6 : 7, filtered.length);
  for (let i = 0; i < labelCount; i++) {
    const t = tMin + (i / (labelCount - 1)) * tRange;
    const x = pad.left + (i / (labelCount - 1)) * chartW;
    const d = new Date(t);
    const label = days <= 1
      ? `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
      : `${d.getMonth() + 1}/${d.getDate()}`;
    ctx.fillText(label, x, H - pad.bottom + 16);
  }

  // Lines
  const legends = [];
  for (const cfg of SERIES_CONFIG) {
    const pts = series[cfg.key];
    if (!pts) continue;

    legends.push({ name: cfg.label, color: cfg.color });

    ctx.strokeStyle = cfg.color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();

    pts.forEach((p, i) => {
      const x = pad.left + ((p.t - tMin) / tRange) * chartW;
      const y = pad.top + chartH - (p.v / vMax) * chartH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Dots
    ctx.fillStyle = cfg.color;
    for (const p of pts) {
      const x = pad.left + ((p.t - tMin) / tRange) * chartW;
      const y = pad.top + chartH - (p.v / vMax) * chartH;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return legends;
}
