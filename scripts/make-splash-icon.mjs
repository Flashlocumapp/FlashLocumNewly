import fs from 'fs';
import zlib from 'zlib';

const INPUT = 'assets/images/18347e94-3e49-4911-b030-1d003153e506.png';
const OUTPUT = 'assets/images/splash-icon.png';

// --- CRC32 ---
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const dataBytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(dataBytes.length, 0);
  const crcInput = Buffer.concat([typeBytes, dataBytes]);
  const crcVal = Buffer.alloc(4);
  crcVal.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBytes, dataBytes, crcVal]);
}

// --- Read source PNG ---
const srcBuf = fs.readFileSync(INPUT);

// Verify PNG signature
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
if (!srcBuf.slice(0, 8).equals(PNG_SIG)) {
  throw new Error('Not a valid PNG file');
}

// Parse chunks to find IHDR and IDAT
let offset = 8;
let width, height, bitDepth, colorType;
const idatChunks = [];

while (offset < srcBuf.length) {
  const chunkLen = srcBuf.readUInt32BE(offset);
  const chunkType = srcBuf.slice(offset + 4, offset + 8).toString('ascii');
  const chunkData = srcBuf.slice(offset + 8, offset + 8 + chunkLen);
  offset += 12 + chunkLen;

  if (chunkType === 'IHDR') {
    width = chunkData.readUInt32BE(0);
    height = chunkData.readUInt32BE(4);
    bitDepth = chunkData[8];
    colorType = chunkData[9];
    console.log(`Source PNG: ${width}x${height}, bitDepth=${bitDepth}, colorType=${colorType}`);
  } else if (chunkType === 'IDAT') {
    idatChunks.push(chunkData);
  } else if (chunkType === 'IEND') {
    break;
  }
}

if (colorType !== 2) {
  console.warn(`Warning: expected colorType=2 (RGB), got ${colorType}. Proceeding anyway.`);
}

// Decompress IDAT data
const compressedData = Buffer.concat(idatChunks);
const rawData = zlib.inflateSync(compressedData);

// Each row: 1 filter byte + width * 3 bytes (RGB)
const bytesPerRow = 1 + width * 3;
const expectedLen = height * bytesPerRow;
console.log(`Raw data length: ${rawData.length}, expected: ${expectedLen}`);

// Build RGBA scanlines
// Each output row: 1 filter byte (0x00) + width * 4 bytes (RGBA)
const rgbaRows = Buffer.alloc(height * (1 + width * 4));
let outOffset = 0;

for (let y = 0; y < height; y++) {
  const rowStart = y * bytesPerRow;
  // filter byte = 0 (None) for output
  rgbaRows[outOffset++] = 0x00;

  for (let x = 0; x < width; x++) {
    const srcPixelOffset = rowStart + 1 + x * 3;
    const r = rawData[srcPixelOffset];
    const g = rawData[srcPixelOffset + 1];
    const b = rawData[srcPixelOffset + 2];

    // Alpha = luminance: for greyscale R=G=B so alpha=R
    // For coloured pixels, alpha = max(R,G,B)
    const alpha = (r === g && g === b) ? r : Math.max(r, g, b);

    rgbaRows[outOffset++] = r;
    rgbaRows[outOffset++] = g;
    rgbaRows[outOffset++] = b;
    rgbaRows[outOffset++] = alpha;
  }
}

// Compress RGBA scanlines
const compressedRgba = zlib.deflateSync(rgbaRows, { level: 9 });

// Build output PNG
const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

// IHDR: width, height, bitDepth=8, colorType=6 (RGBA), compression=0, filter=0, interlace=0
const ihdrData = Buffer.alloc(13);
ihdrData.writeUInt32BE(width, 0);
ihdrData.writeUInt32BE(height, 4);
ihdrData[8] = 8;   // bitDepth
ihdrData[9] = 6;   // colorType = RGBA
ihdrData[10] = 0;  // compression
ihdrData[11] = 0;  // filter
ihdrData[12] = 0;  // interlace

const ihdrChunk = makeChunk('IHDR', ihdrData);
const idatChunk = makeChunk('IDAT', compressedRgba);
const iendChunk = makeChunk('IEND', Buffer.alloc(0));

const outPng = Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
fs.writeFileSync(OUTPUT, outPng);

console.log(`Written: ${OUTPUT} (${outPng.length} bytes)`);

// Verify: read back and check header
const verify = fs.readFileSync(OUTPUT);
const verifySig = verify.slice(0, 8);
const verifyIhdrLen = verify.readUInt32BE(8);
const verifyIhdrType = verify.slice(12, 16).toString('ascii');
const verifyColorType = verify[25]; // offset 8(sig)+4(len)+4(type)+9(fields before colorType)
console.log(`Verify: sig=${verifySig.toString('hex')}, IHDR type=${verifyIhdrType}, colorType=${verifyColorType} (expected 6 for RGBA)`);
console.log('Done!');
