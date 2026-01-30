const ALARM_NAME = 'claude-usage-check';
const DEFAULT_INTERVAL = 5;

// ─── Alarm Setup ──────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  const { interval } = await chrome.storage.sync.get('interval');
  const min = interval || DEFAULT_INTERVAL;
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: min });
  console.log('[bg] Alarm set:', min, 'min interval');
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    console.log('[bg] Alarm fired, checking usage...');
    checkUsage();
  }
});

// ─── Message handler (single async wrapper) ───────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender)
    .then(sendResponse)
    .catch(e => sendResponse({ ok: false, error: `내부 에러: ${e.message}` }));
  return true;
});

async function handleMessage(msg, sender) {
  switch (msg.type) {
    case 'USAGE_DATA':
      await handleUsageData(msg.data, sender.tab?.id);
      return { ok: true };
    case 'CHECK_NOW':
      await checkUsage();
      return { ok: true };
    case 'GET_STATUS':
      return await getStatus();
    case 'SEND_REPORT':
      return await sendCurrentReport();
    case 'CONFIG_UPDATED':
      await updateAlarm(msg.config.interval);
      return { ok: true };
    default:
      return { ok: false, error: `알 수 없는 메시지 타입: ${msg.type}` };
  }
}

// ─── Update alarm interval ───────────────────────────────
async function updateAlarm(minutes) {
  const min = minutes || DEFAULT_INTERVAL;
  await chrome.alarms.clear(ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: min });
  console.log('[bg] Alarm updated:', min, 'min');
}

// ─── Check Usage ──────────────────────────────────────────
async function checkUsage() {
  const config = await getConfig();
  if (!config.botToken || !config.chatId) {
    console.warn('[bg] Telegram not configured.');
    return;
  }

  try {
    const tab = await chrome.tabs.create({
      url: 'https://claude.ai/settings/usage',
      active: false,
    });
    console.log('[bg] Opened tab:', tab.id);
    setTimeout(async () => {
      try { await chrome.tabs.remove(tab.id); } catch (e) {}
    }, 30000);
  } catch (e) {
    console.error('[bg] Failed to open tab:', e);
  }
}

// ─── Handle scraped data ──────────────────────────────────
async function handleUsageData(data, tabId) {
  console.log('[bg] Received usage data:', data);

  if (tabId) {
    try { await chrome.tabs.remove(tabId); } catch (e) {}
  }

  const { prevState } = await chrome.storage.local.get('prevState');

  // Save states
  await chrome.storage.local.set({
    prevPrevState: prevState || null,
    prevState: data,
    lastCheck: new Date().toISOString(),
  });
  await appendHistory(data);

  // Check for changes
  const hasChanged = detectChange(prevState, data);

  if (hasChanged) {
    console.log('[bg] Change detected!');
    const report = buildReport('변동', data, prevState);
    await sendTelegram(report);
    await chrome.storage.local.set({ lastAlert: new Date().toISOString() });
  } else {
    console.log('[bg] No change.');
  }
}

// ─── Detect change ────────────────────────────────────────
function detectChange(prev, curr) {
  if (!prev) return true;
  const keys = ['session', 'all', 'sonnet'];
  for (const k of keys) {
    if (findUsage(prev, k) !== findUsage(curr, k)) return true;
  }
  return false;
}

// ─── Shared report builder ────────────────────────────────
function buildReport(title, currentState, previousState) {
  const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  let msg = `📊 <b>Claude AI Usage ${title}</b>\n${now}\n\n`;

  const lines = [
    { label: 'session',        keyword: 'session' },
    { label: 'weekly-all',     keyword: 'all' },
    { label: 'weekly-sonnet',  keyword: 'sonnet' },
  ];

  for (const { label, keyword } of lines) {
    const cur = findUsage(currentState, keyword);
    const prev = previousState ? findUsage(previousState, keyword) : null;
    msg += formatLine(label, cur, prev);
  }

  return msg.trimEnd();
}

// ─── Send current state as report ─────────────────────────
async function sendCurrentReport() {
  const config = await getConfig();
  if (!config.botToken) return { ok: false, error: 'Bot Token이 비어있습니다. 팝업에서 설정하세요.' };
  if (!config.chatId) return { ok: false, error: 'Chat ID가 비어있습니다. 팝업에서 설정하세요.' };

  const { prevState, prevPrevState } = await chrome.storage.local.get(['prevState', 'prevPrevState']);
  if (!prevState) return { ok: false, error: '저장된 데이터가 없습니다. "지금 체크" 버튼을 먼저 눌러주세요.' };

  const report = buildReport('현황', prevState, prevPrevState);
  const result = await sendTelegram(report);
  if (result?.ok) return { ok: true };
  return { ok: false, error: result?.error || 'Telegram 전송 실패' };
}

// ─── Helpers ──────────────────────────────────────────────
function findUsage(state, keyword) {
  if (!state) return null;
  if (state.models) {
    for (const [key, val] of Object.entries(state.models)) {
      if (key.toLowerCase().includes(keyword)) return val.usage;
    }
  }
  if (keyword === 'session' && state.session) return state.session.usage;
  return null;
}

function formatLine(label, current, previous) {
  const cur = current || '0%';
  if (previous && previous !== current) {
    const curNum = parseFloat(cur);
    const prevNum = parseFloat(previous);
    const d = curNum - prevNum;
    const sign = d > 0 ? '+' : '';
    if (!isNaN(d)) {
      return `${label}: ${previous} → <b>${cur}</b> (${sign}${d})\n`;
    }
    return `${label}: ${previous} → <b>${cur}</b>\n`;
  }
  return `${label}: <b>${cur}</b>\n`;
}

// ─── Telegram ─────────────────────────────────────────────
async function sendTelegram(text) {
  const config = await getConfig();
  if (!config.botToken) return { ok: false, error: 'Bot Token 없음' };
  if (!config.chatId) return { ok: false, error: 'Chat ID 없음' };

  const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      console.log('[bg] Telegram: sent');
      return { ok: true };
    } else {
      console.error('[bg] Telegram failed:', data.description);
      return { ok: false, error: `Telegram API: ${data.description}` };
    }
  } catch (e) {
    console.error('[bg] Telegram error:', e);
    return { ok: false, error: `네트워크 에러: ${e.message}` };
  }
}

// ─── History ──────────────────────────────────────────────
async function appendHistory(data) {
  const { history = [] } = await chrome.storage.local.get('history');

  history.push({
    timestamp: data.timestamp || new Date().toISOString(),
    models: data.models || {},
    overallUsage: data.overallUsage || null,
    session: data.session || null,
  });

  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const trimmed = history.filter(h => new Date(h.timestamp).getTime() > cutoff);
  await chrome.storage.local.set({ history: trimmed });
}

// ─── Config ───────────────────────────────────────────────
async function getConfig() {
  const data = await chrome.storage.sync.get([
    'botToken', 'chatId', 'interval',
    'trackSession', 'trackWeeklyAll', 'trackWeeklySonnet',
  ]);
  return {
    botToken: data.botToken || '',
    chatId: data.chatId || '',
    interval: data.interval || DEFAULT_INTERVAL,
    trackSession: data.trackSession ?? false,
    trackWeeklyAll: data.trackWeeklyAll ?? true,
    trackWeeklySonnet: data.trackWeeklySonnet ?? false,
  };
}

async function getStatus() {
  const { prevState, lastCheck, lastAlert } = await chrome.storage.local.get([
    'prevState', 'lastCheck', 'lastAlert',
  ]);
  const config = await getConfig();
  return {
    configured: !!(config.botToken && config.chatId),
    interval: config.interval,
    lastCheck,
    lastAlert,
    prevState,
  };
}
