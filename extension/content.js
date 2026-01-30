// Content script — runs on claude.ai/settings/usage
// Waits for usage data to load, extracts it, sends to background.

(async () => {
  console.log('[content] Claude Usage Monitor: page loaded');

  // Wait for dynamic content to render (React SPA)
  await waitForContent();

  const data = extractUsage();
  console.log('[content] Extracted:', data);

  chrome.runtime.sendMessage({ type: 'USAGE_DATA', data });
})();

function waitForContent() {
  return new Promise((resolve) => {
    let attempts = 0;
    const maxAttempts = 30; // 15 seconds max

    const check = () => {
      attempts++;
      const body = document.body?.innerText || '';

      // Look for signs that the page has loaded usage data
      if (body.includes('%') || body.includes('usage') || body.includes('Usage') || attempts >= maxAttempts) {
        setTimeout(resolve, 2000); // Extra 2s for any final renders
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
    models: {},
    overallUsage: null,
    resetInfo: null,
    rawText: body.substring(0, 5000),
    timestamp: new Date().toISOString(),
  };

  // ─── Extract model usage ────────────────────────────────
  // Pattern: look for sections with model names and percentages
  // Claude.ai usage page typically shows model-specific usage bars

  // Try to find all elements with usage information
  const allElements = document.querySelectorAll('*');
  const usageTexts = [];

  for (const el of allElements) {
    const text = el.textContent?.trim() || '';
    // Look for percentage patterns near model names
    if (text.match(/\d+(\.\d+)?\s*%/) && text.length < 200) {
      usageTexts.push(text);
    }
  }

  // Extract structured data from progress bars / usage sections
  const sections = document.querySelectorAll('[class*="usage"], [class*="progress"], [class*="meter"], [role="progressbar"]');
  for (const section of sections) {
    const text = section.textContent?.trim() || '';
    const ariaValue = section.getAttribute('aria-valuenow');
    if (ariaValue) {
      const label = section.getAttribute('aria-label') || section.closest('[class*="model"]')?.textContent?.trim() || 'unknown';
      data.models[label] = { usage: `${ariaValue}%`, raw: text };
    }
  }

  // Regex extraction from body text
  // Pattern: "Model Name" followed by "X%" or "X% of limit"
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match patterns like "Opus 4  3%" or "Claude 3.5 Sonnet  5%"
    const modelMatch = line.match(
      /^((?:Claude\s+)?(?:\d+\.?\d*\s+)?(?:Opus|Sonnet|Haiku)(?:\s+\d+\.?\d*)?)\s+(\d+(?:\.\d+)?)\s*%/i
    );
    if (modelMatch) {
      data.models[modelMatch[1].trim()] = { usage: `${modelMatch[2]}%` };
      continue;
    }

    // Check if line is a model name and next line has percentage
    const nameMatch = line.match(/^((?:Claude\s+)?(?:\d+\.?\d*\s+)?(?:Opus|Sonnet|Haiku)(?:\s+\d+\.?\d*)?)\s*$/i);
    if (nameMatch && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      const pctMatch = nextLine.match(/^(\d+(?:\.\d+)?)\s*%/);
      if (pctMatch) {
        data.models[nameMatch[1].trim()] = { usage: `${pctMatch[1]}%` };
      }
    }

    // Overall usage
    if (line.match(/(?:overall|total|전체|all\s*models)/i)) {
      const pct = line.match(/(\d+(?:\.\d+)?)\s*%/);
      if (pct) data.overallUsage = `${pct[1]}%`;
    }

    // Reset info
    if (line.match(/(?:reset|resets|renew|갱신|리셋)/i)) {
      data.resetInfo = line;
    }
  }

  // Fallback: grab all percentages if no models found
  if (Object.keys(data.models).length === 0) {
    const allPcts = [...body.matchAll(/(\d+(?:\.\d+)?)\s*%/g)];
    if (allPcts.length > 0) {
      data.overallUsage = allPcts.map(m => m[0]).join(', ');
    }
  }

  return data;
}
