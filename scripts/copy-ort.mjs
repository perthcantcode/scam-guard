import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.join(root, 'public/ort');
await mkdir(destination, { recursive: true });
// Transformers.js 4 uses asyncify by default; also bundle the plain and JSEP backends.
const files = ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm',
  'ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm'];
for (const file of files) {
  await copyFile(path.join(root, 'node_modules/onnxruntime-web/dist', file), path.join(destination, file));
}
console.log(`Prepared ${files.length} local ONNX runtime files in public/ort/.`);
