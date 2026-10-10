/** Report actual cached app assets without making network requests. */
export async function getOfflineReadiness() {
  const shell = Boolean(globalThis.navigator?.serviceWorker?.controller);
  const ocrFiles = ['worker.min.js', 'tesseract-core-lstm.wasm.js',
    'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js', 'lang/eng.traineddata'];
  let ocr = false;
  if (globalThis.caches) {
    try {
      const results = await Promise.all(ocrFiles.map(file => caches.match(
        new URL(`/tesseract/${file}`, location.origin).href, { ignoreSearch: true })));
      ocr = results.every(Boolean);
    } catch { /* Storage can be denied in private browsing. */ }
  }
  return { shell, ocr };
}
