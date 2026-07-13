/* eslint-env node */
// Generates assets/images/amber-dot.png — 36x36 RGBA PNG
// amber fill #F59E0B, white border 2.5px, transparent background
// No external dependencies — raw PNG chunk construction

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const WIDTH = 36;
const HEIGHT = 36;
const CX = 18; // center x (0-indexed, so pixel 17.5 is center)
const CY = 18; // center y
const OUTER_R = 9;   // outer radius of circle
const INNER_R = 6.5; // inner radius (amber fill inside border)

// Build raw RGBA pixel data
const pixels = new Uint8Array(WIDTH * HEIGHT * 4);

for (let y = 0; y < HEIGHT; y++) {
  for (let x = 0; x < WIDTH; x++) {
    // Use pixel center: (x + 0.5, y + 0.5)
    const dx = (x + 0.5) - CX;
    const dy = (y + 0.5) - CY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const idx = (y * WIDTH + x) * 4;

    if (dist <= INNER_R) {
      // Amber fill #F59E0B
      pixels[idx]     = 245;
      pixels[idx + 1] = 158;
      pixels[idx + 2] = 11;
      pixels[idx + 3] = 255;
    } else if (dist <= OUTER_R) {
      // White border
      pixels[idx]     = 255;
      pixels[idx + 1] = 255;
      pixels[idx + 2] = 255;
      pixels[idx + 3] = 255;
    } else {
      // Transparent
      pixels[idx]     = 0;
      pixels[idx + 1] = 0;
      pixels[idx + 2] = 0;
      pixels[idx + 3] = 0;
    }
  }
}

// ── PNG encoding ──────────────────────────────────────────────────────────────

function crc32(buf) {
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })());
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBytes, data]);
  const crcVal = Buffer.alloc(4);
  crcVal.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBytes, data, crcVal]);
}

// IHDR
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(WIDTH, 0);
ihdr.writeUInt32BE(HEIGHT, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // color type: RGBA
ihdr[10] = 0; // compression
ihdr[11] = 0; // filter
ihdr[12] = 0; // interlace

// Raw image data with filter byte per scanline
const rawRows = [];
for (let y = 0; y < HEIGHT; y++) {
  rawRows.push(0); // filter type None
  for (let x = 0; x < WIDTH; x++) {
    const idx = (y * WIDTH + x) * 4;
    rawRows.push(pixels[idx], pixels[idx+1], pixels[idx+2], pixels[idx+3]);
  }
}
const rawBuf = Buffer.from(rawRows);
const compressed = zlib.deflateSync(rawBuf, { level: 9 });

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const png = Buffer.concat([
  pngSignature,
  chunk('IHDR', ihdr),
  chunk('IDAT', compressed),
  chunk('IEND', Buffer.alloc(0)),
]);

const outPath = path.join(__dirname, '..', 'assets', 'images', 'amber-dot.png');
fs.writeFileSync(outPath, png);
console.log(`Written ${png.length} bytes to ${outPath}`);
