import Dexie from 'dexie';
import patterns from '../data/scamPatterns.json' with { type: 'json' };
import { MODEL_ALLOW_LOCAL, MODEL_LOCAL_PATH } from './config.js';

const vectorDb = new Dexie('ScamGuardModels');
vectorDb.version(1).stores({ vectors: 'key' });
let extractor;
let vectors;
let device = 'wasm';
let ready = false;
let offline = false;
let netCount = 0;
let work = Promise.resolve();
const originalFetch = self.fetch.bind(self);

// Enforces the app's cached-assets preference inside the inference worker.
async function localFetch(input, options) {
  if (ready) self.postMessage({ type: 'net', count: ++netCount });
  if (offline) {
    const cached = await caches.match(input, { ignoreSearch: true });
    if (cached) return cached;
    throw new Error('This AI file is not cached yet. Turn off cached-assets-only mode and load the model once.');
  }
  return originalFetch(input, options);
}
self.fetch = localFetch;

function hash(value) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return (result >>> 0).toString(16);
}

async function init({ modelId, offline: startOffline }) {
  offline = Boolean(startOffline);
  const start = performance.now();
  const { pipeline, env } = await import('@huggingface/transformers');
  env.allowLocalModels = MODEL_ALLOW_LOCAL;
  env.localModelPath = MODEL_LOCAL_PATH;
  env.allowRemoteModels = true; // Network gate above preserves Transformers.js's cache lookup.
  env.useBrowserCache = true;
  env.fetch = localFetch;
  env.backends.onnx.wasm.wasmPaths = new URL('/ort/', self.location.origin).href;
  env.backends.onnx.wasm.numThreads = 1;
  const progress_callback = event => {
    if (typeof event.progress === 'number') self.postMessage({ type: 'progress', file: event.file, stage: 'Downloading model', progress: Math.min(80, Math.round(event.progress * .8)) });
  };
  const options = { dtype: 'q8', progress_callback };
  if (navigator.gpu) {
    try {
      extractor = await pipeline('feature-extraction', modelId, { ...options, device: 'webgpu' });
      device = 'webgpu';
    } catch { /* Fall back to CPU without requiring GPU support. */ }
  }
  if (!extractor) extractor = await pipeline('feature-extraction', modelId, { ...options, device: 'wasm' });

  const key = `${modelId}:q8:${hash(JSON.stringify(patterns))}`;
  try { vectors = (await vectorDb.vectors.get(key))?.vectors; } catch { /* Private browser modes may disable IndexedDB. */ }
  if (!vectors || vectors.length !== patterns.length) {
    vectors = [];
    for (let index = 0; index < patterns.length; index += 4) {
      const batch = patterns.slice(index, index + 4);
      const result = await extractor(batch.map(pattern => pattern.text), { pooling: 'mean', normalize: true, truncation: true });
      vectors.push(...result.tolist());
      self.postMessage({ type: 'progress', stage: 'Preparing local examples', progress: 80 + Math.round(vectors.length / patterns.length * 19) });
    }
    try { await vectorDb.vectors.put({ key, vectors }); } catch { /* Inference can work without persistent storage. */ }
  }

  let cacheReady = false;
  try {
    const keys = await (await caches.open(env.cacheKey)).keys();
    const modelKeys = keys.map(item => item.url).filter(url => url.includes(modelId));
    cacheReady = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'model_quantized.onnx'].every(file => modelKeys.some(url => url.endsWith('/' + file)));
  } catch { /* Do not claim persistence when storage is unavailable. */ }
  ready = true;
  self.postMessage({ type: 'ready', modelId, device, loadMs: Math.round(performance.now() - start), cacheReady, netCount: 0, patternsCount: patterns.length });
}

async function classify({ id, text }) {
  if (!ready) throw new Error('Local AI is not ready.');
  const start = performance.now();
  const result = await extractor(text, { pooling: 'mean', normalize: true, truncation: true });
  const embedding = result.data;
  const ranked = patterns.map((pattern, index) => ({
    id: pattern.id, family: pattern.family, label: pattern.label,
    similarity: Math.max(-1, Math.min(1, vectors[index].reduce((sum, value, offset) => sum + value * embedding[offset], 0)))
  })).sort((left, right) => right.similarity - left.similarity);
  const scam = ranked.find(item => item.label === 'scam');
  const legitimate = ranked.find(item => item.label === 'legit');
  self.postMessage({ type: 'result', id, family: scam.family, similarity: scam.similarity, benignSimilarity: legitimate.similarity, topK: ranked.slice(0, 3), ms: Math.round(performance.now() - start), device });
}

self.onmessage = ({ data }) => {
  if (data.type === 'setOffline') { offline = Boolean(data.value); return; }
  // Avoid simultaneous ONNX runs; mode changes above are applied immediately.
  work = work.then(() => data.type === 'init' ? init(data) : classify(data)).catch(error => {
    self.postMessage({ type: 'error', id: data.id, message: error.message || 'Local AI could not run.' });
  });
};
