/* Helpers shared by the store-asset scripts (screenshots.mjs, marketing.mjs):
 * how Playwright and Chromium are found, and the PNG re-encoder that makes
 * every image 24-bit RGB without alpha. Dev tooling only; never shipped. */

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/* ------------------------------------------------------------ playwright */


export function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const attempts = [() => require('playwright')];
  attempts.push(() => {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    return createRequire(path.join(globalRoot, 'noop.js'))('playwright');
  });
  for (const attempt of attempts) {
    try { return attempt(); } catch { /* try the next place */ }
  }
  throw new Error('Playwright was not found. Install it globally (npm i -g playwright) or put it on NODE_PATH.');
}

export async function launch(chromium) {
  try {
    return await chromium.launch();
  } catch (error) {
    /* A pre-installed browser directory without the matching Playwright
     * revision: use whichever Chromium is in it. */
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
    const found = existsSync(base)
      ? readdirSync(base).filter((name) => /^chromium-\d+$/.test(name)).sort().reverse()
        .map((name) => [path.join(base, name, 'chrome-linux64', 'chrome'), path.join(base, name, 'chrome-linux', 'chrome')]).flat().find((file) => existsSync(file))
      : null;
    if (!found) throw error;
    return chromium.launch({ executablePath: found });
  }
}

/* ------------------------------------------------------- png flattening */


/* Chromium writes RGBA. The store wants 24-bit, so decode, composite onto an
 * opaque background (the page is already opaque, so this is a no-op in
 * practice) and write plain RGB. No dependency: node:zlib does the work. */
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}

export function flattenPng(buffer, background = [255, 255, 255]) {
  let offset = 8;
  let header = null;
  const parts = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') header = data;
    if (type === 'IDAT') parts.push(data);
    offset += 12 + length;
  }
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const depth = header[8];
  const colorType = header[9];
  if (depth !== 8 || (colorType !== 6 && colorType !== 2) || header[12] !== 0) {
    throw new Error(`Unexpected PNG format (depth ${depth}, colour type ${colorType})`);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(parts));
  const stride = width * bpp;
  const pixels = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const left = x >= bpp ? pixels[y * stride + x - bpp] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= bpp ? pixels[(y - 1) * stride + x - bpp] : 0;
      let value = src[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) value += paeth(left, up, upLeft);
      pixels[y * stride + x] = value & 0xff;
    }
  }

  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const out = y * (width * 3 + 1);
    rows[out] = 0;
    for (let x = 0; x < width; x++) {
      const at = y * stride + x * bpp;
      const alpha = bpp === 4 ? pixels[at + 3] / 255 : 1;
      for (let c = 0; c < 3; c++) {
        rows[out + 1 + x * 3 + c] = Math.round(pixels[at + c] * alpha + background[c] * (1 - alpha));
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}
