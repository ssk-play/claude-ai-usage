const FIELDS = ['botToken', 'chatId', 'interval', 'reporterName', 'trackSession', 'trackWeeklyAll', 'trackWeeklySonnet', 'trackAddOn', 'forceNotifyEnabled'];
const DEFAULTS = { interval: 5, reporterName: '', trackSession: false, trackWeeklyAll: true, trackWeeklySonnet: false, trackAddOn: false, forceNotifyEnabled: false };

// ─── Init: show settings tab first if not configured ──────
(async () => {
  const config = await chrome.storage.sync.get(['botToken', 'chatId']);
  if (!config.botToken || !config.chatId) {
    switchTab('settings');
  } else {
    refreshChart();
  }
})();

// ─── Tabs ─────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    switchTab(tab.dataset.tab);
  });
});

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${name}`));
  if (name === 'status') refreshChart();
}

// ─── Load config ──────────────────────────────────────────
chrome.storage.sync.get(FIELDS, (data) => {
  document.getElementById('botToken').value = data.botToken || '';
  document.getElementById('chatId').value = data.chatId || '';
  document.getElementById('reporterName').value = data.reporterName || DEFAULTS.reporterName;
  document.getElementById('interval').value = data.interval || DEFAULTS.interval;
  document.getElementById('trackSession').checked = data.trackSession ?? DEFAULTS.trackSession;
  document.getElementById('trackWeeklyAll').checked = data.trackWeeklyAll ?? DEFAULTS.trackWeeklyAll;
  document.getElementById('trackWeeklySonnet').checked = data.trackWeeklySonnet ?? DEFAULTS.trackWeeklySonnet;
  document.getElementById('trackAddOn').checked = data.trackAddOn ?? DEFAULTS.trackAddOn;
  document.getElementById('forceNotifyEnabled').checked = data.forceNotifyEnabled ?? DEFAULTS.forceNotifyEnabled;

  // Show current Chat ID status if configured
  if (data.chatId) {
    const statusEl = document.getElementById('telegramStatus');
    statusEl.textContent = `✅ Chat ID 설정됨: ${data.chatId}`;
    statusEl.className = 'help-text success';
  }
});

// ─── Reset Token ──────────────────────────────────────────
document.getElementById('resetTokenBtn').addEventListener('click', async () => {
  const telegramStatus = document.getElementById('telegramStatus');

  if (!confirm('Bot Token과 Chat ID를 초기화하시겠습니까?')) {
    return;
  }

  await chrome.storage.sync.set({ botToken: '', chatId: '' });
  document.getElementById('botToken').value = '';
  document.getElementById('chatId').value = '';
  telegramStatus.textContent = '🔄 초기화되었습니다.';
  telegramStatus.className = 'help-text';

  setTimeout(() => {
    telegramStatus.textContent = '';
  }, 2000);
});

// ─── Auto-save helpers ────────────────────────────────────
let debounceTimer = null;
function debounce(fn, ms) {
  return (...args) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fn(...args), ms);
  };
}

function autoSaveConfig() {
  const config = {
    botToken: document.getElementById('botToken').value.trim(),
    chatId: document.getElementById('chatId').value.trim(),
    reporterName: document.getElementById('reporterName').value.trim(),
    interval: parseInt(document.getElementById('interval').value) || DEFAULTS.interval,
    trackSession: document.getElementById('trackSession').checked,
    trackWeeklyAll: document.getElementById('trackWeeklyAll').checked,
    trackWeeklySonnet: document.getElementById('trackWeeklySonnet').checked,
    trackAddOn: document.getElementById('trackAddOn').checked,
    forceNotifyEnabled: document.getElementById('forceNotifyEnabled').checked,
  };
  chrome.storage.sync.set(config, () => {
    chrome.runtime.sendMessage({ type: 'CONFIG_UPDATED', config }).catch(() => {});
  });
}

const debouncedAutoSave = debounce(autoSaveConfig, 500);

// General fields: debounced auto-save on input/change
['interval', 'reporterName'].forEach(id => {
  document.getElementById(id).addEventListener('input', debouncedAutoSave);
});
['trackSession', 'trackWeeklyAll', 'trackWeeklySonnet', 'trackAddOn', 'forceNotifyEnabled'].forEach(id => {
  document.getElementById(id).addEventListener('change', debouncedAutoSave);
});

// Chat ID: auto-save on change
document.getElementById('chatId').addEventListener('change', autoSaveConfig);

// ─── Verify Token ─────────────────────────────────────────
document.getElementById('verifyTokenBtn').addEventListener('click', async () => {
  const btn = document.getElementById('verifyTokenBtn');
  const telegramStatus = document.getElementById('telegramStatus');
  const botToken = document.getElementById('botToken').value.trim();

  if (!botToken) {
    telegramStatus.textContent = '⚠️ Bot Token을 입력하세요.';
    telegramStatus.className = 'help-text error';
    return;
  }

  btn.textContent = '…';
  btn.disabled = true;
  telegramStatus.textContent = '토큰 확인 중...';
  telegramStatus.className = 'help-text';

  try {
    const url = `https://api.telegram.org/bot${botToken}/getUpdates`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.ok) {
      throw new Error(`Bot Token이 유효하지 않습니다: ${data.description}`);
    }

    // 수동 입력된 Chat ID 우선 사용
    let chatId = document.getElementById('chatId').value.trim();

    // 수동 입력이 없을 때만 자동 추출 시도
    if (!chatId) {
      if (data.result && data.result.length > 0) {
        const latestMessage = data.result[data.result.length - 1];
        const newChatId = latestMessage.message?.chat?.id || latestMessage.my_chat_member?.chat?.id;
        if (newChatId) {
          chatId = String(newChatId);
          document.getElementById('chatId').value = chatId;
        }
      }

      // 기존 저장된 값 fallback
      if (!chatId) {
        const currentConfig = await chrome.storage.sync.get(['chatId']);
        chatId = currentConfig.chatId || '';
      }
    }

    // 토큰 + chatId 저장
    autoSaveConfig();

    if (!chatId) {
      telegramStatus.textContent = '✅ 토큰 유효. 💬 Chat ID를 입력하거나 봇에게 메시지를 보낸 후 다시 검증하세요.';
      telegramStatus.className = 'help-text info';
    } else {
      telegramStatus.textContent = `✅ 토큰 유효 · Chat ID: ${chatId}`;
      telegramStatus.className = 'help-text success';
    }
  } catch (e) {
    telegramStatus.textContent = `❌ ${e.message}`;
    telegramStatus.className = 'help-text error';
  } finally {
    btn.textContent = '✔';
    btn.disabled = false;
  }
});


// ─── Send report (extracted) ──────────────────────────────
async function sendReport() {
  const config = await chrome.storage.sync.get(['botToken', 'chatId']);
  if (!config.botToken) throw new Error('Bot Token이 비어있습니다.');
  if (!config.chatId) throw new Error('Chat ID가 비어있습니다.');

  const { prevState } = await chrome.storage.local.get('prevState');
  if (!prevState) throw new Error('저장된 데이터 없음.');

  const { prevPrevState } = await chrome.storage.local.get('prevPrevState');
  const trackConfig = await chrome.storage.sync.get(['reporterName', 'trackSession', 'trackWeeklyAll', 'trackWeeklySonnet', 'trackAddOn']);
  const msg = buildReport('현황', prevState, prevPrevState, {
    reporterName: trackConfig.reporterName || '',
    trackSession: trackConfig.trackSession ?? false,
    trackWeeklyAll: trackConfig.trackWeeklyAll ?? true,
    trackWeeklySonnet: trackConfig.trackWeeklySonnet ?? false,
    trackAddOn: trackConfig.trackAddOn ?? false,
  });

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

  if (!result.ok) {
    throw new Error(`Telegram API: ${result.description}`);
  }

  // 최초 성공 시 상태 탭으로 전환
  const { telegramVerified } = await chrome.storage.local.get('telegramVerified');
  if (!telegramVerified) {
    await chrome.storage.local.set({ telegramVerified: true });
    switchTab('status');
  }
}

// ─── Report button (check → send) ────────────────────────
let pendingReport = false;
let reportTimeout = null;

document.getElementById('reportBtn').addEventListener('click', () => {
  const btn = document.getElementById('reportBtn');
  btn.textContent = '체크 중...';
  btn.disabled = true;
  pendingReport = true;

  chrome.runtime.sendMessage({ type: 'CHECK_NOW' }).catch(() => {});

  // Clear previous timeout
  if (reportTimeout) clearTimeout(reportTimeout);

  // Fallback timeout (20 seconds)
  reportTimeout = setTimeout(() => {
    pendingReport = false;
    btn.textContent = '📩 리포트';
    btn.disabled = false;
    refreshStatus();
    refreshChart();
  }, 20000);
});

// Listen for storage changes to refresh status
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;

  if (changes.lastCheck || changes.pageUnavailable || changes.prevState) {
    refreshStatus();
  }

  if (changes.lastCheck) {
    refreshChart();

    if (pendingReport) {
      pendingReport = false;
      if (reportTimeout) clearTimeout(reportTimeout);

      const btn = document.getElementById('reportBtn');
      btn.textContent = '전송 중...';

      sendReport()
        .then(() => {
          btn.textContent = '✅ 완료';
          showToast('Telegram으로 리포트를 전송했습니다.');
        })
        .catch((e) => {
          btn.textContent = '❌ 실패';
          showToast(`전송 실패: ${e.message}`, true);
        })
        .finally(() => {
          setTimeout(() => {
            btn.textContent = '📩 리포트';
            btn.disabled = false;
          }, 3000);
        });
    }
  }
});

// ─── Status ───────────────────────────────────────────────
async function refreshStatus() {
  const config = await chrome.storage.sync.get(['botToken', 'chatId', 'interval']);
  const local = await chrome.storage.local.get(['prevState', 'lastCheck', 'lastAlert', 'pageUnavailable']);
  const el = document.getElementById('status');
  let html = '';

  if (!config.botToken || !config.chatId) {
    html += '<div class="status-warn">⚠️ Telegram 설정 필요 → 설정 탭</div>';
  }

  if (local.pageUnavailable) {
    html += '<div class="status-warn">⚠️ 페이지를 확인해주세요. (로그인/오류)</div>';
  } else if (local.lastCheck) {
    const t = new Date(local.lastCheck).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    html += `<div>마지막 체크: ${t}</div>`;
  } else {
    html += '<div>아직 체크한 적 없음</div>';
  }

  if (local.lastAlert) {
    const t = new Date(local.lastAlert).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    html += `<div>마지막 알림: ${t}</div>`;
  }

  html += `<div>체크 간격: ${config.interval || 5}분</div>`;

  const st = local.prevState;
  if (st?.session || st?.weeklyAll || st?.weeklySonnet) {
    html += '<div style="margin-top:8px"><b>사용량:</b></div>';
    if (st.session) html += `<div class="model-row"><span class="model-name">session</span><span class="model-usage">${st.session}</span></div>`;
    if (st.weeklyAll) html += `<div class="model-row"><span class="model-name">weekly-all</span><span class="model-usage">${st.weeklyAll}</span></div>`;
    if (st.weeklySonnet != null) html += `<div class="model-row"><span class="model-name">weekly-sonnet</span><span class="model-usage">${st.weeklySonnet}</span></div>`;
  }

  if (st?.addOnEnabled || st?.addOnUsed || st?.addOnPercent || st?.addOnBalance) {
    html += `<div style="margin-top:8px"><b>추가 사용량: ${st.addOnEnabled || '-'}</b></div>`;
    if (st.addOnUsed) html += `<div class="model-row"><span class="model-name">사용금액</span><span class="model-usage">${st.addOnUsed} (${st.addOnPercent || '-'})</span></div>`;
    if (st.addOnBalance) html += `<div class="model-row"><span class="model-name">잔액</span><span class="model-usage">${st.addOnBalance}</span></div>`;
  }

  el.innerHTML = html || '대기 중...';
}

// ─── Chart ────────────────────────────────────────────────
async function refreshChart() {
  const { history = [] } = await chrome.storage.local.get('history');
  const canvas = document.getElementById('usageChart');
  const legendEl = document.getElementById('chartLegend');
  const emptyEl = document.getElementById('chartEmpty');
  const days = parseInt(document.getElementById('chartRange').value);
  const tc = await chrome.storage.sync.get(['trackSession', 'trackWeeklyAll', 'trackWeeklySonnet']);
  const trackConfig = {
    trackSession: tc.trackSession ?? false,
    trackWeeklyAll: tc.trackWeeklyAll ?? true,
    trackWeeklySonnet: tc.trackWeeklySonnet ?? false,
  };

  const legends = drawUsageChart(canvas, history, days, trackConfig);

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

// ─── Toast ────────────────────────────────────────────────
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
