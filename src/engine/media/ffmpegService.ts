import type {
  MediaOptions,
  TaskResult,
} from '../types.ts';
import { replaceExtension } from '../../utils/fileUtils.ts';
import { toBlobURL } from '@ffmpeg/util';

const MIME_MAP: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  gif: 'image/gif',
};

class FFmpegService {
  private ffmpeg: any = null;
  private isLoaded = false;
  private isLoading = false;
  private loadPromise: Promise<void> | null = null;

  public isEngineLoaded(): boolean {
    return this.isLoaded && !!this.ffmpeg?.loaded;
  }

  /**
   * Lazy loads the FFmpeg WebAssembly core on demand.
   * Never bundled into initial page load.
   */
  async load(onProgress?: (ratio: number) => void): Promise<void> {
    if (this.isLoaded && this.ffmpeg?.loaded) return;
    if (this.isLoading && this.loadPromise) {
      return this.loadPromise;
    }

    this.isLoading = true;
    onProgress?.(0.1);

    this.loadPromise = (async () => {
      try {
        // Dynamically import @ffmpeg/ffmpeg to isolate in a separate lazy chunk
        const { FFmpeg } = await import('@ffmpeg/ffmpeg');

        const ffmpeg = new FFmpeg();
        this.ffmpeg = ffmpeg;

        onProgress?.(0.25);

        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
        const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
        const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');

        onProgress?.(0.6);

        await ffmpeg.load({
          coreURL,
          wasmURL,
        });

        this.isLoaded = true;
        this.isLoading = false;
        onProgress?.(1.0);
      } catch (err: any) {
        this.isLoaded = false;
        this.isLoading = false;
        this.ffmpeg = null;
        throw new Error(
          `Failed to initialize WebAssembly FFmpeg core: ${err?.message || 'SharedArrayBuffer or CORS issue'}`
        );
      }
    })();

    return this.loadPromise;
  }

  /**
   * Execute media conversion, audio extraction, or stream trimming
   */
  async convert(
    file: File | Blob,
    fileName: string,
    options: MediaOptions,
    onProgress?: (ratio: number, timeMs?: number) => void,
    signal?: AbortSignal
  ): Promise<TaskResult<Blob>> {
    const startTime = performance.now();
    const originalSize = file.size;

    let inputFsName = '';
    let outputFsName = '';
    let progressHandler: any = null;

    try {
      if (signal?.aborted) {
        throw new Error('Operation was cancelled before execution started.');
      }

      // Ensure engine is loaded
      if (!this.isLoaded || !this.ffmpeg?.loaded) {
        await this.load((ratio) => onProgress?.(ratio * 0.2));
      }

      const { fetchFile } = await import('@ffmpeg/util');
      const ffmpeg = this.ffmpeg;

      // Generate safe unique virtual filesystem names
      const safeBase = `media_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const inputExt = (fileName.split('.').pop() || 'tmp').toLowerCase();
      const targetExt = options.targetFormat.toLowerCase().replace(/^\./, '');
      inputFsName = `${safeBase}_in.${inputExt}`;
      outputFsName = `${safeBase}_out.${targetExt}`;

      onProgress?.(0.25);

      // Write file into virtual memory filesystem
      const fileBytes = await fetchFile(file);
      await ffmpeg.writeFile(inputFsName, fileBytes, { signal });

      onProgress?.(0.35);

      // Setup real-time progress handler
      progressHandler = ({ progress, time }: { progress: number; time: number }) => {
        // time is in microseconds
        const timeMs = Math.round(time / 1000);
        const ratio = 0.35 + Math.min(0.6, Math.max(0, progress) * 0.6);
        onProgress?.(ratio, timeMs);
      };
      ffmpeg.on('progress', progressHandler);

      // Construct FFmpeg arguments
      const args: string[] = [];

      // Trimming parameters
      const hasTrim =
        options.trim &&
        (options.trim.startTime !== undefined || options.trim.endTime !== undefined);

      const isSameContainer = inputExt === targetExt;
      const useLosslessTrim =
        hasTrim && isSameContainer && options.losslessTrim !== false;

      if (hasTrim) {
        if (options.trim?.startTime !== undefined && options.trim.startTime > 0) {
          args.push('-ss', options.trim.startTime.toString());
        }
        if (options.trim?.endTime !== undefined && options.trim.endTime > 0) {
          args.push('-to', options.trim.endTime.toString());
        }
      }

      // Input file
      args.push('-i', inputFsName);

      // Codec and encoding logic
      if (useLosslessTrim) {
        // Stream copy: avoids re-encoding latency entirely
        args.push('-c', 'copy');
      } else {
        // Check if target is audio-only
        const isTargetAudio = ['mp3', 'wav', 'aac', 'ogg', 'flac'].includes(targetExt);
        if (isTargetAudio) {
          args.push('-vn'); // Strip video stream

          const bitrate = options.bitrate || '192k';
          switch (targetExt) {
            case 'mp3':
              args.push('-c:a', 'libmp3lame', '-b:a', bitrate);
              break;
            case 'wav':
              args.push('-c:a', 'pcm_s16le');
              break;
            case 'aac':
              args.push('-c:a', 'aac', '-b:a', bitrate);
              break;
            case 'ogg':
              args.push('-c:a', 'libvorbis', '-b:a', bitrate);
              break;
            case 'flac':
              args.push('-c:a', 'flac');
              break;
            default:
              args.push('-b:a', bitrate);
              break;
          }
        } else {
          // Video container conversion or re-encoded trim
          if (targetExt === 'mp4') {
            args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac');
          } else if (targetExt === 'webm') {
            args.push('-c:v', 'libvpx', '-c:a', 'libvorbis');
          } else if (targetExt === 'gif') {
            args.push('-vf', 'fps=10,scale=480:-1:flags=lanczos');
          }
        }
      }

      // Output file
      args.push(outputFsName);

      // Run FFmpeg execution
      const exitCode = await ffmpeg.exec(args, undefined, { signal });

      if (exitCode !== 0) {
        throw new Error(
          `FFmpeg exited with error code ${exitCode}. The file codec may be unsupported or corrupted.`
        );
      }

      onProgress?.(0.95);

      // Read output file
      const rawData = await ffmpeg.readFile(outputFsName, undefined, { signal });
      const dataBytes =
        rawData instanceof Uint8Array
          ? rawData
          : new TextEncoder().encode(rawData as string);

      const outputMimeType = MIME_MAP[targetExt] || 'application/octet-stream';
      const outputBlob = new Blob([dataBytes as Uint8Array<ArrayBuffer>], { type: outputMimeType });

      const outputFileName = replaceExtension(fileName, targetExt);
      const durationMs = Math.round(performance.now() - startTime);

      onProgress?.(1.0);

      return {
        taskId: `media_${Date.now()}`,
        success: true,
        data: outputBlob,
        outputFileName,
        outputMimeType,
        durationMs,
        originalSize,
        resultSize: outputBlob.size,
      };
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - startTime);
      return {
        taskId: `media_${Date.now()}`,
        success: false,
        error: err?.message || 'Media conversion failed.',
        durationMs,
      };
    } finally {
      // Clean up progress event listener
      if (progressHandler && this.ffmpeg) {
        this.ffmpeg.off('progress', progressHandler);
      }

      // Memory cleanup: Delete virtual filesystem files to prevent WASM heap bloat
      if (inputFsName && this.ffmpeg) {
        try {
          await this.ffmpeg.deleteFile(inputFsName);
        } catch {
          // Ignore deletion error if file was never created
        }
      }
      if (outputFsName && this.ffmpeg) {
        try {
          await this.ffmpeg.deleteFile(outputFsName);
        } catch {
          // Ignore deletion error
        }
      }
    }
  }

  /**
   * Terminate and release WebAssembly memory immediately
   */
  terminate(): void {
    if (this.ffmpeg) {
      try {
        this.ffmpeg.terminate();
      } catch {}
      this.ffmpeg = null;
      this.isLoaded = false;
      this.isLoading = false;
      this.loadPromise = null;
    }
  }
}

export const ffmpegService = new FFmpegService();
