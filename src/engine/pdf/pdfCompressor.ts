/**
 * Client-side PDF Compression Engine using pdf-lib and stream optimization.
 * 100% offline, zero server uploads, privacy-preserving client-side processing.
 */

import { PDFDocument, PDFName, PDFRawStream, PDFRef } from 'pdf-lib';

export type PdfCompressionPreset = 'max' | 'balanced' | 'quality';

export interface PdfCompressionOptions {
  preset: PdfCompressionPreset;
  stripMetadata?: boolean;
}

export interface PdfCompressionResult {
  blob: Blob;
  outputFileName: string;
  originalSize: number;
  compressedSize: number;
  savedBytes: number;
  savingsPercent: number;
  durationMs: number;
}

/**
 * Calculates an accurate estimated compressed size based on preset and original file size.
 */
export function estimateCompressedSize(originalSize: number, preset: PdfCompressionPreset): {
  estimatedSize: number;
  estimatedSavingsPercent: number;
} {
  let ratio = 0.70; // 30% savings
  let savings = 30;

  if (preset === 'max') {
    ratio = 0.45; // ~55% savings
    savings = 55;
  } else if (preset === 'balanced') {
    ratio = 0.65; // ~35% savings
    savings = 35;
  } else if (preset === 'quality') {
    ratio = 0.82; // ~18% savings
    savings = 18;
  }

  const estimatedSize = Math.max(1024, Math.round(originalSize * ratio));
  return {
    estimatedSize,
    estimatedSavingsPercent: savings,
  };
}

/**
 * Compress embedded JPEG / PNG images inside a PDF context if running in browser with canvas support.
 */
async function optimizeEmbeddedImages(
  pdfDoc: PDFDocument,
  preset: PdfCompressionPreset,
  onProgress?: (ratio: number) => void
): Promise<void> {
  const context = pdfDoc.context;
  const indirectObjects = context.enumerateIndirectObjects();
  const imageStreams: { ref: PDFRef; stream: PDFRawStream }[] = [];

  for (const [ref, obj] of indirectObjects) {
    if (obj instanceof PDFRawStream) {
      const dict = obj.dict;
      const type = dict.get(PDFName.of('Type'));
      const subtype = dict.get(PDFName.of('Subtype'));
      if (
        (subtype && subtype.toString() === '/Image') ||
        (type && type.toString() === '/XObject' && subtype && subtype.toString() === '/Image')
      ) {
        imageStreams.push({ ref, stream: obj });
      }
    }
  }

  if (imageStreams.length === 0 || typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  // Determine quality and max dimension based on preset
  let quality = 0.7;
  let maxDim = 1500;
  if (preset === 'max') {
    quality = 0.5;
    maxDim = 1000;
  } else if (preset === 'balanced') {
    quality = 0.72;
    maxDim = 1600;
  } else if (preset === 'quality') {
    quality = 0.85;
    maxDim = 2200;
  }

  let processed = 0;
  for (const { ref, stream } of imageStreams) {
    try {
      const bytes = stream.contents;
      if (!bytes || bytes.length < 4096) {
        // Skip tiny icons/masks
        continue;
      }

      // Check if JPEG (starts with 0xFF 0xD8)
      const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
      const blob = new Blob([bytes.buffer as ArrayBuffer], {
        type: isJpeg ? 'image/jpeg' : 'image/png',
      });

      // Decode using Image or createImageBitmap
      let bitmap: ImageBitmap | HTMLImageElement | null = null;
      if (typeof createImageBitmap !== 'undefined') {
        bitmap = await createImageBitmap(blob).catch(() => null);
      }

      if (bitmap) {
        let width = bitmap.width;
        let height = bitmap.height;

        if (width > maxDim || height > maxDim) {
          const scale = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        // Render to canvas and recompress
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(bitmap, 0, 0, width, height);
          const recompressedBlob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
          );

          if (recompressedBlob && recompressedBlob.size < bytes.length * 0.9) {
            const recompressedBytes = new Uint8Array(await recompressedBlob.arrayBuffer());
            // Update stream dictionary and replace indirect object
            stream.dict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
            stream.dict.set(PDFName.of('Width'), context.obj(width));
            stream.dict.set(PDFName.of('Height'), context.obj(height));
            stream.dict.set(PDFName.of('Length'), context.obj(recompressedBytes.length));
            const newStream = PDFRawStream.of(stream.dict, recompressedBytes);
            context.assign(ref, newStream);
          }
        }
      }
    } catch {
      // Graceful fallback: preserve original image stream
    }

    processed++;
    onProgress?.(0.3 + (processed / imageStreams.length) * 0.4);
  }
}

/**
 * Executes PDF compression with selectable presets and structural optimization.
 */
export async function compressPdf(
  file: File,
  options: PdfCompressionOptions,
  onProgress?: (ratio: number) => void
): Promise<PdfCompressionResult> {
  const startTime = performance.now();
  onProgress?.(0.05);

  const buffer = await file.arrayBuffer();
  onProgress?.(0.15);

  // Load document with pdf-lib
  const pdfDoc = await PDFDocument.load(buffer, {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  onProgress?.(0.3);

  // Strip thumbnails and non-essential objects
  const pages = pdfDoc.getPages();
  for (const page of pages) {
    try {
      page.node.delete(PDFName.of('Thumb'));
    } catch {
      // Ignore if no Thumb
    }
  }

  // Strip document metadata if requested or in max/balanced presets
  if (options.stripMetadata || options.preset === 'max') {
    try {
      pdfDoc.setTitle('');
      pdfDoc.setAuthor('');
      pdfDoc.setSubject('');
      pdfDoc.setKeywords([]);
      pdfDoc.setProducer('ZeroEgress Client-Side Optimizer');
      pdfDoc.setCreator('ZeroEgress');
    } catch {
      // Ignore
    }
  }

  // Recompress raster images in document
  await optimizeEmbeddedImages(pdfDoc, options.preset, onProgress);
  onProgress?.(0.75);

  // Re-save document with useObjectStreams: true for compressed cross-references
  const compressedBytes = await pdfDoc.save({
    useObjectStreams: true,
    addDefaultPage: false,
  });
  onProgress?.(0.95);

  const originalSize = file.size;
  let finalBytes = compressedBytes;

  // In the rare event that re-saving increased the size (e.g. tiny already-compressed PDF),
  // return the smaller of the two while ensuring safe output
  if (finalBytes.length > originalSize && options.preset !== 'max') {
    finalBytes = new Uint8Array(buffer);
  }

  onProgress?.(1.0);
  const durationMs = Math.round(performance.now() - startTime);
  const compressedSize = finalBytes.length;
  const savedBytes = Math.max(0, originalSize - compressedSize);
  const savingsPercent = originalSize > 0 ? Math.round((savedBytes / originalSize) * 100) : 0;

  const baseName = file.name.replace(/\.pdf$/i, '');
  const outputFileName = `${baseName}_compressed.pdf`;
  const blob = new Blob([finalBytes.buffer as ArrayBuffer], { type: 'application/pdf' });

  return {
    blob,
    outputFileName,
    originalSize,
    compressedSize,
    savedBytes,
    savingsPercent,
    durationMs,
  };
}
