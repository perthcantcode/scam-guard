const sleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) { reject(new DOMException('Demo stopped', 'AbortError')); return; }
  const abort = () => { clearTimeout(timer); reject(new DOMException('Demo stopped', 'AbortError')); };
  const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
  signal?.addEventListener('abort', abort, { once: true });
});
let demoRunning = false;

function point(selector) {
  const el = document.querySelector(selector);
  if (!el) return { x: innerWidth / 2, y: innerHeight / 2 };
  const box = el.getBoundingClientRect();
  return { x: box.left + Math.min(box.width * 0.55, box.width - 18), y: box.top + Math.min(28, box.height / 2) };
}

function zoomTo(selector, scale = 1.12) {
  const el = document.querySelector(selector);
  if (!el) return;
  const box = el.getBoundingClientRect();
  const dx = innerWidth * 0.5 - (box.left + box.width / 2);
  const dy = innerHeight * 0.28 - (box.top + box.height * 0.2);
  document.documentElement.style.setProperty('--demo-x', `${Math.round(dx * 0.42)}px`);
  document.documentElement.style.setProperty('--demo-y', `${Math.round(dy * 0.35)}px`);
  document.documentElement.style.setProperty('--demo-s', String(scale));
}

function resetZoom() {
  document.documentElement.style.setProperty('--demo-x', '0px');
  document.documentElement.style.setProperty('--demo-y', '0px');
  document.documentElement.style.setProperty('--demo-s', '1');
}

export function maybeStartDemo(api) {
  const params = new URLSearchParams(location.search);
  if (params.get('demo') !== '1' && location.hash !== '#demo') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (innerWidth < 760) return;
  runProductDemo(api);
}

export async function runProductDemo(api) {
  if (demoRunning || api.state.busy || api.state.ocrBusy) return;
  demoRunning = true;
  const controller = new AbortController();
  const { signal } = controller;
  const cursor = document.createElement('div');
  cursor.className = 'demo-cursor';
  cursor.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 3l16 9-7 1.5L11 21Z" fill="#111" stroke="#ff5a66" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const caption = document.createElement('div');
  caption.className = 'demo-caption';
  const skip = document.createElement('button');
  skip.className = 'demo-skip';
  skip.type = 'button';
  skip.textContent = 'Skip demo';
  const progress = document.createElement('div');
  progress.className = 'demo-progress';
  const titlecard = document.createElement('div');
  titlecard.className = 'demo-titlecard';
  titlecard.innerHTML = '<div><p>PRODUCT TOUR</p><strong>Check first.<br>Worry less.</strong></div>';
  const stop = () => {
    controller.abort();
    document.body.classList.remove('demoing');
    resetZoom();
    cursor.remove();
    caption.remove();
    skip.remove();
    progress.remove();
    titlecard.remove();
    window.removeEventListener('keydown', onKeydown);
  };
  const onKeydown = e => { if (e.key === 'Escape') stop(); };
  skip.addEventListener('click', stop);
  window.addEventListener('keydown', onKeydown);
  document.body.append(progress, titlecard, cursor, caption, skip);
  document.body.classList.add('demoing');

  const move = async (selector) => {
    const { x, y } = point(selector);
    cursor.style.transform = `translate(${x}px, ${y}px)`;
    await sleep(560, signal);
  };
  const say = (text) => { caption.textContent = text; };
  const setProgress = (n) => { progress.style.width = `${n}%`; };
  const flashTitle = async (html, ms = 1400) => {
    titlecard.innerHTML = `<div>${html}</div>`;
    titlecard.classList.add('show');
    await sleep(ms, signal);
    titlecard.classList.remove('show');
    await sleep(280, signal);
  };

  try {
    setProgress(6);
    await flashTitle('<p>SCAM GUARD</p><strong>Private checks.<br>On your device.</strong>', 1600);

    say('You’ve got the message. We’ve got the pause.');
    cursor.style.transform = `translate(${innerWidth * 0.42}px, ${180}px)`;
    zoomTo('.hero-quote', 1.08);
    await sleep(1600, signal);

    setProgress(18);
    say('Paste a message that feels off.');
    zoomTo('.composer', 1.14);
    await move('#msg-input');
    const text = api.examples.prize;
    api.state.draft = '';
    api.state.inputType = 'paste';
    api.state.ocrMs = null;
    const field = document.getElementById('msg-input');
    if (field) field.focus();
    for (const char of text) {
      api.state.draft += char;
      if (field) field.value = api.state.draft;
      const count = document.getElementById('char-count');
      if (count) count.textContent = `${api.state.draft.length.toLocaleString()} / 4,000`;
      await sleep(14 + Math.random() * 18, signal);
    }

    setProgress(42);
    say('Get a second opinion before you reply.');
    await move('#check-btn');
    document.getElementById('check-btn')?.classList.add('demo-press');
    await api.runAnalysis({demo: 1});
    document.getElementById('check-btn')?.classList.remove('demo-press');
    await sleep(400, signal);
    zoomTo('.verdict-card', 1.12);
    say('Red flags, in plain language. Score is a heuristic.');
    await sleep(2600, signal);

    setProgress(64);
    say('Track what reaches you. Metadata only.');
    await move('.desktop-nav [data-page="radar"]');
    api.navigate('radar');
    await sleep(700, signal);
    zoomTo('.heatmap-card', 1.08);
    await sleep(2000, signal);
    zoomTo('.stats-grid', 1.06);
    await sleep(1400, signal);

    setProgress(82);
    say('Rules. Local AI. Screenshots. Radar.');
    await move('.desktop-nav [data-page="about"]');
    api.navigate('about');
    await sleep(700, signal);
    zoomTo('.about-grid', 1.06);
    await sleep(1800, signal);
    zoomTo('.faq-list', 1.04);
    await sleep(1600, signal);

    setProgress(100);
    await flashTitle('<p>CHECK FIRST</p><strong>Worry less.</strong>', 1400);
    api.navigate('check');
    await sleep(400, signal);
    resetZoom();
    say('scamguard. On your device.');
    await sleep(1400, signal);
  } catch (err) {
    if (err?.name !== 'AbortError') console.warn(err);
  } finally {
    if (!signal.aborted) stop();
    demoRunning = false;
  }
}

