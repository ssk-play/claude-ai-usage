// ─── Shared report format (used by background.js and popup.js) ───

function buildReport(title, currentState, previousState, trackConfig) {
  const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  let msg = `Claude AI Usage ${title}\n${now}\n\n`;

  const lines = [
    { label: 'session',       key: 'session',       track: 'trackSession' },
    { label: 'weekly-all',    key: 'weeklyAll',      track: 'trackWeeklyAll' },
    { label: 'weekly-sonnet', key: 'weeklySonnet',   track: 'trackWeeklySonnet' },
  ];

  for (const { label, key, track } of lines) {
    if (trackConfig && !trackConfig[track]) continue;
    const cur = currentState?.[key] || null;
    const prev = previousState?.[key] || null;
    msg += _formatLine(label, cur, prev);
  }

  return msg.trimEnd();
}

function _formatLine(label, current, previous) {
  const cur = current || '0%';
  if (previous && previous !== current) {
    const curNum = parseFloat(cur);
    const prevNum = parseFloat(previous);
    const d = curNum - prevNum;
    const sign = d > 0 ? '+' : '';
    if (!isNaN(d)) {
      return `${label}: ${previous} -> ${cur} (${sign}${d})\n`;
    }
    return `${label}: ${previous} -> ${cur}\n`;
  }
  return `${label}: ${cur}\n`;
}
