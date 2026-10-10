import { copyFile, mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.join(root, 'public/tesseract');
await mkdir(path.join(destination, 'lang'), { recursive: true });
await copyFile(path.join(root, 'node_modules/tesseract.js/dist/worker.min.js'), path.join(destination, 'worker.min.js'));
await copyFile(path.join(root, 'node_modules/tesseract.js/dist/worker.min.js.LICENSE.txt'), path.join(destination, 'worker.LICENSE.txt'));
await copyFile(path.join(root, 'node_modules/tesseract.js-core/LICENSE'), path.join(destination, 'core.LICENSE.txt'));
// LSTM-only .wasm.js wrappers embed their WASM. Include all supported CPU variants.
for (const file of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) {
  await copyFile(path.join(root, 'node_modules/tesseract.js-core', file), path.join(destination, file));
}
try {
  await access(path.join(destination, 'lang/eng.traineddata'));
} catch {
  console.warn('English OCR data is missing. Run npm run setup:ocr once while online before using OCR.');
}
console.log('Prepared local Tesseract worker and 3 LSTM cores in public/tesseract/.');
