// PWA 用アイコンを依存なしで生成する（グラデーション背景＋白い星）
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function inStar(x, y, cx, cy, R, r) {
  // 5 角星の内外判定（極座標の頂点を補間）
  const a = Math.atan2(y - cy, x - cx) + Math.PI / 2;
  const d = Math.hypot(x - cx, y - cy);
  const seg = (2 * Math.PI) / 10;
  let t = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const i = Math.floor(t / seg);
  const f = (t - i * seg) / seg;
  const r0 = i % 2 === 0 ? R : r;
  const r1 = i % 2 === 0 ? r : R;
  // 2 頂点を結ぶ直線までの半径を近似
  const p0 = [r0 * Math.cos(0), r0 * Math.sin(0)];
  const p1 = [r1 * Math.cos(seg), r1 * Math.sin(seg)];
  const ang = f * seg;
  const dir = [Math.cos(ang), Math.sin(ang)];
  const ex = p1[0] - p0[0], ey = p1[1] - p0[1];
  const den = dir[0] * ey - dir[1] * ex;
  const lim = (p0[0] * ey - p0[1] * ex) / den;
  return d <= lim;
}

function png(size) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      const t = (x + y) / (2 * size);
      let r = Math.round(0x3d + (0xff - 0x3d) * t);
      let g = Math.round(0xb8 + (0x8f - 0xb8) * t);
      let b = Math.round(0xf5 + (0xc8 - 0xf5) * t);
      if (inStar(x, y, size / 2, size * 0.53, size * 0.34, size * 0.14)) [r, g, b] = [255, 255, 255];
      row.set([r, g, b, 255], 1 + x * 4);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync('public/icon-192.png', png(192));
writeFileSync('public/icon-512.png', png(512));
writeFileSync('public/apple-touch-icon.png', png(180));
writeFileSync(
  'public/icon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3db8f5"/><stop offset="1" stop-color="#ff8fc8"/></linearGradient></defs><rect width="64" height="64" rx="14" fill="url(#g)"/><path fill="#fff" d="M32 12l5.9 12.6 13.8 1.6-10.2 9.4 2.8 13.6L32 42.4l-12.3 6.8 2.8-13.6-10.2-9.4 13.8-1.6z"/></svg>`,
);
console.log('icons written');
