/**
 * Universal Converter Router
 * Orchestrates and delegates multi-format and cross-category file conversions
 * to isolated, 100% client-side browser engines (WebAssembly, Canvas, Web Workers).
 */

import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';
import { zip } from 'fflate';
import mammoth from 'mammoth';

import { ffmpegService } from './media/ffmpegService';
import { createArchive } from './archives/archiveService';
import { convertFont, type FontTargetFormat } from './font/fontConverter';
import { parseDxf, dxfToSvg, dxfToPdf } from './cad/cadEngine';
import { parseEpubFile, convertTextOrMarkdownToPdf } from './ebook/ebookEngine';
import { traceBitmapToSvg } from './vector/vectorEngine';
import { normalizeExtension, detectSourceCategory } from './formatRegistry';

// Configure pdfjs-dist worker URL if running in browser
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions?.workerSrc) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '4.0.379'}/build/pdf.worker.min.mjs`;
  } catch {
    // Falls back to inline fake worker automatically
  }
}

export interface ConversionOutput {
  blob: Blob;
  fileName: string;
  isZip?: boolean;
}

/**
 * Decode File/Blob image into an HTML5 Canvas element
 */
async function fileToCanvas(file: File | Blob): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode image data into bitmap'));
    };
    img.src = url;
  });
}

/**
 * Image to PDF converter using pdf-lib
 */
async function convertImageToPdf(file: File | Blob, baseName: string): Promise<ConversionOutput> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.create();

  let embeddedImage;
  const isPng = file.type.includes('png') || (file as File).name?.toLowerCase().endsWith('.png');

  try {
    if (isPng) {
      embeddedImage = await pdfDoc.embedPng(arrayBuffer);
    } else {
      embeddedImage = await pdfDoc.embedJpg(arrayBuffer);
    }
  } catch {
    // Convert unknown image bitmap (WebP/AVIF/BMP) to PNG canvas first, then embed
    const canvas = await fileToCanvas(file);
    const pngBlob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    if (!pngBlob) throw new Error('Failed to encode image to canvas PNG');
    const pngBuf = await pngBlob.arrayBuffer();
    embeddedImage = await pdfDoc.embedPng(pngBuf);
  }

  const { width, height } = embeddedImage;
  const page = pdfDoc.addPage([width, height]);
  page.drawImage(embeddedImage, {
    x: 0,
    y: 0,
    width,
    height,
  });

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
  return {
    blob,
    fileName: `${baseName}.pdf`,
  };
}

/**
 * PDF to Images (PNG/JPG/WEBP) rendered at sharp 150 DPI with multi-page ZIP packaging
 */
async function convertPdfToImages(
  file: File | Blob,
  baseName: string,
  targetFormat: 'png' | 'jpg' | 'webp',
  onProgress?: (ratio: number) => void
): Promise<ConversionOutput> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  const scale = 150 / 72; // 150 DPI sharp rendering
  const mime = targetFormat === 'jpg' ? 'image/jpeg' : targetFormat === 'webp' ? 'image/webp' : 'image/png';
  const ext = targetFormat === 'jpg' ? 'jpg' : targetFormat;

  const pageBlobs: { name: string; blob: Blob }[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    if (targetFormat === 'jpg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), mime, 0.92)
    );

    if (blob) {
      pageBlobs.push({
        name: `page_${pageNum}.${ext}`,
        blob,
      });
    }

    onProgress?.((pageNum / numPages) * 0.9);
  }

  if (pageBlobs.length === 0) {
    throw new Error('PDF document contained no renderable pages');
  }

  if (pageBlobs.length === 1) {
    return {
      blob: pageBlobs[0].blob,
      fileName: `${baseName}_page_1.${ext}`,
      isZip: false,
    };
  }

  // Package multiple pages into a ZIP
  const zippable: Record<string, Uint8Array> = {};
  for (const pb of pageBlobs) {
    const buf = await pb.blob.arrayBuffer();
    zippable[pb.name] = new Uint8Array(buf);
  }

  const zipBytes = await new Promise<Uint8Array>((resolve, reject) => {
    zip(zippable, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });

  const zipBlob = new Blob([zipBytes as any], { type: 'application/zip' });
  return {
    blob: zipBlob,
    fileName: `${baseName}_pages_${ext}.zip`,
    isZip: true,
  };
}

/**
 * SVG vector to bitmap rasterization (PNG/JPG/WEBP)
 */
async function convertSvgToBitmap(
  file: File | Blob,
  baseName: string,
  targetFormat: 'png' | 'jpg' | 'webp'
): Promise<ConversionOutput> {
  const svgText = await file.text();
  const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const renderedBlob = await new Promise<Blob>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = (img.naturalWidth || 800) * 2;
      canvas.height = (img.naturalHeight || 600) * 2;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable'));
        return;
      }
      if (targetFormat === 'jpg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const mime = targetFormat === 'jpg' ? 'image/jpeg' : targetFormat === 'webp' ? 'image/webp' : 'image/png';
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('Rasterization failed'));
      }, mime, 0.95);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load SVG into image context'));
    };
    img.src = url;
  });

  const ext = targetFormat === 'jpg' ? 'jpg' : targetFormat;
  return {
    blob: renderedBlob,
    fileName: `${baseName}.${ext}`,
  };
}

/**
 * Master Universal Conversion Execution Function
 */
export async function executeUniversalConversion(
  file: File,
  targetFormat: string,
  onProgress?: (ratio: number) => void
): Promise<ConversionOutput> {
  const baseName = file.name.replace(/\.[^/.]+$/, '');
  const sourceExt = normalizeExtension(file.name);
  const targetExt = targetFormat.toLowerCase();
  const sourceCat = detectSourceCategory(file.name, file.type);

  onProgress?.(0.05);

  // 1. Target is Archive (ZIP / TAR / TAR.GZ)
  if (['zip', 'tar', 'tar.gz'].includes(targetExt)) {
    const format = targetExt === 'zip' ? 'zip' : targetExt === 'tar' ? 'tar' : 'tar.gz';
    const res = await createArchive([{ name: file.name, file }], format, 6, `${baseName}.${targetExt}`, (pct) => {
      onProgress?.(pct / 100);
    });
    return {
      blob: res.blob,
      fileName: res.fileName,
      isZip: true,
    };
  }

  // 2. Video or Audio Conversions (via FFmpeg WASM)
  const isVideoOrAudioTarget = [
    'mp4', 'webm', 'mkv', 'avi', 'mov', 'flv', 'wmv',
    'mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a', 'gif',
  ].includes(targetExt);

  if ((sourceCat === 'Video' || sourceCat === 'Audio') && isVideoOrAudioTarget) {
    onProgress?.(0.15);
    const result = await ffmpegService.convert(
      file,
      file.name,
      { targetFormat: targetExt },
      (ratio) => onProgress?.(ratio)
    );
    if (!result.success) {
      throw new Error(result.error || 'Media transcoding failed');
    }
    if (!result.data) {
      throw new Error('Media transcoding returned no output');
    }
    return {
      blob: result.data,
      fileName: `${baseName}.${targetExt}`,
    };
  }

  // 3. PDF to Images (PNG/JPG/WEBP)
  if (sourceExt === 'pdf' && ['png', 'jpg', 'jpeg', 'webp'].includes(targetExt)) {
    const fmt = targetExt === 'jpeg' || targetExt === 'jpg' ? 'jpg' : targetExt === 'webp' ? 'webp' : 'png';
    return await convertPdfToImages(file, baseName, fmt, onProgress);
  }

  // 4. PDF to Text or HTML extraction
  if (sourceExt === 'pdf' && ['txt', 'md', 'html'].includes(targetExt)) {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfDoc = await loadingTask.promise;
    let fullText = '';
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((it: any) => it.str || '').join(' ');
      fullText += `--- Page ${i} ---\n${pageText}\n\n`;
      onProgress?.(i / pdfDoc.numPages);
    }

    if (targetExt === 'html') {
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${baseName}</title></head><body><pre>${fullText}</pre></body></html>`;
      return {
        blob: new Blob([html], { type: 'text/html' }),
        fileName: `${baseName}.html`,
      };
    }

    return {
      blob: new Blob([fullText], { type: 'text/plain' }),
      fileName: `${baseName}.${targetExt}`,
    };
  }

  // 5. Image to Image (WebP, PNG, JPG, AVIF, GIF, BMP, ICO)
  if (sourceCat === 'Image' && ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'bmp', 'ico'].includes(targetExt)) {
    onProgress?.(0.3);
    const canvas = await fileToCanvas(file);
    const mime =
      targetExt === 'jpg' || targetExt === 'jpeg'
        ? 'image/jpeg'
        : targetExt === 'webp'
        ? 'image/webp'
        : targetExt === 'avif'
        ? 'image/avif'
        : 'image/png';

    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, mime, 0.92));
    if (!blob) throw new Error('Image canvas encoding failed');
    onProgress?.(1.0);
    return {
      blob,
      fileName: `${baseName}.${targetExt === 'jpeg' ? 'jpg' : targetExt}`,
    };
  }

  // 6. Image to PDF
  if (sourceCat === 'Image' && targetExt === 'pdf') {
    onProgress?.(0.3);
    const res = await convertImageToPdf(file, baseName);
    onProgress?.(1.0);
    return res;
  }

  // 7. Image to Vector (SVG via potrace)
  if (sourceCat === 'Image' && targetExt === 'svg') {
    onProgress?.(0.3);
    const traceResult = await traceBitmapToSvg(file);
    onProgress?.(1.0);
    return {
      blob: traceResult.blob,
      fileName: `${baseName}.svg`,
    };
  }

  // 8. Vector: SVG to Bitmap (PNG/JPG/WEBP) or PDF
  if (sourceExt === 'svg') {
    if (['png', 'jpg', 'jpeg', 'webp'].includes(targetExt)) {
      const fmt = targetExt === 'jpg' || targetExt === 'jpeg' ? 'jpg' : targetExt === 'webp' ? 'webp' : 'png';
      return await convertSvgToBitmap(file, baseName, fmt);
    }
    if (targetExt === 'pdf') {
      const imgRes = await convertSvgToBitmap(file, baseName, 'png');
      return await convertImageToPdf(imgRes.blob, baseName);
    }
  }

  // 9. CAD: DXF to SVG or PDF
  if (sourceExt === 'dxf') {
    const text = await file.text();
    const drawing = parseDxf(text);
    if (targetExt === 'svg') {
      const svg = dxfToSvg(drawing);
      return {
        blob: new Blob([svg], { type: 'image/svg+xml' }),
        fileName: `${baseName}.svg`,
      };
    }
    if (targetExt === 'pdf') {
      const pdfBytes = await dxfToPdf(drawing, baseName);
      return {
        blob: new Blob([pdfBytes as any], { type: 'application/pdf' }),
        fileName: `${baseName}.pdf`,
      };
    }
  }

  // 10. Spreadsheets: XLSX, XLS, CSV, ODS, JSON, TSV
  const isSpreadsheetTarget = ['xlsx', 'xls', 'csv', 'ods', 'json', 'tsv', 'html'].includes(targetExt);
  if (sourceCat === 'Spreadsheet' && isSpreadsheetTarget) {
    onProgress?.(0.3);
    let workbook: XLSX.WorkBook;
    if (sourceExt === 'json') {
      const text = await file.text();
      const parsed = JSON.parse(text);
      workbook = XLSX.utils.book_new();
      const ws = Array.isArray(parsed) ? XLSX.utils.json_to_sheet(parsed) : XLSX.utils.json_to_sheet([parsed]);
      XLSX.utils.book_append_sheet(workbook, ws, 'Sheet1');
    } else {
      const buffer = await file.arrayBuffer();
      workbook = XLSX.read(buffer, { type: 'array' });
    }

    onProgress?.(0.6);
    if (targetExt === 'json') {
      const firstSheet = workbook.SheetNames[0];
      const json = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet]);
      return {
        blob: new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }),
        fileName: `${baseName}.json`,
      };
    }

    if (targetExt === 'html') {
      const firstSheet = workbook.SheetNames[0];
      const html = XLSX.utils.sheet_to_html(workbook.Sheets[firstSheet]);
      return {
        blob: new Blob([html], { type: 'text/html' }),
        fileName: `${baseName}.html`,
      };
    }

    const bookType = targetExt === 'tsv' ? 'csv' : (targetExt as any);
    const outBytes = XLSX.write(workbook, { bookType, type: 'array' });
    onProgress?.(1.0);
    return {
      blob: new Blob([outBytes], { type: 'application/octet-stream' }),
      fileName: `${baseName}.${targetExt}`,
    };
  }

  // 11. Fonts: TTF, OTF, WOFF, WOFF2
  const isFontTarget = ['ttf', 'otf', 'woff', 'woff2'].includes(targetExt);
  if (sourceCat === 'Font' && isFontTarget) {
    onProgress?.(0.3);
    const buf = await file.arrayBuffer();
    const res = await convertFont(buf, baseName, targetExt as FontTargetFormat);
    onProgress?.(1.0);
    return {
      blob: res.blob,
      fileName: res.fileName,
    };
  }

  // 12. Word Documents (.docx) to HTML / TXT / PDF
  if (sourceExt === 'docx') {
    onProgress?.(0.3);
    const buf = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer: buf });
    const html = result.value;

    if (targetExt === 'html') {
      return {
        blob: new Blob([html], { type: 'text/html' }),
        fileName: `${baseName}.html`,
      };
    }
    if (targetExt === 'txt' || targetExt === 'md') {
      const txt = html.replace(/<[^>]+>/g, '');
      return {
        blob: new Blob([txt], { type: 'text/plain' }),
        fileName: `${baseName}.${targetExt}`,
      };
    }
    if (targetExt === 'pdf') {
      const plainText = html.replace(/<[^>]+>/g, '\n');
      const pdfBlob = await convertTextOrMarkdownToPdf(plainText, { title: baseName });
      return {
        blob: pdfBlob,
        fileName: `${baseName}.pdf`,
      };
    }
  }

  // 13. Markdown & Text to PDF / HTML
  if (['md', 'markdown', 'txt'].includes(sourceExt)) {
    const text = await file.text();
    if (targetExt === 'pdf') {
      const pdfBlob = await convertTextOrMarkdownToPdf(text, { title: baseName });
      return {
        blob: pdfBlob,
        fileName: `${baseName}.pdf`,
      };
    }
    if (targetExt === 'html') {
      const html = `<!DOCTYPE html><html><body><pre>${text}</pre></body></html>`;
      return {
        blob: new Blob([html], { type: 'text/html' }),
        fileName: `${baseName}.html`,
      };
    }
  }

  // 14. E-Books (EPUB) to PDF / TXT / HTML
  if (sourceExt === 'epub') {
    onProgress?.(0.2);
    const buf = await file.arrayBuffer();
    const epub = await parseEpubFile(buf);
    onProgress?.(0.6);

    if (targetExt === 'pdf') {
      const pdfBlob = await convertTextOrMarkdownToPdf(epub.fullText, { title: baseName });
      return {
        blob: pdfBlob,
        fileName: `${baseName}.pdf`,
      };
    }
    if (targetExt === 'txt') {
      return {
        blob: new Blob([epub.fullText], { type: 'text/plain' }),
        fileName: `${baseName}.txt`,
      };
    }
    if (targetExt === 'html') {
      return {
        blob: new Blob([epub.fullHtml], { type: 'text/html' }),
        fileName: `${baseName}.html`,
      };
    }
  }

  // Default fallback: create archive
  const fallbackArchive = await createArchive([{ name: file.name, file }], 'zip', 6, `${baseName}.zip`);
  return {
    blob: fallbackArchive.blob,
    fileName: fallbackArchive.fileName,
    isZip: true,
  };
}
