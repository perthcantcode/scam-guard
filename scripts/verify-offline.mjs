import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const build = spawn(npm, ['run', 'build'], { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
build.on('exit', (code) => {
  if (code !== 0) process.exit(code || 1);
  console.log(`\nManual production/offline check (http://localhost:4173):
1. Open online once. Wait until the service worker is activated, then reload.
2. Enable local AI and wait for the model to finish loading. Check an English sample.
3. Upload a screenshot and confirm readable OCR output. Verify the actual detected language.
4. Use browser DevTools Network > Offline (not only the app's model offline switch).
5. Reload the page. Paste another sample. Verify rules, model status, and local OCR.
6. Open Radar, inspect saved checks, reload /share?text=Sample and confirm the app opens.
7. Inspect Network: message content must not appear in requests. Record browser/device/timings.
Models need their first online download. Browser cache eviction can require downloads again.
Press Ctrl+C to stop preview.\n`);
  const preview = spawn(npm, ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173'], { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  preview.on('exit', (previewCode) => process.exit(previewCode || 0));
});
