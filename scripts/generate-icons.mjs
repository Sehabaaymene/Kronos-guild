// Generates the app icon and splash image (no dependencies).
// Usage: node scripts/generate-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

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
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x + 0.5, y + 0.5);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const GOLD = [200, 166, 106];
const GOLD_LIGHT = [232, 205, 150];
const BG_TOP = [28, 28, 31];
const BG_BOTTOM = [10, 10, 11];
const smooth = (edge, d) => Math.max(0, Math.min(1, 0.5 - d / edge)); // anti-aliasing helper
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Returns gold coverage (0..1) of the watch-face mark at a point, in a unit where the face radius = R. */
function mark(x, y, cx, cy, R, px) {
  const r = Math.hypot(x - cx, y - cy);
  let cov = 0;
  // outer bezel ring
  cov = Math.max(cov, smooth(px, Math.abs(r - R) - R * 0.035));
  // hour markers
  const ang = Math.atan2(y - cy, x - cx);
  for (let h = 0; h < 12; h++) {
    const a = (h / 12) * Math.PI * 2 - Math.PI / 2;
    const major = h % 3 === 0;
    const r1 = R * (major ? 0.70 : 0.76), r2 = R * 0.86;
    const d = segDist(x, y, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
    cov = Math.max(cov, smooth(px, d - R * (major ? 0.028 : 0.014)));
  }
  void ang;
  // hands: hour (10 o'clock), minute (2 o'clock) — the classic "smile"
  const hourA = (10 / 12) * Math.PI * 2 - Math.PI / 2 + 0.04;
  const minA = (2 / 12) * Math.PI * 2 - Math.PI / 2 - 0.02;
  cov = Math.max(cov, smooth(px, segDist(x, y, cx, cy, cx + Math.cos(hourA) * R * 0.45, cy + Math.sin(hourA) * R * 0.45) - R * 0.032));
  cov = Math.max(cov, smooth(px, segDist(x, y, cx, cy, cx + Math.cos(minA) * R * 0.64, cy + Math.sin(minA) * R * 0.64) - R * 0.022));
  // center cap
  cov = Math.max(cov, smooth(px, r - R * 0.05));
  return cov;
}

// ---------------- app icon 1024 (opaque, iOS masks the corners itself)
const S = 1024;
const icon = png(S, (x, y) => {
  const t = y / S;
  let c = mix(BG_TOP, BG_BOTTOM, t);
  // subtle radial glow behind the face
  const g = Math.max(0, 1 - Math.hypot(x - S / 2, y - S * 0.47) / (S * 0.55));
  c = mix(c, [44, 38, 28], g * 0.35);
  const cov = mark(x, y, S / 2, S / 2, S * 0.33, 1.2);
  const gold = mix(GOLD_LIGHT, GOLD, y / S);
  c = mix(c, gold, cov);
  return [...c.map((v) => Math.round(v)), 255];
});
writeFileSync('assets/icon.png', icon);

// ---------------- splash mark (transparent background)
const P = 512;
const splash = png(P, (x, y) => {
  const cov = mark(x, y, P / 2, P / 2, P * 0.42, 1.2);
  const gold = mix(GOLD_LIGHT, GOLD, y / P);
  return [...gold.map((v) => Math.round(v)), Math.round(cov * 255)];
});
writeFileSync('assets/splash-icon.png', splash);

// ---------------- Android adaptive icon layers
writeFileSync('assets/android-icon-foreground.png', png(S, (x, y) => {
  const cov = mark(x, y, S / 2, S / 2, S * 0.26, 1.2);
  const gold = mix(GOLD_LIGHT, GOLD, y / S);
  return [...gold.map((v) => Math.round(v)), Math.round(cov * 255)];
}));
writeFileSync('assets/android-icon-background.png', png(S, (_x, y) => [...mix(BG_TOP, BG_BOTTOM, y / S).map((v) => Math.round(v)), 255]));
writeFileSync('assets/android-icon-monochrome.png', png(S, (x, y) => [255, 255, 255, Math.round(mark(x, y, S / 2, S / 2, S * 0.26, 1.2) * 255)]));
writeFileSync('assets/favicon.png', png(48, (x, y) => {
  const c = mix(BG_TOP, BG_BOTTOM, y / 48);
  const cov = mark(x, y, 24, 24, 16, 1);
  return [...mix(c, GOLD, cov).map((v) => Math.round(v)), 255];
}));
// ---------------- web app (iPhone Home Screen) icons
import { mkdirSync } from 'node:fs';
mkdirSync('public/icons', { recursive: true });
const webIcon = (size, pad = 1) =>
  png(size, (x, y) => {
    const c = mix(BG_TOP, BG_BOTTOM, y / size);
    const g = Math.max(0, 1 - Math.hypot(x - size / 2, y - size * 0.47) / (size * 0.55));
    const bg = mix(c, [44, 38, 28], g * 0.35);
    const cov = mark(x, y, size / 2, size / 2, size * 0.33 * pad, Math.max(1, size / 700));
    return [...mix(bg, mix(GOLD_LIGHT, GOLD, y / size), cov).map((v) => Math.round(v)), 255];
  });
writeFileSync('public/icons/apple-touch-icon.png', webIcon(180));
writeFileSync('public/icons/icon-192.png', webIcon(192));
writeFileSync('public/icons/icon-512.png', webIcon(512));
writeFileSync('public/icons/icon-maskable-512.png', webIcon(512, 0.8));
console.log('Icons written to assets/ and public/icons/');
