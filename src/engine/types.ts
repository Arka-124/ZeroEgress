/**
 * ZeroEgress Conversion Engine Interfaces
 * Standardized abstraction layer decoupling conversion logic from UI components.
 * This architecture allows transparent swapping between pure browser client-side execution
 * and future native runtimes (Tauri / Rust backend).
 */

export type TaskType =
  | 'image-convert'
  | 'pdf-merge'
  | 'pdf-split'
  | 'pdf-inspect'
  | 'metadata-inspect'
  | 'metadata-strip'
  | 'media-convert';

export interface BaseTask {
  id: string;
  type: TaskType;
  createdAt: number;
}

export type ImageTargetFormat = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/avif';

export interface ImageConvertOptions {
  targetFormat: ImageTargetFormat;
  quality: number; // 0.0 to 1.0 (e.g. 0.85 for 85%)
  resize?: {
    width?: number;
    height?: number;
    maintainAspectRatio?: boolean;
  };
}

export interface ImageConvertTask extends BaseTask {
  type: 'image-convert';
  file: File | Blob;
  fileName: string;
  options: ImageConvertOptions;
}

export interface PdfMergeItem {
  id: string;
  file: File | Blob;
  name: string;
  size: number;
  pageCount?: number;
}

export interface PdfMergeTask extends BaseTask {
  type: 'pdf-merge';
  items: PdfMergeItem[];
  outputFileName?: string;
}

export interface PdfSplitTask extends BaseTask {
  type: 'pdf-split';
  file: File | Blob;
  fileName: string;
  pageRanges: string; // e.g. "1-3, 5"
  splitMode: 'extract' | 'separate-all'; // 'extract' creates 1 PDF with selected pages; 'separate-all' splits every page into its own PDF
}

export interface PdfInspectTask extends BaseTask {
  type: 'pdf-inspect';
  file: File | Blob;
  fileName: string;
}

export type MetadataCategory = 'gps' | 'camera' | 'timestamp' | 'software' | 'document' | 'other';

export interface MetadataTag {
  category: MetadataCategory;
  key: string;
  label: string;
  value: string;
  raw?: any;
}

export interface GpsCoordinates {
  latitude: number;
  longitude: number;
  altitude?: number;
  formattedDMS?: string;
}

export interface MetadataInspectionReport {
  fileType: 'image' | 'pdf' | 'unknown';
  hasSensitiveMetadata: boolean;
  totalTagsFound: number;
  tags: MetadataTag[];
  gps?: GpsCoordinates;
  camera?: {
    make?: string;
    model?: string;
    lens?: string;
  };
  software?: string;
  timestamp?: string;
  title?: string;
  author?: string;
}

export interface MetadataInspectTask extends BaseTask {
  type: 'metadata-inspect';
  file: File | Blob;
  fileName: string;
}

export interface MetadataStripOptions {
  removeGps?: boolean;
  removeAll?: boolean;
}

export interface MetadataStripTask extends BaseTask {
  type: 'metadata-strip';
  file: File | Blob;
  fileName: string;
  options?: MetadataStripOptions;
}

export type AudioBitratePreset = '128k' | '192k' | '320k';

export interface MediaTrimOptions {
  startTime?: number; // In seconds
  endTime?: number;   // In seconds
}

export interface MediaOptions {
  targetFormat: string; // e.g. 'mp3', 'wav', 'aac', 'ogg', 'flac', 'mp4', 'webm'
  bitrate?: AudioBitratePreset | string;
  trim?: MediaTrimOptions;
  losslessTrim?: boolean;
}

export interface MediaConvertTask extends BaseTask {
  type: 'media-convert';
  file: File | Blob;
  fileName: string;
  options: MediaOptions;
}

export type ConversionTask =
  | ImageConvertTask
  | PdfMergeTask
  | PdfSplitTask
  | PdfInspectTask
  | MetadataInspectTask
  | MetadataStripTask
  | MediaConvertTask;

export interface TaskResultSuccess<T = Blob | Blob[] | PdfMetadata | MetadataInspectionReport> {
  taskId: string;
  success: true;
  data: T;
  outputFileName: string;
  outputMimeType: string;
  durationMs: number;
  originalSize: number;
  resultSize: number;
}

export interface TaskResultFailure {
  taskId: string;
  success: false;
  error: string;
  durationMs: number;
}

export type TaskResult<T = any> = TaskResultSuccess<T> | TaskResultFailure;

export interface PdfPageInfo {
  pageNumber: number; // 1-indexed
  width: number;
  height: number;
}

export interface PdfMetadata {
  pageCount: number;
  title?: string;
  author?: string;
  pages: PdfPageInfo[];
}

export type DataFormat = 'json' | 'csv' | 'yaml';

export interface DataOptions {
  delimiter?: ',' | ';' | '\t' | string;
  indent?: number;
  minify?: boolean;
}

export type HashAlgorithm = 'SHA-256' | 'SHA-512' | 'MD5';

export interface EngineAdapter {
  readonly name: string;
  readonly isAirGapped: boolean; // Indicates 100% client-side zero-server upload
  initialize?(): Promise<void>;
  convertImage(task: ImageConvertTask, onProgress?: (ratio: number) => void): Promise<TaskResult<Blob>>;
  mergePdfs(task: PdfMergeTask, onProgress?: (ratio: number) => void): Promise<TaskResult<Blob>>;
  splitPdf(task: PdfSplitTask, onProgress?: (ratio: number) => void): Promise<TaskResult<Blob | Blob[]>>;
  inspectPdf(task: PdfInspectTask): Promise<TaskResult<PdfMetadata>>;
  inspectMetadata(task: MetadataInspectTask): Promise<TaskResult<MetadataInspectionReport>>;
  stripMetadata(task: MetadataStripTask, onProgress?: (ratio: number) => void): Promise<TaskResult<Blob>>;
  convertData(
    content: string,
    from: DataFormat,
    to: DataFormat,
    options?: DataOptions
  ): string;
  computeHash(
    buffer: ArrayBuffer,
    algorithm: HashAlgorithm
  ): Promise<string>;
  convertMedia(
    taskOrFile: MediaConvertTask | File,
    targetFormatOrOptions?: string | MediaOptions,
    optionsOrProgress?: MediaOptions | ((ratio: number, timeMs?: number) => void),
    onProgress?: (ratio: number, timeMs?: number) => void,
    signal?: AbortSignal
  ): Promise<TaskResult<Blob>>;
  isMediaEngineLoaded?(): boolean;
  loadMediaEngine?(onProgress?: (ratio: number) => void): Promise<void>;
  isFormatSupported(format: ImageTargetFormat): Promise<boolean>;
}

