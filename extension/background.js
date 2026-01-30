importScripts('shared.js');

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

  // Check for changes (only tracked fields)
  const config = await getConfig();
  const hasChanged = detectChange(prevState, data, config);

  if (hasChanged) {
    console.log('[bg] Change detected!');
    const report = buildReport('변동', data, prevState, config);
    await sendTelegram(report);
    await chrome.storage.local.set({ lastAlert: new Date().toISOString() });
  } else {
    console.log('[bg] No change.');
  }
}

// ─── Detect change ────────────────────────────────────────
function detectChange(prev, curr, config) {
  if (!prev) return true;
  const trackMap = [
    { key: 'session',      track: 'trackSession' },
    { key: 'weeklyAll',    track: 'trackWeeklyAll' },
    { key: 'weeklySonnet', track: 'trackWeeklySonnet' },
  ];
  for (const { key, track } of trackMap) {
    if (config && !config[track]) continue;
    if (prev[key] !== curr[key]) return true;
  }
  return false;
}

// ─── Report uses shared buildReport() from shared.js ──────
// buildReport() is loaded via importScripts or defined in shared.js

// ─── Send current state as report ─────────────────────────
async function sendCurrentReport() {
  const config = await getConfig();
  if (!config.botToken) return { ok: false, error: 'Bot Token이 비어있습니다. 팝업에서 설정하세요.' };
  if (!config.chatId) return { ok: false, error: 'Chat ID가 비어있습니다. 팝업에서 설정하세요.' };

  const { prevState, prevPrevState } = await chrome.storage.local.get(['prevState', 'prevPrevState']);
  if (!prevState) return { ok: false, error: '저장된 데이터가 없습니다. "지금 체크" 버튼을 먼저 눌러주세요.' };

  const report = buildReport('현황', prevState, prevPrevState, config);
  const result = await sendTelegram(report);
  if (result?.ok) return { ok: true };
  return { ok: false, error: result?.error || 'Telegram 전송 실패' };
}

// shared.js functions are imported at the top via importScripts

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
    session: data.session || null,
    weeklyAll: data.weeklyAll || null,
    weeklySonnet: data.weeklySonnet || null,
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
