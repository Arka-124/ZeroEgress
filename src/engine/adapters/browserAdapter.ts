import { PDFDocument } from 'pdf-lib';
import type {
  EngineAdapter,
  ImageConvertTask,
  ImageTargetFormat,
  PdfInspectTask,
  PdfMetadata,
  PdfMergeTask,
  PdfSplitTask,
  TaskResult,
} from '../types';
import { replaceExtension, parsePageRange } from '../../utils/fileUtils';

export class BrowserAdapter implements EngineAdapter {
  readonly name = 'Browser WebAssembly & Canvas Engine';
  readonly isAirGapped = true;

  private formatCache = new Map<ImageTargetFormat, boolean>();

  async initialize(): Promise<void> {
    // Check format capabilities ahead of time
    const formats: ImageTargetFormat[] = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'];
    for (const f of formats) {
      await this.isFormatSupported(f);
    }
  }

  /**
   * Check if the client browser supports encoding to a given MIME type
   */
  async isFormatSupported(format: ImageTargetFormat): Promise<boolean> {
    if (this.formatCache.has(format)) {
      return this.formatCache.get(format)!;
    }

    if (typeof document === 'undefined') {
      return false;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const dataUrl = canvas.toDataURL(format);
      const supported = dataUrl.startsWith(`data:${format}`);
      this.formatCache.set(format, supported);
      return supported;
    } catch {
      this.formatCache.set(format, false);
      return false;
    }
  }

  /**
   * 100% Client-side image conversion using OffscreenCanvas / HTML5 Canvas
   */
  async convertImage(
    task: ImageConvertTask,
    onProgress?: (ratio: number) => void
  ): Promise<TaskResult<Blob>> {
    const startTime = performance.now();
    const originalSize = task.file.size;
    onProgress?.(0.1);

    try {
      // Step 1: Decode image
      let imageSource: ImageBitmap | HTMLImageElement;
      let width = 0;
      let height = 0;

      try {
        imageSource = await createImageBitmap(task.file);
        width = imageSource.width;
        height = imageSource.height;
      } catch {
        // Fallback to HTMLImageElement for SVGs or formats not supported by createImageBitmap
        imageSource = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          const url = URL.createObjectURL(task.file);
          img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
          };
          img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image element'));
          };
          img.src = url;
        });
        width = imageSource.naturalWidth || imageSource.width;
        height = imageSource.naturalHeight || imageSource.height;
      }

      onProgress?.(0.4);

      // Handle optional resize dimensions
      let targetWidth = width;
      let targetHeight = height;

      if (task.options.resize) {
        const { width: rw, height: rh, maintainAspectRatio = true } = task.options.resize;
        if (rw && rh && !maintainAspectRatio) {
          targetWidth = rw;
          targetHeight = rh;
        } else if (rw && (!rh || maintainAspectRatio)) {
          targetWidth = rw;
          targetHeight = Math.round((height / width) * rw);
        } else if (rh && (!rw || maintainAspectRatio)) {
          targetHeight = rh;
          targetWidth = Math.round((width / height) * rh);
        }
      }

      // Step 2: Render to Canvas
      let blob: Blob | null = null;
      const format = task.options.targetFormat;
      const quality = Math.max(0.01, Math.min(1.0, task.options.quality));

      if (typeof OffscreenCanvas !== 'undefined') {
        try {
          const offscreen = new OffscreenCanvas(targetWidth, targetHeight);
          const ctx = offscreen.getContext('2d');
          if (!ctx) throw new Error('Offscreen 2D context unavailable');

          // If JPEG, fill white background to prevent black transparent areas
          if (format === 'image/jpeg') {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, targetWidth, targetHeight);
          }

          ctx.drawImage(imageSource, 0, 0, targetWidth, targetHeight);
          onProgress?.(0.7);

          blob = await offscreen.convertToBlob({
            type: format,
            quality: format === 'image/png' ? undefined : quality,
          });
        } catch {
          blob = null; // Fallback to standard canvas
        }
      }

      if (!blob) {
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not get Canvas 2D context');

        if (format === 'image/jpeg') {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, targetWidth, targetHeight);
        }

        ctx.drawImage(imageSource, 0, 0, targetWidth, targetHeight);
        onProgress?.(0.8);

        blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => {
              if (b) resolve(b);
              else reject(new Error('Canvas toBlob conversion failed'));
            },
            format,
            format === 'image/png' ? undefined : quality
          );
        });
      }

      // Clean up bitmap resources if supported
      if ('close' in imageSource && typeof imageSource.close === 'function') {
        imageSource.close();
      }

      onProgress?.(1.0);

      // Determine appropriate target extension
      const extMap: Record<ImageTargetFormat, string> = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/webp': 'webp',
        'image/avif': 'avif',
      };
      const newExtension = extMap[format] || 'png';
      const outputFileName = replaceExtension(task.fileName, newExtension);

      const durationMs = Math.round(performance.now() - startTime);

      return {
        taskId: task.id,
        success: true,
        data: blob,
        outputFileName,
        outputMimeType: blob.type || format,
        durationMs,
        originalSize,
        resultSize: blob.size,
      };
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - startTime);
      return {
        taskId: task.id,
        success: false,
        error: err?.message || 'Image conversion failed',
        durationMs,
      };
    }
  }

  /**
   * Pure client-side PDF inspection using pdf-lib
   */
  async inspectPdf(task: PdfInspectTask): Promise<TaskResult<PdfMetadata>> {
    const startTime = performance.now();
    try {
      const buffer = await task.file.arrayBuffer();
      const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });

      const pageCount = pdf.getPageCount();
      const pages = pdf.getPages().map((page, idx) => ({
        pageNumber: idx + 1,
        width: Math.round(page.getWidth()),
        height: Math.round(page.getHeight()),
      }));

      const title = pdf.getTitle() || undefined;
      const author = pdf.getAuthor() || undefined;

      return {
        taskId: task.id,
        success: true,
        data: {
          pageCount,
          title,
          author,
          pages,
        },
        outputFileName: task.fileName,
        outputMimeType: 'application/pdf',
        durationMs: Math.round(performance.now() - startTime),
        originalSize: task.file.size,
        resultSize: task.file.size,
      };
    } catch (err: any) {
      return {
        taskId: task.id,
        success: false,
        error: err?.message || 'Could not read PDF metadata',
        durationMs: Math.round(performance.now() - startTime),
      };
    }
  }

  /**
   * Pure client-side PDF Merge using pdf-lib
   */
  async mergePdfs(
    task: PdfMergeTask,
    onProgress?: (ratio: number) => void
  ): Promise<TaskResult<Blob>> {
    const startTime = performance.now();
    const originalSize = task.items.reduce((acc, item) => acc + item.size, 0);

    try {
      if (task.items.length === 0) {
        throw new Error('At least one PDF file must be provided for merge');
      }

      const mergedPdf = await PDFDocument.create();
      const totalItems = task.items.length;

      for (let i = 0; i < totalItems; i++) {
        const item = task.items[i];
        const bytes = await item.file.arrayBuffer();
        const sourcePdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const indices = sourcePdf.getPageIndices();
        const copiedPages = await mergedPdf.copyPages(sourcePdf, indices);

        copiedPages.forEach((page) => {
          mergedPdf.addPage(page);
        });

        onProgress?.((i + 1) / totalItems);
      }

      const mergedBytes = await mergedPdf.save();
      const blob = new Blob([mergedBytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
      const durationMs = Math.round(performance.now() - startTime);

      return {
        taskId: task.id,
        success: true,
        data: blob,
        outputFileName: task.outputFileName || 'merged-document.pdf',
        outputMimeType: 'application/pdf',
        durationMs,
        originalSize,
        resultSize: blob.size,
      };
    } catch (err: any) {
      return {
        taskId: task.id,
        success: false,
        error: err?.message || 'PDF Merge operation failed',
        durationMs: Math.round(performance.now() - startTime),
      };
    }
  }

  /**
   * Pure client-side PDF Split / Extraction using pdf-lib
   */
  async splitPdf(
    task: PdfSplitTask,
    onProgress?: (ratio: number) => void
  ): Promise<TaskResult<Blob | Blob[]>> {
    const startTime = performance.now();
    const originalSize = task.file.size;

    try {
      const bytes = await task.file.arrayBuffer();
      const sourcePdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const totalPages = sourcePdf.getPageCount();

      if (totalPages === 0) {
        throw new Error('The supplied PDF document has no pages.');
      }

      const selectedPages = parsePageRange(task.pageRanges, totalPages);
      if (selectedPages.length === 0) {
        throw new Error(`No valid pages selected within range 1-${totalPages}`);
      }

      onProgress?.(0.2);

      if (task.splitMode === 'extract') {
        // Extract selected pages into a single new PDF document
        const newDoc = await PDFDocument.create();
        const zeroIndexedPages = selectedPages.map((p) => p - 1);
        const copiedPages = await newDoc.copyPages(sourcePdf, zeroIndexedPages);

        copiedPages.forEach((p) => newDoc.addPage(p));
        onProgress?.(0.8);

        const newPdfBytes = await newDoc.save();
        const blob = new Blob([newPdfBytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
        const durationMs = Math.round(performance.now() - startTime);
        const cleanBase = replaceExtension(task.fileName, '');
        const outputFileName = `${cleanBase}_pages_${task.pageRanges.replace(/[^0-9-]/g, '_') || 'extracted'}.pdf`;

        onProgress?.(1.0);
        return {
          taskId: task.id,
          success: true,
          data: blob,
          outputFileName,
          outputMimeType: 'application/pdf',
          durationMs,
          originalSize,
          resultSize: blob.size,
        };
      } else {
        // 'separate-all': split every selected page into individual single-page PDFs
        const resultBlobs: Blob[] = [];
        const totalSelected = selectedPages.length;

        for (let i = 0; i < totalSelected; i++) {
          const pageNum = selectedPages[i];
          const singleDoc = await PDFDocument.create();
          const [copiedPage] = await singleDoc.copyPages(sourcePdf, [pageNum - 1]);
          singleDoc.addPage(copiedPage);

          const singleBytes = await singleDoc.save();
          resultBlobs.push(new Blob([singleBytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }));
          onProgress?.(0.2 + (0.8 * (i + 1)) / totalSelected);
        }

        const totalResultSize = resultBlobs.reduce((acc, b) => acc + b.size, 0);
        const durationMs = Math.round(performance.now() - startTime);

        return {
          taskId: task.id,
          success: true,
          data: resultBlobs,
          outputFileName: `${replaceExtension(task.fileName, '')}_split_pages`,
          outputMimeType: 'application/pdf',
          durationMs,
          originalSize,
          resultSize: totalResultSize,
        };
      }
    } catch (err: any) {
      return {
        taskId: task.id,
        success: false,
        error: err?.message || 'PDF Split operation failed',
        durationMs: Math.round(performance.now() - startTime),
      };
    }
  }
}
