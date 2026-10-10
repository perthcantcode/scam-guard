import { analyze } from './engine/pipeline.js';
import embedClient from './engine/embedClient.js';
import { extractText, setOcrOffline } from './engine/ocr.js';
import { logCheck, getAllChecks, deleteAllChecks, exportJSON, importJSON } from './db/db.js';
import { totals, topFamily, topChannel, topBrand, scamFreeStreak, busiestWeekday, weeklySummary, targetedLevel, insightLine, heatmapData, breakdown } from './db/stats.js';
import { toDayKey } from './db/dayKey.js';
import { seedDemo, clearDemo } from './data/demoSeed.js';
import { FAMILY_LABELS, CHANNEL_LABELS } from './engine/config.js';
import { maybeStartDemo, runProductDemo } from './demoTour.js';
import { getOfflineReadiness } from './readiness.js';

const icons = {
  shield: '<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  chart: '<path d="M4 3v17h17M8 15v-4m5 4V7m5 8V4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  download: '<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  warning: '<path d="m12 3 10 18H2L12 3Zm0 6v5m0 3v1"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.shield}</svg>`;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const preference = (key, fallback) => { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } };
const savePreference = (key, value) => { try { localStorage.setItem(key, value); } catch { /* Session still works without persistence. */ } };
const state = {
  page: 'check', channel: preference('sg_channel', 'sms'), lang: preference('sg_lang', 'en'),
  draft: '', inputType: 'paste', inputMode: 'text', result: null, resultText: '', checks: [],
  busy: false, ocrBusy: false, ocrStatus: '', ocrMs: null, metric: 'scams', day: null,
  cacheOnly: preference('sg_cache_only', 'false') === 'true' || !navigator.onLine,
  readiness: { shell: false, ocr: false }, installPrompt: null, toastTimer: null, readyAt: null, requests: 0,
  motionPaused: preference('sg_motion_paused', 'false') === 'true',
};
if (!CHANNEL_LABELS[state.channel]) state.channel = 'sms';
const examples = {
  parcel: 'Your parcel is on hold. Pay a redelivery fee of PHP 35 immediately at https://delivery-update.example/claim to avoid return.',
  prize: 'Congratulations! Nanalo ka ng PHP 50,000 GCash prize. Send your OTP to claim your reward now.',
  everyday: 'Hey! Study group at the library tomorrow at 3? Bring your notes. See you there!',
};
const verdictNames = { scam: 'High scam risk', suspicious: 'Looks suspicious', likely_ok: 'No strong red flags' };
const navItems = [['check','search','Check message'],['radar','chart','My radar'],['about','info','How it works']];

try {
  new PerformanceObserver(list => {
    if (state.readyAt !== null) state.requests += list.getEntries().filter(e => e.startTime >= state.readyAt).length;
  }).observe({ type: 'resource', buffered: true });
} catch { /* Resource timing is optional browser diagnostics. */ }

function nav(mobile = false) {
  return `<nav class="${mobile ? 'mobile-nav' : 'desktop-nav'}" aria-label="${mobile ? 'Mobile navigation' : 'Main navigation'}">${navItems.map(([id, name, label]) => `<button class="nav-tab ${state.page === id ? 'active' : ''}" data-page="${id}" ${state.page === id ? 'aria-current="page"' : ''}>${icon(name)}<span>${label}</span></button>`).join('')}</nav>`;
}

function render() {
  document.getElementById('app').innerHTML = `
    <a class="skip-link" href="#main-content">Skip to message checker</a>
    <header class="header"><div class="header-inner">
      <a class="logo" href="#check" aria-label="Scam Guard home"><span class="logo-mark">${icon('shield')}</span><span class="wordmark">scam<span class="logo-light">guard</span><span class="logo-period">.</span></span></a>
      ${nav()}
      <div class="header-status"><span class="status-dot"></span>On your device</div>
    </div></header>
    <main class="main-content" id="main-content" tabindex="-1">${state.page === 'check' ? checkPage() : state.page === 'radar' ? radarPage() : aboutPage()}</main>
    ${renderFooter()}
    ${nav(true)}<div id="toast" class="toast" role="status" hidden></div>`;
  bindEvents();
  if (state.page === 'radar') renderHeatmap();
}

function pageHeading(eyebrow, title, copy) {
  return `<div class="page-heading"><div class="brand-specks" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div><div><p class="eyebrow"><span class="status-dot"></span>${eyebrow}</p><h1>${title}</h1><p class="page-description">${copy}</p></div><div class="heading-note"><span class="brand-bubbles" aria-hidden="true"><span></span><span></span><span></span></span>A little pause.<br>A safer next step.</div></div>`;
}

function proofStrip() {
  const chips = [['featured','On-device'],['','No cloud AI'],['','Spot red flags'],['','Metadata only'],['','Free to check']];
  return `<div class="proof-row">${chips.map(([cls,label]) => `<span class="proof-chip ${cls}">${label}</span>`).join('')}</div>`;
}

function brandMarquee() {
  const rows = [
    [['search','Spot the red flags'],['lock','Keep your OTP private'],['shield','Check before you click'],['image','Read suspicious screenshots']],
    [['shield','On-device analysis'],['chart','Understand your scam patterns'],['lock','Your messages stay yours'],['search','Pause before you pay']]
  ];
  const tracks = rows.map((items, index) => {
    const row = items.map(([name,label]) => `<span class="marquee-chip">${icon(name)}${label}<span class="marquee-spark" aria-hidden="true">+</span></span>`).join('');
    return `<div class="marquee-window"><div class="marquee-track ${index ? 'marquee-reverse' : ''}"><div class="marquee-group">${row}${row.replaceAll('class="marquee-chip', 'aria-hidden="true" class="marquee-chip')}</div><div class="marquee-group" aria-hidden="true">${row}${row}</div></div></div>`;
  }).join('');
  return `<section class="brand-marquee ${state.motionPaused ? 'is-paused' : ''}" aria-label="Scam Guard principles"><div class="marquee-heading"><span><i aria-hidden="true"></i> A sharper eye for suspicious messages</span><button id="motion-toggle" class="motion-toggle" aria-label="${state.motionPaused ? 'Resume' : 'Pause'} scrolling text" aria-pressed="${state.motionPaused}" title="${state.motionPaused ? 'Resume' : 'Pause'} scrolling text">${state.motionPaused ? '▶' : 'Ⅱ'}</button></div><div class="marquee-rows">${tracks}</div></section>`;
}

function renderFooter() {
  return `<footer class="site-footer"><div class="footer-inner"><div class="footer-top"><div><p class="eyebrow">READY TO CHECK ON DEVICE?</p><h2>Check the message.<br><span>Keep your guard up.</span></h2></div><div class="footer-actions"><div class="footer-icon-tiles" aria-hidden="true"><i>${icon('search')}</i><i>${icon('shield')}</i><i>${icon('lock')}</i></div><button class="btn" data-page="check">Check a message ${icon('arrow')}</button></div></div><div class="footer-bottom"><span>Private by design. Built for everyday messages.</span><button data-page="about">How it works ${icon('arrow')}</button><span>Local AI · 2026</span></div></div><div class="footer-wordmark-wrap" aria-hidden="true"><div class="footer-wordmark">scamguard<span>.</span></div></div></footer>`;
}

function checkPage() {
  return `<section class="guard-hero" aria-labelledby="guard-title"><div class="guard-intro"><p class="eyebrow"><span class="guard-cross" aria-hidden="true">+</span> YOUR EVERYDAY SCAM CHECK</p><h1 id="guard-title">Spot the scam.<br><span>Before you tap.</span></h1><p class="page-description">Suspicious text, link, or screenshot? Uncover the warning signs with a private check on your device.</p>${proofStrip()}</div><div class="guard-emblem" aria-hidden="true"><span class="emblem-label">SCAM GUARD / ON DEVICE</span><div class="emblem-shield">${icon('shield')}</div><span class="emblem-caption">A second opinion.<br>A more informed next step.</span><i class="emblem-corner">+</i></div></section>
    ${brandMarquee()}
    <div class="check-layout"><div class="check-main">
      <section class="card composer" aria-labelledby="composer-title">
        <div class="section-title"><h2 id="composer-title">Let’s take a look.</h2><span class="small muted">01 / CHECK</span></div>
        <div class="input-tabs" role="tablist" aria-label="Input method"><button role="tab" aria-selected="${state.inputMode === 'text'}" class="input-tab ${state.inputMode === 'text' ? 'active' : ''}" data-input-mode="text">${icon('search')} Paste a message</button><button role="tab" aria-selected="${state.inputMode === 'image'}" class="input-tab ${state.inputMode === 'image' ? 'active' : ''}" data-input-mode="image">${icon('image')} Upload screenshot</button></div>
        <div class="source-row"><label for="channel-select">Where did you receive it?</label><select id="channel-select" ${state.busy ? 'disabled' : ''}>${Object.entries(CHANNEL_LABELS).map(([key,label]) => `<option value="${key}" ${state.channel === key ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
        ${state.inputMode === 'image' ? `<button class="upload-area" id="upload-btn" ${state.busy || state.ocrBusy ? 'disabled' : ''}>${icon('upload')}<strong>Choose a screenshot</strong><span>or drop an image here · PNG, JPG, WebP · up to 8 MB</span></button>` : ''}
        <label class="sr-only" for="msg-input">Message to check</label>
        <textarea id="msg-input" class="textarea" maxlength="4000" rows="6" placeholder="Paste the message here. We’ll help you spot the red flags." ${state.busy || state.ocrBusy ? 'disabled' : ''}>${escapeHtml(state.draft)}</textarea>
        <div class="input-caption"><span>${icon('lock')} Your message stays on this device.</span><span id="char-count">${state.draft.length.toLocaleString()} / 4,000</span></div>
        <div id="ocr-status" class="status-message" role="status">${escapeHtml(state.ocrStatus)}</div>
        <div class="composer-actions"><button class="btn btn-primary" id="check-btn" ${state.busy || state.ocrBusy ? 'disabled' : ''}>${state.busy ? '<span class="spinner"></span> Checking…' : 'Check message ' + icon('arrow')}</button><button class="btn btn-quiet" id="clear-btn" ${state.busy || state.ocrBusy ? 'disabled' : ''}>Clear</button></div>
        <div class="examples"><span>Just trying it out?</span>${[['parcel','Parcel fee'],['prize','Prize message'],['everyday','Everyday text']].map(([key,label]) => `<button data-example="${key}" ${state.busy || state.ocrBusy ? 'disabled' : ''}>${label}</button>`).join('')}</div>
        <input type="file" id="ocr-input" accept="image/png,image/jpeg,image/webp" hidden />
      </section>
      <div id="verdict-area" aria-live="polite">${state.result ? verdictCard() : ''}</div>
      <section class="card recent-card"><div class="section-title"><h2>Recent checks</h2><button class="text-button" data-page="radar">View radar ${icon('arrow')}</button></div>${recentList(state.checks.slice(0, 4))}</section>
    </div><aside class="check-sidebar">
      <section class="card protection-card"><div class="card-symbol">${icon('shield')}</div><p class="eyebrow">PRIVATE. ON DEVICE.</p><h2>A second opinion.<br>Without the oversharing.</h2><p>Your messages are checked here, in your browser. No account. No cloud AI.</p><div class="feature-status"><span>${icon('check')} Message & link checks</span><strong>Ready</strong></div><div id="model-controls">${modelControls()}</div></section>
      <section class="card snapshot-card"><div class="section-title"><h2>Your week, at a glance</h2>${icon('chart')}</div>${snapshot()}<button class="text-button" data-page="radar">Explore your radar ${icon('arrow')}</button></section>
      <div class="gentle-note">${icon('info')}<p>A check is a second opinion, not a guarantee. Never share your OTP, PIN, or password.</p></div>
    </aside></div>`;
}

function modelControls() {
  const info = embedClient.getInfo();
  const status = embedClient.status;
  return `<div class="feature-status"><span>${icon('shield')} Local AI model</span><strong class="${status === 'error' ? 'status-error' : ''}">${status === 'ready' ? 'Ready' : status === 'loading' ? 'Loading…' : status === 'error' ? 'Unavailable' : 'Not loaded'}</strong></div>
    ${status === 'ready' ? `<p class="model-note">The model is running on this device. ${info.device === 'webgpu' ? 'GPU' : 'CPU'} inference is active.</p>` : `<p class="model-note">Add a pretrained model to compare scam patterns. One-time download; no training needed. Rule checks work now.</p>`}
    ${status === 'loading' ? `<progress max="100" value="${Number(info.progress) || 0}" aria-label="Model download progress"></progress><p class="small muted">Preparing model · ${Math.round(Number(info.progress) || 0)}%</p>` : status !== 'ready' ? `<button class="btn btn-secondary full-width" id="model-load-btn">${icon('download')} ${status === 'error' ? 'Retry local AI' : 'Enable local AI'}</button>` : ''}
    ${info.error ? `<p class="status-message error">The model couldn’t load. Message and link checks are still available.</p><details class="small muted"><summary>Model details</summary><p>${escapeHtml(info.error)}</p></details>` : ''}
    <label class="offline-control"><input type="checkbox" id="cache-only" ${state.cacheOnly ? 'checked' : ''} ${status === 'loading' ? 'disabled' : ''}><span>Use cached assets only</span></label>
    ${state.cacheOnly ? '<p class="cache-notice">Downloads are off. Uncached models may be unavailable.</p>' : ''}
    <details class="offline-readiness"><summary>Offline readiness</summary><ul>
      <li><span>App saved on this device</span><strong>${state.readiness.shell ? 'Ready' : 'Not yet'}</strong></li>
      <li><span>Screenshot reader saved</span><strong>${state.readiness.ocr ? 'Ready' : 'Not yet'}</strong></li>
      <li><span>AI model files saved</span><strong>${info.cacheReady ? 'Ready' : 'Not verified'}</strong></li>
    </ul><p>Open the installed or production app online once, load local AI, then check with your connection off. Browser storage can be cleared.</p></details>`;
}

function snapshot() {
  const week = weeklySummary(state.checks);
  const includesDemo = state.checks.some(c => c.demo);
  return `${includesDemo ? '<span class="demo-badge">Includes demo data</span>' : ''}<div class="snapshot-stats"><div><strong>${week.checked}</strong><span>Messages checked</span></div><div><strong class="danger">${week.scams}</strong><span>High-risk results</span></div></div><div class="mini-bars" aria-hidden="true">${Array.from({length: 28}, (_, i) => {
    const date = new Date(); date.setDate(date.getDate() - (27 - i));
    const count = state.checks.filter(c => c.dayKey === toDayKey(date.getTime())).length;
    return `<span style="--bar-height:${Math.min(100, 14 + count * 18)}%;--bar-color:${count ? 'var(--accent)' : '#fff'}"></span>`;
  }).join('')}</div><p class="small muted">${state.checks.length ? 'Your last 28 days of checks.' : 'Your activity starts with your first check.'}</p>`;
}

function verdictCard() {
  const r = state.result;
  const flags = r.flags.filter(f => f.type !== 'warning_context');
  const issues = r.links.filter(l => l.issues?.length);
  const info = embedClient.getInfo();
  return `<section class="card verdict-card ${r.verdict}" aria-labelledby="result-title"><div class="section-title"><span class="eyebrow">02 / YOUR RESULT</span><span class="result-mode">${r.device === 'rules-only' ? 'Rule checks' : 'Local AI + rules'}</span></div><div class="verdict-header"><div><h2 id="result-title">${verdictNames[r.verdict]}</h2><p>${r.family !== 'unknown' ? escapeHtml(FAMILY_LABELS[r.family] || 'Unclassified') : 'Message analysis'}${r.brand ? ' · ' + escapeHtml(r.brand) : ''}</p></div><div class="risk-score"><strong>${r.score}</strong><span>/100 risk</span></div></div><div class="score-track"><span style="width:${r.score}%"></span></div>
    <div class="result-language"><span>Explanation</span><div class="segmented"><button data-lang="en" class="${state.lang === 'en' ? 'active' : ''}">English</button><button data-lang="tl" class="${state.lang === 'tl' ? 'active' : ''}">Tagalog</button></div></div><p class="explanation">${escapeHtml(r.explanation[state.lang] || r.explanation.en)}</p>
    ${flags.length ? `<ul class="flags-list">${flags.map(f => `<li>${icon('warning')}<span>${escapeHtml(f.why)}</span></li>`).join('')}</ul>` : ''}
    ${issues.length ? `<div class="link-issues"><h3>Links to be careful with</h3>${issues.map(l => `<p><code>${escapeHtml(l.url)}</code><br><span>${escapeHtml(l.issues.join(', ').replaceAll('_', ' '))}</span></p>`).join('')}</div>` : ''}
    <details class="result-detail"><summary>View checked message & highlights</summary><div class="highlighted-message">${highlightMessage(state.resultText, flags)}</div></details>
    <details class="result-detail"><summary>${icon('lock')} How this check ran</summary><dl class="proof-panel"><div><dt>Processing</dt><dd>${escapeHtml(r.device)}</dd></div><div><dt>Rules & links</dt><dd>${r.timings.rulesMs} ms</dd></div><div><dt>Embedding inference</dt><dd>${r.timings.embedMs === null ? 'Not used' : r.timings.embedMs + ' ms'}</dd></div><div><dt>Screenshot reading</dt><dd>${r.timings.ocrMs === null ? 'Not used' : r.timings.ocrMs + ' ms'}</dd></div>${r.device !== 'rules-only' ? `<div><dt>Model</dt><dd>${escapeHtml(info.modelId)}</dd></div><div><dt>Fetches/resources since AI ready</dt><dd>${state.requests + (Number(info.netCount) || 0)}</dd></div>` : ''}</dl><p class="small muted">Processing stays in your browser. Model files may download during setup. Request counts use browser resource timing and worker fetch calls; verify offline behavior in your browser’s Network panel.</p></details>
    <p class="result-caution">${icon('info')} This score is a heuristic, not a probability. Verify with the sender through a channel you trust.</p></section>`;
}

function highlightMessage(text, flags) {
  const spans = flags.filter(f => Array.isArray(f.span) && f.span[1] > f.span[0]).map(f => [Math.max(0, f.span[0]), Math.min(text.length, f.span[1])]).sort((a,b) => a[0]-b[0]);
  let pos = 0, html = '';
  for (const [start,end] of spans) { if (start < pos || end <= start) continue; html += escapeHtml(text.slice(pos,start)) + '<mark>' + escapeHtml(text.slice(start,end)) + '</mark>'; pos = end; }
  return html + escapeHtml(text.slice(pos));
}

function recentList(checks) {
  if (!checks.length) return `<div class="empty-state">${icon('clock')}<div><h3>A fresh start.</h3><p>Your checks will appear here. Message text isn’t saved by default.</p></div></div>`;
  return `<div class="recent-list">${checks.map(c => `<div class="recent-item"><span class="verdict-dot ${c.verdict}"></span><div class="recent-info"><strong>${escapeHtml(c.family === 'unknown' ? verdictNames[c.verdict] : FAMILY_LABELS[c.family] || 'Unclassified')}${c.demo ? ' <span class="demo-badge">Demo</span>' : ''}</strong><span>${escapeHtml(CHANNEL_LABELS[c.channel] || 'Other')}${c.brand ? ' · ' + escapeHtml(c.brand) : ''} · ${escapeHtml(timeAgo(c.ts))}</span></div><span class="recent-risk">${c.score}<small>/100</small></span></div>`).join('')}</div>`;
}

function radarPage() {
  const t = totals(state.checks), tf = topFamily(state.checks), tc = topChannel(state.checks), tb = topBrand(state.checks), busiest = busiestWeekday(state.checks);
  return `${pageHeading('YOUR PRIVATE ACTIVITY', 'Know your patterns.', 'See what reaches you, where it comes from, and how often.<br>Your history lives only in this browser.')}
    ${state.checks.some(c => c.demo) ? '<div class="demo-banner">Includes sample history. Demo records are labeled and can be removed below.</div>' : ''}
    <div class="stats-grid">${[[t.checked,'Messages checked'],[t.scams,'High-risk results'],[t.scamRate,'High-risk share'],[scamFreeStreak(state.checks) + ' days','Days without flagged checks']].map(([val,label]) => `<div class="card stat-card"><span>${label}</span><strong>${val}</strong></div>`).join('')}</div>
    <section class="card heatmap-card"><div class="section-title"><div><p class="eyebrow">A YEAR AT A GLANCE</p><h2>Your scam radar</h2></div><div class="segmented" aria-label="Heatmap metric"><button data-metric="scams" class="${state.metric === 'scams' ? 'active' : ''}">Flagged checks</button><button data-metric="all" class="${state.metric === 'all' ? 'active' : ''}">All checks</button></div></div><p class="small muted">Select a day to explore. Flagged checks include suspicious and high-risk results.</p><div id="heatmap-area"></div><div class="day-picker"><label for="day-select">Explore a date</label><input id="day-select" type="date" max="${toDayKey(Date.now())}" value="${state.day || toDayKey(Date.now())}"></div><div id="day-detail-area">${dayDetail()}</div></section>
    ${insightLine(state.checks) ? `<p class="insight-line">${icon('info')}${escapeHtml(insightLine(state.checks))}</p>` : ''}
    <div class="radar-columns"><section class="card"><h2>Where they reach you</h2>${breakdownBars('channel')}</section><section class="card"><h2>What to watch for</h2>${breakdownBars('family')}</section></div>
    <section class="card pattern-summary">${[['Top channel',tc ? CHANNEL_LABELS[tc.key] : '—'],['Top threat',tf ? FAMILY_LABELS[tf.key] : '—'],['Top brand',tb?.key || '—'],['Busiest day',busiest?.name || '—'],['This week’s activity',state.checks.length ? targetedLevel(state.checks) : '—']].map(([label,val]) => `<div><span>${label}</span><strong>${escapeHtml(val)}</strong></div>`).join('')}</section>
    <section class="card"><div class="section-title"><h2>Your data, your call.</h2>${icon('lock')}</div><p class="muted">Export a backup, import saved checks, or explore with sample history.</p><div class="data-controls"><button class="btn btn-secondary" id="seed-btn">Load demo data</button><button class="btn btn-secondary" id="clear-demo-btn">Remove demo data</button><button class="btn btn-secondary" id="export-btn">${icon('download')} Export JSON</button><button class="btn btn-secondary" id="import-btn">${icon('upload')} Import JSON</button><button class="btn btn-danger" id="delete-all-btn">Delete all history</button><input type="file" id="import-file" accept="application/json,.json" hidden></div></section>`;
}

function breakdownBars(field) {
  const data = breakdown(state.checks, field), max = data[0]?.count || 1;
  return data.length ? `<div class="breakdown">${data.map(b => `<div class="breakdown-item"><div><span>${escapeHtml((field === 'channel' ? CHANNEL_LABELS : FAMILY_LABELS)[b.key] || 'Other')}</span><strong>${b.count}</strong></div><div class="bar-track"><span style="width:${b.count/max*100}%"></span></div></div>`).join('')}</div>` : '<p class="empty-copy">No flagged checks yet. Patterns will appear as you check messages.</p>';
}

function renderHeatmap() {
  const container = document.getElementById('heatmap-area');
  if (!container) return;
  const data = heatmapData(state.checks, {metric: state.metric});
  const colors = ['#ffffff','#ffe4e1','#ff9a93','#f0304a','#9e0a1f'];
  let svg = '<svg class="heatmap-svg" viewBox="0 0 835 140" width="835" height="140" role="img" aria-label="Daily check activity. Use the date picker below to explore.">';
  for (const m of data.months) svg += `<text x="${30 + m.weekIndex*15}" y="12">${escapeHtml(m.label)}</text>`;
  for (const [i,label] of [[1,'M'],[3,'W'],[5,'F']]) svg += `<text x="0" y="${24 + i*15 + 10}">${label}</text>`;
  data.weeks.forEach((week,w) => week.forEach((cell,d) => { if (!cell.future) svg += `<rect data-day="${cell.dayKey}" x="${30+w*15}" y="${24+d*15}" width="11" height="11" rx="3" fill="${colors[cell.level]}"><title>${cell.dayKey}: ${cell.count} ${state.metric === 'scams' ? 'flagged' : 'total'} checks</title></rect>`; }));
  container.innerHTML = `<div class="heatmap-scroll">${svg}</svg></div><div class="heatmap-legend"><span>Less</span>${colors.map(c => `<i style="background:${c}"></i>`).join('')}<span>More</span></div>`;
  container.querySelectorAll('[data-day]').forEach(cell => cell.addEventListener('click', () => selectDay(cell.dataset.day)));
  const scroller = container.querySelector('.heatmap-scroll'); scroller.scrollLeft = scroller.scrollWidth;
}
function selectDay(day) { state.day = day; document.getElementById('day-select').value = day; document.getElementById('day-detail-area').innerHTML = dayDetail(); }
function dayDetail() { return state.day ? `<div class="day-detail"><h3>${new Date(state.day + 'T12:00:00').toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'})}</h3>${recentList(state.checks.filter(c => c.dayKey === state.day))}</div>` : ''; }

function scene(kind) {
  const frames = {
    search: '<rect x="8" y="18" width="120" height="52" fill="#fff" stroke="#111" stroke-width="2"/><rect x="20" y="32" width="72" height="8" fill="#ff5a66" stroke="#111"/><rect x="20" y="46" width="48" height="8" fill="#111"/><rect x="102" y="26" width="28" height="28" fill="#ff5a66" stroke="#111" stroke-width="2"/><path d="M110 40h12M116 34v12" stroke="#111" stroke-width="2" stroke-linecap="round"/>',
    shield: '<rect x="70" y="16" width="70" height="58" fill="#fff" stroke="#111" stroke-width="2"/><rect x="18" y="28" width="78" height="46" fill="#ff5a66" stroke="#111" stroke-width="2"/><path d="M44 42v18c0 8 13 14 13 14s13-6 13-14V42l-13-5Z" fill="#111"/><path d="m51 52 4 4 8-8" stroke="#ff5a66" stroke-width="2" fill="none" stroke-linecap="round"/>',
    image: '<rect x="28" y="16" width="92" height="62" fill="#fff" stroke="#111" stroke-width="2"/><rect x="40" y="28" width="68" height="38" fill="#fafafa" stroke="#111"/><path d="m44 54 12-12 10 8 8-10 14 14H44Z" fill="#ff5a66" stroke="#111"/><circle cx="58" cy="38" r="4" fill="#e10b25" stroke="#111"/>',
    chart: '<rect x="16" y="18" width="128" height="54" fill="#fff" stroke="#111" stroke-width="2"/><rect x="28" y="48" width="8" height="14" fill="#fff" stroke="#111"/><rect x="42" y="40" width="8" height="22" fill="#ff5a66" stroke="#111"/><rect x="56" y="32" width="8" height="30" fill="#111"/><rect x="70" y="38" width="8" height="24" fill="#ff5a66" stroke="#111"/><rect x="84" y="28" width="8" height="34" fill="#e10b25"/><rect x="98" y="42" width="8" height="20" fill="#fff" stroke="#111"/>',
  };
  return `<svg class="scene" viewBox="0 0 160 88" fill="none" aria-hidden="true">${frames[kind]}</svg>`;
}

function howHero() {
  const steps = [['01','Paste or snap','Drop in a text, a link, or a screenshot of the message.'],['02','Check on device','Rules, optional local AI, and screenshot reading all run in your browser.'],['03','Pause and decide','See the red flags, then verify through a channel you trust.']];
  return `<section class="how-hero" aria-labelledby="how-title"><p class="eyebrow"><span class="status-dot"></span>A LITTLE CLARITY GOES A LONG WAY</p><h1 class="how-title" id="how-title">How it <span class="how-mark">works.</span></h1><p class="how-lede">Private by design. Useful checks and understandable results, all on the device in your hands.</p><ol class="how-steps">${steps.map(([n,t,c]) => `<li><b>${n}</b><div><strong>${t}</strong><span>${c}</span></div></li>`).join('')}</ol></section>`;
}

function pou() {
  const eye = cx => `<g class="pou-eye"><circle class="pou-lens" cx="${cx}" cy="112" r="30" fill="#fff" stroke="#111" stroke-width="5"/><g class="pou-pupil"><circle cx="${cx}" cy="112" r="12" fill="#111"/><circle cx="${cx + 4}" cy="107" r="3.4" fill="#fff"/></g></g>`;
  return `<svg class="pou" viewBox="0 0 240 220" role="img" aria-label="A friendly red blob wearing glasses, watching your cursor for scams"><g class="pou-all"><path d="M120 16C100 16 92 38 84 58 60 84 22 112 22 156c0 40 40 50 98 50s98-10 98-50c0-44-38-72-62-98-8-20-16-42-36-42Z" fill="var(--red)" stroke="#111" stroke-width="5" stroke-linejoin="round"/><ellipse cx="62" cy="158" rx="12" ry="24" fill="#fff" opacity=".25" transform="rotate(18 62 158)"/>${eye(86)}${eye(154)}<path d="M116 108q4-8 8 0M56 106 32 96M184 106l24-10" fill="none" stroke="#111" stroke-width="5" stroke-linecap="round"/><path d="M132 70q20-14 42-2" fill="none" stroke="#111" stroke-width="5" stroke-linecap="round"/><path d="M104 166q16 12 32 0" fill="none" stroke="#111" stroke-width="5" stroke-linecap="round"/></g></svg>`;
}

function aboutPage() {
  const faqs = [
    ['TRUST · SCORE','Does a low score mean it’s safe?', 'No. It means this check found few strong warning signs. Verify unexpected requests using an official app or a contact you already trust.'],
    ['PRIVACY · DEVICE','Do my messages leave this device?', 'Message analysis and screenshot reading run in your browser. Model setup downloads files, but does not send your message or image to a cloud AI service.'],
    ['SETUP · OFFLINE','What needs an internet connection?', 'The first visit and AI model setup. After the app and required files are cached, prepared checks can work offline. You can inspect Offline readiness on the checker.'],
    ['LANGUAGE · TAGALOG','Does it understand Tagalog and Taglish?', 'Yes, through rules and example patterns, and explanations come in English or Tagalog. The optional AI model is primarily English, so treat Tagalog and Taglish results with extra care.'],
    ['DATA · CONTROL','Can I delete or move my history?', 'Yes. My radar lets you export a metadata backup, import saved checks, remove demo history, or delete all check history. Message text is not included in exports.'],
    ['ACCESS · COST','Do I need an account?', 'No. There is no account, no sign-in and no cloud AI service. Open the app, paste a message or screenshot, and check it.'],
  ];
  const platform = [
    ['search','Paste a message','Check texts before you reply.'],
    ['image','Read a screenshot','OCR stays on this device.'],
    ['lock','Keep it private','No account. No cloud AI.'],
    ['shield','Verified patterns','Rules first, local model optional.', true],
    ['warning','Spot red flags','OTP asks, fees, lookalike links.'],
    ['chart','See your radar','Metadata only. Text stays out.'],
    ['check','Your call','A second opinion, not a guarantee.'],
  ];
  return `${howHero()}
        <section class="demo-invitation"><div><strong>See a check from start to finish.</strong><p>A short guided tour using a labeled sample message. Open with <code>?demo=1</code> to replay.</p></div><button class="btn btn-secondary" id="tour-btn">Play product tour ${icon('arrow')}</button></section>
    <div class="about-grid">${[
      ['search','01','Spot the red flags','Rules look for requests for OTPs, pressure to act, suspicious fees, and lookalike links. These checks work immediately, even without the AI model.'],
      ['shield','02','Compare scam patterns','Enable local AI to download a pretrained sentence embedding model. It compares your message with example scam patterns in your browser. No model training or cloud AI API is needed.'],
      ['image','03','Read a screenshot','Tesseract OCR reads text from an image on your device. Review the extracted text, then check it. English OCR can read Latin-script Taglish, but recognition is not perfect.'],
      ['chart','04','Understand your history','Your radar tracks checks by day, source, brand, and scam type. It stores metadata locally; message text is not saved by default. Sample history is always labeled.'],
    ].map(([name,num,title,copy]) => `<section class="card about-card">${scene(name)}<div class="section-title"><span class="eyebrow">${num}</span></div><h2>${title}</h2><p>${copy}</p></section>`).join('')}</div>
    <section class="platform" aria-label="What Scam Guard supports"><div class="platform-head"><p class="eyebrow">PLATFORM</p><h2>All-in-one check.</h2><p class="muted">Everything a careful pause needs.</p></div>${platform.map(([name,title,copy,on]) => `<div class="platform-row ${on ? 'active' : ''}"><span class="platform-ico">${icon(name)}</span><div><strong>${title}</strong><p>${copy}</p></div></div>`).join('')}</section>
    <section class="card offline-explainer"><div><p class="eyebrow">READY WHEN THE SIGNAL ISN’T</p><h2>Set up once. Check on device.</h2><p>Load the app while online, enable the AI model, and read a screenshot once before using those features offline. Browser storage can be cleared or evicted, so test your setup with your connection off. If the model is unavailable, the app tells you when it uses rules only.</p><p>“Use cached assets only” disables model downloads and requires an already prepared OCR worker. It is an app setting, not a device-wide airplane mode.</p></div><div class="offline-actions"><button class="btn btn-primary" data-page="check">Check a message ${icon('arrow')}</button>${state.installPrompt ? '<button class="btn btn-secondary" id="install-btn">Install app</button>' : ''}</div></section>
    <section class="faq" aria-labelledby="faq-title"><div class="faq-side"><p class="eyebrow">FAQ</p><h2 class="faq-title" id="faq-title">Got <span>questions?</span></h2><p class="faq-intro">Everything you need to know about a private check. Tap a card to open it.</p>${pou()}<p class="pou-caption">Eyes on every sketchy link.</p></div><div class="faq-list">${faqs.map(([tag,q,a]) => `<details class="faq-item" name="faq"><summary><span><span class="faq-tag">${tag}</span>${q}</span><span class="faq-toggle" aria-hidden="true">+</span></summary><p>${a}</p></details>`).join('')}</div></section>
    <div class="gentle-note">${icon('info')}<p>Scam Guard cannot confirm who sent a message or guarantee that a link is safe. Scores are heuristics, not measured probabilities. Model similarity is experimental; the model is primarily English and multilingual accuracy has not been measured.</p></div>`;
}


let eyeFrame = 0, eyePoint = null;
function lookAt(x, y) {
  document.querySelectorAll('.pou-eye').forEach(eye => {
    const pupil = eye.querySelector('.pou-pupil'), lens = eye.querySelector('.pou-lens');
    if (!pupil || !lens) return;
    const box = lens.getBoundingClientRect(), unit = (box.width / 60) || 1;
    const dx = x - (box.left + box.width / 2), dy = y - (box.top + box.height / 2);
    const dist = Math.hypot(dx, dy) || 1, reach = Math.min(13, dist / unit / 9);
    pupil.style.transform = `translate(${(dx / dist * reach).toFixed(1)}px, ${(dy / dist * reach).toFixed(1)}px)`;
  });
}
window.addEventListener('pointermove', e => {
  eyePoint = [e.clientX, e.clientY];
  if (!eyeFrame) eyeFrame = requestAnimationFrame(() => { eyeFrame = 0; lookAt(...eyePoint); });
}, { passive: true });

function bindEvents() {
  document.getElementById('motion-toggle')?.addEventListener('click', e => {
    state.motionPaused = !state.motionPaused; savePreference('sg_motion_paused', String(state.motionPaused));
    document.querySelector('.brand-marquee')?.classList.toggle('is-paused', state.motionPaused);
    e.currentTarget.setAttribute('aria-pressed', String(state.motionPaused));
    e.currentTarget.setAttribute('aria-label', `${state.motionPaused ? 'Resume' : 'Pause'} scrolling text`);
    e.currentTarget.title = `${state.motionPaused ? 'Resume' : 'Pause'} scrolling text`;
    e.currentTarget.textContent = state.motionPaused ? '▶' : 'Ⅱ';
  });
  document.querySelector('.logo').addEventListener('click', e => { e.preventDefault(); navigate('check'); });
  document.querySelectorAll('[data-page]').forEach(el => el.addEventListener('click', () => navigate(el.dataset.page)));
  document.querySelectorAll('[data-input-mode]').forEach(el => {
    el.addEventListener('click', () => { state.inputMode = el.dataset.inputMode; render(); document.querySelector(`[data-input-mode="${state.inputMode}"]`)?.focus(); });
    el.addEventListener('keydown', e => { if (['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) { e.preventDefault(); state.inputMode = e.key === 'Home' ? 'text' : e.key === 'End' ? 'image' : state.inputMode === 'text' ? 'image' : 'text'; render(); document.querySelector(`[data-input-mode="${state.inputMode}"]`)?.focus(); } });
  });
  document.querySelectorAll('[data-example]').forEach(el => el.addEventListener('click', () => { state.draft = examples[el.dataset.example]; state.inputType = 'paste'; state.ocrMs = null; state.result = null; render(); document.getElementById('msg-input').focus(); }));
  document.querySelectorAll('[data-lang]').forEach(el => el.addEventListener('click', () => { state.lang = el.dataset.lang; savePreference('sg_lang',state.lang); render(); }));
  document.querySelectorAll('[data-metric]').forEach(el => el.addEventListener('click', () => { state.metric = el.dataset.metric; render(); }));
  document.getElementById('channel-select')?.addEventListener('change', e => { state.channel = e.target.value; savePreference('sg_channel',state.channel); });
  const textarea = document.getElementById('msg-input');
  textarea?.addEventListener('input', e => { state.draft = e.target.value; document.getElementById('char-count').textContent = `${state.draft.length.toLocaleString()} / 4,000`; });
  textarea?.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runAnalysis(); } });
  textarea?.addEventListener('paste', e => { const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/')); if (item) { e.preventDefault(); handleOCR(item.getAsFile()); } });
  document.getElementById('check-btn')?.addEventListener('click', runAnalysis);
  document.getElementById('clear-btn')?.addEventListener('click', () => { state.draft = ''; state.result = null; state.resultText = ''; state.ocrStatus = ''; state.ocrMs = null; state.inputType = 'paste'; render(); document.getElementById('msg-input').focus(); });
  document.getElementById('upload-btn')?.addEventListener('click', () => document.getElementById('ocr-input').click());
  document.getElementById('ocr-input')?.addEventListener('change', e => { if (e.target.files[0]) handleOCR(e.target.files[0]); });
  const composer = document.querySelector('.composer');
  composer?.addEventListener('dragover', e => { e.preventDefault(); composer.classList.add('drag-over'); });
  composer?.addEventListener('dragleave', () => composer.classList.remove('drag-over'));
  composer?.addEventListener('drop', e => { e.preventDefault(); composer.classList.remove('drag-over'); if (e.dataTransfer.files[0]) handleOCR(e.dataTransfer.files[0]); });
  document.getElementById('day-select')?.addEventListener('change', e => { if (e.target.value) selectDay(e.target.value); });
  bindModelControls(); bindDataControls();
  if (eyePoint) lookAt(...eyePoint);
  document.getElementById('tour-btn')?.addEventListener('click', () => { navigate('check'); runProductDemo({state, examples, runAnalysis, navigate}); });
  document.getElementById('install-btn')?.addEventListener('click', async () => { await state.installPrompt?.prompt(); state.installPrompt = null; render(); });
}

function bindModelControls() {
  document.getElementById('model-load-btn')?.addEventListener('click', async () => { try { await embedClient.init(); } catch (err) { toast('AI model unavailable. Rule checks are still ready.'); } updateModelControls(); });
  document.getElementById('cache-only')?.addEventListener('change', e => { state.cacheOnly = e.target.checked; savePreference('sg_cache_only', String(state.cacheOnly)); embedClient.setOffline(state.cacheOnly); setOcrOffline(state.cacheOnly); updateModelControls(); });
}
function updateModelControls() { const el = document.getElementById('model-controls'); if (el) { el.innerHTML = modelControls(); bindModelControls(); } }
embedClient.onStatus(() => { if (embedClient.status === 'ready' && state.readyAt === null) { state.readyAt = performance.now(); state.requests = 0; } updateModelControls(); });

function navigate(page) { state.page = page; state.day = null; render(); window.scrollTo({top:0,behavior:'instant'}); refreshHistory(); }
async function refreshHistory() {
  try { state.checks = (await getAllChecks()).sort((a,b) => b.ts-a.ts); }
  catch { toast('History is unavailable in this browser. Message checking still works.'); }
}

async function runAnalysis({demo = 0} = {}) {
  if (state.busy || state.ocrBusy) return;
  if (!state.draft.trim()) { toast('Paste a message or upload a screenshot first.'); document.getElementById('msg-input')?.focus(); return; }
  state.busy = true;
  const text = state.draft.trim().slice(0,4000), channel = state.channel, inputType = state.inputType;
  let notice = '';
  render();
  try {
    const result = await analyze(text, {channel,inputType});
    if (state.ocrMs !== null) result.timings.ocrMs = state.ocrMs;
    state.result = result; state.resultText = text;
    if (!result.analysisFailed) {
      try { await logCheck(result, {inputType,text,demo: demo === 1 ? 1 : 0}); await refreshHistory(); } catch { notice = 'Check complete, but history could not be saved.'; }
    } else { state.result = null; notice = result.explanation.en; }
  } catch (err) { state.result = null; notice = 'Could not finish this check. Please try again.'; }
  finally { state.busy = false; render(); if (notice) toast(notice); document.getElementById('verdict-area')?.scrollIntoView({behavior:'smooth',block:'nearest'}); }
}

async function handleOCR(file) {
  if (state.ocrBusy || state.busy) return;
  state.ocrBusy = true; state.ocrStatus = 'Reading screenshot…'; state.inputMode = 'image'; render();
  try {
    const result = await extractText(file, {onProgress: pct => { state.ocrStatus = `Reading screenshot… ${pct}%`; const el = document.getElementById('ocr-status'); if (el) el.textContent = state.ocrStatus; }});
    if (result.error) throw new Error(result.error);
    if (!result.text?.trim()) throw new Error('No text found. Try a clearer screenshot.');
    state.draft = result.text.slice(0,4000); state.inputType = 'ocr'; state.ocrMs = result.ms; state.result = null;
    state.ocrStatus = `Text extracted in ${(result.ms/1000).toFixed(1)}s. Review it below, then check the message.${result.text.length > 4000 ? ' Only the first 4,000 characters are included.' : ''}`;
  } catch (err) { state.ocrStatus = `Could not read screenshot: ${err.message}`; }
  finally { state.ocrBusy = false; render(); }
}

function bindDataControls() {
  const action = (id, fn) => document.getElementById(id)?.addEventListener('click', async e => {
    e.currentTarget.disabled = true;
    try { const message = await fn(); await refreshHistory(); render(); if (message) toast(message); }
    catch (err) { render(); toast(err.message || 'Something went wrong. Try again.'); }
  });
  action('seed-btn', async () => { const n = await seedDemo(); return `${n} sample checks loaded. Demo records are labeled.`; });
  action('clear-demo-btn', async () => { await clearDemo(); return 'Demo history removed. Your own checks are kept.'; });
  action('delete-all-btn', async () => { if (confirm('Delete all check history on this device, including demo records? This cannot be undone.')) { await deleteAllChecks(); return 'All check history deleted.'; } });
  action('export-btn', async () => { const json = await exportJSON(); downloadFile(new Blob([json],{type:'application/json'}), `scam-guard-${toDayKey(Date.now())}.json`); return 'History exported.'; });
  document.getElementById('import-btn')?.addEventListener('click', () => document.getElementById('import-file').click());
  document.getElementById('import-file')?.addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    try { if (file.size > 5*1024*1024) throw new Error('Choose a JSON backup smaller than 5 MB.'); const added = await importJSON(await file.text()); await refreshHistory(); render(); toast(`${added} new checks imported. Existing history is kept.`); } catch (err) { toast(err.message); }
  });
}

function downloadFile(blob, name) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000); }
function toast(message) { const el = document.getElementById('toast'); if (!el) return; clearTimeout(state.toastTimer); el.textContent = message; el.hidden = false; state.toastTimer = setTimeout(() => { el.hidden = true; },6000); }
function timeAgo(ts) { const mins = Math.max(0, Math.floor((Date.now()-ts)/60000)); if (mins < 1) return 'Just now'; if (mins < 60) return `${mins}m ago`; if (mins < 1440) return `${Math.floor(mins/60)}h ago`; return new Date(ts).toLocaleDateString(undefined,{month:'short',day:'numeric'}); }

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); state.installPrompt = e; });
window.addEventListener('online', () => toast('You’re back online.'));
window.addEventListener('offline', () => toast('You’re offline. Prepared features can still run on this device.'));

async function init() {
  embedClient.setOffline(state.cacheOnly);
  setOcrOffline(state.cacheOnly);
  const params = new URLSearchParams(location.search);
  const shared = [params.get('title'),params.get('text'),params.get('url')].filter(Boolean).join('\n');
  if (shared) { state.draft = shared.slice(0,4000); state.inputType = 'share'; history.replaceState({},'',location.pathname === '/share' ? '/' : location.pathname); }
  await refreshHistory(); render();
  refreshReadiness();
  maybeStartDemo({ state, examples, runAnalysis, navigate });
}
async function refreshReadiness() { state.readiness = await getOfflineReadiness(); updateModelControls(); }
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', refreshReadiness);
  navigator.serviceWorker.ready.then(refreshReadiness).catch(() => {});
}
init();




