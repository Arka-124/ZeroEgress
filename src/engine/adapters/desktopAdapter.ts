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
  PdfRedactTask,
  PdfOcrTask,
  WatchFolderConfig,
  WatchFolderEvent,
  TaskResult,
  DataFormat,
  DataOptions,
  HashAlgorithm,
  MediaConvertTask,
  MediaOptions,
} from '../types.ts';
import { BrowserAdapter } from './browserAdapter.ts';

export function isTauriEnvironment(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__)
  );
}

export interface HardwareAccelerationStatus {
  nvenc: boolean;
  videotoolbox: boolean;
  qsv: boolean;
  best_encoder: string;
}

export interface NativeSystemCapabilities {
  os: string;
  arch: string;
  is_air_gapped: boolean;
  engine_type: string;
  ffmpeg_cli_available: boolean;
  hardware_acceleration?: HardwareAccelerationStatus;
}

export type NativeOperationType =
  | 'media_transcode'
  | 'office_to_pdf'
  | 'cad_dxf'
  | 'camera_raw'
  | 'pdf_redact'
  | 'pdfa_compliance'
  | 'forensic_hash'
  | 'website_capture'
  | 'ocr';

export interface NativeConversionRequest {
  operation: NativeOperationType;
  input_path?: string;
  output_path?: string;
  input_bytes?: number[];
  file_name: string;
  target_format: string;
  options?: Record<string, any>;
}

export interface NativeConversionResponse {
  success: boolean;
  output_file_name: string;
  output_path?: string;
  output_bytes?: number[];
  duration_ms: number;
  details?: string;
  error?: string;
}

export class DesktopAdapter implements EngineAdapter {
  readonly name = 'Tauri Native Desktop Engine (Rust & System CLI)';
  readonly isAirGapped = true;

  // Fallback engine if running in hybrid or browser environment
  private fallbackAdapter = new BrowserAdapter();
  private capabilities: NativeSystemCapabilities | null = null;

  async initialize(): Promise<void> {
    if (!isTauriEnvironment()) {
      await this.fallbackAdapter.initialize?.();
      return;
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      this.capabilities = await invoke<NativeSystemCapabilities>('get_system_capabilities');
    } catch {
      // Fallback
    }
  }

  isMediaEngineLoaded(): boolean {
    return isTauriEnvironment() ? true : this.fallbackAdapter.isMediaEngineLoaded();
  }

  getCapabilities(): NativeSystemCapabilities | null {
    return this.capabilities;
  }

  async loadMediaEngine(onProgress?: (ratio: number) => void): Promise<void> {
    if (isTauriEnvironment()) {
      onProgress?.(1.0);
      return;
    }
    return this.fallbackAdapter.loadMediaEngine?.(onProgress);
  }

  /**
   * Unified IPC Bridge connecting UI requests to compiled Rust backend commands
   * (invoke('execute_native_conversion', { request }))
   * Supports unlimited multi-gigabyte files streamed directly from disk!
   */
  async executeNativeConversion(
    request: NativeConversionRequest,
    onProgress?: (ratio: number) => void
  ): Promise<TaskResult<Blob | string>> {
    const startTime = performance.now();
    onProgress?.(0.1);

    if (!isTauriEnvironment()) {
      // Web fallback handling
      return {
        taskId: `web_fallback_${Date.now()}`,
        success: false,
        error: 'Native conversion requires ZeroEgress Desktop runtime.',
        durationMs: Math.round(performance.now() - startTime),
      };
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      onProgress?.(0.5);

      const result = await invoke<NativeConversionResponse>('execute_native_conversion', {
        request,
      });

      onProgress?.(1.0);

      if (!result.success) {
        return {
          taskId: `native_${Date.now()}`,
          success: false,
          error: result.error || 'Conversion failed',
          durationMs: result.duration_ms,
        };
      }

      if (request.operation === 'forensic_hash' && result.output_bytes) {
        const jsonStr = new TextDecoder().decode(new Uint8Array(result.output_bytes));
        return {
          taskId: `native_${Date.now()}`,
          success: true,
          data: jsonStr,
          outputFileName: result.output_file_name,
          outputMimeType: 'application/json',
          durationMs: result.duration_ms,
          originalSize: jsonStr.length,
          resultSize: jsonStr.length,
        };
      }

      const uint8 = result.output_bytes ? new Uint8Array(result.output_bytes) : new Uint8Array(0);
      let mimeType = 'application/octet-stream';
      if (result.output_file_name.endsWith('.pdf')) mimeType = 'application/pdf';
      else if (result.output_file_name.endsWith('.svg')) mimeType = 'image/svg+xml';
      else if (result.output_file_name.endsWith('.jpg') || result.output_file_name.endsWith('.jpeg')) mimeType = 'image/jpeg';
      else if (result.output_file_name.endsWith('.png')) mimeType = 'image/png';
      else if (result.output_file_name.endsWith('.json')) mimeType = 'application/json';

      const blob = new Blob([uint8], { type: mimeType });

      return {
        taskId: `native_${Date.now()}`,
        success: true,
        data: blob,
        outputFileName: result.output_file_name,
        outputMimeType: mimeType,
        durationMs: result.duration_ms,
        originalSize: uint8.byteLength,
        resultSize: blob.size,
      };
    } catch (err: any) {
      return {
        taskId: `native_${Date.now()}`,
        success: false,
        error: err?.message || 'Native desktop execution error',
        durationMs: Math.round(performance.now() - startTime),
      };
    }
  }

  /**
   * GPU Hardware Video/Audio Transcoding delegating directly to native FFmpeg CLI
   * Supporting multi-GB file streaming without browser RAM limits
   */
  async convertMedia(
    taskOrFile: MediaConvertTask | File,
    targetFormatOrOptions?: string | MediaOptions,
    optionsOrProgress?: MediaOptions | ((ratio: number, timeMs?: number) => void),
    onProgress?: (ratio: number, timeMs?: number) => void,
    signal?: AbortSignal
  ): Promise<TaskResult<Blob>> {
    if (!isTauriEnvironment()) {
      return this.fallbackAdapter.convertMedia(
        taskOrFile,
        targetFormatOrOptions,
        optionsOrProgress,
        onProgress,
        signal
      );
    }

    const startTime = performance.now();

    try {
      let file: File | Blob;
      let fileName: string;
      let options: MediaOptions;

      if ('type' in taskOrFile && taskOrFile.type === 'media-convert') {
        const task = taskOrFile as MediaConvertTask;
        file = task.file;
        fileName = task.fileName;
        options = task.options;
      } else {
        file = taskOrFile as File;
        fileName = (taskOrFile as File).name || 'media.mp4';
        if (typeof targetFormatOrOptions === 'string') {
          const opts = (typeof optionsOrProgress === 'object' ? optionsOrProgress : {}) as MediaOptions;
          options = { ...opts, targetFormat: targetFormatOrOptions };
        } else {
          options = (targetFormatOrOptions as MediaOptions) || { targetFormat: 'mp3' };
        }
      }

      onProgress?.(0.2);

      // Check for native OS path (from native drag-and-drop)
      const nativePath = (file as any).path || (file as any).nativePath;
      const targetExt = options.targetFormat.toLowerCase().replace(/^\./, '');

      if (nativePath) {
        // Stream directly from disk without copying into RAM!
        const outputTempPath = `${nativePath}_clean.${targetExt}`;
        const res = await this.executeNativeConversion({
          operation: 'media_transcode',
          input_path: nativePath,
          output_path: outputTempPath,
          file_name: fileName,
          target_format: targetExt,
          options: {
            target_format: targetExt,
            bitrate: options.bitrate,
            start_time: options.trim?.startTime,
            end_time: options.trim?.endTime,
            lossless_trim: options.losslessTrim,
          },
        });

        if (res.success && res.data instanceof Blob) {
          return {
            taskId: res.taskId,
            success: true,
            data: res.data,
            outputFileName: res.outputFileName || fileName,
            outputMimeType: `audio/${targetExt}`,
            durationMs: res.durationMs,
            originalSize: file.size,
            resultSize: res.data.size,
          };
        }
      }

      // If in-memory file without native path, fallback to WASM engine
      return this.fallbackAdapter.convertMedia(
        taskOrFile,
        targetFormatOrOptions,
        optionsOrProgress,
        onProgress,
        signal
      );
    } catch (err: any) {
      return {
        taskId: `native_${Date.now()}`,
        success: false,
        error: err?.message || 'Native desktop conversion failed.',
        durationMs: Math.round(performance.now() - startTime),
      };
    }
  }

  /**
   * Native Office Document Conversion (DOCX, PPTX, XLSX, ODT, ODP, Pages, Keynote, Numbers to PDF)
   */
  async convertOfficeDocument(
    file: File,
    onProgress?: (ratio: number) => void
  ): Promise<TaskResult<Blob>> {
    if (!isTauriEnvironment()) {
      return {
        taskId: `office_${Date.now()}`,
        success: false,
        error: 'Office conversion requires native desktop engine.',
        durationMs: 0,
      };
    }

    const nativePath = (file as any).path || (file as any).nativePath;
    const buffer = nativePath ? undefined : await file.arrayBuffer();
    const bytes = buffer ? Array.from(new Uint8Array(buffer)) : undefined;

    const res = await this.executeNativeConversion({
      operation: 'office_to_pdf',
      input_path: nativePath,
      input_bytes: bytes,
      file_name: file.name,
      target_format: 'pdf',
    }, onProgress);

    if (!res.success) {
      return res as TaskResult<Blob>;
    }

    const blob = res.data as Blob;
    return {
      taskId: res.taskId,
      success: true,
      data: blob,
      outputFileName: res.outputFileName,
      outputMimeType: 'application/pdf',
      durationMs: res.durationMs,
      originalSize: file.size,
      resultSize: blob.size,
    };
  }

  /**
   * 2D CAD Blueprints (DXF) to Scalable SVG or Vector PDF
   */
  async convertCadBlueprint(
    file: File,
    targetFormat: 'svg' | 'pdf' = 'svg',
    onProgress?: (ratio: number) => void
  ): Promise<TaskResult<Blob>> {
    if (!isTauriEnvironment()) {
      return {
        taskId: `cad_${Date.now()}`,
        success: false,
        error: 'CAD conversion requires native desktop engine.',
        durationMs: 0,
      };
    }

    const nativePath = (file as any).path || (file as any).nativePath;
    const buffer = nativePath ? undefined : await file.arrayBuffer();
    const bytes = buffer ? Array.from(new Uint8Array(buffer)) : undefined;

    const res = await this.executeNativeConversion({
      operation: 'cad_dxf',
      input_path: nativePath,
      input_bytes: bytes,
      file_name: file.name,
      target_format: targetFormat,
    }, onProgress);

    if (!res.success) {
      return res as TaskResult<Blob>;
    }

    const blob = res.data as Blob;
    return {
      taskId: res.taskId,
      success: true,
      data: blob,
      outputFileName: res.outputFileName,
      outputMimeType: targetFormat === 'svg' ? 'image/svg+xml' : 'application/pdf',
      durationMs: res.durationMs,
      originalSize: file.size,
      resultSize: blob.size,
    };
  }

  /**
   * Camera RAW format conversion (CR2, NEF, ARW, DNG) to full-resolution preview
   */
  async convertCameraRaw(
    file: File,
    onProgress?: (ratio: number) => void
  ): Promise<TaskResult<Blob>> {
    if (!isTauriEnvironment()) {
      return {
        taskId: `raw_${Date.now()}`,
        success: false,
        error: 'Camera RAW conversion requires native desktop engine.',
        durationMs: 0,
      };
    }

    const nativePath = (file as any).path || (file as any).nativePath;
    const buffer = nativePath ? undefined : await file.arrayBuffer();
    const bytes = buffer ? Array.from(new Uint8Array(buffer)) : undefined;

    const res = await this.executeNativeConversion({
      operation: 'camera_raw',
      input_path: nativePath,
      input_bytes: bytes,
      file_name: file.name,
      target_format: 'jpg',
    }, onProgress);

    if (!res.success) {
      return res as TaskResult<Blob>;
    }

    const blob = res.data as Blob;
    return {
      taskId: res.taskId,
      success: true,
      data: blob,
      outputFileName: res.outputFileName,
      outputMimeType: 'image/jpeg',
      durationMs: res.durationMs,
      originalSize: file.size,
      resultSize: blob.size,
    };
  }

  /**
   * ISO 19005-1 PDF/A Archival compliance conversion
   */
  async applyPdfaCompliance(
    file: File,
    conformancePart = 1,
    onProgress?: (ratio: number) => void
  ): Promise<TaskResult<Blob>> {
    if (!isTauriEnvironment()) {
      return {
        taskId: `pdfa_${Date.now()}`,
        success: false,
        error: 'PDF/A conversion requires native desktop engine.',
        durationMs: 0,
      };
    }

    const nativePath = (file as any).path || (file as any).nativePath;
    const buffer = nativePath ? undefined : await file.arrayBuffer();
    const bytes = buffer ? Array.from(new Uint8Array(buffer)) : undefined;

    const res = await this.executeNativeConversion({
      operation: 'pdfa_compliance',
      input_path: nativePath,
      input_bytes: bytes,
      file_name: file.name,
      target_format: 'pdf',
      options: { conformance_part: conformancePart },
    }, onProgress);

    if (!res.success) {
      return res as TaskResult<Blob>;
    }

    const blob = res.data as Blob;
    return {
      taskId: res.taskId,
      success: true,
      data: blob,
      outputFileName: res.outputFileName,
      outputMimeType: 'application/pdf',
      durationMs: res.durationMs,
      originalSize: file.size,
      resultSize: blob.size,
    };
  }

  /**
   * Automated Forensic Hash Logging & Chain-of-Custody Certificate
   */
  async generateForensicReport(
    file: File,
    onProgress?: (ratio: number) => void
  ): Promise<TaskResult<string>> {
    if (!isTauriEnvironment()) {
      return {
        taskId: `forensic_${Date.now()}`,
        success: false,
        error: 'Forensic report requires native desktop engine.',
        durationMs: 0,
      };
    }

    const nativePath = (file as any).path || (file as any).nativePath;
    const buffer = nativePath ? undefined : await file.arrayBuffer();
    const bytes = buffer ? Array.from(new Uint8Array(buffer)) : undefined;

    const res = await this.executeNativeConversion({
      operation: 'forensic_hash',
      input_path: nativePath,
      input_bytes: bytes,
      file_name: file.name,
      target_format: 'json',
    }, onProgress);

    if (!res.success) {
      return res as TaskResult<string>;
    }

    const str = typeof res.data === 'string' ? res.data : '';
    return {
      taskId: res.taskId,
      success: true,
      data: str,
      outputFileName: res.outputFileName,
      outputMimeType: 'application/json',
      durationMs: res.durationMs,
      originalSize: file.size,
      resultSize: str.length,
    };
  }

  /**
   * Live Headless Website Capture to PNG or PDF without browser CORS limits
   */
  async captureLiveUrl(
    url: string,
    format: 'png' | 'pdf' = 'png',
    onProgress?: (ratio: number) => void
  ): Promise<TaskResult<Blob>> {
    if (!isTauriEnvironment()) {
      return {
        taskId: `capture_${Date.now()}`,
        success: false,
        error: 'Live headless capture requires native desktop engine.',
        durationMs: 0,
      };
    }

    const res = await this.executeNativeConversion({
      operation: 'website_capture',
      input_path: url,
      file_name: url.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30),
      target_format: format,
    }, onProgress);

    if (!res.success) {
      return res as TaskResult<Blob>;
    }

    const blob = res.data as Blob;
    return {
      taskId: res.taskId,
      success: true,
      data: blob,
      outputFileName: res.outputFileName,
      outputMimeType: format === 'pdf' ? 'application/pdf' : 'image/png',
      durationMs: res.durationMs,
      originalSize: blob.size,
      resultSize: blob.size,
    };
  }

  /**
   * Native cryptographic hash computation via Rust compiled instructions
   */
  async computeHash(
    buffer: ArrayBuffer,
    algorithm: HashAlgorithm
  ): Promise<string> {
    if (!isTauriEnvironment()) {
      return this.fallbackAdapter.computeHash(buffer, algorithm);
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const bytes = Array.from(new Uint8Array(buffer));
      return await invoke<string>('compute_hash_native', {
        fileBytes: bytes,
        algorithm,
      });
    } catch {
      return this.fallbackAdapter.computeHash(buffer, algorithm);
    }
  }

  convertData(
    content: string,
    from: DataFormat,
    to: DataFormat,
    options?: DataOptions
  ): string {
    return this.fallbackAdapter.convertData(content, from, to, options);
  }

  async convertImage(
    task: ImageConvertTask,
    onProgress?: (ratio: number) => void
  ): Promise<TaskResult<Blob>> {
    return this.fallbackAdapter.convertImage(task, onProgress);
  }

  async mergePdfs(
    task: PdfMergeTask,
    onProgress?: (ratio: number) => void
  ): Promise<TaskResult<Blob>> {
    return this.fallbackAdapter.mergePdfs(task, onProgress);
  }

  async splitPdf(
    task: PdfSplitTask,
    onProgress?: (ratio: number) => void
  ): Promise<TaskResult<Blob | Blob[]>> {
    return this.fallbackAdapter.splitPdf(task, onProgress);
  }

  async inspectPdf(task: PdfInspectTask): Promise<TaskResult<PdfMetadata>> {
    return this.fallbackAdapter.inspectPdf(task);
  }

  async inspectMetadata(task: MetadataInspectTask): Promise<TaskResult<MetadataInspectionReport>> {
    return this.fallbackAdapter.inspectMetadata(task);
  }

  async stripMetadata(
    task: MetadataStripTask,
    onProgress?: (ratio: number) => void
  ): Promise<TaskResult<Blob>> {
    return this.fallbackAdapter.stripMetadata(task, onProgress);
  }

  async isFormatSupported(format: ImageTargetFormat): Promise<boolean> {
    return this.fallbackAdapter.isFormatSupported(format);
  }

  async redactPdfVector(
    task: PdfRedactTask,
    onProgress?: (ratio: number) => void
  ): Promise<TaskResult<Blob>> {
    if (!isTauriEnvironment()) {
      return this.fallbackAdapter.redactPdfVector(task, onProgress);
    }

    const startTime = performance.now();
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const buffer = await task.file.arrayBuffer();
      const bytes = Array.from(new Uint8Array(buffer));

      const outputBytes = await invoke<number[]>('redact_pdf_vector_native', {
        inputBytes: bytes,
        searchTerms: task.options.searchTerms,
        redactVectors: Boolean(task.options.redactVectors),
      });

      const uint8 = new Uint8Array(outputBytes);
      const blob = new Blob([uint8], { type: 'application/pdf' });

      return {
        taskId: task.id,
        success: true,
        data: blob,
        outputFileName: `${task.fileName.replace(/\.pdf$/i, '')}_redacted.pdf`,
        outputMimeType: 'application/pdf',
        durationMs: Math.round(performance.now() - startTime),
        originalSize: task.file.size,
        resultSize: blob.size,
      };
    } catch {
      return this.fallbackAdapter.redactPdfVector(task, onProgress);
    }
  }

  async ocrPdf(
    task: PdfOcrTask,
    onProgress?: (ratio: number) => void
  ): Promise<TaskResult<Blob>> {
    if (!isTauriEnvironment()) {
      return this.fallbackAdapter.ocrPdf(task, onProgress);
    }

    const startTime = performance.now();
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const buffer = await task.file.arrayBuffer();
      const bytes = Array.from(new Uint8Array(buffer));

      const outputBytes = await invoke<number[]>('ocr_pdf_native', {
        inputBytes: bytes,
        language: task.options.language || 'eng',
      });

      const uint8 = new Uint8Array(outputBytes);
      const blob = new Blob([uint8], { type: 'application/pdf' });

      return {
        taskId: task.id,
        success: true,
        data: blob,
        outputFileName: `${task.fileName.replace(/\.pdf$/i, '')}_searchable_ocr.pdf`,
        outputMimeType: 'application/pdf',
        durationMs: Math.round(performance.now() - startTime),
        originalSize: task.file.size,
        resultSize: blob.size,
      };
    } catch {
      return this.fallbackAdapter.ocrPdf(task, onProgress);
    }
  }

  async startWatchFolder(
    config: WatchFolderConfig,
    onEvent?: (event: WatchFolderEvent) => void
  ): Promise<{ id: string; stop: () => void }> {
    if (!isTauriEnvironment()) {
      return this.fallbackAdapter.startWatchFolder(config, onEvent);
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const watcherId = await invoke<string>('start_watch_folder_native', {
        inputDir: config.inputPath,
        outputDir: config.outputPath,
        targetFormat: config.targetFormat,
      });

      onEvent?.({
        timestamp: Date.now(),
        fileName: 'Native Daemon',
        status: 'detected',
        details: `Native watcher daemon started with ID: ${watcherId}`,
      });

      const stop = () => {
        invoke('stop_watch_folder_native', { watcherId }).catch(() => {});
      };

      return { id: watcherId, stop };
    } catch {
      return this.fallbackAdapter.startWatchFolder(config, onEvent);
    }
  }

  async getWatchFolderStatuses(): Promise<WatchFolderConfig[]> {
    if (!isTauriEnvironment()) {
      return this.fallbackAdapter.getWatchFolderStatuses();
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const nativeStatuses = await invoke<any[]>('get_watch_folders_status_native');
      return nativeStatuses.map((s) => ({
        id: s.watcher_id,
        name: `Watch ${s.target_format}`,
        inputPath: s.input_dir,
        outputPath: s.output_dir,
        targetFormat: s.target_format,
        isActive: s.is_active,
        filesProcessed: s.files_processed,
      }));
    } catch {
      return this.fallbackAdapter.getWatchFolderStatuses();
    }
  }

  /**
   * Listen to native OS file explorer drag-and-drop events
   */
  async setupNativeFileDrop(
    onFilesDropped: (paths: string[]) => void
  ): Promise<(() => void) | undefined> {
    if (!isTauriEnvironment()) return undefined;

    try {
      const { listen } = await import('@tauri-apps/api/event');
      return await listen<{ paths: string[] }>('tauri://drag-drop', (event) => {
        if (event.payload?.paths?.length > 0) {
          onFilesDropped(event.payload.paths);
        }
      });
    } catch {
      return undefined;
    }
  }
}
