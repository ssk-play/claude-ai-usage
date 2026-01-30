const FIELDS = ['botToken', 'chatId', 'interval', 'trackSession', 'trackWeeklyAll', 'trackWeeklySonnet'];
const DEFAULTS = { interval: 5, trackSession: false, trackWeeklyAll: true, trackWeeklySonnet: false };

// ─── Telegram toggle ──────────────────────────────────────
async function initTelegramToggle() {
  const { telegramVerified } = await chrome.storage.local.get('telegramVerified');
  const body = document.getElementById('telegramBody');
  const arrow = document.querySelector('.toggle-arrow');

  if (!telegramVerified) {
    // 아직 성공한 적 없으면 펼쳐놓기
    body.style.display = 'block';
    arrow.classList.add('open');
  }

  document.getElementById('telegramToggle').addEventListener('click', () => {
    const open = body.style.display === 'none';
    body.style.display = open ? 'block' : 'none';
    arrow.classList.toggle('open', open);
  });
}
initTelegramToggle();

// ─── Load config ──────────────────────────────────────────
chrome.storage.sync.get(FIELDS, (data) => {
  document.getElementById('botToken').value = data.botToken || '';
  document.getElementById('chatId').value = data.chatId || '';
  document.getElementById('interval').value = data.interval || DEFAULTS.interval;
  document.getElementById('trackSession').checked = data.trackSession ?? DEFAULTS.trackSession;
  document.getElementById('trackWeeklyAll').checked = data.trackWeeklyAll ?? DEFAULTS.trackWeeklyAll;
  document.getElementById('trackWeeklySonnet').checked = data.trackWeeklySonnet ?? DEFAULTS.trackWeeklySonnet;
});

// ─── Save config ──────────────────────────────────────────
document.getElementById('saveBtn').addEventListener('click', () => {
  const config = {
    botToken: document.getElementById('botToken').value.trim(),
    chatId: document.getElementById('chatId').value.trim(),
    interval: parseInt(document.getElementById('interval').value) || DEFAULTS.interval,
    trackSession: document.getElementById('trackSession').checked,
    trackWeeklyAll: document.getElementById('trackWeeklyAll').checked,
    trackWeeklySonnet: document.getElementById('trackWeeklySonnet').checked,
  };
  chrome.storage.sync.set(config, () => {
    // Update alarm in background
    chrome.runtime.sendMessage({ type: 'CONFIG_UPDATED', config }).catch(() => {});
    const status = document.getElementById('saveStatus');
    status.textContent = '✅ 저장됨';
    setTimeout(() => (status.textContent = ''), 2000);
  });
});

// ─── Check now (fire-and-forget, no response needed) ──────
document.getElementById('checkBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'CHECK_NOW' }).catch(() => {});
  const btn = document.getElementById('checkBtn');
  btn.textContent = '체크 중...';
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = '지금 체크';
    btn.disabled = false;
    refreshStatus();
  }, 12000);
});

// ─── Send report (popup handles directly, no service worker) ──
document.getElementById('reportBtn').addEventListener('click', async () => {
  const btn = document.getElementById('reportBtn');
  btn.textContent = '전송 중...';
  btn.disabled = true;

  try {
    // Read config directly from storage
    const config = await chrome.storage.sync.get(['botToken', 'chatId']);
    if (!config.botToken) throw new Error('Bot Token이 비어있습니다.');
    if (!config.chatId) throw new Error('Chat ID가 비어있습니다.');

    // Read last state directly from storage
    const { prevState } = await chrome.storage.local.get('prevState');
    if (!prevState) throw new Error('저장된 데이터 없음. "지금 체크"를 먼저 눌러주세요.');

    // Build report
    const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    let msg = `📊 <b>Claude AI Usage 현황</b>\n⏰ ${now}\n\n`;
    if (prevState.session) msg += `🔹 현재 세션: <b>${prevState.session.usage}</b>\n`;
    if (prevState.models) {
      for (const [model, data] of Object.entries(prevState.models)) {
        msg += `🔹 ${model}: <b>${data.usage}</b>\n`;
      }
    }
    if (prevState.overallUsage) msg += `\n전체: <b>${prevState.overallUsage}</b>`;
    if (prevState.resetInfo) msg += `\n리셋: ${prevState.resetInfo}`;

    // Send directly via Telegram API
    const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: msg,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    const result = await res.json();

    if (result.ok) {
      btn.textContent = '✅ 전송 완료';
      showToast('Telegram으로 리포트를 전송했습니다.');
      // 최초 성공 시 토글 접기
      const { telegramVerified } = await chrome.storage.local.get('telegramVerified');
      if (!telegramVerified) {
        await chrome.storage.local.set({ telegramVerified: true });
        document.getElementById('telegramBody').style.display = 'none';
        document.querySelector('.toggle-arrow').classList.remove('open');
      }
    } else {
      throw new Error(`Telegram API: ${result.description}`);
    }
  } catch (e) {
    btn.textContent = '❌ 실패';
    showToast(`전송 실패: ${e.message}`, true);
  }

  setTimeout(() => {
    btn.textContent = '📩 리포트 전송';
    btn.disabled = false;
  }, 3000);
});

// ─── Status (read storage directly) ───────────────────────
async function refreshStatus() {
  const config = await chrome.storage.sync.get(['botToken', 'chatId', 'interval']);
  const local = await chrome.storage.local.get(['prevState', 'lastCheck', 'lastAlert']);
  const el = document.getElementById('status');
  let html = '';

  if (!config.botToken || !config.chatId) {
    html += '<div class="status-warn">⚠️ Telegram 설정 필요</div>';
  }

  if (local.lastCheck) {
    const t = new Date(local.lastCheck).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    html += `<div>마지막 체크: ${t}</div>`;
  } else {
    html += '<div>아직 체크 안 됨</div>';
  }

  if (local.lastAlert) {
    const t = new Date(local.lastAlert).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    html += `<div>마지막 알림: ${t}</div>`;
  }

  html += `<div>체크 간격: ${config.interval || 5}분</div>`;

  if (local.prevState?.models && Object.keys(local.prevState.models).length > 0) {
    html += '<div style="margin-top:8px"><b>모델별 사용량:</b></div>';
    for (const [model, data] of Object.entries(local.prevState.models)) {
      html += `<div class="model-row"><span class="model-name">${model}</span><span class="model-usage">${data.usage}</span></div>`;
    }
  }

  if (local.prevState?.overallUsage) {
    html += `<div style="margin-top:4px">전체: <b>${local.prevState.overallUsage}</b></div>`;
  }

  el.innerHTML = html || '대기 중...';
}

function showToast(msg, isError = false) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = 'toast ' + (isError ? 'toast-error' : 'toast-ok');
  toast.style.display = 'block';
  setTimeout(() => (toast.style.display = 'none'), 4000);
}

refreshStatus();

// ─── Tabs ─────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    if (tab.dataset.tab === 'chart') refreshChart();
  });
});

// ─── Chart ────────────────────────────────────────────────
async function refreshChart() {
  const { history = [] } = await chrome.storage.local.get('history');
  const canvas = document.getElementById('usageChart');
  const legendEl = document.getElementById('chartLegend');
  const emptyEl = document.getElementById('chartEmpty');
  const days = parseInt(document.getElementById('chartRange').value);

  const legends = drawUsageChart(canvas, history, days);

  if (!legends) {
    canvas.style.display = 'none';
    legendEl.style.display = 'none';
    emptyEl.style.display = 'block';
    return;
  }

  canvas.style.display = 'block';
  emptyEl.style.display = 'none';

  legendEl.innerHTML = legends.map(l =>
    `<div class="legend-item"><span class="legend-dot" style="background:${l.color}"></span>${l.name}</div>`
  ).join('');
  legendEl.style.display = 'flex';
}

document.getElementById('chartRange').addEventListener('change', refreshChart);
