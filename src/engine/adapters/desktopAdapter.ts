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
} from '../types.ts';
import { BrowserAdapter } from './browserAdapter.ts';

export function isTauriEnvironment(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__)
  );
}

export interface NativeSystemCapabilities {
  os: string;
  arch: string;
  is_air_gapped: boolean;
  engine_type: string;
  ffmpeg_cli_available: boolean;
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
   * Native media conversion delegating to direct system FFmpeg CLI
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

      // Check if file has a native OS path (from native drag-and-drop)
      const nativePath = (file as any).path || (file as any).nativePath;

      if (nativePath) {
        const { invoke } = await import('@tauri-apps/api/core');
        onProgress?.(0.5);

        const targetExt = options.targetFormat.toLowerCase().replace(/^\./, '');
        const outputTempPath = `${nativePath}_clean.${targetExt}`;

        const nativeResult = await invoke<{
          success: boolean;
          output_file_name: string;
          output_bytes: number[];
          duration_ms: number;
        }>('convert_media_native', {
          inputPath: nativePath,
          outputPath: outputTempPath,
          options: {
            target_format: targetExt,
            bitrate: options.bitrate,
            start_time: options.trim?.startTime,
            end_time: options.trim?.endTime,
            lossless_trim: options.losslessTrim,
          },
        });

        onProgress?.(1.0);
        const uint8 = new Uint8Array(nativeResult.output_bytes);
        const blob = new Blob([uint8], { type: `audio/${targetExt}` });

        return {
          taskId: `native_${Date.now()}`,
          success: true,
          data: blob,
          outputFileName: nativeResult.output_file_name || fileName,
          outputMimeType: blob.type,
          durationMs: Math.round(performance.now() - startTime),
          originalSize: file.size,
          resultSize: blob.size,
        };
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
