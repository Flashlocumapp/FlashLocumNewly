import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInflate } from 'zlib';
import { Readable } from 'stream';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── 1. Register font ──────────────────────────────────────────────────────────
const fontPath = resolve(ROOT, 'assets/fonts/Inter_600SemiBold.ttf');
GlobalFonts.registerFromPath(fontPath, 'Inter');

// ── 2. Generate splash-text.png ───────────────────────────────────────────────
const CANVAS_W = 1300;
const CANVAS_H = 302;
const FONT_SIZE = 345;
const TEXT = 'FlashLocum';

const canvas = createCanvas(CANVAS_W, CANVAS_H);
const ctx = canvas.getContext('2d');

ctx.font = `600 ${FONT_SIZE}px Inter`;
ctx.fillStyle = '#FFFFFF';
ctx.textBaseline = 'alphabetic';

const metrics = ctx.measureText(TEXT);
const textW = metrics.width;

// Vertical centering: use ascent/descent if available, else estimate
const ascent = metrics.actualBoundingBoxAscent ?? FONT_SIZE * 0.73;
const descent = metrics.actualBoundingBoxDescent ?? FONT_SIZE * 0.1;
const textH = ascent + descent;

const x = (CANVAS_W - textW) / 2;
const y = (CANVAS_H - textH) / 2 + ascent;

ctx.fillText(TEXT, x, y);

const pngBuffer = canvas.toBuffer('image/png');
const splashPath = resolve(ROOT, 'assets/images/splash-text.png');
writeFileSync(splashPath, pngBuffer);
console.log(`\nWrote ${splashPath} (${pngBuffer.length} bytes)`);

// ── 3. Measure visible bounding box ──────────────────────────────────────────
function measureVisibleBounds(buffer) {
  // Parse PNG chunks to find IHDR (dimensions) and IDAT (pixel data)
  let offset = 8; // skip PNG signature
  let width = 0, height = 0;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.slice(offset + 4, offset + 8).toString('ascii');
    const data = buffer.slice(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }

  return new Promise((resolve, reject) => {
    const combined = Buffer.concat(idatChunks);
    const inflate = createInflate();
    const chunks = [];

    inflate.on('data', chunk => chunks.push(chunk));
    inflate.on('end', () => {
      const raw = Buffer.concat(chunks);
      // Each row: 1 filter byte + width * 4 bytes (RGBA)
      const bytesPerRow = 1 + width * 4;

      let minX = width, maxX = -1, minY = height, maxY = -1;

      for (let row = 0; row < height; row++) {
        const rowStart = row * bytesPerRow + 1; // skip filter byte
        for (let col = 0; col < width; col++) {
          const pixelOffset = rowStart + col * 4;
          const alpha = raw[pixelOffset + 3];
          if (alpha > 10) { // threshold to ignore near-transparent anti-aliasing
            if (col < minX) minX = col;
            if (col > maxX) maxX = col;
            if (row < minY) minY = row;
            if (row > maxY) maxY = row;
          }
        }
      }

      resolve({ width, height, minX, maxX, minY, maxY });
    });
    inflate.on('error', reject);

    const readable = new Readable();
    readable.push(combined);
    readable.push(null);
    readable.pipe(inflate);
  });
}

const bounds = await measureVisibleBounds(pngBuffer);
const visW = bounds.maxX - bounds.minX + 1;
const visH = bounds.maxY - bounds.minY + 1;

console.log('\n── Splash-text.png measurements ──────────────────────────────');
console.log(`Canvas:       ${bounds.width} × ${bounds.height} px`);
console.log(`Visible bbox: x=${bounds.minX}–${bounds.maxX}, y=${bounds.minY}–${bounds.maxY}`);
console.log(`Visible size: ${visW} × ${visH} px`);

if (visH >= 220 && visH <= 280) {
  console.log(`✓ Visible height ${visH}px is within target range 220–280 px`);
} else {
  console.warn(`⚠ Visible height ${visH}px is OUTSIDE target range 220–280 px — adjust FONT_SIZE`);
}

// ── 4. Generate Android density PNGs ─────────────────────────────────────────
const DENSITY_SIZES = [
  { file: 'splash_mdpi.png',    size: 288 },
  { file: 'splash_hdpi.png',    size: 432 },
  { file: 'splash_xhdpi.png',   size: 576 },
  { file: 'splash_xxhdpi.png',  size: 864 },
  { file: 'splash_xxxhdpi.png', size: 1152 },
];

// Load the splash-text.png we just wrote as an Image
import('@napi-rs/canvas').then(async ({ loadImage }) => {
  const splashImg = await loadImage(splashPath);
  const srcW = splashImg.width;
  const srcH = splashImg.height;

  console.log('\n── Android density PNGs ───────────────────────────────────────');

  for (const { file, size } of DENSITY_SIZES) {
    const dc = createCanvas(size, size);
    const dctx = dc.getContext('2d');

    // Scale to fit maintaining aspect ratio
    const scale = Math.min(size / srcW, size / srcH);
    const dw = srcW * scale;
    const dh = srcH * scale;
    const dx = (size - dw) / 2;
    const dy = (size - dh) / 2;

    dctx.drawImage(splashImg, dx, dy, dw, dh);

    const outPath = resolve(ROOT, 'assets/images', file);
    writeFileSync(outPath, dc.toBuffer('image/png'));
    console.log(`  Wrote ${file} (${size}×${size}, text ${Math.round(dw)}×${Math.round(dh)})`);
  }

  console.log('\nDone.\n');
});
