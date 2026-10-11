import { PDFDocument } from 'pdf-lib';
import type {
  EngineAdapter,
  ImageConvertTask,
  ImageTargetFormat,
  MetadataInspectTask,
  MetadataInspectionReport,
  MetadataStripTask,
  PdfInspectTask,
  PdfMetadata,
  PdfMergeTask,
  PdfSplitTask,
  TaskResult,
  DataFormat,
  DataOptions,
  HashAlgorithm,
  MediaConvertTask,
  MediaOptions,
} from '../types';
import { replaceExtension, parsePageRange } from '../../utils/fileUtils.ts';
import { parseFileMetadata } from '../metadata/exifParser.ts';
import { stripMetadataFromBuffer } from '../metadata/binaryStripper.ts';
import { convertData as engineConvertData } from '../data/dataConverter.ts';
import { md5 } from '../crypto/md5.ts';
import { ffmpegService } from '../media/ffmpegService.ts';

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

  private formatPdfError(err: any): string {
    const msg = err?.message?.toLowerCase() || '';
    if (msg.includes('encrypted') || msg.includes('password') || msg.includes('decrypt')) {
      return 'Encrypted / Password-Protected PDF: File is encrypted and requires a password to open.';
    }
    if (msg.includes('header') || msg.includes('corrupted') || msg.includes('malformed') || msg.includes('trailer') || msg.includes('xref')) {
      return 'Malformed or Corrupted PDF: File header/structure is damaged and cannot be parsed.';
    }
    return err?.message || 'PDF operation failed';
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
        error: this.formatPdfError(err),
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
        error: this.formatPdfError(err),
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
        error: this.formatPdfError(err),
        durationMs: Math.round(performance.now() - startTime),
      };
    }
  }

  /**
   * Deep EXIF, XMP, IPTC, and PDF metadata inspection
   */
  async inspectMetadata(
    task: MetadataInspectTask
  ): Promise<TaskResult<MetadataInspectionReport>> {
    const startTime = performance.now();
    try {
      const report = await parseFileMetadata(task.file, task.fileName);
      return {
        taskId: task.id,
        success: true,
        data: report,
        outputFileName: task.fileName,
        outputMimeType: task.file.type || 'application/octet-stream',
        durationMs: Math.round(performance.now() - startTime),
        originalSize: task.file.size,
        resultSize: task.file.size,
      };
    } catch (err: any) {
      return {
        taskId: task.id,
        success: false,
        error: err?.message || 'Metadata inspection failed',
        durationMs: Math.round(performance.now() - startTime),
      };
    }
  }

  /**
   * Pure client-side lossless stripping of EXIF, XMP, IPTC, and container metadata
   */
  async stripMetadata(
    task: MetadataStripTask,
    onProgress?: (ratio: number) => void
  ): Promise<TaskResult<Blob>> {
    const startTime = performance.now();
    const originalSize = task.file.size;
    onProgress?.(0.2);

    try {
      const buffer = await task.file.arrayBuffer();
      onProgress?.(0.5);

      const { cleanBytes, mimeType } = await stripMetadataFromBuffer(buffer, task.fileName);
      onProgress?.(0.85);

      const blob = new Blob([cleanBytes as Uint8Array<ArrayBuffer>], {
        type: mimeType || task.file.type || 'application/octet-stream',
      });

      const cleanFileName = task.fileName.replace(/(\.[^.]+)$/, '_clean$1');
      onProgress?.(1.0);

      return {
        taskId: task.id,
        success: true,
        data: blob,
        outputFileName: cleanFileName,
        outputMimeType: blob.type,
        durationMs: Math.round(performance.now() - startTime),
        originalSize,
        resultSize: blob.size,
      };
    } catch (err: any) {
      return {
        taskId: task.id,
        success: false,
        error: err?.message || 'Metadata stripping failed',
        durationMs: Math.round(performance.now() - startTime),
      };
    }
  }

  /**
   * Universal structured data converter (JSON ↔ CSV ↔ YAML)
   */
  convertData(
    content: string,
    from: DataFormat,
    to: DataFormat,
    options: DataOptions = {}
  ): string {
    return engineConvertData(content, from, to, options);
  }

  /**
   * Cryptographic hash computation using Web Crypto API and MD5 fallback
   */
  async computeHash(
    buffer: ArrayBuffer,
    algorithm: HashAlgorithm
  ): Promise<string> {
    if (algorithm === 'MD5') {
      return md5(buffer);
    }

    const subtle = globalThis.crypto?.subtle;
    if (!subtle) {
      throw new Error('Web Cryptography API (crypto.subtle) is unavailable in this environment.');
    }

    const hashBuffer = await subtle.digest(algorithm, buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  isMediaEngineLoaded(): boolean {
    return ffmpegService.isEngineLoaded();
  }

  async loadMediaEngine(onProgress?: (ratio: number) => void): Promise<void> {
    await ffmpegService.load(onProgress);
  }

  /**
   * High-performance client-side media conversion, audio extraction, and trimming via FFmpeg WebAssembly.
   */
  async convertMedia(
    taskOrFile: MediaConvertTask | File,
    targetFormatOrOptions?: string | MediaOptions,
    optionsOrProgress?: MediaOptions | ((ratio: number, timeMs?: number) => void),
    onProgress?: (ratio: number, timeMs?: number) => void,
    signal?: AbortSignal
  ): Promise<TaskResult<Blob>> {
    let file: File | Blob;
    let fileName: string;
    let options: MediaOptions;
    let progressCb: ((ratio: number, timeMs?: number) => void) | undefined = onProgress;
    let abortSig: AbortSignal | undefined = signal;

    if ('type' in taskOrFile && taskOrFile.type === 'media-convert') {
      const task = taskOrFile as MediaConvertTask;
      file = task.file;
      fileName = task.fileName;
      options = task.options;
      if (typeof optionsOrProgress === 'function') {
        progressCb = optionsOrProgress;
      }
    } else {
      file = taskOrFile as File;
      fileName = (taskOrFile as File).name || 'media.mp4';
      if (typeof targetFormatOrOptions === 'string') {
        const targetFormat = targetFormatOrOptions;
        const opts = (typeof optionsOrProgress === 'object' ? optionsOrProgress : {}) as MediaOptions;
        options = { ...opts, targetFormat };
      } else {
        options = (targetFormatOrOptions as MediaOptions) || { targetFormat: 'mp3' };
      }
    }

    return ffmpegService.convert(file, fileName, options, progressCb, abortSig);
  }
}


