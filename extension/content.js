// Content script — runs on claude.ai/settings/usage
// Extracts usage data and sends to background.

(async () => {
  console.log('[content] Claude Usage Monitor: page loaded');
  await waitForContent();

  const data = extractUsage();
  console.log('[content] Extracted:', JSON.stringify(data));

  if (!data.weeklyAll && !data.weeklySonnet && !data.session) {
    console.warn('[content] 파싱 실패: 사용량 데이터를 찾을 수 없음');
    chrome.runtime.sendMessage({ type: 'USAGE_DATA', data: { ...data, parseFailed: true } });
  } else {
    chrome.runtime.sendMessage({ type: 'USAGE_DATA', data });
  }
})();

function waitForContent() {
  return new Promise((resolve) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      const body = document.body?.innerText || '';
      if (body.includes('%') || attempts >= 30) {
        setTimeout(resolve, 3000);
        return;
      }
      setTimeout(check, 500);
    };
    check();
  });
}

function extractUsage() {
  const body = document.body.innerText;
  const data = {
    session: null,
    weeklyAll: null,
    weeklySonnet: null,
    addOnUsed: null,
    addOnPercent: null,
    addOnBalance: null,
    rawText: body.substring(0, 5000),
    timestamp: new Date().toISOString(),
  };

  // Strategy 1: Find labeled sections
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    const pct = findPercent(lines, i);

    // Session / Current
    if (line.match(/current\s*session|현재\s*세션/i) && pct) {
      data.session = pct;
    }
    // All Models
    if (line.match(/all\s*models|모든\s*모델/i) && pct) {
      data.weeklyAll = pct;
    }
    // Sonnet
    if (line.match(/sonnet/i) && !line.match(/all/i) && pct) {
      data.weeklySonnet = pct;
    }
  }

  // Strategy 2: Look for percentage elements in DOM with nearby labels
  if (!data.session || !data.weeklyAll) {
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      const text = el.textContent?.trim() || '';
      if (!text.match(/^\d+(\.\d+)?%$/) && !text.match(/^\d+(\.\d+)?\s*%$/)) continue;
      if (text.length > 10) continue;

      // Check parent/sibling for label
      const context = getContext(el);
      const ctxLower = context.toLowerCase();
      const pctVal = text.match(/(\d+(?:\.\d+)?)\s*%/)?.[0];
      if (!pctVal) continue;

      if (ctxLower.match(/current\s*session|현재\s*세션/) && !data.session) {
        data.session = pctVal;
      } else if (ctxLower.match(/all\s*models|모든\s*모델/) && !data.weeklyAll) {
        data.weeklyAll = pctVal;
      } else if (ctxLower.match(/sonnet/) && !ctxLower.match(/all/) && !data.weeklySonnet) {
        data.weeklySonnet = pctVal;
      }
    }
  }

  // ─── 추가 사용량 (Add-on Usage) 파싱 ───
  const addOnIdx = lines.findIndex(l => l.match(/추가\s*사용량/));
  if (addOnIdx !== -1) {
    for (let i = addOnIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      // "US$0.00 사용" 패턴 → 사용금액
      const usedMatch = line.match(/(US\$[\d,.]+)\s*사용/);
      if (usedMatch && !data.addOnUsed) {
        data.addOnUsed = usedMatch[1];
      }
      // "0% 사용" 패턴 → 퍼센티지
      const pctMatch = line.match(/(\d+(?:\.\d+)?)\s*%\s*사용/);
      if (pctMatch && !data.addOnPercent) {
        data.addOnPercent = pctMatch[1] + '%';
      }
      // "현재 잔액" 패턴 → 잔액
      if (line.match(/현재\s*잔액/)) {
        // 잔액은 이전 라인 또는 같은 라인에서 US$ 패턴 찾기
        for (let j = Math.max(addOnIdx, i - 3); j <= i; j++) {
          const balMatch = lines[j].match(/(US\$[\d,.]+)/);
          if (balMatch && balMatch[1] !== data.addOnUsed) {
            data.addOnBalance = balMatch[1];
            break;
          }
        }
      }
    }
  }

  // Strategy 3: Ordered percentages fallback
  // Claude usage page typically shows: session%, all-models%, sonnet%
  if (!data.session && !data.weeklyAll) {
    const allPcts = [...body.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map(m => m[0]);
    if (allPcts.length >= 3) {
      data.session = data.session || allPcts[0];
      data.weeklyAll = data.weeklyAll || allPcts[1];
      data.weeklySonnet = data.weeklySonnet || allPcts[2];
    } else if (allPcts.length === 2) {
      data.weeklyAll = data.weeklyAll || allPcts[0];
      data.weeklySonnet = data.weeklySonnet || allPcts[1];
    } else if (allPcts.length === 1) {
      data.weeklyAll = data.weeklyAll || allPcts[0];
    }
  }

  return data;
}

// Find percentage on current line or next line
function findPercent(lines, idx) {
  for (let j = idx; j < Math.min(idx + 3, lines.length); j++) {
    const match = lines[j].match(/(\d+(?:\.\d+)?)\s*%/);
    if (match) return match[0];
  }
  return null;
}

// Get text context around an element (parents + siblings)
function getContext(el) {
  const parts = [];
  let node = el;
  for (let depth = 0; depth < 5 && node; depth++) {
    node = node.parentElement;
    if (node) {
      const direct = [...node.childNodes]
        .filter(n => n.nodeType === 3)
        .map(n => n.textContent.trim())
        .join(' ');
      if (direct) parts.push(direct);
      // Also check previous siblings
      const prev = node.previousElementSibling;
      if (prev) parts.push(prev.textContent?.trim() || '');
    }
  }
  return parts.join(' ');
}
