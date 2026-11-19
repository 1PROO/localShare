'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ASSETS_DIR = path.resolve(__dirname, '..', 'assets');

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

function sampleWorkMeshIcon(u, v, pxScale) {
  const aa = 0.75 * pxScale;

  // Rounded squircle outer frame
  const bgDist = sdRoundedBox(u, v, 0.5, 0.5, 0.44, 0.44, 0.14);
  const bgAlpha = 1 - smoothstep(-aa, aa, bgDist);
  if (bgAlpha <= 0.001) return [0, 0, 0, 0];

  // Diagonal indigo (#4F46E5) -> blue (#3B82F6) -> emerald (#10B981) gradient
  const gradT = clamp01((u * 0.65 + v * 0.75) / 1.25);
  let r, g, b;
  if (gradT < 0.5) {
    const t = gradT * 2;
    r = lerp(79, 59, t);
    g = lerp(70, 130, t);
    b = lerp(229, 246, t);
  } else {
    const t = (gradT - 0.5) * 2;
    r = lerp(59, 16, t);
    g = lerp(130, 185, t);
    b = lerp(246, 129, t);
  }

  // Subtle top-left glass glow inside squircle
  const glowDist = Math.hypot(u - 0.28, v - 0.22);
  const glow = Math.max(0, 1 - glowDist / 0.65) * 0.16;
  r = lerp(r, 255, glow);
  g = lerp(g, 255, glow);
  b = lerp(b, 255, glow);

  // Subtle inner rim highlight
  const rimDist = Math.abs(bgDist + 0.014);
  const rimAlpha = (1 - smoothstep(0, 0.016 + aa, rimDist)) * 0.22;
  let a = bgAlpha;
  [r, g, b, a] = blendOver(r, g, b, a, 255, 255, 255, rimAlpha * bgAlpha);

  // Mesh connections between hub (0.50, 0.54) and 3 peer nodes
  const topX = 0.50, topY = 0.225;
  const leftX = 0.235, leftY = 0.735;
  const rightX = 0.765, rightY = 0.735;
  const hubX = 0.50, hubY = 0.545;

  const lineWidth = 0.024;
  const dL1 = sdSegment(u, v, topX, topY, hubX, hubY) - lineWidth;
  const dL2 = sdSegment(u, v, leftX, leftY, hubX, hubY) - lineWidth;
  const dL3 = sdSegment(u, v, rightX, rightY, hubX, hubY) - lineWidth;
  const dL4 = sdSegment(u, v, leftX, leftY, rightX, rightY) - lineWidth * 0.7;
  const meshLineDist = Math.min(dL1, dL2, dL3, dL4);
  const meshLineAlpha = (1 - smoothstep(-aa, aa, meshLineDist)) * 0.85 * bgAlpha;
  [r, g, b, a] = blendOver(r, g, b, a, 224, 242, 254, meshLineAlpha);

  // Central rounded workspace folder-chat hub
  const folderBody = sdRoundedBox(u, v, 0.50, 0.555, 0.17, 0.125, 0.042);
  const folderTab = sdRoundedBox(u, v, 0.415, 0.435, 0.085, 0.042, 0.025);
  const folderDist = Math.min(folderBody, folderTab);
  const folderAlpha = (1 - smoothstep(-aa, aa, folderDist)) * bgAlpha;
  [r, g, b, a] = blendOver(r, g, b, a, 255, 255, 255, folderAlpha);

  // Chat/sync bars inside the white folder hub
  const bar1 = sdRoundedBox(u, v, 0.485, 0.535, 0.085, 0.015, 0.012);
  const bar2 = sdRoundedBox(u, v, 0.460, 0.590, 0.060, 0.015, 0.012);
  const barDist = Math.min(bar1, bar2);
  const barAlpha = (1 - smoothstep(-aa, aa, barDist)) * folderAlpha;
  [r, g, b, a] = blendOver(r, g, b, a, 79, 70, 229, barAlpha);

  // Emerald pulse dot inside folder hub
  const pulseDist = Math.hypot(u - 0.59, v - 0.59) - 0.024;
  const pulseAlpha = (1 - smoothstep(-aa, aa, pulseDist)) * folderAlpha;
  [r, g, b, a] = blendOver(r, g, b, a, 16, 185, 129, pulseAlpha);

  // Three outer peer nodes (white halo + emerald/indigo core)
  const nodes = [
    [topX, topY, 16, 185, 129],
    [leftX, leftY, 79, 70, 229],
    [rightX, rightY, 16, 185, 129]
  ];
  for (let i = 0; i < nodes.length; i++) {
    const [nx, ny, cr, cg, cb] = nodes[i];
    const dist = Math.hypot(u - nx, v - ny);
    const outerAlpha = (1 - smoothstep(-aa, aa, dist - 0.072)) * bgAlpha;
    [r, g, b, a] = blendOver(r, g, b, a, 255, 255, 255, outerAlpha);
    const innerAlpha = (1 - smoothstep(-aa, aa, dist - 0.038)) * bgAlpha;
    [r, g, b, a] = blendOver(r, g, b, a, cr, cg, cb, innerAlpha);
  }

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
          const [sr, sg, sb, sa] = sampleWorkMeshIcon(u, v, pxScale);
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
    <linearGradient id="wm-bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4F46E5" />
      <stop offset="50%" stop-color="#3B82F6" />
      <stop offset="100%" stop-color="#10B981" />
    </linearGradient>
    <linearGradient id="wm-shine" x1="0%" y1="0%" x2="80%" y2="80%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.24" />
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0" />
    </linearGradient>
  </defs>

  <!-- Squircle background -->
  <rect x="16" y="16" width="224" height="224" rx="48" fill="url(#wm-bg)" />
  <rect x="16" y="16" width="224" height="224" rx="48" fill="url(#wm-shine)" />
  <rect x="19" y="19" width="218" height="218" rx="45" fill="none" stroke="#FFFFFF" stroke-opacity="0.25" stroke-width="3" />

  <!-- Mesh network links -->
  <g stroke="#E0F2FE" stroke-opacity="0.88" stroke-width="11" stroke-linecap="round">
    <line x1="128" y1="58" x2="128" y2="140" />
    <line x1="60" y1="188" x2="128" y2="140" />
    <line x1="196" y1="188" x2="128" y2="140" />
    <line x1="60" y1="188" x2="196" y2="188" stroke-width="8" stroke-opacity="0.65" />
  </g>

  <!-- Central workspace folder + chat hub -->
  <path d="M84 114 C84 106 90 100 98 100 L122 100 C127 100 131 103 134 107 L138 111 L158 111 C166 111 172 117 172 125 L172 162 C172 170 166 176 158 176 L98 176 C90 176 84 170 84 162 Z" fill="#FFFFFF" />
  <rect x="102" y="132" width="44" height="8" rx="4" fill="#4F46E5" />
  <rect x="102" y="146" width="30" height="8" rx="4" fill="#4F46E5" />
  <circle cx="150" cy="150" r="6" fill="#10B981" />

  <!-- Peer nodes -->
  <g>
    <circle cx="128" cy="58" r="18" fill="#FFFFFF" />
    <circle cx="128" cy="58" r="9.5" fill="#10B981" />

    <circle cx="60" cy="188" r="18" fill="#FFFFFF" />
    <circle cx="60" cy="188" r="9.5" fill="#4F46E5" />

    <circle cx="196" cy="188" r="18" fill="#FFFFFF" />
    <circle cx="196" cy="188" r="9.5" fill="#10B981" />
  </g>
</svg>
`;
}

function main() {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });

  const svgPath = path.join(ASSETS_DIR, 'icon.svg');
  fs.writeFileSync(svgPath, generateSvg(), 'utf8');

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

  console.log('Generated WorkMesh icon assets:');
  for (const file of [svgPath, iconPngPath, trayPngPath, icoPath]) {
    const stat = fs.statSync(file);
    console.log(` - ${path.relative(path.resolve(__dirname, '..'), file)} (${stat.size} bytes)`);
  }
}

main();
