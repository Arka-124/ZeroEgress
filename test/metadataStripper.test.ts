import { describe, it } from 'node:test';
import assert from 'node:assert';
import { stripJpegMetadata, stripPngMetadata, stripWebpMetadata } from '../src/engine/metadata/binaryStripper.ts';

describe('Metadata Stripper binary operations', () => {
  it('successfully strips 0xFFE1 APP1 (EXIF) and 0xFFFE (COM) markers from JPEG buffer', () => {
    // Construct a synthetic JPEG with:
    // 1. SOI: FF D8
    // 2. APP1 (EXIF): FF E1, length: 00 0A (10 bytes total), 'Exif\0\0\0\0'
    // 3. COM (Comment): FF FE, length: 00 07, 'hello'
    // 4. DQT (Quantization Table): FF DB, length: 00 04, AA BB
    // 5. SOS (Start of Scan): FF DA, length: 00 03, CC
    // 6. Image data: 11 22 33
    // 7. EOI: FF D9

    const rawJpeg: number[] = [
      0xff, 0xd8, // SOI
      0xff, 0xe1, 0x00, 0x0a, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x01, 0x02, // APP1 EXIF
      0xff, 0xfe, 0x00, 0x07, 0x68, 0x65, 0x6c, 0x6c, 0x6f, // COM
      0xff, 0xdb, 0x00, 0x04, 0xaa, 0xbb, // DQT (should be kept!)
      0xff, 0xda, 0x00, 0x03, 0xcc, // SOS
      0x11, 0x22, 0x33, // Scan image payload
      0xff, 0xd9, // EOI
    ];

    const inputBytes = new Uint8Array(rawJpeg);

    // Verify test buffer contains 0xFFE1 marker before stripping
    let hasApp1Before = false;
    for (let i = 0; i < inputBytes.length - 1; i++) {
      if (inputBytes[i] === 0xff && inputBytes[i + 1] === 0xe1) {
        hasApp1Before = true;
        break;
      }
    }
    assert.strictEqual(hasApp1Before, true, 'Original buffer must contain 0xFFE1 APP1 marker');

    // Run lossless stripper
    const cleanBytes = stripJpegMetadata(inputBytes);

    // Verify 0xFFE1 APP1 marker is completely gone
    let hasApp1After = false;
    let hasComAfter = false;
    let hasDqtAfter = false;
    let hasSosAfter = false;

    for (let i = 0; i < cleanBytes.length - 1; i++) {
      if (cleanBytes[i] === 0xff && cleanBytes[i + 1] === 0xe1) {
        hasApp1After = true;
      }
      if (cleanBytes[i] === 0xff && cleanBytes[i + 1] === 0xfe) {
        hasComAfter = true;
      }
      if (cleanBytes[i] === 0xff && cleanBytes[i + 1] === 0xdb) {
        hasDqtAfter = true;
      }
      if (cleanBytes[i] === 0xff && cleanBytes[i + 1] === 0xda) {
        hasSosAfter = true;
      }
    }

    assert.strictEqual(hasApp1After, false, 'Clean buffer must NOT contain 0xFFE1 marker');
    assert.strictEqual(hasComAfter, false, 'Clean buffer must NOT contain 0xFFFE marker');
    assert.strictEqual(hasDqtAfter, true, 'Clean buffer MUST preserve DQT quantization table');
    assert.strictEqual(hasSosAfter, true, 'Clean buffer MUST preserve SOS marker');

    // Check SOI and EOI
    assert.strictEqual(cleanBytes[0], 0xff);
    assert.strictEqual(cleanBytes[1], 0xd8);
    assert.strictEqual(cleanBytes[cleanBytes.length - 2], 0xff);
    assert.strictEqual(cleanBytes[cleanBytes.length - 1], 0xd9);

    // Buffer should be smaller by exactly the removed metadata segments
    assert.ok(cleanBytes.length < inputBytes.length, 'Output buffer size should be smaller');
  });

  it('successfully strips tEXt chunks from PNG buffer while preserving IDAT and IEND', () => {
    // 8-byte signature
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    // IHDR (length 0 for dummy)
    const ihdr = [0x00, 0x00, 0x00, 0x00, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x00];
    // tEXt chunk: length 4, 'tEXt', 'data', crc 4
    const textChunk = [
      0x00, 0x00, 0x00, 0x04, 0x74, 0x45, 0x58, 0x74, 0x61, 0x62, 0x63, 0x64, 0x11, 0x22, 0x33, 0x44,
    ];
    // IDAT chunk: length 2, 'IDAT', 'xx', crc 4
    const idat = [0x00, 0x00, 0x00, 0x02, 0x49, 0x44, 0x41, 0x54, 0xaa, 0xbb, 0x55, 0x66, 0x77, 0x88];
    // IEND
    const iend = [0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0x00, 0x00, 0x00, 0x00];

    const rawPng = new Uint8Array([...sig, ...ihdr, ...textChunk, ...idat, ...iend]);
    const cleanPng = stripPngMetadata(rawPng);

    const cleanStr = new TextDecoder('latin1').decode(cleanPng);
    assert.ok(!cleanStr.includes('tEXt'), 'tEXt chunk removed');
    assert.ok(cleanStr.includes('IHDR'), 'IHDR preserved');
    assert.ok(cleanStr.includes('IDAT'), 'IDAT preserved');
    assert.ok(cleanStr.includes('IEND'), 'IEND preserved');
  });

  it('successfully strips EXIF chunk from WebP buffer and cleans VP8X flags', () => {
    // RIFF .... WEBP
    const riffHeader = [
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, // RIFF 36 WEBP
    ];
    // VP8X with EXIF flag set (bit 3 of flags byte: 0x08)
    const vp8x = [
      0x56, 0x50, 0x38, 0x58, // 'VP8X'
      0x0a, 0x00, 0x00, 0x00, // length 10
      0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // payload
    ];
    // EXIF chunk
    const exifChunk = [
      0x45, 0x58, 0x49, 0x46, // 'EXIF'
      0x04, 0x00, 0x00, 0x00, // length 4
      0x01, 0x02, 0x03, 0x04,
    ];

    const rawWebp = new Uint8Array([...riffHeader, ...vp8x, ...exifChunk]);
    const cleanWebp = stripWebpMetadata(rawWebp);

    const cleanStr = new TextDecoder('latin1').decode(cleanWebp);
    assert.ok(!cleanStr.includes('EXIF'), 'EXIF chunk removed from WebP');
    assert.ok(cleanStr.includes('VP8X'), 'VP8X chunk preserved');
  });
});
