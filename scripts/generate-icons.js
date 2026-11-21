'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ASSETS_DIR = path.resolve(__dirname, '..', 'assets');
const DOCS_DIR = path.resolve(__dirname, '..', 'docs');

// Standard PNG CRC-32 lookup table
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([lenBuf, body, crcBuf]);
}

function encodePngRgba(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // Bit depth
  ihdr[9] = 6;  // Color type: RGBA
  ihdr[10] = 0; // Compression: deflate
  ihdr[11] = 0; // Filter: adaptive
  ihdr[12] = 0; // Interlace: none

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rawRow = y * (stride + 1);
    raw[rawRow] = 0; // Filter type 0 (None)
    rgba.copy(raw, rawRow + 1, y * stride, (y + 1) * stride);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function encodeIcoBmpPayload(size, rgba) {
  const header = Buffer.alloc(40);
  const pixelBytesLen = size * size * 4;
  const andRowStride = Math.ceil(size / 32) * 4;
  const andMaskLen = andRowStride * size;

  header.writeUInt32LE(40, 0); // biSize
  header.writeInt32LE(size, 4); // biWidth
  header.writeInt32LE(size * 2, 8); // biHeight (XOR + AND)
  header.writeUInt16LE(1, 12); // biPlanes
  header.writeUInt16LE(32, 14); // biBitCount
  header.writeUInt32LE(0, 16); // biCompression (BI_RGB)
  header.writeUInt32LE(pixelBytesLen + andMaskLen, 20); // biSizeImage

  const pixels = Buffer.alloc(pixelBytesLen);
  const andMask = Buffer.alloc(andMaskLen);

  for (let y = 0; y < size; y++) {
    const srcRow = size - 1 - y; // Bottom-up order
    for (let x = 0; x < size; x++) {
      const srcIdx = (srcRow * size + x) * 4;
      const dstIdx = (y * size + x) * 4;
      const r = rgba[srcIdx];
      const g = rgba[srcIdx + 1];
      const b = rgba[srcIdx + 2];
      const a = rgba[srcIdx + 3];
      pixels[dstIdx] = b;
      pixels[dstIdx + 1] = g;
      pixels[dstIdx + 2] = r;
      pixels[dstIdx + 3] = a;

      if (a < 128) {
        const maskByteIdx = y * andRowStride + (x >> 3);
        andMask[maskByteIdx] |= (1 << (7 - (x & 7)));
      }
    }
  }

  return Buffer.concat([header, pixels, andMask]);
}

function encodeIco(entries) {
  const count = entries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type: 1 = Icon
  header.writeUInt16LE(count, 4);

  const dir = Buffer.alloc(16 * count);
  let offset = 6 + dir.length;

  const payloads = [];
  for (let i = 0; i < count; i++) {
    const { size, data } = entries[i];
    const base = i * 16;
    dir[base] = size >= 256 ? 0 : size;
    dir[base + 1] = size >= 256 ? 0 : size;
    dir[base + 2] = 0; // Color palette
    dir[base + 3] = 0; // Reserved
    dir.writeUInt16LE(1, base + 4); // Color planes
    dir.writeUInt16LE(32, base + 6); // Bits per pixel
    dir.writeUInt32LE(data.length, base + 8);
    dir.writeUInt32LE(offset, base + 12);
    offset += data.length;
    payloads.push(data);
  }

  return Buffer.concat([header, dir, ...payloads]);
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function sdRoundedBox(px, py, cx, cy, hx, hy, r) {
  const qx = Math.abs(px - cx) - hx + r;
  const qy = Math.abs(py - cy) - hy + r;
  const mx = Math.max(qx, 0);
  const my = Math.max(qy, 0);
  return Math.hypot(mx, my) + Math.min(Math.max(qx, qy), 0) - r;
}

function sdSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const denom = bax * bax + bay * bay || 1e-6;
  const h = clamp01((pax * bax + pay * bay) / denom);
  return Math.hypot(pax - bax * h, pay - bay * h);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function blendOver(dstR, dstG, dstB, dstA, srcR, srcG, srcB, srcA) {
  const inv = 1 - srcA;
  const outA = srcA + dstA * inv;
  if (outA <= 1e-6) return [0, 0, 0, 0];
  return [
    (srcR * srcA + dstR * dstA * inv) / outA,
    (srcG * srcA + dstG * dstA * inv) / outA,
    (srcB * srcA + dstB * dstA * inv) / outA,
    outA
  ];
}

function wrapPi(a) {
  let x = (a + Math.PI) % (2 * Math.PI);
  if (x < 0) x += 2 * Math.PI;
  return x - Math.PI;
}

function sdArc(px, py, cx, cy, r, startAngle, sweepAngle) {
  const dx = px - cx;
  const dy = py - cy;
  const distR = Math.hypot(dx, dy);
  const midAngle = startAngle + sweepAngle * 0.5;
  const halfSweep = Math.abs(sweepAngle) * 0.5;
  const angle = Math.atan2(dy, dx);
  const dAng = wrapPi(angle - midAngle);
  if (Math.abs(dAng) <= halfSweep) {
    return Math.abs(distR - r);
  }
  const endAngle = startAngle + sweepAngle;
  const sx = cx + r * Math.cos(startAngle);
  const sy = cy + r * Math.sin(startAngle);
  const ex = cx + r * Math.cos(endAngle);
  const ey = cy + r * Math.sin(endAngle);
  return Math.min(Math.hypot(px - sx, py - sy), Math.hypot(px - ex, py - ey));
}

function sampleTwinSyncIcon(u, v, pxScale) {
  const aa = 0.75 * pxScale;
  const S = 1 / 256;

  // Rounded squircle outer frame: x=12, y=12, width=232, height=232, rx=56
  const bgDist = sdRoundedBox(u, v, 0.5, 0.5, 116 * S, 116 * S, 56 * S);
  const bgAlpha = 1 - smoothstep(-aa, aa, bgDist);
  if (bgAlpha <= 0.001) return [0, 0, 0, 0];

  // Diagonal indigo (#4F46E5) -> sky (#0EA5E9) -> emerald (#10B981) gradient
  const gradT = clamp01(((u - 12 * S) + (v - 12 * S)) / (464 * S));
  let r, g, b;
  if (gradT < 0.5) {
    const t = gradT * 2;
    r = lerp(79, 14, t);
    g = lerp(70, 165, t);
    b = lerp(229, 233, t);
  } else {
    const t = (gradT - 0.5) * 2;
    r = lerp(14, 16, t);
    g = lerp(165, 185, t);
    b = lerp(233, 129, t);
  }

  // Subtle top-left glass sheen inside squircle (cx=24%, cy=18%, r=65%)
  const sheenCx = (12 + 0.24 * 232) * S;
  const sheenCy = (12 + 0.18 * 232) * S;
  const sheenR = 0.65 * 232 * S;
  const sheen = clamp01(1 - Math.hypot(u - sheenCx, v - sheenCy) / sheenR) * 0.24;
  let a = bgAlpha;
  [r, g, b, a] = blendOver(r, g, b, a, 255, 255, 255, sheen * bgAlpha);

  // Subtle white inner stroke (stroke-opacity="0.22", stroke-width="3")
  const rimDist = Math.abs(bgDist + 1.5 * S) - 1.5 * S;
  const rimAlpha = (1 - smoothstep(-aa, aa, rimDist)) * 0.22 * bgAlpha;
  [r, g, b, a] = blendOver(r, g, b, a, 255, 255, 255, rimAlpha);

  // Symmetric glowing halos behind the twin nodes
  const leftNodeX = 100 * S, nodeY = 128 * S;
  const rightNodeX = 156 * S;
  const glowRadius = 26 * S;
  const nodeXs = [leftNodeX, rightNodeX];
  for (let i = 0; i < nodeXs.length; i++) {
    const tGlow = clamp01(Math.hypot(u - nodeXs[i], v - nodeY) / glowRadius);
    if (tGlow < 1) {
      const glowA = tGlow < 0.55
        ? lerp(0.45, 0.16, tGlow / 0.55)
        : lerp(0.16, 0.0, (tGlow - 0.55) / 0.45);
      [r, g, b, a] = blendOver(r, g, b, a, 224, 242, 254, glowA * bgAlpha);
    }
  }

  // Mirrored interlocking smooth sync arcs with rounded chevron arrowheads
  const arcRadius = 68 * S;
  const halfStroke = 8 * S;
  const sweep = (150 * Math.PI) / 180;

  // Upper sync arc (#FFFFFF): 195 deg -> 345 deg + chevron
  const upperArcDist = sdArc(u, v, 0.5, 0.5, arcRadius, (195 * Math.PI) / 180, sweep);
  const upperTipX = 193.68 * S, upperTipY = 110.40 * S;
  const upperChev1 = sdSegment(u, v, upperTipX, upperTipY, 200.52 * S, 90.54 * S);
  const upperChev2 = sdSegment(u, v, upperTipX, upperTipY, 175.31 * S, 100.22 * S);
  const upperDist = Math.min(upperArcDist, upperChev1, upperChev2) - halfStroke;
  const upperAlpha = (1 - smoothstep(-aa, aa, upperDist)) * bgAlpha;
  [r, g, b, a] = blendOver(r, g, b, a, 255, 255, 255, upperAlpha);

  // Lower sync arc (#E0F2FE): 15 deg -> 165 deg + chevron
  const lowerArcDist = sdArc(u, v, 0.5, 0.5, arcRadius, (15 * Math.PI) / 180, sweep);
  const lowerTipX = 62.32 * S, lowerTipY = 145.60 * S;
  const lowerChev1 = sdSegment(u, v, lowerTipX, lowerTipY, 55.48 * S, 165.46 * S);
  const lowerChev2 = sdSegment(u, v, lowerTipX, lowerTipY, 80.69 * S, 155.78 * S);
  const lowerDist = Math.min(lowerArcDist, lowerChev1, lowerChev2) - halfStroke;
  const lowerAlpha = (1 - smoothstep(-aa, aa, lowerDist)) * bgAlpha;
  [r, g, b, a] = blendOver(r, g, b, a, 224, 242, 254, lowerAlpha);

  // Crisp twin node cores
  const coreRadius = 12.5 * S;
  const leftCoreDist = Math.hypot(u - leftNodeX, v - nodeY) - coreRadius;
  const leftCoreAlpha = (1 - smoothstep(-aa, aa, leftCoreDist)) * bgAlpha;
  [r, g, b, a] = blendOver(r, g, b, a, 255, 255, 255, leftCoreAlpha);

  const rightCoreDist = Math.hypot(u - rightNodeX, v - nodeY) - coreRadius;
  const rightCoreAlpha = (1 - smoothstep(-aa, aa, rightCoreDist)) * bgAlpha;
  [r, g, b, a] = blendOver(r, g, b, a, 224, 242, 254, rightCoreAlpha);

  return [r, g, b, a];
}

function renderIconRgba(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const subSamples = size <= 48 ? 4 : 2;
  const invSub = 1 / subSamples;
  const invTotal = 1 / (subSamples * subSamples);
  const pxScale = 1 / size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let accR = 0;
      let accG = 0;
      let accB = 0;
      let accA = 0;

      for (let sy = 0; sy < subSamples; sy++) {
        const v = (y + (sy + 0.5) * invSub) * pxScale;
        for (let sx = 0; sx < subSamples; sx++) {
          const u = (x + (sx + 0.5) * invSub) * pxScale;
          const [sr, sg, sb, sa] = sampleTwinSyncIcon(u, v, pxScale);
          accR += sr * sa;
          accG += sg * sa;
          accB += sb * sa;
          accA += sa;
        }
      }

      const avgA = accA * invTotal;
      const idx = (y * size + x) * 4;
      if (avgA > 1e-4) {
        rgba[idx] = Math.min(255, Math.round((accR * invTotal) / avgA));
        rgba[idx + 1] = Math.min(255, Math.round((accG * invTotal) / avgA));
        rgba[idx + 2] = Math.min(255, Math.round((accB * invTotal) / avgA));
        rgba[idx + 3] = Math.min(255, Math.round(avgA * 255));
      } else {
        rgba[idx] = 0;
        rgba[idx + 1] = 0;
        rgba[idx + 2] = 0;
        rgba[idx + 3] = 0;
      }
    }
  }

  return rgba;
}

function generateSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <defs>
    <linearGradient id="ts-bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4F46E5" />
      <stop offset="50%" stop-color="#0EA5E9" />
      <stop offset="100%" stop-color="#10B981" />
    </linearGradient>
    <radialGradient id="ts-sheen" cx="24%" cy="18%" r="65%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.24" />
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="ts-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#E0F2FE" stop-opacity="0.45" />
      <stop offset="55%" stop-color="#E0F2FE" stop-opacity="0.16" />
      <stop offset="100%" stop-color="#E0F2FE" stop-opacity="0" />
    </radialGradient>
  </defs>

  <!-- Rounded squircle background -->
  <rect x="12" y="12" width="232" height="232" rx="56" fill="url(#ts-bg)" />
  <rect x="12" y="12" width="232" height="232" rx="56" fill="url(#ts-sheen)" />
  <rect x="13.5" y="13.5" width="229" height="229" rx="54.5" fill="none" stroke="#FFFFFF" stroke-opacity="0.22" stroke-width="3" />

  <!-- Symmetric glowing twin nodes -->
  <circle cx="100" cy="128" r="26" fill="url(#ts-glow)" />
  <circle cx="156" cy="128" r="26" fill="url(#ts-glow)" />

  <!-- Mirrored interlocking smooth sync arcs with rounded chevron arrowheads -->
  <g fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="16">
    <path d="M 62.32 110.40 A 68 68 0 0 1 193.68 110.40" stroke="#FFFFFF" />
    <path d="M 200.52 90.54 L 193.68 110.40 L 175.31 100.22" stroke="#FFFFFF" />
    <path d="M 193.68 145.60 A 68 68 0 0 1 62.32 145.60" stroke="#E0F2FE" />
    <path d="M 55.48 165.46 L 62.32 145.60 L 80.69 155.78" stroke="#E0F2FE" />
  </g>

  <!-- Crisp twin node cores -->
  <circle cx="100" cy="128" r="12.5" fill="#FFFFFF" />
  <circle cx="156" cy="128" r="12.5" fill="#E0F2FE" />
</svg>
`;
}

function main() {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
  fs.mkdirSync(DOCS_DIR, { recursive: true });

  const svgMarkup = generateSvg();
  const svgPath = path.join(ASSETS_DIR, 'icon.svg');
  const docsSvgPath = path.join(DOCS_DIR, 'icon.svg');
  fs.writeFileSync(svgPath, svgMarkup, 'utf8');
  fs.writeFileSync(docsSvgPath, svgMarkup, 'utf8');

  const rgba16 = renderIconRgba(16);
  const rgba32 = renderIconRgba(32);
  const rgba48 = renderIconRgba(48);
  const rgba256 = renderIconRgba(256);

  const png32 = encodePngRgba(32, 32, rgba32);
  const png256 = encodePngRgba(256, 256, rgba256);

  const iconPngPath = path.join(ASSETS_DIR, 'icon.png');
  const trayPngPath = path.join(ASSETS_DIR, 'tray-icon.png');
  fs.writeFileSync(iconPngPath, png256);
  fs.writeFileSync(trayPngPath, png32);

  const icoBuffer = encodeIco([
    { size: 16, data: encodeIcoBmpPayload(16, rgba16) },
    { size: 32, data: encodeIcoBmpPayload(32, rgba32) },
    { size: 48, data: encodeIcoBmpPayload(48, rgba48) },
    { size: 256, data: png256 }
  ]);
  const icoPath = path.join(ASSETS_DIR, 'icon.ico');
  fs.writeFileSync(icoPath, icoBuffer);

  console.log('Generated TwinSync Pro icon assets:');
  for (const file of [svgPath, docsSvgPath, iconPngPath, trayPngPath, icoPath]) {
    const stat = fs.statSync(file);
    console.log(` - ${path.relative(path.resolve(__dirname, '..'), file)} (${stat.size} bytes)`);
  }
}

main();
