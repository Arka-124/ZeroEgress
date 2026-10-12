import opentype from 'opentype.js';
import * as wawoff2 from 'wawoff2';
import { deflateSync } from 'fflate';

export type FontTargetFormat = 'ttf' | 'otf' | 'woff' | 'woff2';

export interface FontMetadata {
  familyName: string;
  styleName: string;
  postScriptName: string;
  designer?: string;
  version?: string;
  numGlyphs: number;
  unitsPerEm: number;
  format: 'ttf' | 'otf' | 'woff' | 'woff2';
}

export interface ConvertedFontResult {
  blob: Blob;
  format: FontTargetFormat;
  fileName: string;
  size: number;
}

/**
 * Detect font format from magic bytes
 */
export function detectFontFormat(buffer: ArrayBuffer): 'ttf' | 'otf' | 'woff' | 'woff2' | 'unknown' {
  const bytes = new Uint8Array(buffer.slice(0, 4));
  const tag = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);

  if (tag === 'wOF2') return 'woff2';
  if (tag === 'wOFF') return 'woff';
  if (tag === 'OTTO') return 'otf';
  if (bytes[0] === 0x00 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00) return 'ttf';
  if (tag === 'true') return 'ttf';

  return 'unknown';
}

/**
 * Normalize input font buffer to standard TrueType/OpenType ArrayBuffer
 */
export async function normalizeToSfntBuffer(buffer: ArrayBuffer): Promise<{
  sfntBuffer: ArrayBuffer;
  font: opentype.Font;
}> {
  const format = detectFontFormat(buffer);
  let sfntBuffer = buffer;

  if (format === 'woff2') {
    // Decompress WOFF2 to TTF/OTF bytes
    const decompressed = await wawoff2.decompress(new Uint8Array(buffer));
    sfntBuffer = decompressed.buffer.slice(
      decompressed.byteOffset,
      decompressed.byteOffset + decompressed.byteLength
    ) as ArrayBuffer;
  }

  // Parse font
  const parseFn = (opentype as any).default?.parse || opentype.parse;
  const font = parseFn(sfntBuffer);

  return { sfntBuffer, font };
}

/**
 * Extract rich metadata from font
 */
export async function inspectFont(buffer: ArrayBuffer): Promise<FontMetadata> {
  const detected = detectFontFormat(buffer);
  const { font } = await normalizeToSfntBuffer(buffer);

  const names = font.names;
  const familyName = names.fontFamily?.en || names.fontFamily?.[Object.keys(names.fontFamily)[0]] || 'Unknown Family';
  const styleName = names.fontSubfamily?.en || names.fontSubfamily?.[Object.keys(names.fontSubfamily)[0]] || 'Regular';
  const postScriptName = names.postScriptName?.en || names.postScriptName?.[Object.keys(names.postScriptName)[0]] || familyName.replace(/\s+/g, '-');
  const designer = names.designer?.en || names.designer?.[Object.keys(names.designer)[0]];
  const version = names.version?.en || names.version?.[Object.keys(names.version)[0]];

  return {
    familyName,
    styleName,
    postScriptName,
    designer,
    version,
    numGlyphs: font.glyphs.length,
    unitsPerEm: font.unitsPerEm,
    format: detected === 'unknown' ? 'ttf' : detected,
  };
}

/**
 * Encode an SFNT (TTF/OTF) buffer into a valid WOFF (v1) file format
 */
export function encodeWoffV1(sfntBuffer: ArrayBuffer): Uint8Array {
  const view = new DataView(sfntBuffer);
  const numTables = view.getUint16(4);
  const flavor = view.getUint32(0);

  // Read tables
  interface TableEntry {
    tag: string;
    tagNum: number;
    offset: number;
    length: number;
    checksum: number;
    data: Uint8Array;
    compData: Uint8Array;
  }

  const tables: TableEntry[] = [];
  for (let i = 0; i < numTables; i++) {
    const entryOffset = 12 + i * 16;
    const tagNum = view.getUint32(entryOffset);
    const tag = String.fromCharCode(
      (tagNum >> 24) & 0xff,
      (tagNum >> 16) & 0xff,
      (tagNum >> 8) & 0xff,
      tagNum & 0xff
    );
    const checksum = view.getUint32(entryOffset + 4);
    const offset = view.getUint32(entryOffset + 8);
    const length = view.getUint32(entryOffset + 12);

    const rawTable = new Uint8Array(sfntBuffer, offset, length);
    // Deflate compression
    const compressed = deflateSync(rawTable);
    const compData = compressed.length < rawTable.length ? compressed : rawTable;

    tables.push({
      tag,
      tagNum,
      offset,
      length,
      checksum,
      data: rawTable,
      compData,
    });
  }

  // Calculate WOFF total length with 4-byte padding
  const headerSize = 44;
  const dirSize = numTables * 20;
  let currentOffset = headerSize + dirSize;

  const tableOffsets: number[] = [];
  for (const t of tables) {
    // 4-byte boundary alignment
    while (currentOffset % 4 !== 0) currentOffset++;
    tableOffsets.push(currentOffset);
    currentOffset += t.compData.length;
  }

  const totalWoffLength = currentOffset;
  const woffBytes = new Uint8Array(totalWoffLength);
  const woffView = new DataView(woffBytes.buffer);

  // Write WOFF header
  woffView.setUint32(0, 0x774f4646); // 'wOFF'
  woffView.setUint32(4, flavor); // flavor (0x00010000 or 'OTTO')
  woffView.setUint32(8, totalWoffLength); // length
  woffView.setUint16(12, numTables); // numTables
  woffView.setUint16(14, 0); // reserved
  woffView.setUint32(16, sfntBuffer.byteLength); // totalSfntSize
  woffView.setUint16(20, 1); // majorVersion
  woffView.setUint16(22, 0); // minorVersion
  woffView.setUint32(24, 0); // metaOffset
  woffView.setUint32(28, 0); // metaLength
  woffView.setUint32(32, 0); // metaOrigLength
  woffView.setUint32(36, 0); // privOffset
  woffView.setUint32(40, 0); // privLength

  // Write table directory
  for (let i = 0; i < numTables; i++) {
    const t = tables[i];
    const dirOffset = headerSize + i * 20;
    woffView.setUint32(dirOffset, t.tagNum);
    woffView.setUint32(dirOffset + 4, tableOffsets[i]);
    woffView.setUint32(dirOffset + 8, t.compData.length);
    woffView.setUint32(dirOffset + 12, t.length);
    woffView.setUint32(dirOffset + 16, t.checksum);

    // Write table bytes
    woffBytes.set(t.compData, tableOffsets[i]);
  }

  return woffBytes;
}

/**
 * Convert font buffer bidirectionally to target format
 */
export async function convertFont(
  buffer: ArrayBuffer,
  baseFileName: string,
  targetFormat: FontTargetFormat
): Promise<ConvertedFontResult> {
  const { sfntBuffer, font } = await normalizeToSfntBuffer(buffer);
  const baseName = baseFileName.replace(/\.[^/.]+$/, '');

  let outputBytes: Uint8Array;
  let mimeType = 'font/ttf';

  if (targetFormat === 'woff2') {
    mimeType = 'font/woff2';
    // Compress SFNT buffer into WOFF2
    outputBytes = await wawoff2.compress(new Uint8Array(sfntBuffer));
  } else if (targetFormat === 'woff') {
    mimeType = 'font/woff';
    outputBytes = encodeWoffV1(sfntBuffer);
  } else if (targetFormat === 'otf') {
    mimeType = 'font/otf';
    // Export OpenType table buffer
    outputBytes = new Uint8Array(font.toArrayBuffer());
  } else {
    // 'ttf'
    mimeType = 'font/ttf';
    outputBytes = new Uint8Array(font.toArrayBuffer());
  }

  const blob = new Blob([outputBytes as any], { type: mimeType });
  return {
    blob,
    format: targetFormat,
    fileName: `${baseName}.${targetFormat}`,
    size: blob.size,
  };
}
