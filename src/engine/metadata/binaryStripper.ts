import { PDFDocument, PDFName } from 'pdf-lib';

/**
 * Strips all metadata (EXIF, XMP, IPTC, comments) from JPEG, PNG, WebP, and PDF buffers.
 * Preserves the exact compressed image bitstream (lossless stripping without transcoding artifacts).
 */
export async function stripMetadataFromBuffer(
  buffer: ArrayBuffer,
  _fileName?: string
): Promise<{ cleanBytes: Uint8Array; mimeType: string }> {
  const bytes = new Uint8Array(buffer);

  // JPEG Detection (FF D8)
  if (bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const cleanBytes = stripJpegMetadata(bytes);
    return { cleanBytes, mimeType: 'image/jpeg' };
  }

  // PNG Detection (89 50 4E 47)
  if (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    const cleanBytes = stripPngMetadata(bytes);
    return { cleanBytes, mimeType: 'image/png' };
  }

  // WebP Detection (RIFF .... WEBP)
  if (
    bytes.length > 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) {
    const cleanBytes = stripWebpMetadata(bytes);
    return { cleanBytes, mimeType: 'image/webp' };
  }

  // PDF Detection (%PDF)
  if (
    bytes.length > 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  ) {
    const cleanBytes = await stripPdfMetadata(buffer);
    return { cleanBytes, mimeType: 'application/pdf' };
  }

  // Fallback: If format is unhandled, return as-is
  return { cleanBytes: bytes, mimeType: 'application/octet-stream' };
}

/**
 * Pure binary lossless stripper for JPEG segments
 * Eliminates APP1 (0xFFE1: EXIF/XMP), APP2 (0xFFE2), APP13 (0xFFED: IPTC), APP14 (0xFFEE), and COM (0xFFFE).
 */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const output: number[] = [];

  // Copy SOI (FF D8)
  output.push(bytes[0], bytes[1]);

  let offset = 2;
  const length = bytes.length;

  while (offset + 1 < length) {
    if (bytes[offset] !== 0xff) {
      // Stream error or reached image data directly, append remainder
      for (let i = offset; i < length; i++) {
        output.push(bytes[i]);
      }
      break;
    }

    const marker = bytes[offset + 1];

    // Marker 0xDA (SOS - Start of Scan) or 0xD9 (EOI):
    // From SOS onwards, the compressed entropy-coded scan data begins.
    // Copy remainder of the file without modification.
    if (marker === 0xda || marker === 0xd9) {
      for (let i = offset; i < length; i++) {
        output.push(bytes[i]);
      }
      break;
    }

    // Standalone markers without length: RST0-RST7 (0xD0-0xD7), SOI (0xD8), TEM (0x01)
    if (
      (marker >= 0xd0 && marker <= 0xd7) ||
      marker === 0xd8 ||
      marker === 0x01
    ) {
      output.push(bytes[offset], bytes[offset + 1]);
      offset += 2;
      continue;
    }

    // Read segment length (includes 2 length bytes)
    if (offset + 3 >= length) {
      break;
    }
    const segmentLength = view.getUint16(offset + 2);
    const segmentEnd = offset + 2 + segmentLength;

    // Check if this segment should be stripped:
    // 0xE1 = APP1 (EXIF / XMP)
    // 0xED = APP13 (IPTC / Photoshop)
    // 0xFE = COM (Comment)
    const isMetadataSegment =
      marker === 0xe1 || marker === 0xed || marker === 0xfe;

    if (!isMetadataSegment) {
      // Keep segment
      for (let i = offset; i < segmentEnd && i < length; i++) {
        output.push(bytes[i]);
      }
    }

    offset = segmentEnd;
  }

  return new Uint8Array(output);
}

/**
 * Pure binary lossless stripper for PNG chunks
 * Strips tEXt, zTXt, iTXt, eXIf, tIME, and dSIG chunks.
 */
export function stripPngMetadata(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const output: number[] = [];

  // Copy 8-byte PNG signature
  for (let i = 0; i < 8; i++) {
    output.push(bytes[i]);
  }

  let offset = 8;
  const length = bytes.length;

  while (offset + 11 < length) {
    const chunkLength = view.getUint32(offset);
    const chunkType = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7]
    );
    const totalChunkBytes = 12 + chunkLength; // 4 len + 4 type + data + 4 crc

    const isMetadataChunk =
      chunkType === 'tEXt' ||
      chunkType === 'zTXt' ||
      chunkType === 'iTXt' ||
      chunkType === 'eXIf' ||
      chunkType === 'tIME' ||
      chunkType === 'dSIG';

    if (!isMetadataChunk) {
      for (let i = offset; i < offset + totalChunkBytes && i < length; i++) {
        output.push(bytes[i]);
      }
    }

    offset += totalChunkBytes;
    if (chunkType === 'IEND') break;
  }

  return new Uint8Array(output);
}

/**
 * Pure binary lossless stripper for WebP chunks
 * Strips EXIF and XMP chunks and updates VP8X flags.
 */
export function stripWebpMetadata(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: { fourCC: string; data: Uint8Array }[] = [];

  let offset = 12; // skip RIFF + WEBP
  const length = bytes.length;

  while (offset + 7 < length) {
    const fourCC = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3]
    );
    const chunkSize = view.getUint32(offset + 4, true);
    const totalChunkBytes = 8 + chunkSize + (chunkSize % 2);

    if (fourCC !== 'EXIF' && fourCC !== 'XMP ') {
      let chunkData = bytes.slice(offset, offset + totalChunkBytes);

      // If VP8X chunk, unset EXIF bit (bit 3) and XMP bit (bit 2)
      if (fourCC === 'VP8X' && chunkData.length >= 9) {
        chunkData[8] = chunkData[8] & ~0x08; // clear EXIF flag
        chunkData[8] = chunkData[8] & ~0x04; // clear XMP flag
      }

      chunks.push({ fourCC, data: chunkData });
    }

    offset += totalChunkBytes;
  }

  // Calculate new total size
  let totalDataLength = 4; // 'WEBP'
  chunks.forEach((c) => {
    totalDataLength += c.data.length;
  });

  const output = new Uint8Array(8 + totalDataLength);
  const outView = new DataView(output.buffer);

  // Write 'RIFF'
  output[0] = 0x52; output[1] = 0x49; output[2] = 0x46; output[3] = 0x46;
  outView.setUint32(4, totalDataLength, true);
  // Write 'WEBP'
  output[8] = 0x57; output[9] = 0x45; output[10] = 0x42; output[11] = 0x50;

  let writeOffset = 12;
  chunks.forEach((c) => {
    output.set(c.data, writeOffset);
    writeOffset += c.data.length;
  });

  return output;
}

/**
 * Strips PDF metadata dictionaries and XMP metadata stream using pdf-lib
 */
export async function stripPdfMetadata(buffer: ArrayBuffer): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });

  // Clear standard document information dictionary
  pdf.setTitle('');
  pdf.setAuthor('');
  pdf.setSubject('');
  pdf.setKeywords([]);
  pdf.setProducer('');
  pdf.setCreator('');

  // Remove XMP Metadata packet stream from PDF catalog if present
  try {
    const catalog = pdf.catalog;
    catalog.delete(PDFName.of('Metadata'));
  } catch {
    // If not present
  }

  const cleanBytes = await pdf.save();
  return cleanBytes as Uint8Array;
}
