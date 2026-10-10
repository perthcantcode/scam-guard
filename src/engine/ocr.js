/** Tesseract runs locally in its own worker. Images never leave this device. */
let worker = null;
let workerLanguages = [];
let queue = Promise.resolve();
let progressListener;
let offline = false;
const info = { status: 'idle', progress: 0, languagesUsed: [], error: null };
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const asset = path => new URL(`/tesseract/${path}`, globalThis.location?.origin || 'http://localhost').href;

function progress(value) {
  info.progress = Math.round(value);
  try { progressListener?.(info.progress); } catch { /* UI callbacks do not interrupt OCR. */ }
}

export function setOcrOffline(value) { offline = Boolean(value); }
export function getOcrInfo() { return { ...info, languagesUsed: [...workerLanguages], offline }; }

async function initialize(languages) {
  if (worker && workerLanguages.join('+') === languages.join('+')) return;
  if (worker) { await worker.terminate(); worker = null; }
  if (offline) {
    const required = ['worker.min.js', ...languages.map(language => `lang/${language}.traineddata`),
      'tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js'];
    if (!globalThis.caches || !(await Promise.all(required.map(file => caches.match(asset(file), { ignoreSearch: true })))).every(Boolean)) {
      throw new Error('OCR assets are not cached yet. Turn off cached-assets-only mode and open the app online once.');
    }
  }
  if (!offline) {
    // Dev servers may send HTML for missing assets; reject it before Tesseract parses it.
    for (const language of languages) {
      const cached = await globalThis.caches?.match(asset(`lang/${language}.traineddata`), { ignoreSearch: true });
      if (cached && !cached.headers.get('content-type')?.includes('text/html')) continue;
      const response = await fetch(asset(`lang/${language}.traineddata`), { method: 'HEAD', signal: AbortSignal.timeout(10000) });
      if (!response.ok || response.headers.get('content-type')?.includes('text/html')) {
        throw new Error('The screenshot reader is not installed in this build yet. You can still paste a message.');
      }
    }
  }
  info.status = 'loading';
  const { createWorker } = await import('tesseract.js');
  worker = await createWorker(languages, 1, {
    workerPath: asset('worker.min.js'), corePath: asset(''), langPath: asset('lang'),
    workerBlobURL: false, gzip: false,
    logger: event => { if (typeof event.progress === 'number') progress(event.progress * 100); }
  });
  workerLanguages = [...languages];
  info.languagesUsed = [...languages];
  info.status = 'ready';
}

export function extractText(file, { onProgress, languages = ['eng'] } = {}) {
  if (!file || !ALLOWED_TYPES.has(file.type)) return Promise.resolve({ text: '', ms: 0, languagesUsed: [], error: 'Choose a PNG, JPEG, or WebP image.' });
  if (file.size > 8 * 1024 * 1024) return Promise.resolve({ text: '', ms: 0, languagesUsed: [], error: 'Image is too large. Choose one smaller than 8 MB.' });
  const requested = Array.isArray(languages) && languages.length && languages.every(language => /^[a-z]{3}$/.test(language)) ? [...languages] : ['eng'];
  const run = queue.then(async () => {
    const start = performance.now();
    progressListener = onProgress;
    info.error = null;
    try {
      progress(0);
      const image = await preprocessImage(file);
      try { await initialize(requested); }
      catch (error) {
        if (requested.join('+') === 'eng') throw error;
        await initialize(['eng']);
      }
      info.status = 'working';
      const { data } = await worker.recognize(image);
      info.status = 'ready';
      progress(100);
      return { text: cleanOCRText(data.text), ms: Math.round(performance.now() - start), confidence: data.confidence, languagesUsed: [...workerLanguages] };
    } catch (error) {
      info.status = 'error';
      info.error = error.message;
      return { text: '', ms: Math.round(performance.now() - start), languagesUsed: [], error: `Could not read this image. ${error.message}` };
    } finally { progressListener = null; }
  });
  queue = run.catch(() => {});
  return run;
}

async function preprocessImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Image processing is unavailable in this browser.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const gray = .299 * pixels.data[index] + .587 * pixels.data[index + 1] + .114 * pixels.data[index + 2];
      pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = Math.max(0, Math.min(255, (gray - 128) * 1.15 + 128));
    }
    context.putImageData(pixels, 0, 0);
    return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('This image could not be decoded.')), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}

export function cleanOCRText(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/[^\S\n]+/g, ' ')
    .replace(/https?\s*:\s*\/\s*\/\s*[a-z0-9.\- /?=&%]+/gi, url => url.replace(/\s*([:/.])\s*/g, '$1'))
    .split('\n').map(line => line.trim()).filter(Boolean).join('\n').trim();
}

export async function disposeOcr() {
  await queue;
  if (worker) await worker.terminate();
  worker = null;
  workerLanguages = [];
  info.status = 'idle';
}
