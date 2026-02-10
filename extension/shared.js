// ─── Shared report format (used by background.js and popup.js) ───

function buildReport(title, currentState, previousState, trackConfig) {
  const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  const name = trackConfig?.reporterName ? ` [${trackConfig.reporterName}]` : '';
  let msg = `Claude AI Usage ${title}${name}\n${now}\n\n`;

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

  // 추가 사용량
  if (trackConfig?.trackAddOn) {
    const addOnLines = [
      { label: 'add-on-used',    key: 'addOnUsed' },
      { label: 'add-on-percent', key: 'addOnPercent' },
      { label: 'add-on-balance', key: 'addOnBalance' },
    ];
    msg += '\n';
    for (const { label, key } of addOnLines) {
      const cur = currentState?.[key] || null;
      const prev = previousState?.[key] || null;
      msg += _formatLine(label, cur, prev);
    }
  }

  return msg.trimEnd();
}

function _formatLine(label, current, previous) {
  const cur = current || '-';
  if (previous && previous !== current) {
    const curNum = parseFloat(cur.replace(/[^0-9.]/g, ''));
    const prevNum = parseFloat(previous.replace(/[^0-9.]/g, ''));
    const d = curNum - prevNum;
    const sign = d > 0 ? '+' : '';
    if (!isNaN(d)) {
      return `${label}: ${previous} -> ${cur} (${sign}${d})\n`;
    }
    return `${label}: ${previous} -> ${cur}\n`;
  }
  return `${label}: ${cur}\n`;
}
