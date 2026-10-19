#!/usr/bin/env node
// Generates the PWA icons (amber "M" on black) with no dependencies. Run: node scripts/make-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const AMBER = [0xff, 0xb8, 0x00];
const ORANGE = [0xfa, 0x79, 0x00];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x / size, y / size);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Block "M" inside the maskable safe zone (central 60%), orange underline bar.
function pixel(u, v) {
  const L = 0.24, R = 0.76, T = 0.26, B = 0.66, s = 0.085;
  const inM =
    v >= T && v <= B && (
      (u >= L && u <= L + s) || (u >= R - s && u <= R) ||
      // diagonals meeting at the middle
      (Math.abs(u - (L + s / 2 + (v - T) * 0.55)) < s / 1.6 && u <= 0.5 && v <= T + 0.42) ||
      (Math.abs(u - (R - s / 2 - (v - T) * 0.55)) < s / 1.6 && u >= 0.5 && v <= T + 0.42)
    );
  if (inM) return AMBER;
  if (v >= 0.71 && v <= 0.75 && u >= L && u <= R) return ORANGE;
  return [0, 0, 0];
}

mkdirSync('public/icons', { recursive: true });
for (const size of [180, 192, 512]) writeFileSync(`public/icons/icon-${size}.png`, png(size, pixel));
console.log('icons written');
