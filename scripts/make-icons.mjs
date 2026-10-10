import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

const directory = new URL('../public/icons/', import.meta.url);
await mkdir(directory, { recursive: true });
const shield = [[256,84],[391,132],[380,282],[351,349],[306,392],[256,425],[206,392],[161,349],[132,282],[121,132]];
const check = [[179,247],[201,225],[241,265],[314,188],[337,210],[242,309]];
function inside(x, y, points) {
  let value = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i], [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) value = !value;
  }
  return value;
}
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const key = Buffer.from(type), size = Buffer.alloc(4), checksum = Buffer.alloc(4);
  size.writeUInt32BE(data.length); checksum.writeUInt32BE(crc32(Buffer.concat([key, data])));
  return Buffer.concat([size, key, data, checksum]);
}
function icon(size) {
  const rows = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const color = [0, 0, 0];
    for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
      const px = (x + (sx + .5) / 2) * 512 / size, py = (y + (sy + .5) / 2) * 512 / size;
      const inMark = px > 48 && px < 464 && py > 48 && py < 464;
      const sample = inside(px, py, check)
        ? [225, 11, 37]
        : inside(px, py, shield)
          ? [255, 255, 255]
          : inMark
            ? [225, 11, 37]
            : [255, 255, 255];
      sample.forEach((value, i) => { color[i] += value / 4; });
    }
    const offset = y * (size * 3 + 1) + 1 + x * 3;
    color.forEach((value, i) => { rows[offset + i] = Math.round(value); });
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
for (const size of [192, 512]) await writeFile(new URL(`icon-${size}.png`, directory), icon(size));
await writeFile(new URL('icon-maskable-512.png', directory), icon(512));
await writeFile(new URL('../favicon.svg', directory), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="white"/><path d="M256 84 391 132 380 282 351 349 306 392 256 425 206 392 161 349 132 282 121 132Z" fill="#e10b25"/><path d="m179 247 22-22 40 40 73-77 23 22-95 99Z" fill="#ffffff"/></svg>\n');
console.log('Prepared app icons.');

