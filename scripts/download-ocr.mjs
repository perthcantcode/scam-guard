import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const destination = new URL('../public/tesseract/lang/', import.meta.url);
await mkdir(destination, { recursive: true });
const source = 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/';
const records = [];
for (const language of ['eng']) {
  const name = `${language}.traineddata`;
  const target = new URL(name, destination);
  let data;
  try {
    data = await readFile(target);
    console.log(`Using existing ${name}.`);
  } catch {
    const response = await fetch(`${source}${name}`);
    if (!response.ok) throw new Error(`OCR download failed: ${response.status} ${response.statusText}`);
    data = Buffer.from(await response.arrayBuffer());
    if (data.length < 100_000 || data.subarray(0, 20).toString().includes('<html')) {
      throw new Error(`The downloaded ${name} is not valid traineddata.`);
    }
    console.log(`Downloaded ${name} (${(data.length / 1024 / 1024).toFixed(2)} MiB).`);
  }
  const digest = createHash('sha256').update(data).digest('hex');
  if (digest !== '7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2') {
    throw new Error(`Unexpected checksum for ${name}; review the upstream asset before updating the pinned digest.`);
  }
  await writeFile(target, data);
  records.push({ file: name, source: `${source}${name}`, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
}
try {
  await readFile(new URL('LICENSE', destination));
} catch {
  const license = await fetch(`${source}LICENSE`);
  if (!license.ok) throw new Error(`Could not download OCR language license (${license.status}).`);
  await writeFile(new URL('LICENSE', destination), await license.text());
}
await writeFile(new URL('sources.json', destination), `${JSON.stringify(records, null, 2)}\n`);
console.log('OCR language assets are ready. They are served locally and precached in production.');
