import { MODEL_ID, EMBED_TIMEOUT_MS } from './config.js';

let worker;
let loading;
let resolveLoad;
let rejectLoad;
let initTimer;
let sequence = 0;
let offline = false;
const listeners = new Set();
const pending = new Map();
const info = { modelId: MODEL_ID, device: null, loadMs: null, sizeHint: 'About 23 MB', progress: 0, netCount: 0, cacheReady: false, error: null };

function emit() {
  for (const listener of listeners) {
    try { listener({ status: embedClient.status, ...info, offline }); } catch { /* A view cannot break the worker. */ }
  }
}

function fail(message) {
  clearTimeout(initTimer);
  embedClient.status = 'error';
  info.error = message;
  rejectLoad?.(new Error(message));
  loading = null;
  for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error(message)); }
  pending.clear();
  worker?.terminate();
  worker = null;
  emit();
}

const embedClient = {
  status: 'idle',
  init() {
    if (this.status === 'ready') return Promise.resolve(this.getInfo());
    if (loading) return loading;
    if (typeof Worker === 'undefined') return Promise.reject(new Error('Local AI needs a browser with Web Worker support.'));
    this.status = 'loading';
    Object.assign(info, { error: null, progress: 0, cacheReady: false });
    loading = new Promise((resolve, reject) => { resolveLoad = resolve; rejectLoad = reject; });
    const requestPromise = loading;
    try {
      worker = new Worker(new URL('./embed.worker.js', import.meta.url), { type: 'module' });
      worker.onerror = event => fail(event.message || 'Could not load local AI. Rule checks remain available.');
      worker.onmessage = ({ data }) => {
        if (data.type === 'progress') { Object.assign(info, { progress: data.progress, stage: data.stage, file: data.file }); emit(); }
        else if (data.type === 'net') { info.netCount = data.count; emit(); }
        else if (data.type === 'ready') {
          clearTimeout(initTimer);
          const { type, ...details } = data;
          Object.assign(info, details, { progress: 100, error: null });
          this.status = 'ready';
          resolveLoad?.(this.getInfo());
          loading = null;
          emit();
        } else if (data.type === 'result' || (data.type === 'error' && data.id != null)) {
          const request = pending.get(data.id);
          if (!request) return;
          clearTimeout(request.timer);
          pending.delete(data.id);
          if (data.type === 'error') request.reject(new Error(data.message));
          else request.resolve(data);
        } else if (data.type === 'error') fail(data.message);
      };
      initTimer = setTimeout(() => fail('Model loading timed out. Check your connection and retry; rule checks still work.'), 180000);
      worker.postMessage({ type: 'init', modelId: MODEL_ID, offline });
      emit();
    } catch (error) { fail(error.message); }
    return requestPromise;
  },
  classify(text) {
    if (this.status !== 'ready' || !worker) return Promise.reject(new Error('Local AI is not loaded.'));
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('Local AI took too long; this check used rules only.'));
      }, EMBED_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer });
      worker.postMessage({ type: 'classify', id, text: String(text).slice(0, 4000) });
    });
  },
  onStatus(callback) {
    listeners.add(callback);
    callback({ status: this.status, ...info, offline });
    return () => listeners.delete(callback);
  },
  setOffline(value) {
    offline = Boolean(value);
    worker?.postMessage({ type: 'setOffline', value: offline });
    emit();
  },
  getInfo() { return { ...info, offline, status: this.status }; }
};

export default embedClient;
