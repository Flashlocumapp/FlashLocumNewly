#!/usr/bin/env node
/**
 * Flattens the alpha channel from assets/icon.png against a white background
 * and re-exports as RGB PNG (no alpha) — required for Apple App Store submission.
 */

import { createRequire } from 'module';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconPath = path.resolve(__dirname, '../assets/icon.png');

async function flattenIcon() {
  let sharp;
  try {
    const require = createRequire(import.meta.url);
    sharp = require('sharp');
  } catch {
    console.log('sharp not found, trying to load from node_modules...');
    try {
      const { default: s } = await import('sharp');
      sharp = s;
    } catch {
      console.error('sharp is not available. Install it with: bun add sharp');
      process.exit(1);
    }
  }

  console.log(`Reading: ${iconPath}`);

  const outputBuffer = await sharp(iconPath)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .toColorspace('srgb')
    .png({ compressionLevel: 9 })
    .toBuffer();

  writeFileSync(iconPath, outputBuffer);
  console.log(`Written: ${iconPath}`);

  // Verify: PNG color type is at byte offset 25
  // PNG signature = 8 bytes, then IHDR chunk:
  //   4 bytes length, 4 bytes "IHDR", 4 bytes width, 4 bytes height,
  //   1 byte bit depth, 1 byte color type  <-- offset 25
  const written = readFileSync(iconPath);
  const colorType = written[25];
  const colorTypeNames = {
    0: 'Grayscale',
    2: 'RGB (truecolor)',
    3: 'Indexed-color',
    4: 'Grayscale+Alpha',
    6: 'RGBA (truecolor+alpha)',
  };
  console.log(`Color type byte (offset 25): 0x${colorType.toString(16).padStart(2, '0')} = ${colorTypeNames[colorType] ?? 'Unknown'}`);

  if (colorType === 2) {
    console.log('✓ Icon is RGB (no alpha) — Apple submission ready.');
  } else if (colorType === 6) {
    console.error('✗ Icon still has alpha channel (RGBA). Flattening may have failed.');
    process.exit(1);
  } else {
    console.warn(`⚠ Unexpected color type: ${colorType}`);
  }
}

flattenIcon().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
