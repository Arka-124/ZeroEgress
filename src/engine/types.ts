/**
 * FileMaster Conversion Engine Interfaces
 * Standardized abstraction layer decoupling conversion logic from UI components.
 * This architecture allows transparent swapping between pure browser client-side execution
 * and future native runtimes (Tauri / Rust backend).
 */

export type TaskType = 'image-convert' | 'pdf-merge' | 'pdf-split' | 'pdf-inspect';

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

export type ConversionTask = ImageConvertTask | PdfMergeTask | PdfSplitTask | PdfInspectTask;

export interface TaskResultSuccess<T = Blob | Blob[] | PdfMetadata> {
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

export interface EngineAdapter {
  readonly name: string;
  readonly isAirGapped: boolean; // Indicates 100% client-side zero-server upload
  initialize?(): Promise<void>;
  convertImage(task: ImageConvertTask, onProgress?: (ratio: number) => void): Promise<TaskResult<Blob>>;
  mergePdfs(task: PdfMergeTask, onProgress?: (ratio: number) => void): Promise<TaskResult<Blob>>;
  splitPdf(task: PdfSplitTask, onProgress?: (ratio: number) => void): Promise<TaskResult<Blob | Blob[]>>;
  inspectPdf(task: PdfInspectTask): Promise<TaskResult<PdfMetadata>>;
  isFormatSupported(format: ImageTargetFormat): Promise<boolean>;
}
