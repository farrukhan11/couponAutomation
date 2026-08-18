const els = {
  host: document.getElementById('host'),
  runBadge: document.getElementById('runBadge'),
  codes: document.getElementById('codes'),
  reapplyBest: document.getElementById('reapplyBest'),
  start: document.getElementById('start'),
  stop: document.getElementById('stop'),
  testedCount: document.getElementById('testedCount'),
  workingCount: document.getElementById('workingCount'),
  bestValue: document.getElementById('bestValue'),
  status: document.getElementById('status'),
  results: document.getElementById('results'),
  exportCsv: document.getElementById('exportCsv'),
  clearResults: document.getElementById('clearResults')
};

let currentRun = null;

function parseCodes(raw) {
  const tokens = raw
    .split(/[\n,;\t ]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set(tokens)];
}

function setRunning(running) {
  els.start.disabled = running;
  els.stop.disabled = !running;
  els.codes.disabled = running;
  els.reapplyBest.disabled = running;
  els.runBadge.textContent = running ? 'Running' : 'Ready';
  els.runBadge.className = `badge${running ? ' running' : ''}`;
}

function formatMoney(value, currency = '') {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${currency || ''}${Number(value).toFixed(2)}`;
}

function discountLabel(result) {
  if (Number.isFinite(result.discountPercent) && result.discountPercent > 0) {
    return `${result.discountPercent.toFixed(2)}%`;
  }
  if (Number.isFinite(result.discountAmount) && result.discountAmount > 0) {
    return formatMoney(result.discountAmount, result.currencySymbol);
  }
  return '—';
}

function isWorking(result) {
  return result.status === 'WORKING' || result.status === 'WORKING_UNMEASURED';
}

function render(run) {
  currentRun = run || null;
  const results = run?.results || [];
  const working = results.filter(isWorking);
  const best = run?.best || null;

  els.testedCount.textContent = String(results.length);
  els.workingCount.textContent = String(working.length);
  els.bestValue.textContent = best ? `${best.code} · ${discountLabel(best)}` : '—';
  els.exportCsv.disabled = results.length === 0;

  els.results.innerHTML = '';
  for (const result of results) {
    const tr = document.createElement('tr');
    if (best && result.code === best.code) tr.classList.add('best');

    const codeTd = document.createElement('td');
    codeTd.textContent = result.code;

    const statusTd = document.createElement('td');
    const pill = document.createElement('span');
    pill.className = `status-pill ${isWorking(result) ? 'working' : result.status === 'INVALID' || result.status === 'EXPIRED' ? 'failed' : 'other'}`;
    pill.textContent = result.status;
    statusTd.appendChild(pill);
    if (result.message) {
      const note = document.createElement('div');
      note.className = 'muted';
      note.textContent = result.message.slice(0, 110);
      statusTd.appendChild(note);
    }

    const discountTd = document.createElement('td');
    discountTd.textContent = discountLabel(result);

    tr.append(codeTd, statusTd, discountTd);
    els.results.appendChild(tr);
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function loadState() {
  const tab = await getActiveTab();
  if (tab?.url) {
    try { els.host.textContent = new URL(tab.url).hostname; } catch { els.host.textContent = tab.url; }
  }
  const key = tab?.id ? `couponTest:${tab.id}` : null;
  if (!key) return;
  const stored = await chrome.storage.local.get([key, 'couponTest:last']);
  const run = stored[key] || stored['couponTest:last'];
  if (run && (!run.host || !tab?.url || (() => { try { return new URL(tab.url).hostname === run.host; } catch { return true; } })())) {
    render(run);
    els.status.textContent = run.summary || 'Previous results loaded for this store.';
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== 'COUPON_TEST_PROGRESS') return;
  const update = message.payload;
  if (update?.summary) els.status.textContent = update.summary;
  if (update?.run) render(update.run);
});

els.start.addEventListener('click', async () => {
  const codes = parseCodes(els.codes.value);
  if (!codes.length) {
    els.status.textContent = 'Paste at least one coupon code first.';
    return;
  }

  const tab = await getActiveTab();
  if (!tab?.id || !/^https?:/i.test(tab.url || '')) {
    els.status.textContent = 'Open a normal http/https cart or checkout page first.';
    return;
  }

  setRunning(true);
  els.status.textContent = `Scanning page and preparing to test ${codes.length} code(s)…`;

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'START_COUPON_TESTS',
      payload: { codes, reapplyBest: els.reapplyBest.checked }
    });

    if (!response?.ok) throw new Error(response?.error || 'Coupon test failed.');
    render(response.run);
    await chrome.storage.local.set({ [`couponTest:${tab.id}`]: response.run, 'couponTest:last': response.run });
    els.status.textContent = response.run.summary || 'Testing complete.';
    els.runBadge.textContent = 'Done';
    els.runBadge.className = 'badge done';
  } catch (error) {
    els.status.textContent = error?.message || String(error);
    els.runBadge.textContent = 'Error';
    els.runBadge.className = 'badge error';
  } finally {
    els.start.disabled = false;
    els.stop.disabled = true;
    els.codes.disabled = false;
    els.reapplyBest.disabled = false;
  }
});

els.stop.addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  try { await chrome.tabs.sendMessage(tab.id, { type: 'STOP_COUPON_TESTS' }); } catch {}
  els.status.textContent = 'Stopping after the current page action…';
});

els.clearResults.addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (tab?.id) await chrome.storage.local.remove(`couponTest:${tab.id}`);
  currentRun = null;
  render(null);
  els.status.textContent = 'Results cleared.';
});

els.exportCsv.addEventListener('click', () => {
  const results = currentRun?.results || [];
  if (!results.length) return;
  const headers = [
    'store','page','code','status','discount_percent','discount_amount','currency',
    'baseline_subtotal','baseline_total','after_total','message','tested_at'
  ];
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.join(',')];
  for (const r of results) {
    lines.push([
      currentRun.host,currentRun.url,r.code,r.status,
      r.discountPercent ?? '',r.discountAmount ?? '',r.currencySymbol ?? '',
      r.baselineSubtotal ?? '',r.baselineTotal ?? '',r.afterTotal ?? '',r.message ?? '',r.testedAt
    ].map(escape).join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `coupon-test-${currentRun.host || 'results'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

loadState().catch((error) => {
  els.status.textContent = error?.message || String(error);
});
